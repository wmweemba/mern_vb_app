/**
 * Reads Simon's migration workbook and emits a structured JSON artifact for
 * scripts/importGraceCycle.js to consume.
 *
 * Deliberately separate from the import. Reading a spreadsheet and writing to a
 * financial database are different jobs with different failure modes, and the
 * artifact in between is reviewable by a human — including by Simon, against the
 * figures he signed off.
 *
 * The output contains real member names and amounts. It is customer financial
 * data and MUST NOT be committed. Write it outside the repo, `docker cp` it into
 * the backend container to run the import against production, and delete it after.
 *
 *   node scripts/extractGraceWorkbook.js <workbook.xlsx> <out.json>
 *
 * Signed-off control totals (docs/plan_db_cutover_and_grace_migration.md §3) are
 * asserted here. If the workbook ever stops reproducing them, this exits non-zero
 * rather than quietly handing wrong figures to the import.
 */
const path = require('path');
const XLSX = require('xlsx');

const NAME_ALIASES = {
  // Simon confirmed 2026-09-09: one person, renamed mid-cycle. Onboarded as Malambo.
  mwenzi: 'Malambo',
  // Confirmed by William 2026-09-10: the app's member record is authoritative and
  // the workbook has a typo. The app spells her "Tabita Mtonga".
  tabitha: 'Tabita',
};

/**
 * Documented corrections to the source workbook, each agreed with the treasurer.
 * Applied after parsing and logged on every run, so a correction is never silent.
 */
const CORRECTIONS = [
  {
    month: '2026-08', name: 'Kondwani', field: 'closingLoanBalance', value: 2200,
    reason: 'Closing-balance cell left blank. He borrowed K2,200 fresh in August, and '
          + 'Chitalu — the identical case in the same month, fresh loan with no prior '
          + 'balance and no interest yet — shows K4,500. Simon also confirmed K220 of '
          + 'interest falls due in September, which is 10% of K2,200. Confirmed as an '
          + 'omission by William 2026-09-10; group total rises 60,675 -> 62,875.',
  },
];

const CONTROL_TOTALS = {
  members: 25,
  outstandingAt31Aug: 62875,
  cashAt31Aug: 42,
  membershipFeesCollected: 2145,
  subscriptionCollected: 288,
  monthlyDeltas: { '2026-06': -33, '2026-07': -36, '2026-08': 111 },
};

const MONTH_SHEETS = [
  { key: '2026-06', label: 'June', sheet: 'June Contribution' },
  { key: '2026-07', label: 'July', sheet: 'July Contribution' },
  { key: '2026-08', label: 'August', sheet: 'August Contribution' },
];

const norm = (v) => {
  const t = String(v == null ? '' : v).trim();
  return NAME_ALIASES[t.toLowerCase()] || t;
};
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function rowsOf(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
}

