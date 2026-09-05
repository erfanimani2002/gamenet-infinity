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

    let calcSection = (sessionsList) => {
      let cash = 0, card = 0;
      sessionsList.forEach((s) => {
        let amt = s.settleAmount || 0;
        if (s.settlePayType === "cash") cash += amt;
        else if (s.settlePayType === "card") card += amt;
      });
      return { cash, card, total: cash + card };
    };

    let consoleCalc = calcSection(settledSessions.filter((s) => s.deviceType === "console"));
    let billiardCalc = calcSection(settledSessions.filter((s) => s.deviceType === "billiard"));
    let pcCalc = calcSection(settledSessions.filter((s) => s.deviceType === "pc"));

    let consoleBlock = { cash: 0, card: 0 };
    let billiardBlock = { cash: 0, card: 0 };
    let tournamentMatchBlock = { cash: 0, card: 0 };
    let dailyBlockPayments = blockPayments.filter((bp) => Utils.isInRange(bp.date, range.start, range.end));
    dailyBlockPayments.forEach((bp) => {
      let amt = bp.amount || 0;
      let target = bp.deviceType === "console" ? consoleBlock : bp.deviceType === "tournament" ? tournamentMatchBlock : billiardBlock;
      if (bp.payType === "cash") target.cash += amt;
      else if (bp.payType === "card") target.card += amt;
    });

    let cafeCash = 0, cafeCard = 0;
    dailyOrders.forEach((o) => { if (o.payType === "cash") cafeCash += o.total; else if (o.payType === "card") cafeCard += o.total; });

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
    let tournamentCash = 0, tournamentCard = 0;
    tournaments.forEach((t) => {
      if (!t.entryFeeStatus) return;
      Object.values(t.entryFeeStatus).forEach((efs) => {
        if (efs.collected && efs.settledAt && Utils.isInRange(efs.settledAt, range.start, range.end)) {
          if (efs.payType === "cash") tournamentCash += t.entryFee || 0;
          else if (efs.payType === "card") tournamentCard += t.entryFee || 0;
        }
      });
    });
    tournamentCash += tournamentMatchBlock.cash;
    tournamentCard += tournamentMatchBlock.card;

    // Prize payouts paid out as cash/card are cash-outs, the same way purchases
    // are. A payout credited to the winner's wallet doesn't leave the till, so
    // it's recorded but excluded from the cash/card reconciliation totals.
    let dailyPayouts = payouts.filter((p) => Utils.isInRange(p.date, range.start, range.end));
    let payoutCash = 0, payoutCard = 0;
    dailyPayouts.forEach((p) => {
      if (p.payType === "cash") payoutCash += p.amount || 0;
      else if (p.payType === "card") payoutCard += p.amount || 0;
    });

    let totalCashIn = consoleCalc.cash + consoleBlock.cash + billiardCalc.cash + billiardBlock.cash + pcCalc.cash + cafeCash + debtCash + chargeCash + tournamentCash;
    let totalCardIn = consoleCalc.card + consoleBlock.card + billiardCalc.card + billiardBlock.card + pcCalc.card + cafeCard + debtCard + chargeCard + tournamentCard;
    let totalCashOut = purchaseCash + payoutCash;
    let totalCardOut = purchaseCard + payoutCard;

    return {
      consoleCalc, billiardCalc, pcCalc, consoleBlock, billiardBlock,
      cafeCash, cafeCard, debtCash, debtCard, chargeCash, chargeCard,
      purchaseCash, purchaseCard, purchaseOther, payoutCash, payoutCard,
      tournamentCash, tournamentCard, activeMatches,
      totalCashIn, totalCardIn, totalCashOut, totalCardOut,
    };
  }

  async function renderDaily(el) {
    let range = Utils.getReportRange();
    let d = await calculateDailyTotals(range);
    let {
      consoleCalc, billiardCalc, pcCalc, consoleBlock, billiardBlock,
      cafeCash, cafeCard, debtCash, debtCard, chargeCash, chargeCard,
      purchaseCash, purchaseCard, purchaseOther, payoutCash, payoutCard,
      tournamentCash, tournamentCard, activeMatches,
      totalCashIn, totalCardIn, totalCashOut, totalCardOut,
    } = d;

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

        <h3>دریافتی‌ها</h3>

        <div class="report-section">
          <h4>کنسول‌ها</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(consoleCalc.cash + consoleBlock.cash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(consoleCalc.card + consoleBlock.card)}</div></div>
          </div>
        </div>

        <div class="report-section">
          <h4>بیلیارد</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(billiardCalc.cash + billiardBlock.cash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(billiardCalc.card + billiardBlock.card)}</div></div>
          </div>
        </div>

        <div class="report-section">
          <h4>پی‌سی</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(pcCalc.cash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(pcCalc.card)}</div></div>
          </div>
        </div>

        <div class="report-section">
          <h4>کافی‌شاپ</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(cafeCash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(cafeCard)}</div></div>
          </div>
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

        ${(tournamentCash + tournamentCard) > 0 ? `
        <div class="report-section">
          <h4>مسابقات</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی حق ورود</div><div class="summary-value">${Utils.formatCurrency(tournamentCash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی حق ورود</div><div class="summary-value">${Utils.formatCurrency(tournamentCard)}</div></div>
            <div class="summary-item"><div class="summary-label">بازی‌های تکمیل‌شده</div><div class="summary-value">${activeMatches.length}</div></div>
          </div>
        </div>
        ` : ''}

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
        <h3>تطبیق صندوق</h3>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">نقدی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn)}</div></div>
          <div class="summary-item"><div class="summary-label">نقدی پرداختی (خرید + جایزه)</div><div class="summary-value amount negative">${Utils.formatCurrency(totalCashOut)}</div></div>
          <div class="summary-item"><div class="summary-label">مانده نقدی</div><div class="summary-value font-bold">${Utils.formatCurrency(totalCashIn - totalCashOut)}</div></div>
        </div>
        <div class="form-inline">
          <div class="form-group"><label>مبلغ شمارش‌شده صندوق</label><input type="number" id="cashCounted" placeholder="0" min="0"></div>
          <div class="form-group"><label>مبلغ کارتخوان</label><input type="number" id="cardReceived" placeholder="0" min="0"></div>
        </div>
        <div id="reconciliationResult" style="margin-top:8px">
          <div class="list-row"><span class="row-label">اختلاف نقدی</span><span class="row-value" id="diffCash">-</span></div>
          <div class="list-row"><span class="row-label">اختلاف کارتخوان</span><span class="row-value" id="diffCard">-</span></div>
        </div>

        <hr class="section-divider">
        <div class="flex-gap">
          <button class="btn btn-primary" onclick="Reports.exportDailyExcel()">خروجی اکسل</button>
          <button class="btn btn-outline" onclick="Reports.showFullTransactions()">لیست تراکنش‌ها</button>
          <button class="btn btn-success" onclick="Reports.closeDay(${totalCashIn}, ${totalCardIn}, ${totalCashOut}, ${totalCardOut})">بستن روز</button>
        </div>
      </div>
    `;
    el.innerHTML = html;

    document.getElementById("cashCounted").addEventListener("input", () => calcRecon(totalCashIn - totalCashOut, totalCardIn));
    document.getElementById("cardReceived").addEventListener("input", () => calcRecon(totalCashIn - totalCashOut, totalCardIn));
  }

  function calcRecon(systemCash, systemCard) {
    let cashCounted = parseInt(document.getElementById("cashCounted")?.value) || 0;
    let cardReceived = parseInt(document.getElementById("cardReceived")?.value) || 0;
    let diffCash = cashCounted - systemCash;
    let diffCard = cardReceived - systemCard;
    let dc = document.getElementById("diffCash");
    let dcd = document.getElementById("diffCard");
    if (dc) { dc.textContent = Utils.formatCurrency(diffCash); dc.className = "row-value " + (diffCash !== 0 ? "amount negative" : "amount positive"); }
    if (dcd) { dcd.textContent = Utils.formatCurrency(diffCard); dcd.className = "row-value " + (diffCard !== 0 ? "amount negative" : "amount positive"); }
  }

  async function renderInstant(el) {
    let range = Utils.getCurrentReportRange();
    let sessions = await DB.getAll("sessions");
    let cafeOrders = await DB.getAll("cafeOrders");
    let debtPayments = await DB.getAll("debtPayments");
    let blockPayments = await DB.getAll("blockPayments");

    let tournaments = await DB.getAll("tournaments");
    let matches = await DB.getAll("matches");
    let activeMatches = matches.filter((m) => m.status === "completed" && m.timerEnd && Utils.isInRange(m.timerEnd, range.start, range.end));
    let tournamentCash = 0, tournamentCard = 0;
    tournaments.forEach((t) => {
      if (!t.entryFeeStatus) return;
      Object.values(t.entryFeeStatus).forEach((efs) => {
        if (efs.collected && efs.settledAt && Utils.isInRange(efs.settledAt, range.start, range.end)) {
          if (efs.payType === "cash") tournamentCash += t.entryFee || 0;
          else if (efs.payType === "card") tournamentCard += t.entryFee || 0;
        }
      });
    });

    let walletCharges = await DB.getAll("walletCharges");
    let dailyCharges = walletCharges.filter((c) => Utils.isInRange(c.date, range.start, range.end));
    let chargeCash = 0, chargeCard = 0;
    dailyCharges.forEach((c) => { if (c.paymentType === "cash") chargeCash += c.amount; else chargeCard += c.amount; });

    let allTransactions = [
      ...sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, range.start, range.end)).map((s) => ({ payType: s.settlePayType, amount: s.settleAmount || 0 })),
      ...cafeOrders.filter((o) => Utils.isInRange(o.createdAt, range.start, range.end)).map((o) => ({ payType: o.payType, amount: o.total })),
      ...debtPayments.filter((p) => Utils.isInRange(p.date, range.start, range.end)).map((d) => ({ payType: d.paymentType, amount: d.amount })),
      ...blockPayments.filter((bp) => Utils.isInRange(bp.date, range.start, range.end)).map((bp) => ({ payType: bp.payType, amount: bp.amount })),
    ];

    let totalCash = chargeCash + tournamentCash, totalCard = chargeCard + tournamentCard;
    allTransactions.forEach((t) => { if (t.payType === "cash") totalCash += t.amount; else if (t.payType === "card") totalCard += t.amount; });

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>گزارش لحظه‌ای</h2>
          <div class="text-muted text-sm">از ${Jalali.formatDateTime(range.start)} تا الان</div>
        </div>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">جمع کل</div><div class="summary-value">${Utils.formatCurrency(totalCash + totalCard)}</div></div>
          <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(totalCash)}</div></div>
          <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(totalCard)}</div></div>
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

    let dayData = {};
    for (let d = 0; d < monthDays; d++) {
      // Business day boundaries are [calendarDay-1 23:35, calendarDay 23:35), the
      // same window Utils.getReportRange uses for "today" — computed here by
      // passing noon of that calendar day, which always falls inside that window.
      let calendarDay = new Date(firstDay); calendarDay.setDate(calendarDay.getDate() + d);
      let noon = new Date(calendarDay.getFullYear(), calendarDay.getMonth(), calendarDay.getDate(), 12, 0, 0);
      let dayRange = Utils.getReportRange(noon);
      let totals = await calculateDailyTotals(dayRange, preloaded);
      dayData[d + 1] = totals.totalCashIn + totals.totalCardIn;
    }

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
      <div class="report-section"><h3>فهرست روزبه‌رو</h3>
        ${Object.entries(dayData).map(([day, total]) => {
          let dayDate = new Date(firstDay); dayDate.setDate(dayDate.getDate() + parseInt(day) - 1);
          let weekday = Utils.getJalaliWeekday(dayDate);
          return `<div class="list-row"><span class="row-label">روز ${day} (${weekday})</span><span class="row-value">${Utils.formatCurrency(total)}</span></div>`;
        }).join("")}
      </div>
      <button class="btn btn-primary" onclick="Reports.exportMonthlyExcel()">خروجی اکسل</button>
    `;
  }

  async function closeDay(cashIn, cardIn, cashOut, cardOut) {
    if (!confirm("آیا از بستن روز مطمئن هستید؟ اطلاعات در گزارش ماهانه ثبت خواهد شد.")) return;
    let today = Jalali.getTodayJalali();
    let key = today.year + "/" + String(today.month).padStart(2, "0") + "/" + String(today.day).padStart(2, "0");
    let daySummary = { date: key, cashIn: cashIn, cardIn: cardIn, cashOut: cashOut, cardOut: cardOut, closedAt: new Date().toISOString() };
    await DB.put("dailySummaries", daySummary);
    await DB.logActivity("بستن روز", "تاریخ: " + key + " | نقدی: " + Utils.formatCurrency(cashIn) + " | کارتی: " + Utils.formatCurrency(cardIn));
    App.toast("روز بسته شد");
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

  async function reversePayment(customerId, amount, payType) {
    if (!customerId || !amount) return;
    let customer = await DB.get("customers", customerId);
    if (!customer) return;
    if (payType === "wallet") {
      customer.wallet += amount;
      customer.totalPaid = Math.max(0, (customer.totalPaid || 0) - amount);
    } else if (payType === "debt") {
      customer.debt = Math.max(0, customer.debt - amount);
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
          await reversePayment(customerId, oldAmount, oldPayType);
          let payResult = await Utils.applyPayment(customerId, newAmount, newPayType);
          if (!payResult.success) {
            // Roll back to the original payment so the reversal above doesn't
            // leave the customer's balance short with nothing recorded.
            await Utils.applyPayment(customerId, oldAmount, oldPayType);
            App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
            return;
          }
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
          await reversePayment(bp.customerId, oldAmount, oldPayType);
          let payResult = await Utils.applyPayment(bp.customerId, newAmount, newPayType);
          if (!payResult.success) {
            await Utils.applyPayment(bp.customerId, oldAmount, oldPayType);
            App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
            return;
          }
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
          await reversePayment(order.customerId, oldAmount, oldPayType);
          let payResult = await Utils.applyPayment(order.customerId, newAmount, newPayType);
          if (!payResult.success) {
            await Utils.applyPayment(order.customerId, oldAmount, oldPayType);
            App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
            return;
          }
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
          await reversePayment(customerId, session.settleAmount || 0, session.settlePayType || "cash");
        }
        session.status = "deleted";
        session.settledAt = null;
        await DB.put("sessions", session);
      }
    } else if (type === "blockPayment") {
      let bp = await DB.get("blockPayments", id);
      if (bp) {
        if (bp.customerId) {
          await reversePayment(bp.customerId, bp.amount || 0, bp.payType || "cash");
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
          await reversePayment(order.customerId, order.total || 0, order.payType || "cash");
        }
        await DB.remove("cafeOrders", id);
      }
    }
    await DB.logActivity("حذف تراکنش", "نوع: " + type + " | شناسه: " + id);
    App.closeModalForce();
    App.toast("حذف شد");
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
    let lastDay = new Date(firstDay); lastDay.setDate(lastDay.getDate() + monthDays);
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
    sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, firstDay, lastDay)).forEach((s) => {
      let device = devices.find((d) => d.id === s.deviceId);
      let ids = (s.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ");
      data.push({ "نوع": s.deviceType, "دستگاه": device ? device.name : "", "شناسه‌ها": ids, "مبلغ": s.settleAmount, "روش": s.settlePayType, "تاریخ": Jalali.formatDateTime(s.settledAt) });
    });
    cafeOrders.filter((o) => Utils.isInRange(o.createdAt, firstDay, lastDay)).forEach((o) => {
      let c = customers.find((cu) => cu.id === o.customerId);
      data.push({ "نوع": "کافی‌شاپ", "شناسه": c ? "#" + (c.displayId || c.id) : "", "آیتم‌ها": (o.items || []).map((i) => i.name + " x" + i.qty).join("، "), "مبلغ": o.total, "روش": o.payType, "تاریخ": Jalali.formatDateTime(o.createdAt) });
    });
    blockPayments.filter((bp) => Utils.isInRange(bp.date, firstDay, lastDay)).forEach((bp) => {
      let c = customers.find((cu) => cu.id === bp.customerId);
      data.push({ "نوع": bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : "تسویه بلوک", "شناسه": c ? "#" + (c.displayId || c.id) : "", "مبلغ": bp.amount, "روش": bp.payType, "تاریخ": Jalali.formatDateTime(bp.date) });
    });
    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ماهانه");

    // Wallet charge history within the month.
    let monthCharges = walletCharges.filter((c) => Utils.isInRange(c.date, firstDay, lastDay));
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

    // Day-close summary records within the month.
    let monthSummaries = dailySummaries.filter((s) => s.date && s.date.startsWith(year + "/" + String(month).padStart(2, "0")));
    if (monthSummaries.length) {
      let wsSummary = XLSX.utils.json_to_sheet(monthSummaries.map((s) => ({ "تاریخ": s.date, "نقدی ورودی": s.cashIn, "کارتی ورودی": s.cardIn, "نقدی خروجی": s.cashOut, "کارتی خروجی": s.cardOut })));
      XLSX.utils.book_append_sheet(wb, wsSummary, "بستن روز");
    }

    // Tournament match settlements within the month.
    let monthTournament = blockPayments.filter((bp) => bp.deviceType === "tournament" && Utils.isInRange(bp.date, firstDay, lastDay));
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

  return { renderDaily, renderInstant, renderMonthly, loadMonthlyReport, showFullTransactions, exportDailyExcel, exportMonthlyExcel, closeDay, editTransaction, saveEditTransaction, deleteTransaction, reversePayment, calculateDailyTotals };
})();
