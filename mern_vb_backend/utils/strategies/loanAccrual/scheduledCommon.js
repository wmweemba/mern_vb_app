// Shared by scheduledReducing and scheduledFlat — the sequential-allocation and
// outstanding-balance logic doesn't depend on how each installment's interest was
// computed, only on the installments[] array both produce.

function applyPayment(loan, paymentAmount) {
  const nextInstallment = loan.installments.find(inst => !inst.paid);
  if (!nextInstallment) return [];

  const installmentsToUpdate = [];
  let remainingPayment = paymentAmount;
  let idx = loan.installments.findIndex(inst => inst.month === nextInstallment.month);

  while (remainingPayment > 0 && idx < loan.installments.length) {
    const inst = loan.installments[idx];
    if (!inst.paid) {
      const currentPaid = inst.paidAmount || 0;
      const amountNeeded = inst.total - currentPaid;
      const paymentForThis = Math.min(remainingPayment, amountNeeded);

      installmentsToUpdate.push({
        index: idx,
        newPaidAmount: currentPaid + paymentForThis,
        willBePaid: (currentPaid + paymentForThis) >= inst.total,
        paymentApplied: paymentForThis,
      });

      remainingPayment -= paymentForThis;
      if (remainingPayment <= 0) break;
    }
    idx++;
  }

  return installmentsToUpdate;
}

function outstanding(loan) {
  return loan.installments.reduce((sum, inst) => sum + (inst.total - (inst.paidAmount || 0)), 0);
}

// Scheduled loans carry their full interest schedule from creation — no separate
// periodic accrual step to run.
function accrue(loan) {
  return loan;
}

module.exports = { applyPayment, outstanding, accrue };
