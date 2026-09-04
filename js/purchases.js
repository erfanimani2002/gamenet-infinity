const Purchases = (function () {
  let activeFilter = "all";

  function getEffectiveType(p) {
    if (p.paymentType === "other" && p.settled && p.settledWith) return p.settledWith;
    return p.paymentType;
  }

  function matchesFilter(p, filter) {
    if (filter === "all") return true;
    let t = getEffectiveType(p);
    return t === filter;
  }

  async function render(el) {
    let purchases = await DB.getAll("purchases");
    let range = Utils.getReportRange();
    let dailyPurchases = purchases.filter((p) => Utils.isInRange(p.date, range.start, range.end));
    let filtered = dailyPurchases.filter((p) => matchesFilter(p, activeFilter));

    let cashTotal = dailyPurchases.filter((p) => getEffectiveType(p) === "cash").reduce((s, p) => s + p.amount, 0);
    let pasargadTotal = dailyPurchases.filter((p) => getEffectiveType(p) === "pasargad").reduce((s, p) => s + p.amount, 0);
    let otherTotal = dailyPurchases.filter((p) => getEffectiveType(p) === "other").reduce((s, p) => s + p.amount, 0);

    let filters = [
      { key: "all", label: "همه" },
      { key: "cash", label: "نقدی" },
      { key: "pasargad", label: "پاسارگاد" },
      { key: "other", label: "سایر" },
    ];

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>خریدهای روزانه</h2>
          <button class="btn btn-primary" onclick="Purchases.showAddPurchase()">+ خرید جدید</button>
        </div>
        <div class="tab-bar" style="margin-bottom:12px;">
          ${filters.map((f) => `<button class="btn btn-sm ${activeFilter === f.key ? 'btn-primary' : 'btn-outline'}" onclick="Purchases.setFilter('${f.key}')">${f.label}</button>`).join("")}
        </div>
        <div class="report-summary" style="margin-bottom:12px;">
          <div class="summary-item"><div class="summary-label">نقدی</div><div class="summary-value">${Utils.formatCurrency(cashTotal)}</div></div>
          <div class="summary-item"><div class="summary-label">پاسارگاد</div><div class="summary-value">${Utils.formatCurrency(pasargadTotal)}</div></div>
          <div class="summary-item"><div class="summary-label">سایر</div><div class="summary-value">${Utils.formatCurrency(otherTotal)}</div></div>
        </div>
        ${filtered.length === 0 ? '<div class="empty-state">بدون خرید</div>' : ''}
        ${filtered.map((p) => {
          let effType = getEffectiveType(p);
          let typeLabel = effType === "cash" ? "نقدی" : effType === "pasargad" ? "پاسارگاد" : "سایر";
          let origLabel = p.paymentType === "other" && p.settled ? `<span class="text-muted text-sm">(اصلی: سایر)</span>` : "";
          return `
          <div class="list-row">
            <span class="row-label">${p.category === 'items' ? 'موارد' : 'یخچال'}</span>
            <span class="row-value">${Utils.escapeHtml(p.description || '-')}</span>
            <span class="row-value amount">${Utils.formatCurrency(p.amount)}</span>
            <span class="row-value">${typeLabel} ${origLabel}</span>
            ${p.thirdParty ? `<span class="text-muted text-sm">← ${Utils.escapeHtml(p.thirdParty)}</span>` : ''}
            ${p.settled ? `<span class="status-badge status-free">تسویه شده</span>` : ''}
            ${p.paymentType === 'other' && !p.settled ? `<button class="btn btn-sm btn-success" onclick="Purchases.showSettlePurchase(${p.id})">تسویه</button>` : ''}
            <button class="btn btn-sm btn-outline" onclick="Purchases.showPurchaseDetails(${p.id})">جزئیات</button>
          </div>`;
        }).join("")}
      </div>
    `;
    el.innerHTML = html;
  }

  function setFilter(filter) {
    activeFilter = filter;
    refresh();
  }

  function showAddPurchase() {
    App.openModal(`
      <h2>ثبت خرید جدید</h2>
      <div class="form-group"><label>دسته‌بندی</label>
        <select id="purCategory"><option value="items">موارد</option><option value="fridge">یخچال</option></select>
      </div>
      <div class="form-group"><label>توضیحات</label><input type="text" id="purDesc" placeholder="توضیحات"></div>
      <div class="form-group"><label>مبلغ (تومان)</label><input type="number" id="purAmount" placeholder="مبلغ" min="0"></div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="purPayType" onchange="Purchases.toggleThirdParty()">
          <option value="cash">نقدی</option>
          <option value="pasargad">پاسارگاد</option>
          <option value="other">سایر</option>
        </select>
      </div>
      <div class="form-group" id="purThirdPartyGroup" style="display:none">
        <label>نام پرداخت‌کننده (شخص ثالث)</label>
        <input type="text" id="purThirdParty" placeholder="نام شخص">
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Purchases.savePurchase()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  function toggleThirdParty() {
    document.getElementById("purThirdPartyGroup").style.display = document.getElementById("purPayType").value === "other" ? "block" : "none";
  }

  async function savePurchase() {
    let category = document.getElementById("purCategory").value;
    let description = document.getElementById("purDesc").value.trim();
    let amount = parseInt(document.getElementById("purAmount").value) || 0;
    let payType = document.getElementById("purPayType").value;
    let thirdParty = document.getElementById("purThirdParty")?.value.trim() || "";
    if (amount <= 0) { App.toast("مبلغ نامعتبر"); return; }
    await DB.add("purchases", { category, description, amount, paymentType: payType, thirdParty, date: new Date().toISOString(), settled: false });
    await DB.logActivity("ثبت خرید", description + " - " + Utils.formatCurrency(amount));
    App.closeModalForce(); App.toast("خرید ثبت شد"); refresh();
  }

  async function showSettlePurchase(purchaseId) {
    let purchase = await DB.get("purchases", purchaseId);
    if (!purchase) { App.toast("خرید یافت نشد"); return; }
    App.openModal(`
      <h2>تسویه خرید</h2>
      <div class="list-row"><span class="row-label">مبلغ</span><span class="row-value">${Utils.formatCurrency(purchase.amount)}</span></div>
      <div class="list-row"><span class="row-label">توضیحات</span><span class="row-value">${Utils.escapeHtml(purchase.description || '-')}</span></div>
      <div class="list-row"><span class="row-label">شخص ثالث</span><span class="row-value">${Utils.escapeHtml(purchase.thirdParty || '-')}</span></div>
      <div class="form-group"><label>تسویه با</label>
        <select id="settlePurchaseWith"><option value="pasargad">پاسارگاد</option><option value="cash">نقدی</option></select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Purchases.confirmSettlePurchase(${purchaseId})">تسویه</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmSettlePurchase(purchaseId) {
    let purchase = await DB.get("purchases", purchaseId);
    let settleWith = document.getElementById("settlePurchaseWith").value;
    purchase.settled = true;
    purchase.settledWith = settleWith;
    purchase.settledAt = new Date().toISOString();
    await DB.put("purchases", purchase);
    await DB.logActivity("تسویه خرید", purchase.description + " - با " + (settleWith === 'pasargad' ? 'پاسارگاد' : 'نقدی'));
    App.closeModalForce(); App.toast("تسویه شد"); refresh();
  }

  async function showPurchaseDetails(purchaseId) {
    let p = await DB.get("purchases", purchaseId);
    if (!p) return;
    let effType = getEffectiveType(p);
    let effLabel = effType === 'cash' ? 'نقدی' : effType === 'pasargad' ? 'پاسارگاد' : 'سایر';
    App.openModal(`
      <h2>جزئیات خرید</h2>
      <div class="list-row"><span class="row-label">دسته</span><span class="row-value">${p.category === 'items' ? 'موارد' : 'یخچال'}</span></div>
      <div class="list-row"><span class="row-label">توضیحات</span><span class="row-value">${Utils.escapeHtml(p.description || '-')}</span></div>
      <div class="list-row"><span class="row-label">مبلغ</span><span class="row-value amount">${Utils.formatCurrency(p.amount)}</span></div>
      <div class="list-row"><span class="row-label">روش پرداخت</span><span class="row-value">${effLabel}</span></div>
      ${p.paymentType === 'other' && p.settled ? `<div class="list-row"><span class="row-label">روش اصلی</span><span class="row-value text-muted">سایر → ${effLabel}</span></div>` : ''}
      ${p.thirdParty ? `<div class="list-row"><span class="row-label">شخص ثالث</span><span class="row-value">${Utils.escapeHtml(p.thirdParty)}</span></div>` : ''}
      <div class="list-row"><span class="row-label">تاریخ ثبت</span><span class="row-value">${Jalali.formatDateTime(p.date)}</span></div>
      ${p.settled ? `
        <div class="list-row"><span class="row-label">تسویه شده</span><span class="row-value">بله</span></div>
        <div class="list-row"><span class="row-label">تسویه با</span><span class="row-value">${effLabel}</span></div>
        <div class="list-row"><span class="row-label">تاریخ تسویه</span><span class="row-value">${Jalali.formatDateTime(p.settledAt)}</span></div>
      ` : ''}
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  function refresh() { let el = document.getElementById("tab-purchases"); if (el && el.classList.contains("active")) render(el); }

  return { render, setFilter, showAddPurchase, toggleThirdParty, savePurchase, showSettlePurchase, confirmSettlePurchase, showPurchaseDetails, refresh };
})();
