const Reports = (function () {
  async function renderDaily(el) {
    let range = Utils.getReportRange();
    let sessions = await DB.getAll("sessions");
    let cafeOrders = await DB.getAll("cafeOrders");
    let debtPayments = await DB.getAll("debtPayments");
    let walletCharges = await DB.getAll("walletCharges");
    let purchases = await DB.getAll("purchases");

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
      else purchaseOther += p.amount;
    });

    let tournaments = await DB.getAll("tournaments");
    let matchData = await DB.getAll("matches");
    let dailyTournaments = tournaments.filter((t) => Utils.isInRange(t.createdAt, range.start, range.end));
    let activeMatches = matchData.filter((m) => m.status === "completed" && m.timerEnd && Utils.isInRange(m.timerEnd, range.start, range.end));
    let totalTournamentIncome = dailyTournaments.reduce((s, t) => s + (t.entryFee || 0) * (t.participants || []).length, 0);

    let totalCashIn = consoleCalc.cash + billiardCalc.cash + pcCalc.cash + cafeCash + debtCash + chargeCash + totalTournamentIncome;
    let totalCardIn = consoleCalc.card + billiardCalc.card + pcCalc.card + cafeCard + debtCard + chargeCard;
    let totalCashOut = purchaseCash;
    let totalCardOut = purchaseCard;

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
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(consoleCalc.cash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(consoleCalc.card)}</div></div>
          </div>
        </div>

        <div class="report-section">
          <h4>بیلیارد</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(billiardCalc.cash)}</div></div>
            <div class="summary-item"><div class="summary-label">کارتی</div><div class="summary-value">${Utils.formatCurrency(billiardCalc.card)}</div></div>
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

        ${dailyTournaments.length > 0 ? `
        <div class="report-section">
          <h4>مسابقات (${dailyTournaments.length})</h4>
          <div class="report-summary">
            <div class="summary-item"><div class="summary-label">درآمد حق ورود</div><div class="summary-value">${Utils.formatCurrency(totalTournamentIncome)}</div></div>
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

        <hr class="section-divider">
        <h3>تطبیق صندوق</h3>
        <div class="report-summary">
          <div class="summary-item"><div class="summary-label">نقدی دریافتی</div><div class="summary-value">${Utils.formatCurrency(totalCashIn)}</div></div>
          <div class="summary-item"><div class="summary-label">نقدی پرداختی (خرید)</div><div class="summary-value amount negative">${Utils.formatCurrency(purchaseCash)}</div></div>
          <div class="summary-item"><div class="summary-label">مانده نقدی</div><div class="summary-value font-bold">${Utils.formatCurrency(totalCashIn - purchaseCash)}</div></div>
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
          <button class="btn btn-success" onclick="Reports.closeDay(${totalCashIn}, ${totalCardIn}, ${purchaseCash}, ${totalCardOut})">بستن روز</button>
        </div>
      </div>
    `;
    el.innerHTML = html;

    document.getElementById("cashCounted").addEventListener("input", () => calcRecon(totalCashIn - purchaseCash, totalCardIn));
    document.getElementById("cardReceived").addEventListener("input", () => calcRecon(totalCashIn - purchaseCash, totalCardIn));
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

    let tournaments = await DB.getAll("tournaments");
    let matches = await DB.getAll("matches");
    let dailyTournaments = tournaments.filter((t) => Utils.isInRange(t.createdAt, range.start, range.end));
    let activeMatches = matches.filter((m) => m.status === "completed" && m.timerEnd && Utils.isInRange(m.timerEnd, range.start, range.end));
    let totalTournamentIncome = dailyTournaments.reduce((s, t) => s + (t.entryFee || 0) * (t.participants || []).length, 0);
    let totalDeviceCost = activeMatches.reduce((s, m) => s + (m.deviceCost || 0), 0);

    let allTransactions = [
      ...sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, range.start, range.end)).map((s) => ({ payType: s.settlePayType, amount: s.settleAmount || 0 })),
      ...cafeOrders.filter((o) => Utils.isInRange(o.createdAt, range.start, range.end)).map((o) => ({ payType: o.payType, amount: o.total })),
      ...debtPayments.filter((p) => Utils.isInRange(p.date, range.start, range.end)).map((d) => ({ payType: d.paymentType, amount: d.amount })),
    ];

    let totalCash = 0, totalCard = 0;
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
    let lastDay = new Date(firstDay); lastDay.setDate(lastDay.getDate() + monthDays);

    let sessions = await DB.getAll("sessions");
    let cafeOrders = await DB.getAll("cafeOrders");
    let debtPayments = await DB.getAll("debtPayments");

    let monthSessions = sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, firstDay, lastDay));
    let monthOrders = cafeOrders.filter((o) => Utils.isInRange(o.createdAt, firstDay, lastDay));
    let monthDebts = debtPayments.filter((p) => Utils.isInRange(p.date, firstDay, lastDay));

    let dayData = {};
    for (let d = 0; d < monthDays; d++) {
      let dayDate = new Date(firstDay); dayDate.setDate(dayDate.getDate() + d);
      let nextDay = new Date(dayDate); nextDay.setDate(nextDay.getDate() + 1);
      let total = 0;
      monthSessions.filter((s) => Utils.isInRange(s.settledAt, dayDate, nextDay)).forEach((s) => total += s.settleAmount || 0);
      monthOrders.filter((o) => Utils.isInRange(o.createdAt, dayDate, nextDay)).forEach((o) => total += o.total || 0);
      monthDebts.filter((p) => Utils.isInRange(p.date, dayDate, nextDay)).forEach((p) => total += p.amount || 0);
      dayData[d + 1] = total;
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

    let tournaments = await DB.getAll("tournaments");
    let matchData = await DB.getAll("matches");
    tournaments.filter((t) => t.status === "completed" && t.createdAt && Utils.isInRange(t.createdAt, range.start, range.end)).forEach((t) => {
      let completedMatches = matchData.filter((m) => m.tournamentId === t.id && m.status === "completed");
      completedMatches.forEach((m) => {
        let cA = customers.find((cu) => cu.id === m.playerA);
        let cB = customers.find((cu) => cu.id === m.playerB);
        let nameA = cA ? "#" + (cA.displayId || cA.id) : "-";
        let nameB = cB ? "#" + (cB.displayId || cB.id) : "-";
        all.push({ txType: "match", txId: m.id, type: "مسابقه", device: t.name, amount: m.deviceCost || 0, payType: "tournament", time: m.timerEnd || t.createdAt, ids: nameA + " vs " + nameB });
      });
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
        t = { type: "session", session: s, typeName: s.deviceType === "console" ? "کنسول" : s.deviceType === "billiard" ? "بیلیارد" : "پی‌سی", device: device ? device.name : "-", amount: s.settleAmount || 0, payType: s.settlePayType, ids: idsText };
      }
    } else {
      let o = await DB.get("cafeOrders", txId);
      if (o) {
        let customers = await DB.getAll("customers");
        let c = customers.find((cu) => cu.id === o.customerId);
        t = { type: "order", order: o, typeName: "کافی‌شاپ", device: "-", amount: o.total, payType: o.payType, ids: c ? "#" + (c.displayId || c.id) : "-" };
      }
    }
    if (!t) return;

    App.openModal(`
      <h2>ویرایش تراکنش</h2>
      <div class="list-row"><span class="row-label">نوع</span><span class="row-value">${t.typeName}</span></div>
      <div class="form-group"><label>مبلغ</label><input type="number" id="editTxAmount" value="${t.amount}" min="0"></div>
      <div class="form-group"><label>روش پرداخت</label><select id="editTxPayType"><option value="cash" ${t.payType === 'cash' ? 'selected' : ''}>نقدی</option><option value="card" ${t.payType === 'card' ? 'selected' : ''}>کارتی</option><option value="wallet" ${t.payType === 'wallet' ? 'selected' : ''}>کیف‌پول</option><option value="debt" ${t.payType === 'debt' ? 'selected' : ''}>بدهکاری</option></select></div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Reports.saveEditTransaction('${t.type}', ${t.type === 'session' ? t.session.id : t.order.id})">ذخیره</button>
        <button class="btn btn-danger" onclick="Reports.deleteTransaction('${t.type}', ${t.type === 'session' ? t.session.id : t.order.id})">حذف</button>
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
        let customerId = (session.ids && session.ids[0]) || null;
        if (customerId && (oldAmount !== newAmount || oldPayType !== newPayType)) {
          await reversePayment(customerId, oldAmount, oldPayType);
          await Utils.applyPayment(customerId, newAmount, newPayType);
        }
        session.settleAmount = newAmount;
        session.settlePayType = newPayType;
        await DB.put("sessions", session);
      }
    } else {
      let order = await DB.get("cafeOrders", id);
      if (order) {
        let oldAmount = order.total || 0;
        let oldPayType = order.payType || "cash";
        if (order.customerId && (oldAmount !== newAmount || oldPayType !== newPayType)) {
          await reversePayment(order.customerId, oldAmount, oldPayType);
          await Utils.applyPayment(order.customerId, newAmount, newPayType);
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
        let customerId = (session.ids && session.ids[0]) || null;
        if (customerId) {
          await reversePayment(customerId, session.settleAmount || 0, session.settlePayType || "cash");
        }
        session.status = "deleted";
        session.settledAt = null;
        await DB.put("sessions", session);
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
      data.push({ "نوع": "کافی‌شاپ", "دستگاه": "-", "شناسه‌ها": c ? "#" + (c.displayId || c.id) : "", "مبلغ": o.total, "روش": o.payType, "تاریخ": Jalali.formatDateTime(o.createdAt), "تسویه‌کننده": "" });
    });
    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "گزارش روزانه");
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
    let data = [];
    sessions.filter((s) => s.status === "settled" && s.settledAt && Utils.isInRange(s.settledAt, firstDay, lastDay)).forEach((s) => {
      data.push({ "نوع": s.deviceType, "مبلغ": s.settleAmount, "روش": s.settlePayType, "تاریخ": Jalali.formatDateTime(s.settledAt) });
    });
    cafeOrders.filter((o) => Utils.isInRange(o.createdAt, firstDay, lastDay)).forEach((o) => {
      data.push({ "نوع": "کافی‌شاپ", "مبلغ": o.total, "روش": o.payType, "تاریخ": Jalali.formatDateTime(o.createdAt) });
    });
    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ماهانه");
    XLSX.writeFile(wb, "گزارش_ماهانه_" + year + "-" + month + ".xlsx");
    App.toast("اکسل دانلود شد");
  }

  return { renderDaily, renderInstant, renderMonthly, loadMonthlyReport, showFullTransactions, exportDailyExcel, exportMonthlyExcel, closeDay, editTransaction, saveEditTransaction, deleteTransaction };
})();
