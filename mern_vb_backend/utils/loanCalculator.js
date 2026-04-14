function calculateLoanSchedule(amount, duration, interestRate, interestMethod = 'reducing') {
  const installmentPrincipal = +(amount / duration).toFixed(2);
  const schedule = [];
  let principalBalance = amount;

  for (let month = 1; month <= duration; month++) {
    let interest;
    if (interestMethod === 'flat') {
      interest = +(amount * (interestRate / 100)).toFixed(2);
    } else {
      interest = +(principalBalance * (interestRate / 100)).toFixed(2);
    }
    const total = +(installmentPrincipal + interest).toFixed(2);
    schedule.push({
      month,
      principal: installmentPrincipal,
      interest,
      total,
      paid: false,
      penalties: {
        lateInterest: 0,
        overdueFine: 0,
        earlyPaymentCharge: 0
      }
    });
    principalBalance -= installmentPrincipal;
  }

  return { duration, schedule };
}

module.exports = calculateLoanSchedule;
