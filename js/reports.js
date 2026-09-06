const Reports = (function () {
  // Shared daily calculation used by both the daily report and (looped once per
  // business day) the monthly report, so any future accounting fix here
  // automatically applies to both. `preloaded`, if given, avoids refetching the
  // whole DB on every iteration of a monthly loop.
  async function calculateDailyTotals(range, preloaded) {
    let sessions = (preloaded && preloaded.sessions) || await DB.getAll("sessions");
    let cafeOrders = (preloaded && preloaded.cafeOrders) || await DB.getAll("cafeOrders");
    let debtPayments = (preloaded && preloaded.debtPayments) || await DB.getAll("debtPayments");
    let walletCharges = (preloaded && preloaded.walletCharges) || await DB.getAll("walletCharges");
    let purchases = (preloaded && preloaded.purchases) || await DB.getAll("purchases");
    let blockPayments = (preloaded && preloaded.blockPayments) || await DB.getAll("blockPayments");
    let tournaments = (preloaded && preloaded.tournaments) || await DB.getAll("tournaments");
    let matchData = (preloaded && preloaded.matches) || await DB.getAll("matches");
    let payouts = (preloaded && preloaded.prizePayouts) || await DB.getAll("prizePayouts");

    let settledSessions = sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, range.start, range.end));
    let dailyOrders = cafeOrders.filter((o) => Utils.isInRange(o.createdAt, range.start, range.end));
    let dailyDebtPayments = debtPayments.filter((p) => Utils.isInRange(p.date, range.start, range.end));
    let dailyCharges = walletCharges.filter((c) => Utils.isInRange(c.date, range.start, range.end));
    let dailyPurchases = purchases.filter((p) => Utils.isInRange(p.date, range.start, range.end));

    // `cash`/`card` are the only fields that feed totalCashIn/totalCardIn (the
    // till reconciliation). `wallet`/`debt` are tracked alongside purely for the
    // "فروش / عملیات" breakdown so managers can see revenue that didn't move
    // through the till (already-collected wallet balance or a new receivable) —
    // they must NEVER be added into totalCashIn/totalCardIn below.
    //
    // A settled payment may now carry `payBreakdown` ({wallet,debt,cash,card})
    // from split wallet→debt payments; when present we expand that exact leg
    // split. `legsOf` turns an amount into its four legs honoring a breakdown.
    let legsOf = (amount, payType, breakdown) => {
      let legs = { cash: 0, card: 0, wallet: 0, debt: 0 };
      if (breakdown && typeof breakdown === "object") {
        let w = breakdown.wallet || 0, d = breakdown.debt || 0, c = breakdown.cash || 0, cd = breakdown.card || 0;
        let sum = w + d + c + cd;
        if (sum > 0) {
          let k = amount / sum;
          legs.wallet = w * k; legs.debt = d * k; legs.cash = c * k; legs.card = cd * k;
        } else {
          legs.cash = amount;
        }
      } else if (payType === "cash") legs.cash = amount;
      else if (payType === "card") legs.card = amount;
      else if (payType === "wallet") legs.wallet = amount;
      else if (payType === "debt") legs.debt = amount;
      else legs.cash = amount;
      return legs;
    };
    let addLegs = (target, amount, payType, breakdown) => {
      let legs = legsOf(amount, payType, breakdown);
      target.cash += legs.cash; target.card += legs.card; target.wallet += legs.wallet; target.debt += legs.debt;
    };

    let consoleCalc = { cash: 0, card: 0, wallet: 0, debt: 0 };
    let billiardCalc = { cash: 0, card: 0, wallet: 0, debt: 0 };
    let pcCalc = { cash: 0, card: 0, wallet: 0, debt: 0 };
    settledSessions.forEach((s) => {
      let amt = s.settleAmount || 0;
      let sb = s.settleBreakdown;
      // A transferred session records which devices its blocks ran on; attribute
      // the settle across those device types instead of dumping the whole total
      // into the final device (see confirmSettleSession). Falls back to the
      // session's own deviceType for records predating the breakdown.
      if (sb && typeof sb === "object" && ((sb.console || 0) + (sb.billiard || 0) + (sb.pc || 0)) > 0) {
        addLegs(consoleCalc, sb.console || 0, s.settlePayType, s.payBreakdown);
        addLegs(billiardCalc, sb.billiard || 0, s.settlePayType, s.payBreakdown);
        addLegs(pcCalc, sb.pc || 0, s.settlePayType, s.payBreakdown);
      } else if (s.deviceType === "console") addLegs(consoleCalc, amt, s.settlePayType, s.payBreakdown);
      else if (s.deviceType === "billiard") addLegs(billiardCalc, amt, s.settlePayType, s.payBreakdown);
      else addLegs(pcCalc, amt, s.settlePayType, s.payBreakdown);
    });

    let consoleBlock = { cash: 0, card: 0, wallet: 0, debt: 0 };
    let billiardBlock = { cash: 0, card: 0, wallet: 0, debt: 0 };
    let tournamentMatchBlock = { cash: 0, card: 0, wallet: 0, debt: 0 };
    let dailyBlockPayments = blockPayments.filter((bp) => Utils.isInRange(bp.date, range.start, range.end));
    dailyBlockPayments.forEach((bp) => {
      let amt = bp.amount || 0;
      let target = bp.deviceType === "console" ? consoleBlock : bp.deviceType === "tournament" ? tournamentMatchBlock : billiardBlock;
      let legs = legsOf(amt, bp.payType, bp.payBreakdown);
      target.cash += legs.cash; target.card += legs.card; target.wallet += legs.wallet; target.debt += legs.debt;
    });

    let cafeCash = 0, cafeCard = 0, cafeWallet = 0, cafeDebt = 0;
    dailyOrders.forEach((o) => {
      let legs = legsOf(o.total, o.payType, o.payBreakdown);
      cafeCash += legs.cash; cafeCard += legs.card; cafeWallet += legs.wallet; cafeDebt += legs.debt;
    });

    let debtCash = 0, debtCard = 0;
    dailyDebtPayments.forEach((p) => { if (p.paymentType === "cash") debtCash += p.amount; else debtCard += p.amount; });

    let chargeCash = 0, chargeCard = 0;
    dailyCharges.forEach((c) => { if (c.paymentType === "cash") chargeCash += c.amount; else chargeCard += c.amount; });

    let purchaseCash = 0, purchaseCard = 0, purchaseOther = 0;
    dailyPurchases.forEach((p) => {
      if (p.paymentType === "cash") purchaseCash += p.amount;
      else if (p.paymentType === "pasargad") purchaseCard += p.amount;
      else if (p.paymentType !== "other") purchaseOther += p.amount;
    });
    purchases.filter((p) => p.paymentType === "other" && p.settled && p.settledWith && Utils.isInRange(p.settledAt, range.start, range.end)).forEach((p) => {
      let eff = p.settledWith;
      if (eff === "cash") purchaseCash += p.amount;
      else if (eff === "pasargad") purchaseCard += p.amount;
      else purchaseOther += p.amount;
    });

    let activeMatches = matchData.filter((m) => m.status === "completed" && m.timerEnd && Utils.isInRange(m.timerEnd, range.start, range.end));
    let tournamentCash = 0, tournamentCard = 0, tournamentWallet = 0, tournamentDebt = 0;
    tournaments.forEach((t) => {
      if (!t.entryFeeStatus) return;
      Object.values(t.entryFeeStatus).forEach((efs) => {
        if (efs.collected && efs.settledAt && Utils.isInRange(efs.settledAt, range.start, range.end)) {
          let legs = legsOf(t.entryFee || 0, efs.payType, efs.payBreakdown);
          tournamentCash += legs.cash; tournamentCard += legs.card; tournamentWallet += legs.wallet; tournamentDebt += legs.debt;
        }
      });
    });
    tournamentCash += tournamentMatchBlock.cash;
    tournamentCard += tournamentMatchBlock.card;
    tournamentWallet += tournamentMatchBlock.wallet;
    tournamentDebt += tournamentMatchBlock.debt;

    // Prize payouts paid out as cash/card are cash-outs, the same way purchases
    // are. A payout credited to the winner's wallet doesn't leave the till, so
    // it's recorded but excluded from the cash/card reconciliation totals.
    let dailyPayouts = payouts.filter((p) => Utils.isInRange(p.date, range.start, range.end));
    let payoutCash = 0, payoutCard = 0;
    dailyPayouts.forEach((p) => {
      if (p.payType === "cash") payoutCash += p.amount || 0;
      else if (p.payType === "card") payoutCard += p.amount || 0;
    });

    // Till reconciliation totals — unchanged: only cash/card legs count here.
    // Wallet/debt legs (computed above per area) are reporting-only and never
    // enter these sums, since no physical money moved through the till for them.
    let totalCashIn = consoleCalc.cash + consoleBlock.cash + billiardCalc.cash + billiardBlock.cash + pcCalc.cash + cafeCash + debtCash + chargeCash + tournamentCash;
    let totalCardIn = consoleCalc.card + consoleBlock.card + billiardCalc.card + billiardBlock.card + pcCalc.card + cafeCard + debtCard + chargeCard + tournamentCard;
    let totalCashOut = purchaseCash + payoutCash;
    let totalCardOut = purchaseCard + payoutCard;

    return {
      consoleCalc, billiardCalc, pcCalc, consoleBlock, billiardBlock,
      cafeCash, cafeCard, cafeWallet, cafeDebt, debtCash, debtCard, chargeCash, chargeCard,
      purchaseCash, purchaseCard, purchaseOther, payoutCash, payoutCard,
      tournamentCash, tournamentCard, tournamentWallet, tournamentDebt, tournamentMatchBlock, activeMatches,
      totalCashIn, totalCardIn, totalCashOut, totalCardOut,
    };
  }

  // Renders one "فروش / عملیات" area row with all four payment-method columns.
  // Returns "" (renders nothing) when the area had no activity at all, so the
  // report doesn't list a wall of empty zero-rows for areas unused that day.
  function renderAreaBreakdown(title, cash, card, wallet, debt, extra) {
    let total = (cash || 0) + (card || 0) + (wallet || 0) + (debt || 0);
    if (total <= 0 && !extra) return "";
    return `
      <div class="report-section">
        <h4>${title}</h4>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(cash || 0)}</div></div>
          <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(card || 0)}</div></div>
          <div class="summary-item"><div class="summary-label">کیف‌پول</div><div class="summary-value">${Utils.formatCurrency(wallet || 0)}</div></div>
          <div class="summary-item"><div class="summary-label">بدهکاری</div><div class="summary-value">${Utils.formatCurrency(debt || 0)}</div></div>
          ${extra || ""}
        </div>
      </div>
    `;
  }

  async function renderDaily(el) {
    let range = Utils.getReportRange();
    let d = await calculateDailyTotals(range);
    let {
      consoleCalc, billiardCalc, pcCalc, consoleBlock, billiardBlock,
      cafeCash, cafeCard, cafeWallet, cafeDebt, debtCash, debtCard, chargeCash, chargeCard,
      purchaseCash, purchaseCard, purchaseOther, payoutCash, payoutCard,
      tournamentCash, tournamentCard, tournamentWallet, tournamentDebt, activeMatches,
      totalCashIn, totalCardIn, totalCashOut, totalCardOut,
    } = d;

    let tournamentExtra = activeMatches.length > 0
      ? `<div class="summary-item"><div class="summary-label">بازی‌های تکمیل‌شده</div><div class="summary-value">${activeMatches.length}</div></div>`
      : "";

    let areasHtml = [
      renderAreaBreakdown("کنسول‌ها", consoleCalc.cash + consoleBlock.cash, consoleCalc.card + consoleBlock.card, consoleCalc.wallet + consoleBlock.wallet, consoleCalc.debt + consoleBlock.debt),
      renderAreaBreakdown("بیلیارد", billiardCalc.cash + billiardBlock.cash, billiardCalc.card + billiardBlock.card, billiardCalc.wallet + billiardBlock.wallet, billiardCalc.debt + billiardBlock.debt),
      renderAreaBreakdown("پی‌سی", pcCalc.cash, pcCalc.card, pcCalc.wallet, pcCalc.debt),
      renderAreaBreakdown("کافی‌شاپ", cafeCash, cafeCard, cafeWallet, cafeDebt),
      renderAreaBreakdown("مسابقات", tournamentCash, tournamentCard, tournamentWallet, tournamentDebt, tournamentExtra),
    ].join("");

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>گزارش روزانه</h2>
          <div class="text-muted text-sm">${Jalali.formatDate(range.start)} تا ${Jalali.formatDate(range.end)}</div>
        </div>

        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">جمع کل دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn + totalCardIn)}</div></div>
          <div class="summary-item"><div class="summary-label">نقدی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn)}</div></div>
          <div class="summary-item"><div class="summary-label">کارتی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCardIn)}</div></div>
        </div>

        <hr class="section-divider">
        <h3>صندوق</h3>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">نقدی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn)}</div></div>
          <div class="summary-item"><div class="summary-label">کارتی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCardIn)}</div></div>
          <div class="summary-item"><div class="summary-label">نقدی پرداختی</div><div class="summary-value amount negative">${Utils.formatCurrency(totalCashOut)}</div></div>
          <div class="summary-item"><div class="summary-label">مانده نقدی</div><div class="summary-value font-bold">${Utils.formatCurrency(totalCashIn - totalCashOut)}</div></div>
        </div>

        <div class="report-section">
          <h4>وصول بدهی</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(debtCash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(debtCard)}</div></div>
          </div>
        </div>

        <div class="report-section">
          <h4>شارژ کیف‌پول</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(chargeCash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(chargeCard)}</div></div>
          </div>
        </div>

        <hr class="section-divider">
        <h3>فروش / عملیات</h3>
        ${areasHtml || '<div class="text-muted text-sm">فروش/عملیاتی ثبت نشده</div>'}

        <hr class="section-divider">
        <h3>پرداختی‌ها (خریدها)</h3>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value amount negative">${Utils.formatCurrency(purchaseCash)}</div></div>
          <div class="summary-item"><div class="summary-label">پاسارگاد</div><div class="summary-value amount negative">${Utils.formatCurrency(purchaseCard)}</div></div>
          <div class="summary-item"><div class="summary-label">سایر</div><div class="summary-value amount negative">${Utils.formatCurrency(purchaseOther)}</div></div>
        </div>

        ${(payoutCash + payoutCard) > 0 ? `
        <div class="report-section">
          <h4>پرداخت جایزه مسابقات</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value amount negative">${Utils.formatCurrency(payoutCash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value amount negative">${Utils.formatCurrency(payoutCard)}</div></div>
          </div>
        </div>
        ` : ''}

        <hr class="section-divider">
        <div class="flex-gap">
          <button class="btn btn-primary" onclick="Reports.exportDailyExcel()">خروجی اکسل</button>
          <button class="btn btn-outline" onclick="Reports.showFullTransactions()">لیست تراکنش‌ها</button>
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  // The instant report is just the daily report's same business-day window,
  // ending "now" instead of at 23:35 — so it MUST share calculateDailyTotals
  // with renderDaily instead of re-deriving totals, or the two can silently
  // drift apart (e.g. missing purchases/payouts, as they previously did here).
  async function renderInstant(el) {
    let range = Utils.getCurrentReportRange();
    let d = await calculateDailyTotals(range);
    let { totalCashIn, totalCardIn, totalCashOut, totalCardOut } = d;

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>گزارش لحظه‌ای</h2>
          <div class="text-muted text-sm">از ${Jalali.formatDateTime(range.start)} تا الان</div>
        </div>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">جمع کل دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn + totalCardIn)}</div></div>
          <div class="summary-item"><div class="summary-label">نقدی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn)}</div></div>
          <div class="summary-item"><div class="summary-label">کارتی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCardIn)}</div></div>
        </div>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">نقدی پرداختی</div><div class="summary-value amount negative">${Utils.formatCurrency(totalCashOut)}</div></div>
          <div class="summary-item"><div class="summary-label">کارتی پرداختی</div><div class="summary-value amount negative">${Utils.formatCurrency(totalCardOut)}</div></div>
          <div class="summary-item"><div class="summary-label">مانده نقدی</div><div class="summary-value font-bold">${Utils.formatCurrency(totalCashIn - totalCashOut)}</div></div>
        </div>
        <button class="btn btn-primary" onclick="Reports.renderInstant(document.getElementById('tab-instantReport'))">بازخوانی</button>
      </div>
    `;
  }

  async function renderMonthly(el) {
    let today = Jalali.getTodayJalali();
    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h2>گزارش ماهانه</h2></div>
        <div class="form-inline mb-4">
          <div class="form-group"><label>ماه</label><select id="monthlyMonth">${[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => `<option value="${m}" ${m === today.month ? 'selected' : ''}>${m}</option>`).join("")}</select></div>
          <div class="form-group"><label>سال</label><input type="number" id="monthlyYear" value="${today.year}" min="1300" max="1500"></div>
          <button class="btn btn-primary" onclick="Reports.loadMonthlyReport()">نمایش</button>
        </div>
        <div id="monthlyResult"></div>
      </div>
    `;
    await loadMonthlyReport();
  }

  async function loadMonthlyReport() {
    let month = parseInt(document.getElementById("monthlyMonth")?.value);
    let year = parseInt(document.getElementById("monthlyYear")?.value);
    if (!month || !year) return;

    let firstDay = Jalali.getJalaliFirstDayOfMonth(year, month);
    let monthDays = Jalali.getJalaliMonthDays(year, month);

    // Fetch each collection once and hand it to calculateDailyTotals for every
    // day of the month, instead of refetching the whole DB per iteration.
    let preloaded = {
      sessions: await DB.getAll("sessions"),
      cafeOrders: await DB.getAll("cafeOrders"),
      debtPayments: await DB.getAll("debtPayments"),
      walletCharges: await DB.getAll("walletCharges"),
      purchases: await DB.getAll("purchases"),
      blockPayments: await DB.getAll("blockPayments"),
      tournaments: await DB.getAll("tournaments"),
      matches: await DB.getAll("matches"),
      prizePayouts: await DB.getAll("prizePayouts"),
    };
    let dailySummaries = await DB.getAll("dailySummaries");

    let dayData = {};
    let dayKeys = {};
    let dayRanges = {};
    for (let d = 0; d < monthDays; d++) {
      // Business day boundaries are [calendarDay-1 23:35, calendarDay 23:35), the
      // same window Utils.getReportRange uses for "today" — computed here by
      // passing noon of that calendar day, which always falls inside that window.
      let calendarDay = new Date(firstDay); calendarDay.setDate(calendarDay.getDate() + d);
      let noon = new Date(calendarDay.getFullYear(), calendarDay.getMonth(), calendarDay.getDate(), 12, 0, 0);
      let dayRange = Utils.getReportRange(noon);
      let totals = await calculateDailyTotals(dayRange, preloaded);
      dayData[d + 1] = totals.totalCashIn + totals.totalCardIn;
      // The saved dailySummaries key (if this day was ever frozen/reconciled)
      // is the business-day key of that same range — same derivation
      // freezeBusinessDay uses.
      dayKeys[d + 1] = Utils.getBusinessDayKey(dayRange);
      dayRanges[d + 1] = dayRange;
    }
    let now = new Date();

    let monthTotal = Object.values(dayData).reduce((s, v) => s + v, 0);
    let maxTotal = Math.max(...Object.values(dayData), 1);

    document.getElementById("monthlyResult").innerHTML = `
      <div class="report-summary mb-4"><div class="summary-item"><div class="summary-label">جمع ماهانه</div><div class="summary-value">${Utils.formatCurrency(monthTotal)}</div></div></div>
      <div class="chart-container">
        <h3 style="margin-bottom:8px">نمودار مقایسه روزها</h3>
        <div style="overflow-x:auto;white-space:nowrap;padding:8px 0;">
          ${Object.entries(dayData).map(([day, total]) => {
            let dayDate = new Date(firstDay); dayDate.setDate(dayDate.getDate() + parseInt(day) - 1);
            let weekday = Utils.getJalaliWeekday(dayDate);
            let shortDay = weekday;
            return `<div style="display:inline-flex;flex-direction:column;align-items:center;width:45px;">
              <div style="width:18px;background:var(--accent);height:${Math.max(Math.round((total / maxTotal) * 200), 2)}px;border-radius:3px 3px 0 0;" title="روز ${day} (${weekday}): ${Utils.formatCurrencyShort(total)}"></div>
              <div style="font-size:9px;color:#666;margin-top:4px;text-align:center;line-height:1.3;">
                <div style="font-weight:600;">${shortDay}</div>
                <div>روز ${day}</div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="report-section"><h3>فهرست روزبه‌روز</h3>
        ${Object.entries(dayData).map(([day, total]) => {
          let dayDate = new Date(firstDay); dayDate.setDate(dayDate.getDate() + parseInt(day) - 1);
          let weekday = Utils.getJalaliWeekday(dayDate);
          let key = dayKeys[day];
          let range = dayRanges[day];
          let summary = dailySummaries.find((s) => s.date === key);

          let statusHtml;
          if (range.end > now) {
            // Still the open/current business day — nothing to reconcile yet.
            statusHtml = `<span class="text-muted text-sm" style="margin-right:8px">باز</span>`;
          } else if (!summary || summary.cashCounted == null) {
            // Day has ended but staff hasn't confirmed the till yet.
            statusHtml = `<button class="btn btn-sm btn-outline" style="margin-right:8px" onclick="Reports.showDayRecon('${key}', '${range.start.toISOString()}', '${range.end.toISOString()}')">تطبیق صندوق</button>`;
          } else {
            statusHtml = `<span class="text-muted text-sm" style="margin-right:8px">شمارش: ${Utils.formatCurrency(summary.cashCounted)} | کارتخوان: ${Utils.formatCurrency(summary.cardReceived || 0)} | اختلاف نقدی: ${Utils.formatCurrency(summary.diffCash || 0)} | اختلاف کارت: ${Utils.formatCurrency(summary.diffCard || 0)}</span>
              <button class="btn btn-sm btn-outline" style="margin-right:8px" onclick="Reports.showDayRecon('${key}', '${range.start.toISOString()}', '${range.end.toISOString()}')">ویرایش تطبیق</button>`;
          }

          return `<div class="list-row"><span class="row-label">روز ${day} (${weekday})</span>${statusHtml}<span class="row-value">${Utils.formatCurrency(total)}</span></div>`;
        }).join("")}
      </div>
      <button class="btn btn-primary" onclick="Reports.exportMonthlyExcel()">خروجی اکسل</button>
    `;
  }

  // Freezes a single business day's SYSTEM totals into dailySummaries without
  // any staff action. Only ever called for a range whose end has already
  // passed (range.end <= now) — the currently open day must never be frozen.
  // If a row already exists (a prior auto-freeze, an on-demand freeze from
  // showDayRecon, or a confirmed reconciliation), its recon fields (cashCounted, cardReceived,
  // diff*, closedAt, reconConfirmedAt, autoClosed*) are preserved untouched;
  // we only ever add the cashIn/cardIn/cashOut/cardOut fields on top when
  // they are missing, we never overwrite an existing frozen/reconciled row.
  async function freezeBusinessDay(range) {
    let now = new Date();
    if (range.end > now) return null; // still open — never freeze

    let key = Utils.getBusinessDayKey(range);
    let existing = await DB.get("dailySummaries", key);
    if (existing && existing.cashIn != null && existing.cardIn != null) {
      // Already frozen (previously auto-closed or frozen on-demand for recon).
      return existing;
    }

    let totals = await calculateDailyTotals(range);
    let daySummary = Object.assign({}, existing, {
      date: key,
      cashIn: totals.totalCashIn,
      cardIn: totals.totalCardIn,
      cashOut: totals.totalCashOut,
      cardOut: totals.totalCardOut,
      autoClosed: true,
      autoClosedAt: now.toISOString(),
    });
    await DB.put("dailySummaries", daySummary);
    return daySummary;
  }

  // Catch-up sweep: walks back 31 calendar days from `now` and freezes every
  // business day whose range has already ended but has no frozen totals yet.
  // Safe to call repeatedly (on login, on tab focus, on every reminder tick) —
  // freezeBusinessDay is idempotent and never re-freezes or wipes a row that
  // already has totals/recon data. This is what makes the freeze work even
  // when the app was closed across one or more 23:35 boundaries.
  async function autoClosePastDays(now) {
    now = now instanceof Date ? now : new Date();

    for (let i = 0; i <= 31; i++) {
      let day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(12, 0, 0, 0);
      let range = Utils.getReportRange(day);
      if (range.end <= now) {
        await freezeBusinessDay(range);
      }
    }

    // Also cover the business day that most recently ended relative to `now`,
    // in case its calendar-noon range wasn't already hit by the loop above
    // (e.g. right after 23:35 but before the next calendar day's noon).
    let currentOpenStart = Utils.getReportRange(now).start;
    if (currentOpenStart <= now) {
      let justEnded = Utils.getReportRange(new Date(currentOpenStart.getTime() - 1));
      if (justEnded.end <= now) {
        await freezeBusinessDay(justEnded);
      }
    }
  }

  // Opens the monthly till-confirmation modal for one ended business day.
  // `startISO`/`endISO` are that day's getReportRange bounds (passed in from
  // loadMonthlyReport, since a business-day key alone can't be reversed back
  // into a range). If the day was never frozen yet (e.g. staff jumps straight
  // to confirming without waiting for the auto-close tick), it's frozen here
  // first via freezeBusinessDay — the modal always displays those frozen
  // system numbers, never a live recompute, and confirming never touches them.
  async function showDayRecon(key, startISO, endISO) {
    let range = { start: new Date(startISO), end: new Date(endISO) };
    let summary = await DB.get("dailySummaries", key);
    if (!summary || summary.cashIn == null) {
      summary = await freezeBusinessDay(range);
    }
    if (!summary) {
      App.toast("این روز هنوز باز است و قابل تطبیق نیست");
      return;
    }

    let netCash = summary.cashIn - summary.cashOut;
    App.openModal(`
      <h2>تطبیق صندوق روز ${key}</h2>
      <div class="report-summary">
        <div class="summary-item"><div class="summary-label">نقدی دریافتی</div><div class="summary-value">${Utils.formatCurrency(summary.cashIn)}</div></div>
        <div class="summary-item"><div class="summary-label">کارتی دریافتی</div><div class="summary-value">${Utils.formatCurrency(summary.cardIn)}</div></div>
        <div class="summary-item"><div class="summary-label">نقدی پرداختی</div><div class="summary-value amount negative">${Utils.formatCurrency(summary.cashOut)}</div></div>
        <div class="summary-item"><div class="summary-label">مانده نقدی</div><div class="summary-value font-bold">${Utils.formatCurrency(netCash)}</div></div>
      </div>
      <div class="text-muted text-sm" style="margin-top:4px">توجه: خریدهای پاسارگاد در جمع کارتخوان (POS) لحاظ نشده‌اند؛ کارتخوان فقط دریافتی‌های کارتی مشتریان است.</div>
      <div class="form-inline" style="margin-top:12px">
        <div class="form-group"><label>مبلغ شمارش‌شده صندوق</label><input type="number" id="reconCashCounted" placeholder="0" min="0" value="${summary.cashCounted != null ? summary.cashCounted : ''}" oninput="Reports.previewDayRecon(${netCash}, ${summary.cardIn})"></div>
        <div class="form-group"><label>مبلغ کارتخوان</label><input type="number" id="reconCardReceived" placeholder="0" min="0" value="${summary.cardReceived != null ? summary.cardReceived : ''}" oninput="Reports.previewDayRecon(${netCash}, ${summary.cardIn})"></div>
      </div>
      <div style="margin-top:8px">
        <div class="list-row"><span class="row-label">اختلاف نقدی</span><span class="row-value" id="reconDiffCash">${summary.diffCash != null ? Utils.formatCurrency(summary.diffCash) : '-'}</span></div>
        <div class="list-row"><span class="row-label">اختلاف کارتخوان</span><span class="row-value" id="reconDiffCard">${summary.diffCard != null ? Utils.formatCurrency(summary.diffCard) : '-'}</span></div>
      </div>
      ${summary.reconConfirmedAt ? `<div class="text-muted text-sm" style="margin-top:4px">آخرین تأیید: ${Jalali.formatDateTime(summary.reconConfirmedAt)}${summary.reconConfirmedBy ? " توسط " + summary.reconConfirmedBy : ""}</div>` : ""}
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Reports.saveDayRecon('${key}', ${netCash}, ${summary.cardIn})">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  // Live diff preview only — purely cosmetic, reads the frozen netCash/cardIn
  // baked into the modal's onclick and never touches dailySummaries.
  function previewDayRecon(netCash, cardIn) {
    let cashCountedRaw = document.getElementById("reconCashCounted")?.value;
    let cardReceivedRaw = document.getElementById("reconCardReceived")?.value;
    let dc = document.getElementById("reconDiffCash");
    let dcd = document.getElementById("reconDiffCard");
    if (dc) {
      if (cashCountedRaw === "" || cashCountedRaw == null) { dc.textContent = "-"; dc.className = "row-value"; }
      else { let diff = (parseInt(cashCountedRaw) || 0) - netCash; dc.textContent = Utils.formatCurrency(diff); dc.className = "row-value " + (diff !== 0 ? "amount negative" : "amount positive"); }
    }
    if (dcd) {
      if (cardReceivedRaw === "" || cardReceivedRaw == null) { dcd.textContent = "-"; dcd.className = "row-value"; }
      else { let diff = (parseInt(cardReceivedRaw) || 0) - cardIn; dcd.textContent = Utils.formatCurrency(diff); dcd.className = "row-value " + (diff !== 0 ? "amount negative" : "amount positive"); }
    }
  }

  // Persists staff's till confirmation for an already-frozen business day.
  // Only ever adds/updates cashCounted, cardReceived, diffCash, diffCard,
  // reconConfirmedAt, reconConfirmedBy — cashIn/cardIn/cashOut/cardOut (the
  // frozen system totals) are read here for the diff math but never rewritten,
  // so a later autoClosePastDays tick (which only fills in missing totals,
  // never overwrites an existing frozen row) can't wipe or change this.
  async function saveDayRecon(key, netCash, cardIn) {
    let cashCountedInput = document.getElementById("reconCashCounted");
    let cardReceivedInput = document.getElementById("reconCardReceived");
    let cashCountedRaw = cashCountedInput ? cashCountedInput.value.trim() : "";
    let cardReceivedRaw = cardReceivedInput ? cardReceivedInput.value.trim() : "";
    if (!cashCountedRaw || !cardReceivedRaw) {
      App.toast("مبلغ شمارش‌شده صندوق و کارتخوان هر دو الزامی است");
      return;
    }

    let summary = await DB.get("dailySummaries", key);
    if (!summary) {
      App.toast("خطا: اطلاعات این روز یافت نشد");
      return;
    }

    let cashCounted = parseInt(cashCountedRaw) || 0;
    let cardReceived = parseInt(cardReceivedRaw) || 0;
    summary.cashCounted = cashCounted;
    summary.cardReceived = cardReceived;
    summary.diffCash = cashCounted - netCash;
    summary.diffCard = cardReceived - cardIn;
    summary.reconConfirmedAt = new Date().toISOString();
    let session = Auth.getSession();
    summary.reconConfirmedBy = session ? (session.name || session.username || "") : "";

    await DB.put("dailySummaries", summary);
    await DB.logActivity("تطبیق صندوق", "تاریخ: " + key + " | شمارش‌شده نقدی: " + Utils.formatCurrency(cashCounted) + " | کارتخوان: " + Utils.formatCurrency(cardReceived));
    App.closeModalForce();
    App.toast("تطبیق صندوق ذخیره شد");
    await loadMonthlyReport();
  }

  async function showFullTransactions() {
    let range = Utils.getReportRange();
    let sessions = await DB.getAll("sessions");
    let cafeOrders = await DB.getAll("cafeOrders");
    let debtPayments = await DB.getAll("debtPayments");
    let blockPayments = await DB.getAll("blockPayments");
    let customers = await DB.getAll("customers");
    let devices = await DB.getAll("devices");

    let all = [];
    sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, range.start, range.end)).forEach((s) => {
      let device = devices.find((d) => d.id === s.deviceId);
      let idsText = (s.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ");
      all.push({ txType: "session", txId: s.id, type: s.deviceType === "console" ? "کنسول" : s.deviceType === "billiard" ? "بیلیارد" : "پی‌سی", device: device ? device.name : "-", amount: s.settleAmount || 0, payType: s.settlePayType, time: s.settledAt, ids: idsText });
    });
    cafeOrders.filter((o) => Utils.isInRange(o.createdAt, range.start, range.end)).forEach((o) => {
      let c = customers.find((cu) => cu.id === o.customerId);
      all.push({ txType: "order", txId: o.id, type: "کافی‌شاپ", device: "-", amount: o.total, payType: o.payType, time: o.createdAt, ids: c ? "#" + (c.displayId || c.id) : "-" });
    });
    blockPayments.filter((bp) => Utils.isInRange(bp.date, range.start, range.end)).forEach((bp) => {
      let device = devices.find((d) => d.id === bp.deviceId);
      let c = customers.find((cu) => cu.id === bp.customerId);
      all.push({ txType: "blockPayment", txId: bp.id, type: bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : "تسویه بلوک", device: device ? device.name : "-", amount: bp.amount || 0, payType: bp.payType, time: bp.date, ids: c ? "#" + (c.displayId || c.id) : "-" });
    });

    all.sort((a, b) => new Date(b.time) - new Date(a.time));

    App.openModal(`<h2>لیست تراکنش‌ها</h2><div style="max-height:400px;overflow-y:auto;">
      ${all.map((t) => `<div class="list-row"><span class="row-label">${t.type}</span><span class="row-value">${t.device} | ${t.ids}</span><span class="row-value amount">${Utils.formatCurrency(t.amount)}</span><span class="text-muted text-sm">${t.payType} | ${Jalali.formatDateTime(t.time)}</span><button class="btn btn-sm btn-outline" onclick="Reports.editTransaction('${t.txType}', ${t.txId})">ویرایش</button></div>`).join("")}
    </div><div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>`);
  }

  async function editTransaction(txType, txId) {
    let t = null;
    if (txType === "session") {
      let s = await DB.get("sessions", txId);
      if (s && s.status === "settled") {
        let devices = await DB.getAll("devices");
        let device = devices.find((d) => d.id === s.deviceId);
        let customers = await DB.getAll("customers");
        let idsText = (s.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ");
        t = { type: "session", id: s.id, typeName: s.deviceType === "console" ? "کنسول" : s.deviceType === "billiard" ? "بیلیارد" : "پی‌سی", device: device ? device.name : "-", amount: s.settleAmount || 0, payType: s.settlePayType, ids: idsText };
      }
    } else if (txType === "blockPayment") {
      let bp = await DB.get("blockPayments", txId);
      if (bp) {
        let devices = await DB.getAll("devices");
        let device = devices.find((d) => d.id === bp.deviceId);
        let customers = await DB.getAll("customers");
        let c = customers.find((cu) => cu.id === bp.customerId);
        t = { type: "blockPayment", id: bp.id, typeName: bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : bp.deviceType === "console" ? "تسویه بلوک کنسول" : "تسویه بلوک بیلیارد", device: device ? device.name : "-", amount: bp.amount || 0, payType: bp.payType, ids: c ? "#" + (c.displayId || c.id) : "-" };
      }
    } else {
      let o = await DB.get("cafeOrders", txId);
      if (o) {
        let customers = await DB.getAll("customers");
        let c = customers.find((cu) => cu.id === o.customerId);
        t = { type: "order", id: o.id, typeName: "کافی‌شاپ", device: "-", amount: o.total, payType: o.payType, ids: c ? "#" + (c.displayId || c.id) : "-" };
      }
    }
    if (!t) return;

    App.openModal(`
      <h2>ویرایش تراکنش</h2>
      <div class="list-row"><span class="row-label">نوع</span><span class="row-value">${t.typeName}</span></div>
      <div class="form-group"><label>مبلغ</label><input type="number" id="editTxAmount" value="${t.amount}" min="0"></div>
      <div class="form-group"><label>روش پرداخت</label><select id="editTxPayType"><option value="cash" ${t.payType === 'cash' ? 'selected' : ''}>نقدی</option><option value="card" ${t.payType === 'card' ? 'selected' : ''}>کارتی</option><option value="wallet" ${t.payType === 'wallet' ? 'selected' : ''}>کیف‌پول</option><option value="debt" ${t.payType === 'debt' ? 'selected' : ''}>بدهکاری</option></select></div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Reports.saveEditTransaction('${t.type}', ${t.id})">ذخیره</button>
        <button class="btn btn-danger" onclick="Reports.deleteTransaction('${t.type}', ${t.id})">حذف</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  // Reverses a payment against a customer. When `payBreakdown` is provided (the
  // canonical record of each leg kept by split wallet→debt payments), each leg
  // is undone exactly: wallet is credited back, debt is reduced, and cash/card
  // reduce totalPaid. Without a breakdown it falls back to the legacy single-leg
  // interpretation of payType, so older records keep reversing correctly.
  async function reversePayment(customerId, amount, payType, payBreakdown) {
    if (!customerId || !amount) return;
    let customer = await DB.get("customers", customerId);
    if (!customer) return;
    if (payBreakdown && typeof payBreakdown === "object") {
      let w = payBreakdown.wallet || 0;
      let d = payBreakdown.debt || 0;
      let other = (payBreakdown.cash || 0) + (payBreakdown.card || 0);
      if (w) {
        customer.wallet = (customer.wallet || 0) + w;
        customer.totalPaid = Math.max(0, (customer.totalPaid || 0) - w);
      }
      if (d) {
        customer.debt = Math.max(0, (customer.debt || 0) - d);
      }
      if (other) {
        customer.totalPaid = Math.max(0, (customer.totalPaid || 0) - other);
      }
    } else if (payType === "wallet") {
      customer.wallet = (customer.wallet || 0) + amount;
      customer.totalPaid = Math.max(0, (customer.totalPaid || 0) - amount);
    } else if (payType === "debt") {
      customer.debt = Math.max(0, (customer.debt || 0) - amount);
    } else {
      customer.totalPaid = Math.max(0, (customer.totalPaid || 0) - amount);
    }
    await DB.put("customers", customer);
  }

  async function saveEditTransaction(type, id) {
    let newAmount = parseInt(document.getElementById("editTxAmount").value) || 0;
    let newPayType = document.getElementById("editTxPayType").value;
    if (type === "session") {
      let session = await DB.get("sessions", id);
      if (session) {
        let oldAmount = session.settleAmount || 0;
        let oldPayType = session.settlePayType || "cash";
        let customerId = session.settlePayerId || (session.ids && session.ids[0]) || null;
        if (customerId && (oldAmount !== newAmount || oldPayType !== newPayType)) {
          await reversePayment(customerId, oldAmount, oldPayType, session.payBreakdown);
          let payResult = await Utils.applyPayment(customerId, newAmount, newPayType);
          if (!payResult.success) {
            // Roll back to the original payment so the reversal above doesn't
            // leave the customer's balance short with nothing recorded.
            await Utils.applyPayment(customerId, oldAmount, oldPayType);
            App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
            return;
          }
          session.payBreakdown = payResult.payBreakdown;
        }
        session.settleAmount = newAmount;
        session.settlePayType = newPayType;
        await DB.put("sessions", session);
      }
    } else if (type === "blockPayment") {
      let bp = await DB.get("blockPayments", id);
      if (bp) {
        let oldAmount = bp.amount || 0;
        let oldPayType = bp.payType || "cash";
        if (bp.customerId && (oldAmount !== newAmount || oldPayType !== newPayType)) {
          await reversePayment(bp.customerId, oldAmount, oldPayType, bp.payBreakdown);
          let payResult = await Utils.applyPayment(bp.customerId, newAmount, newPayType);
          if (!payResult.success) {
            await Utils.applyPayment(bp.customerId, oldAmount, oldPayType);
            App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
            return;
          }
          bp.payBreakdown = payResult.payBreakdown;
        }
        bp.amount = newAmount;
        bp.payType = newPayType;
        await DB.put("blockPayments", bp);
      }
    } else {
      let order = await DB.get("cafeOrders", id);
      if (order) {
        let oldAmount = order.total || 0;
        let oldPayType = order.payType || "cash";
        if (order.customerId && (oldAmount !== newAmount || oldPayType !== newPayType)) {
          await reversePayment(order.customerId, oldAmount, oldPayType, order.payBreakdown);
          let payResult = await Utils.applyPayment(order.customerId, newAmount, newPayType);
          if (!payResult.success) {
            await Utils.applyPayment(order.customerId, oldAmount, oldPayType);
            App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
            return;
          }
          order.payBreakdown = payResult.payBreakdown;
        }
        order.total = newAmount;
        order.payType = newPayType;
        await DB.put("cafeOrders", order);
      }
    }
    await DB.logActivity("ویرایش تراکنش", "نوع: " + type + " | شناسه: " + id);
    App.closeModalForce();
    App.toast("ذخیره شد");
  }

  async function deleteTransaction(type, id) {
    if (!confirm("آیا از حذف این تراکنش مطمئن هستید؟")) return;
    if (type === "session") {
      let session = await DB.get("sessions", id);
      if (session) {
        let customerId = session.settlePayerId || (session.ids && session.ids[0]) || null;
        if (customerId) {
          await reversePayment(customerId, session.settleAmount || 0, session.settlePayType || "cash", session.payBreakdown);
        }
        // Restore cafe item stock for items attached to this session.
        await restoreCafeStock(session.items || []);
        session.status = "deleted";
        session.settledAt = null;
        await DB.put("sessions", session);
      }
    } else if (type === "blockPayment") {
      let bp = await DB.get("blockPayments", id);
      if (bp) {
        if (bp.customerId) {
          await reversePayment(bp.customerId, bp.amount || 0, bp.payType || "cash", bp.payBreakdown);
        }
        if (bp.deviceType === "tournament" && bp.matchId) {
          let match = await DB.get("matches", bp.matchId);
          if (match) {
            match.settled = false;
            match.settlePayType = null;
            match.settleAmount = null;
            match.settlerName = null;
            match.settledAt = null;
            await DB.put("matches", match);
          }
        }
        await DB.remove("blockPayments", id);
      }
    } else {
      let order = await DB.get("cafeOrders", id);
      if (order) {
        if (order.customerId) {
          await reversePayment(order.customerId, order.total || 0, order.payType || "cash", order.payBreakdown);
        }
        // Restore stock for the items in this cafe order.
        await restoreCafeStock((order.items || []).map((i) => ({ itemId: i.id, name: i.name, qty: i.qty })));
        await DB.remove("cafeOrders", id);
      }
    }
    await DB.logActivity("حذف تراکنش", "نوع: " + type + " | شناسه: " + id);
    App.closeModalForce();
    App.toast("حذف شد");
  }

  // Returns cafe item stock for a list of { itemId, name, qty } item records by
  // incrementing the matching cafeItems row. Item lookups prefer itemId (set on
  // session/order items) and fall back to name for records predating itemId.
  async function restoreCafeStock(items) {
    let cafeItems = await DB.getAll("cafeItems");
    for (let it of items) {
      let cafeItem = it.itemId != null
        ? cafeItems.find((ci) => ci.id === it.itemId)
        : cafeItems.find((ci) => ci.name === it.name);
      if (cafeItem && !cafeItem.unlimited) {
        cafeItem.stock += (it.qty || 1);
        cafeItem.stock = Math.max(0, cafeItem.stock);
        await DB.put("cafeItems", cafeItem);
      }
    }
  }

  async function exportDailyExcel() {
    let range = Utils.getReportRange();
    let sessions = await DB.getAll("sessions");
    let cafeOrders = await DB.getAll("cafeOrders");
    let blockPayments = await DB.getAll("blockPayments");
    let walletCharges = await DB.getAll("walletCharges");
    let cafeItems = await DB.getAll("cafeItems");
    let dailySummaries = await DB.getAll("dailySummaries");
    let tournaments = await DB.getAll("tournaments");
    let matches = await DB.getAll("matches");
    let customers = await DB.getAll("customers");
    let devices = await DB.getAll("devices");

    let data = [];
    sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, range.start, range.end)).forEach((s) => {
      let device = devices.find((d) => d.id === s.deviceId);
      let ids = (s.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ");
      data.push({ "نوع": s.deviceType, "دستگاه": device ? device.name : "", "شناسه‌ها": ids, "مبلغ": s.settleAmount, "روش": s.settlePayType, "تاریخ": Jalali.formatDateTime(s.settledAt), "تسویه‌کننده": s.settlerName || "" });
    });
    cafeOrders.filter((o) => Utils.isInRange(o.createdAt, range.start, range.end)).forEach((o) => {
      let c = customers.find((cu) => cu.id === o.customerId);
      let itemsText = (o.items || []).map((i) => i.name + " x" + i.qty).join("، ");
      data.push({ "نوع": "کافی‌شاپ", "دستگاه": "-", "شناسه‌ها": c ? "#" + (c.displayId || c.id) : "", "آیتم‌ها": itemsText, "مبلغ": o.total, "روش": o.payType, "تاریخ": Jalali.formatDateTime(o.createdAt), "تسویه‌کننده": "" });
    });
    blockPayments.filter((bp) => Utils.isInRange(bp.date, range.start, range.end)).forEach((bp) => {
      let device = devices.find((d) => d.id === bp.deviceId);
      let c = customers.find((cu) => cu.id === bp.customerId);
      data.push({ "نوع": bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : "تسویه بلوک", "دستگاه": device ? device.name : "", "شناسه‌ها": c ? "#" + (c.displayId || c.id) : "", "مبلغ": bp.amount, "روش": bp.payType, "تاریخ": Jalali.formatDateTime(bp.date), "تسویه‌کننده": bp.settlerName || "" });
    });
    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "گزارش روزانه");

    // Café orders with full item breakdown and pay type.
    let dailyOrders = cafeOrders.filter((o) => Utils.isInRange(o.createdAt, range.start, range.end));
    if (dailyOrders.length) {
      let wsOrders = XLSX.utils.json_to_sheet(dailyOrders.map((o) => {
        let c = customers.find((cu) => cu.id === o.customerId);
        return {
          "شناسه": c ? "#" + (c.displayId || c.id) : "",
          "آیتم‌ها": (o.items || []).map((i) => i.name + " x" + i.qty).join("، "),
          "جمع": o.total,
          "روش پرداخت": o.payType,
          "تاریخ": Jalali.formatDateTime(o.createdAt),
        };
      }));
      XLSX.utils.book_append_sheet(wb, wsOrders, "سفارشات کافی‌شاپ");
    }

    // Wallet charge history within the day.
    let dailyCharges = walletCharges.filter((c) => Utils.isInRange(c.date, range.start, range.end));
    if (dailyCharges.length) {
      let wsCharges = XLSX.utils.json_to_sheet(dailyCharges.map((ch) => {
        let c = customers.find((cu) => cu.id === ch.customerId);
        return {
          "شناسه": c ? "#" + (c.displayId || c.id) : "",
          "مبلغ": ch.amount,
          "روش": ch.paymentType === "cash" ? "نقدی" : "کارتی",
          "تاریخ": Jalali.formatDateTime(ch.date),
        };
      }));
      XLSX.utils.book_append_sheet(wb, wsCharges, "شارژ کیف‌پول");
    }

    // Current cafe item inventory levels.
    if (cafeItems.length) {
      let wsInventory = XLSX.utils.json_to_sheet(cafeItems.map((it) => ({
        "نام": it.name,
        "قیمت": it.price,
        "موجودی": it.unlimited ? "نامحدود" : it.stock,
      })));
      XLSX.utils.book_append_sheet(wb, wsInventory, "موجودی کافی‌شاپ");
    }

    // Day-close summary (all recorded days, not just today).
    if (dailySummaries.length) {
      let wsSummary = XLSX.utils.json_to_sheet(dailySummaries.map((s) => ({
        "تاریخ": s.date,
        "نقدی ورودی": s.cashIn,
        "کارتی ورودی": s.cardIn,
        "نقدی خروجی": s.cashOut,
        "کارتی خروجی": s.cardOut,
        "زمان بستن": s.closedAt ? Jalali.formatDateTime(s.closedAt) : "",
      })));
      XLSX.utils.book_append_sheet(wb, wsSummary, "بستن روز");
    }

    // Tournament match settlements (blockPayments with deviceType "tournament").
    let tournamentSettlements = blockPayments.filter((bp) => bp.deviceType === "tournament" && Utils.isInRange(bp.date, range.start, range.end));
    if (tournamentSettlements.length) {
      let wsTournament = XLSX.utils.json_to_sheet(tournamentSettlements.map((bp) => {
        let c = customers.find((cu) => cu.id === bp.customerId);
        let t = tournaments.find((tt) => tt.matches && tt.matches.includes(bp.matchId));
        return {
          "مسابقه": t ? t.name : "",
          "شناسه پرداخت‌کننده": c ? "#" + (c.displayId || c.id) : "",
          "مبلغ": bp.amount,
          "روش": bp.payType,
          "تاریخ": Jalali.formatDateTime(bp.date),
          "تسویه‌کننده": bp.settlerName || "",
        };
      }));
      XLSX.utils.book_append_sheet(wb, wsTournament, "تسویه مسابقات");
    }

    XLSX.writeFile(wb, "گزارش_روزانه_" + Jalali.formatDate(new Date()).replace(/\//g, "-") + ".xlsx");
    App.toast("اکسل دانلود شد");
  }

  async function exportMonthlyExcel() {
    let month = parseInt(document.getElementById("monthlyMonth")?.value);
    let year = parseInt(document.getElementById("monthlyYear")?.value);
    let firstDay = Jalali.getJalaliFirstDayOfMonth(year, month);
    let monthDays = Jalali.getJalaliMonthDays(year, month);

    // Match the chart/list exactly: the month's export window is the UNION of
    // each Jalali calendar day's business-day range (getReportRange(noon)),
    // i.e. [day-1's 23:35, last day's 23:35) — NOT calendar midnight. Using
    // calendar midnight here would lose or shift a transaction that happens
    // between 23:35 and midnight on the first/last day of the month relative
    // to what the chart/list already show for those same days.
    let monthStart = Utils.getReportRange(new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate(), 12, 0, 0)).start;
    let lastCalendarDay = new Date(firstDay); lastCalendarDay.setDate(lastCalendarDay.getDate() + monthDays - 1);
    let monthEnd = Utils.getReportRange(new Date(lastCalendarDay.getFullYear(), lastCalendarDay.getMonth(), lastCalendarDay.getDate(), 12, 0, 0)).end;

    let sessions = await DB.getAll("sessions");
    let cafeOrders = await DB.getAll("cafeOrders");
    let blockPayments = await DB.getAll("blockPayments");
    let walletCharges = await DB.getAll("walletCharges");
    let cafeItems = await DB.getAll("cafeItems");
    let dailySummaries = await DB.getAll("dailySummaries");
    let tournaments = await DB.getAll("tournaments");
    let customers = await DB.getAll("customers");
    let devices = await DB.getAll("devices");

    let data = [];
    sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, monthStart, monthEnd)).forEach((s) => {
      let device = devices.find((d) => d.id === s.deviceId);
      let ids = (s.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ");
      data.push({ "نوع": s.deviceType, "دستگاه": device ? device.name : "", "شناسه‌ها": ids, "مبلغ": s.settleAmount, "روش": s.settlePayType, "تاریخ": Jalali.formatDateTime(s.settledAt) });
    });
    cafeOrders.filter((o) => Utils.isInRange(o.createdAt, monthStart, monthEnd)).forEach((o) => {
      let c = customers.find((cu) => cu.id === o.customerId);
      data.push({ "نوع": "کافی‌شاپ", "شناسه": c ? "#" + (c.displayId || c.id) : "", "آیتم‌ها": (o.items || []).map((i) => i.name + " x" + i.qty).join("، "), "مبلغ": o.total, "روش": o.payType, "تاریخ": Jalali.formatDateTime(o.createdAt) });
    });
    blockPayments.filter((bp) => Utils.isInRange(bp.date, monthStart, monthEnd)).forEach((bp) => {
      let c = customers.find((cu) => cu.id === bp.customerId);
      data.push({ "نوع": bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : "تسویه بلوک", "شناسه": c ? "#" + (c.displayId || c.id) : "", "مبلغ": bp.amount, "روش": bp.payType, "تاریخ": Jalali.formatDateTime(bp.date) });
    });
    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ماهانه");

    // Wallet charge history within the month.
    let monthCharges = walletCharges.filter((c) => Utils.isInRange(c.date, monthStart, monthEnd));
    if (monthCharges.length) {
      let wsCharges = XLSX.utils.json_to_sheet(monthCharges.map((ch) => {
        let c = customers.find((cu) => cu.id === ch.customerId);
        return { "شناسه": c ? "#" + (c.displayId || c.id) : "", "مبلغ": ch.amount, "روش": ch.paymentType === "cash" ? "نقدی" : "کارتی", "تاریخ": Jalali.formatDateTime(ch.date) };
      }));
      XLSX.utils.book_append_sheet(wb, wsCharges, "شارژ کیف‌پول");
    }

    // Current cafe item inventory levels.
    if (cafeItems.length) {
      let wsInventory = XLSX.utils.json_to_sheet(cafeItems.map((it) => ({ "نام": it.name, "قیمت": it.price, "موجودی": it.unlimited ? "نامحدود" : it.stock })));
      XLSX.utils.book_append_sheet(wb, wsInventory, "موجودی کافی‌شاپ");
    }

    // Day-close summary records within the month, keyed by the business-day
    // key (see Utils.getBusinessDayKey) that freezeBusinessDay actually saves under —
    // matching by that key, not by string-prefixing "year/month", keeps this
    // in sync with how dailySummaries.date is produced.
    let monthSummaries = dailySummaries.filter((s) => s.date && s.date.startsWith(year + "/" + String(month).padStart(2, "0")));
    if (monthSummaries.length) {
      let wsSummary = XLSX.utils.json_to_sheet(monthSummaries.map((s) => ({
        "تاریخ": s.date, "نقدی ورودی": s.cashIn, "کارتی ورودی": s.cardIn, "نقدی خروجی": s.cashOut, "کارتی خروجی": s.cardOut,
        "زمان بستن خودکار": s.autoClosedAt ? Jalali.formatDateTime(s.autoClosedAt) : "",
        "شمارش‌شده نقدی": s.cashCounted != null ? s.cashCounted : "", "کارتخوان": s.cardReceived != null ? s.cardReceived : "",
        "اختلاف نقدی": s.diffCash != null ? s.diffCash : "", "اختلاف کارتخوان": s.diffCard != null ? s.diffCard : "",
        "زمان تأیید تطبیق": s.reconConfirmedAt ? Jalali.formatDateTime(s.reconConfirmedAt) : "",
      })));
      XLSX.utils.book_append_sheet(wb, wsSummary, "بستن روز");
    }

    // Tournament match settlements within the month.
    let monthTournament = blockPayments.filter((bp) => bp.deviceType === "tournament" && Utils.isInRange(bp.date, monthStart, monthEnd));
    if (monthTournament.length) {
      let wsTournament = XLSX.utils.json_to_sheet(monthTournament.map((bp) => {
        let c = customers.find((cu) => cu.id === bp.customerId);
        let t = tournaments.find((tt) => tt.matches && tt.matches.includes(bp.matchId));
        return { "مسابقه": t ? t.name : "", "شناسه": c ? "#" + (c.displayId || c.id) : "", "مبلغ": bp.amount, "روش": bp.payType, "تاریخ": Jalali.formatDateTime(bp.date) };
      }));
      XLSX.utils.book_append_sheet(wb, wsTournament, "تسویه مسابقات");
    }

    XLSX.writeFile(wb, "گزارش_ماهانه_" + year + "-" + month + ".xlsx");
    App.toast("اکسل دانلود شد");
  }

  return { renderDaily, renderInstant, renderMonthly, loadMonthlyReport, showFullTransactions, exportDailyExcel, exportMonthlyExcel, showDayRecon, previewDayRecon, saveDayRecon, editTransaction, saveEditTransaction, deleteTransaction, reversePayment, calculateDailyTotals, freezeBusinessDay, autoClosePastDays };
})();
