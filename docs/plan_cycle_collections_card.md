# Plan — "Collected This Cycle" dashboard card

**Requested by:** Simon Peter (Grace's group treasurer), via William, 2026-09-21.
**Driver:** a dashboard total matching 4 columns from his own workbook — a running
figure for what has come back into the group as lending capital, this cycle.

## What it is

Sum of, for the current cycle (`archived: { $ne: true }`, same convention as every
other cycle-scoped aggregate in this app — Interest Obligation, Contribution
Liability, `beginNewCycle`):

| Workbook column | App source |
|---|---|
| Loan Interest / "Monthly Interest" | revolving `Loan.entries[type: 'interest_payment']` |
| Loan Repayment | revolving `Loan.entries[type: 'principal_payment']` |
| Added Interest | `Contribution` rows with `countsTowardInterestObligation: true` |
| Membership Fee | `Contribution` rows on any `ContributionType` with `targetAmountPerMember > 0` |

Deliberately **excludes** `Monthly Contribution` (savings) and `New Loan Requested`
(disbursement) — those are separate columns in Simon's own sheet, and this card is
narrower than the Bank Balance card (which already covers the full pool formula).

Scheduled (non-revolving) loans are out of scope for the interest/repayment split —
`grocery_chilimba` loans are always revolving (Phase 2 scoped it that way), so this
mirrors `interestObligationController`'s revolving-only branch rather than adding a
scheduled-loan equivalent nothing currently needs.

## Decisions (confirmed with William)

- **Cycle-scoped**, not lifetime.
- **Self-hiding**, not template-gated — same pattern as `InterestObligationCard`
  (renders nothing when there's nothing to show). No hardcoded `grocery_chilimba`
  check anywhere; a `village_bank` group naturally has no liability/quota
  `ContributionType`s and no revolving loans, so the total is 0 and the card hides.
- **Single total displayed** — no breakdown row in the UI (unlike
  `InterestObligationCard`'s target/credited/shortfall). The endpoint still returns
  the 4 components internally for testability, mirroring how the other two report
  controllers stay derive-only.
- **Card name: "Collected This Cycle"**.
- **New endpoint**, not folded into `/savings/dashboard`.

## Backend

**New file:** `mern_vb_backend/controllers/cycleCollectionsController.js`

```js
// derive-only, same discipline as interestObligationController /
// contributionLiabilityController — nothing stored, everything computed fresh.
async function getCycleCollectionsSummary(req, res) {
  const loans = await Loan.find({ ...req.groupScope, archived: { $ne: true } });
  let monthlyInterest = 0, loanRepayment = 0;
  for (const loan of loans) {
    if (loan.accrualMode !== 'revolving') continue;
    for (const e of loan.entries || []) {
      if (e.type === 'interest_payment') monthlyInterest += e.amount;
      if (e.type === 'principal_payment') loanRepayment += e.amount;
    }
  }

  const liabilityTypeIds = (await ContributionType.find({
    ...req.groupScope, targetAmountPerMember: { $gt: 0 },
  }).select('_id')).map(t => t._id);

  const contributions = await Contribution.find({
    ...req.groupScope, archived: { $ne: true },
    $or: [
      { countsTowardInterestObligation: true },
      { contributionTypeId: { $in: liabilityTypeIds } },
    ],
  });

  let addedInterest = 0, membershipFee = 0;
  const liabilitySet = new Set(liabilityTypeIds.map(String));
  for (const c of contributions) {
    if (c.countsTowardInterestObligation) addedInterest += c.amount;
    else if (liabilitySet.has(String(c.contributionTypeId))) membershipFee += c.amount;
    // a contribution matching both is credited once, as addedInterest — avoids
    // double-counting; not expected in practice (quota and liability types are
    // seeded as mutually exclusive) but the boundary should still be defined.
  }

  const total = round2(monthlyInterest + loanRepayment + addedInterest + membershipFee);
  res.json({ total, monthlyInterest: round2(monthlyInterest), loanRepayment: round2(loanRepayment), addedInterest: round2(addedInterest), membershipFee: round2(membershipFee) });
}
```

**Route:** `routes/reports.js`, alongside the other two:
```js
router.get('/cycle-collections', verifyToken, resolveGroup, checkTrial, getCycleCollectionsSummary);
```
No `requireRole` — visible to every group role, same as the main dashboard stats.

**Tests:** `tests/cycleCollectionsController.test.js` — golden case drawn from Mwiza's
workbook figures (already the golden fixture for `revolvingMonthly.test.js`), plus a
zero-case for a `village_bank` group with no liability/quota types configured.

## Frontend

**New file:** `mern-vb-frontend/src/components/ui/CycleCollectionsCard.jsx`, same shape
as `InterestObligationCard.jsx`:
- Fetches `GET /api/reports/cycle-collections` on mount.
- Renders nothing if `total === 0` (covers groups with no revolving loans and no
  liability/quota contribution types — i.e. every `village_bank` group today).
- Single `K{total}` figure, label "Collected This Cycle".

**Wire into `Dashboard.jsx`**, placed after `ContributionLiabilityCard` and before
`DashboardStatsCard` (same top-to-bottom order as the other two self-hiding cards).

## Verification (per CLAUDE.md's loop — financial logic touched)

1. `cd mern_vb_backend && pnpm test` — new controller test + no regressions in
   `interestObligationController`/`contributionLiabilityController` tests (shared
   query patterns).
2. `node scripts/auditBankBalance.js --all` — this card reads existing data and
   writes nothing, so it cannot introduce a balance discrepancy, but run it anyway
   per the gate's own rule (any financial-adjacent controller touched).
3. Manual check against Grace's group once deployed: total should equal
   `Loan Interest + Added Interest + Loan Repayment + Membership Fee Paid` summed
   across her June–Nov workbook for the current open cycle — closest available proxy
   is `auditFunds.js`/`interestPaidOnLoan` output already verified against her sheet.
4. Frontend: `pnpm test`, then manual browser check — card visible on Grace's group
   dashboard, absent on William's Group and a throwaway `village_bank` test group.

## Out of scope

- No breakdown UI (per William's call) — endpoint returns the components anyway, so
  a future drill-down view is a additive, not a rework.
- No scheduled-loan equivalent — nothing currently needs it.
- No change to `BankBalance`/`auditBankBalance.js` — this is a read-only, additive
  report card.
