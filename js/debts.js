const Debts = (function () {
  async function render(el) {
    let customers = await DB.getAll("customers");
    let debtors = customers.filter((c) => c.debt > 0);

    let html = `
      <div class="card">
        <div class="card-header"><h2>بدهی‌ها</h2></div>
        ${debtors.length === 0 ? '<div class="empty-state"><div class="empty-icon">' + (typeof Icons !== "undefined" ? Icons.get("debts", 40) : "") + '</div>هیچ بدهی‌ای وجود ندارد</div>' : ''}
        ${debtors.map((c) => `
          <div class="debt-row">
            <span class="row-label">#${c.displayId || c.id}</span>
            <span class="row-value">${Utils.escapeHtml(((c.firstName || "") + " " + (c.lastName || "")).trim()) || '<span class="text-muted">—</span>'}</span>
            <span class="debt-amount">${Utils.formatCurrency(c.debt)}</span>
            <button class="btn btn-sm btn-success" onclick="Debts.showPayDebt(${c.id})">پرداخت</button>
            <button class="btn btn-sm btn-outline" onclick="Debts.showHistory(${c.id})">تاریخچه</button>
          </div>
        `).join("")}
      </div>
    `;
    el.innerHTML = html;
  }

  async function showPayDebt(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    App.openModal(`
      <h2>پرداخت بدهی - #${c.displayId || c.id} ${Utils.escapeHtml(((c.firstName || "") + " " + (c.lastName || "")).trim())}</h2>
      <div class="form-group"><label>بدهی فعلی: ${Utils.formatCurrency(c.debt)}</label></div>
      <div class="form-group"><label>مبلغ پرداخت (تومان)</label><input type="number" id="debtPayAmount" placeholder="مبلغ" min="0"></div>
      <div class="form-group"><label>روش پرداخت</label><select id="debtPayType"><option value="cash">نقدی</option><option value="card">کارتی</option></select></div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Debts.processPayment(${id})">پرداخت</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function processPayment(id) {
    await Utils.guardDoubleClick(async () => {
      let amount = Math.round(parseFloat(document.getElementById("debtPayAmount").value) || 0);
      let payType = document.getElementById("debtPayType").value;
      if (amount <= 0) { App.toast("مبلغ نامعتبر"); return { success: false }; }
      let c = await DB.get("customers", id);
      if (!c) { App.toast("مشتری یافت نشد"); return { success: false }; }
      if (amount > c.debt) amount = c.debt;
      // Re-check after capping: paying a customer whose debt is already 0 must
      // not insert a 0-amount debtPayments row.
      if (amount <= 0) { App.toast("بدهی برای پرداخت وجود ندارد"); return { success: false }; }
      c.debt -= amount;
      c.totalPaid = (c.totalPaid || 0) + amount;
      await DB.runAtomic([
        { store: "customers", type: "put", data: c },
        { store: "debtPayments", type: "add", data: { customerId: id, amount, paymentType: payType, date: new Date().toISOString() } },
      ]);
      await DB.logActivity("پرداخت بدهی", "ایدی #" + (c.displayId || c.id) + " - " + Utils.formatCurrency(amount) + " (" + (payType === 'cash' ? 'نقدی' : 'کارتی') + ")");
      App.closeModalForce(); App.toast("پرداخت شد"); refresh();
      return { success: true };
    });
  }

  // Builds the "why was this debt created" side of the history: scans every
  // store that can put a customer into debt (a settled session, a cafe order,
  // a block payment, an overnight-reservation payment) and, for whichever leg
  // of it was "debt" (via payBreakdown.debt, or a plain payType === "debt"),
  // produces a one-line description — device name + item names for sessions,
  // item names for cafe orders, etc. — plus its date and amount.
  async function buildDebtEvents(customerId) {
    let sessions = await DB.getAll("sessions");
    let devices = await DB.getAll("devices");
    let cafeOrders = await DB.getAll("cafeOrders");
    let blockPayments = await DB.getAll("blockPayments");
    let overnightTx = [];
    try { overnightTx = await DB.getAll("overnightTransactions"); } catch (e) { overnightTx = []; }

    let debtLegOf = (obj) => (obj.payBreakdown && typeof obj.payBreakdown === "object") ? (obj.payBreakdown.debt || 0) : 0;
    let itemsText = (items) => (items || []).map((i) => i.name + (i.qty > 1 ? " x" + i.qty : "")).join("، ");

    let events = [];

    sessions
      .filter((s) => s.status === "settled" && ((s.ids || []).includes(customerId) || s.settlePayerId === customerId))
      .forEach((s) => {
        let debtAmt = debtLegOf(s) || (s.settlePayType === "debt" ? (s.settleAmount || 0) : 0);
        if (debtAmt <= 0) return;
        let device = devices.find((d) => d.id === s.deviceId);
        let typeName = s.deviceType === "console" ? "کنسول" : s.deviceType === "billiard" ? "بیلیارد" : s.deviceType === "pc" ? "پی‌سی" : s.deviceType;
        let items = itemsText(s.items);
        let desc = typeName + (device ? " " + device.name : "") + (items ? " و آیتم " + items : "");
        events.push({ date: s.settledAt, desc, amount: debtAmt });
      });

    cafeOrders.filter((o) => o.customerId === customerId).forEach((o) => {
      let debtAmt = debtLegOf(o) || (o.payType === "debt" ? (o.total || 0) : 0);
      if (debtAmt <= 0) return;
      let items = itemsText(o.items);
      events.push({ date: o.createdAt, desc: "کافی‌شاپ" + (items ? ": " + items : ""), amount: debtAmt });
    });

    blockPayments.filter((bp) => bp.customerId === customerId).forEach((bp) => {
      let debtAmt = debtLegOf(bp) || (bp.payType === "debt" ? (bp.amount || 0) : 0);
      if (debtAmt <= 0) return;
      let device = devices.find((d) => d.id === bp.deviceId);
      let typeName = bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : bp.deviceType === "console" ? "تسویه بلوک کنسول" : "تسویه بلوک بیلیارد";
      events.push({ date: bp.date, desc: typeName + (device ? " " + device.name : ""), amount: debtAmt });
    });

    overnightTx.filter((t) => t.customerId === customerId && t.type === "payment").forEach((t) => {
      let debtAmt = debtLegOf(t) || (t.payType === "debt" ? (t.amount || 0) : 0);
      if (debtAmt <= 0) return;
      events.push({ date: t.timestamp, desc: "رزرو شب", amount: debtAmt });
    });

    return events;
  }

  async function showHistory(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    let payments;
    try { payments = await DB.getByIndex("debtPayments", "by_customer", id); }
    catch (e) { payments = (await DB.getAll("debtPayments")).filter((p) => p.customerId === id); }
    let debtEvents = await buildDebtEvents(id);

    let timeline = [
      ...debtEvents.map((e) => ({ date: e.date, html: `<span>ثبت بدهی — ${Utils.escapeHtml(e.desc)}: <span class="debt-amount">${Utils.formatCurrency(e.amount)}</span></span>` })),
      ...payments.map((p) => ({ date: p.date, html: `<span>پرداخت: ${Utils.formatCurrency(p.amount)} (${p.paymentType === 'cash' ? 'نقدی' : 'کارتی'})</span>` })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    App.openModal(`
      <h2>تاریخچه بدهی - #${c.displayId || c.id} ${Utils.escapeHtml(((c.firstName || "") + " " + (c.lastName || "")).trim())}</h2>
      <div class="list-row"><span class="row-label">بدهی فعلی</span><span class="row-value debt-amount">${Utils.formatCurrency(c.debt)}</span></div>
      <hr class="section-divider">
      ${timeline.length === 0 ? '<div class="text-muted">بدون سابقه</div>' : ''}
      ${timeline.map((e) => `<div class="block-item">${e.html}<span class="text-muted text-sm">${e.date ? Jalali.formatDateTime(e.date) : '—'}</span></div>`).join("")}
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  function refresh() { let el = document.getElementById("tab-debts"); if (el && el.classList.contains("active")) render(el); }

  return { render, showPayDebt, processPayment, showHistory, refresh };
})();
