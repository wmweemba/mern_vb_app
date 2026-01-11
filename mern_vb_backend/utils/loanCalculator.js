function calculateLoanSchedule(amount, customDuration = null) {
    let duration = customDuration || 1;
    if (customDuration === null) {
        if (amount > 20000) duration = 4;
        else if (amount > 5000) duration = 3;
        else if (amount > 2000) duration = 2;
    }
  
    const installmentPrincipal = +(amount / duration).toFixed(2);
    const schedule = [];
    let principalBalance = amount;
  
    for (let month = 1; month <= duration; month++) {
      const interest = +(principalBalance * 0.10).toFixed(2);
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