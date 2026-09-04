const Debts = (function () {
  async function render(el) {
    let customers = await DB.getAll("customers");
    let debtors = customers.filter((c) => c.debt > 0);

    let html = `
      <div class="card">
        <div class="card-header"><h2>بدهی‌ها</h2></div>
        ${debtors.length === 0 ? '<div class="empty-state"><div class="empty-icon">✅</div>هیچ بدهی‌ای وجود ندارد</div>' : ''}
        ${debtors.map((c) => `
          <div class="debt-row">
            <span class="row-label">#${c.displayId || c.id}</span>
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
      <h2>پرداخت بدهی - #${c.displayId || c.id}</h2>
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
    let amount = parseInt(document.getElementById("debtPayAmount").value) || 0;
    let payType = document.getElementById("debtPayType").value;
    if (amount <= 0) { App.toast("مبلغ نامعتبر"); return; }
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    if (amount > c.debt) amount = c.debt;
    c.debt -= amount;
    c.totalPaid = (c.totalPaid || 0) + amount;
    await DB.put("customers", c);
    await DB.add("debtPayments", { customerId: id, amount, paymentType: payType, date: new Date().toISOString() });
    await DB.logActivity("پرداخت بدهی", "ایدی #" + (c.displayId || c.id) + " - " + Utils.formatCurrency(amount) + " (" + (payType === 'cash' ? 'نقدی' : 'کارتی') + ")");
    App.closeModalForce(); App.toast("پرداخت شد"); refresh();
  }

  async function showHistory(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    let payments = await DB.getByIndex("debtPayments", "by_customer", id);
    App.openModal(`
      <h2>تاریخچه بدهی - #${c.displayId || c.id}</h2>
      <div class="list-row"><span class="row-label">بدهی فعلی</span><span class="row-value debt-amount">${Utils.formatCurrency(c.debt)}</span></div>
      <hr class="section-divider">
      ${payments.length === 0 ? '<div class="text-muted">بدون سابقه</div>' : ''}
      ${payments.map((p) => `<div class="block-item"><span>پرداخت: ${Utils.formatCurrency(p.amount)} (${p.paymentType === 'cash' ? 'نقدی' : 'کارتی'})</span><span class="text-muted text-sm">${Jalali.formatDateTime(p.date)}</span></div>`).join("")}
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  function refresh() { let el = document.getElementById("tab-debts"); if (el && el.classList.contains("active")) render(el); }

  return { render, showPayDebt, processPayment, showHistory, refresh };
})();
