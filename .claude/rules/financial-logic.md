---
paths:
  - "mern_vb_backend/utils/loanCalculator*"
  - "mern_vb_backend/utils/loanCalculator/**"
  - "mern_vb_backend/controllers/{payment,bankBalance,loan,savings,contribution,fund,cycle}Controller.js"
  - "mern_vb_backend/models/**"
  - "mern_vb_backend/scripts/audit*.js"
---

# Financial logic (read before touching calculations)

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Domain Model & Core Schemas

### Current Models (mern_vb_backend/models/)

| Model | File | Purpose |
|-------|------|---------|
| User | User.js | Members, roles, auth |
| Loans | Loans.js | Loan records + installment schedules |
| Savings | Savings.js | Member savings deposits |
| BankBalance | BankBalance.js | Group bank balance (single document) |
| Transaction | Transaction.js | Full audit trail of all money movement |
| Fine | Fine.js | Fines/penalties with paid/unpaid status |
| Threshold | Threshold.js | Loan eligibility thresholds |
| ContributionType | ContributionType.js | Treasurer-configured catalog of contribution kinds (e.g. "Admin Fee", "Social Fund"); per-group; soft-deleted only |
| Contribution | Contribution.js | One row per recorded contribution; denormalized `typeName` snapshot; resolved `affectsMainBalance` + `overrodeDefault` stored at record time |
| GroupFund | GroupFund.js | **Named pot** alongside the main lending pool — `social_fund`, `app_subscription`, or any treasurer-added key. Source of truth for pot balances |
| FundExpense | FundExpense.js | Debit side of a fund's mini-ledger (formerly SocialFundExpense; bound to the same `socialfundexpenses` collection). Amount positive; direction implied by transaction type |
| SocialFundBalance | SocialFundBalance.js | **DEPRECATED** — superseded by GroupFund. No longer read or written by app code; left un-dropped as the pre-migration record |

---

## Financial Logic — Read This Before Touching Calculations

### Bank Balance Formula
```
Bank Balance (lending pool) = Starting Balance (cycle_reset)
             + All Savings Deposits              (saving)        (+)
             + All Loan Payments                 (loan_payment)  (+)
             + All Fine Payments                 (fine, paid)    (+)
             + All Main-Balance Contributions    (contribution)  (+)  ← NEW
             - All Loan Disbursements            (loan)          (-)
             - All Payouts                       (payout)        (-)
```

**social_fund_credit**, **social_fund_debit**, **fund_credit** and **fund_debit** are NOT part of the main balance. The last two are the generic named-fund pair; the first two are legacy rows that are never rewritten.

```
Fund Balance (per GroupFund) = Σ contributions with that fundId   (fund_credit)  (+)
                             - Σ expenses with that fundId        (fund_debit)   (-)
```
Audit a group's pots with `node scripts/auditFunds.js --group <id>` (or `--all`).

### Transaction Types (Transaction model enum)
`['loan', 'saving', 'fine', 'payment', 'loan_payment', 'payout', 'cycle_reset', 'contribution', 'social_fund_credit', 'social_fund_debit', 'fund_credit', 'fund_debit']`

### Interest Calculation (utils/loanCalculator.js)
**This is the most critical file in the backend. Treat with extreme care.**

**Reducing balance (current method — William's group):**
- Each installment = equal principal slice + interest on *remaining* outstanding principal
- As loan shrinks, interest portion shrinks
- Fairer for borrowers

**Flat rate (to be added for other groups):**
- Interest charged on *original* loan amount every installment regardless of repayments
- Simpler to explain, higher effective cost to borrower

When adding flat rate support, add a branch in loanCalculator.js:
```js
if (interestMethod === 'flat') {
  // interest = originalAmount * (rate/100) / durationMonths — every installment
} else {
  // existing reducing balance logic
}
```

### Payment Processing Rules
- Payments are applied sequentially: Month 1 → Month 2 → Month 3 → Month 4
- Overpayments roll to next installment automatically
- All payment operations MUST use MongoDB sessions (atomic transactions)
- Failed operations must automatically rollback — this was a hard bug pre-v2.0.4

### Data Integrity Non-Negotiables
- Never update bank balance without logging a Transaction record simultaneously
- Never skip MongoDB sessions on payment operations
- The `scripts/` folder contains audit tools — use them to verify balance integrity

## Financial audit detail (Verification Loop step 2)

### Step 2 — Financial Audit (only if financial logic was touched)
Touched any of these? → `loanCalculator.js`, `paymentController.js`,
`bankBalanceController.js`, `loanController.js`, `GroupSettings`:
```bash
cd mern_vb_backend && node scripts/auditBankBalance.js --all
```
The script is **multi-tenant** (2026-08-12 rewrite — it used to have zero `groupId`
scoping and compared one group's balance against every group's transactions pooled
together, producing a meaningless number). `--all` audits every non-deleted group and
prints a per-group summary table; `--group <id>` audits one group; no args just lists
groups and exits. Exits non-zero if any audited group's discrepancy exceeds ZMW 1, so
it can gate a release.

Confirm every group's script output matches its app-reported balance.
Discrepancy > ZMW 1 on a group you touched = stop and investigate before marking done.
(William's Group carries a known, pre-existing ~K18,177 discrepancy from repeated
dev/demo test sessions — not live financial data, not caused by any current change.
Tracked for a cycle-reset cleanup alongside the eventual Coolify DB cutover, not an
open bug to chase now.)

## Related gotchas

1. **Bank balance drift** — caused by non-atomic payment operations. Always use MongoDB sessions. Audit scripts exist in `scripts/` if drift is suspected.

2. **Loan payment misallocation** — repayments must target the most recent active loan in the current cycle. See `paymentController.js` for correct implementation.

3. **Route ordering in Express 5** — static routes (`/export`) must come before dynamic routes (`/:userId`). Getting this wrong causes crashes on startup.

4. **Custom loan duration ignored** — was a bug in `createLoan`. Duration must be read from `req.body`, not inferred from amount thresholds. Fixed in 2.1.0 — don't regress this.

5. **PDF generation** — was moved from backend to frontend in Aug 2025. If you see backend PDF routes being added, that's wrong.

6. **Fines** — only credit bank balance when **paid**, not when issued. This distinction matters for balance accuracy.

7. **Partial payment state** — `paid===false` with `paidAmount>0` is VALID after v3.10.0. This state means an installment has been partially paid (typically interest covered, principal outstanding). It is only a corruption signal if `paidAmount > installment total`. The old `scripts/fixCorruptedLoan.js` has been retired — do not restore or re-run it. See `RETIRED_fixCorruptedLoan.js` for history.