function main() {
  const [, , workbookPath, outPath] = process.argv;
  if (!workbookPath || !outPath) {
    console.error('Usage: node scripts/extractGraceWorkbook.js <workbook.xlsx> <out.json>');
    process.exit(1);
  }

  const wb = XLSX.readFile(workbookPath);

  // Roster comes from the Membership sheet; it is the list Simon maintains.
  const membershipRows = rowsOf(wb, 'Membership');
  const members = membershipRows
    .slice(1)
    .map(r => norm(r[0]))
    .filter(n => n && n.toLowerCase() !== 'total' && !/^\d+$/.test(n));

  const months = MONTH_SHEETS.map(({ key, label, sheet }) => {
    const rows = rowsOf(wb, sheet);
    // Row 0 is "Brought Forward", row 1 is the header; member rows follow until "Total".
    const headerIdx = rows.findIndex(r => String(r[0] || '').trim() === 'Member Name');
    const entries = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const name = norm(rows[i][0]);
      if (!name || name === 'Total' || name.startsWith('Total ')) break;
      entries.push({
        name,
        monthlyContribution: num(rows[i][1]),
        newLoan:             num(rows[i][2]),
        loanRepayment:       num(rows[i][3]),
        loanInterestPaid:    num(rows[i][4]),
        openingLoanBalance:  num(rows[i][5]), // balance AFTER that month's new loan
        closingLoanBalance:  num(rows[i][6]), // "New Loan total" — the figure to import
        addedInterest:       num(rows[i][7]),
        membershipFeePaid:   num(rows[i][8]),
        subscription:        num(rows[i][9]), // "System" — August only
      });
    }
    return { key, label, entries };
  });

  // ── Apply documented corrections ─────────────────────────────────────────
  for (const c of CORRECTIONS) {
    const month = months.find(m => m.key === c.month);
    const row = month && month.entries.find(e => e.name.toLowerCase() === c.name.toLowerCase());
    if (!row) throw new Error(`Correction target not found: ${c.name} ${c.month}`);
    const before = row[c.field];
    row[c.field] = c.value;
    console.log(`\n   📝 Correction applied — ${c.name} ${c.month} ${c.field}: ${before} -> ${c.value}`);
    console.log(`      ${c.reason}\n`);
  }

  const sum = (arr, f) => Math.round(arr.reduce((s, e) => s + f(e), 0) * 100) / 100;

  // Cross-check: closing balances stated in the workbook must equal the balances
  // implied by chaining each member's own monthly movements. Any divergence beyond
  // the documented corrections above means the sheet has a new internal
  // inconsistency and must go back to the treasurer, not into the database.
  const chained = new Map();
  for (const m of months) {
    for (const e of m.entries) {
      chained.set(e.name, Math.round(((chained.get(e.name) || 0) - e.loanRepayment + e.newLoan) * 100) / 100);
    }
  }
  const stated = new Map(months[2].entries.map(e => [e.name, e.closingLoanBalance]));
  const divergent = [...chained.entries()].filter(([n, v]) => Math.abs(v - (stated.get(n) || 0)) > 0.01);
  if (divergent.length) {
    console.error('\n❌ Closing balances disagree with each member\'s own monthly movements:');
    divergent.forEach(([n, v]) => console.error(`   ${n}: chained K${v} vs stated K${stated.get(n) || 0}`));
    console.error('   Resolve with the treasurer before importing.\n');
    process.exit(1);
  }

  const totals = {
    members: members.length,
    outstandingAt31Aug: sum(months[2].entries, e => e.closingLoanBalance),
    membershipFeesCollected: sum(months.flatMap(m => m.entries), e => e.membershipFeePaid),
    subscriptionCollected: sum(months.flatMap(m => m.entries), e => e.subscription),
    monthlyDeltas: {},
  };

  // Cash delta per month = everything in, minus new loans out. Reproduces the
  // workbook's "Total Balance" row, which is a monthly delta and NOT a running total.
  let cash = 0;
  for (const m of months) {
    const inflow = sum(m.entries, e =>
      e.monthlyContribution + e.loanRepayment + e.loanInterestPaid + e.addedInterest + e.membershipFeePaid);
    const outflow = sum(m.entries, e => e.newLoan);
    const delta = Math.round((inflow - outflow) * 100) / 100;
    totals.monthlyDeltas[m.key] = delta;
    cash = Math.round((cash + delta) * 100) / 100;
  }
  totals.cashAt31Aug = cash;

  // ── Control totals ────────────────────────────────────────────────────────
  const failures = [];
  const check = (label, actual, expected) => {
    const ok = Math.abs(actual - expected) < 0.01;
    console.log(`  ${ok ? '✅' : '❌'} ${label.padEnd(34)} ${String(actual).padStart(10)}  (expected ${expected})`);
    if (!ok) failures.push(label);
  };

  console.log('\n📖 Grace workbook extraction');
  console.log(`   Source: ${path.basename(workbookPath)}\n`);
  check('members', totals.members, CONTROL_TOTALS.members);
  check('outstanding loans at 31 Aug', totals.outstandingAt31Aug, CONTROL_TOTALS.outstandingAt31Aug);
  check('cash at 31 Aug', totals.cashAt31Aug, CONTROL_TOTALS.cashAt31Aug);
  check('membership fees collected', totals.membershipFeesCollected, CONTROL_TOTALS.membershipFeesCollected);
  check('subscription collected', totals.subscriptionCollected, CONTROL_TOTALS.subscriptionCollected);
  for (const [k, expected] of Object.entries(CONTROL_TOTALS.monthlyDeltas)) {
    check(`cash delta ${k}`, totals.monthlyDeltas[k], expected);
  }

  if (failures.length) {
    console.error(`\n❌ ${failures.length} control total(s) do not match the signed-off figures. Not writing output.\n`);
    process.exit(1);
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    source: path.basename(workbookPath),
    cycle: { startDate: '2026-06-01', endDate: '2026-11-30' },
    openingBankBalance: 0,          // Simon: treat brought-forward as zero
    interestQuotaPerMember: 1050,
    membershipFeeTarget: 250,
    monthlyContribution: 700,
    interestRatePercent: 10,
    members,
    months,
    totals,
  };

  require('fs').writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`\n✅ All control totals match. Wrote ${outPath}\n`);
}

main();
