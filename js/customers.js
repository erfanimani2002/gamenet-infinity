const Customers = (function () {
  async function render(el) {
    let customers = await DB.getAll("customers");
    let html = `
      <div class="card">
        <div class="card-header">
          <h2>مدیریت شناسه‌ها (ایدی‌ها)</h2>
          <button class="btn btn-primary" onclick="Customers.showAddCustomer()">+ شناسه جدید</button>
        </div>
        <div class="search-box">
          <input type="text" id="customerSearch" placeholder="جستجو بر اساس شماره ایدی..." oninput="Customers.filterList()">
        </div>
        <div id="customerList">
          ${renderCustomerList(customers)}
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  function renderCustomerList(customers) {
    if (customers.length === 0) {
      return '<div class="empty-state"><div class="empty-icon">👤</div>هنوز شناسه‌ای ثبت نشده</div>';
    }
    return customers.map((c) => `
      <div class="list-row" data-search="${String(c.displayId || c.id).toLowerCase()}">
        <span class="row-label">#${c.displayId || c.id}</span>
        <span class="row-value" style="min-width:80px">
          <span class="amount ${c.wallet > 0 ? 'positive' : ''}">${Utils.formatCurrencyShort(c.wallet)}</span>
        </span>
        <span class="row-value" style="min-width:80px">
          <span class="amount ${c.debt > 0 ? 'debt' : ''}">${Utils.formatCurrencyShort(c.debt)}</span>
        </span>
        <span class="row-actions">
          <button class="btn btn-outline btn-sm" onclick="Customers.showProfile(${c.id})">پروفایل</button>
          <button class="btn btn-outline btn-sm" onclick="Customers.showChargeWallet(${c.id})">شارژ</button>
          <button class="btn btn-outline btn-sm" onclick="Customers.showPayDebt(${c.id})">پرداخت بدهی</button>
          <button class="btn btn-outline btn-sm" onclick="Customers.showManualAdjust(${c.id})">اصلاح</button>
        </span>
      </div>
    `).join("");
  }

  function filterList() {
    let q = document.getElementById("customerSearch").value.toLowerCase();
    document.querySelectorAll("#customerList .list-row").forEach((row) => {
      row.style.display = row.dataset.search.includes(q) ? "flex" : "none";
    });
  }

  async function showAddCustomer() {
    let customers = await DB.getAll("customers");
    let maxId = 0;
    customers.forEach((c) => {
      let num = parseInt(c.displayId);
      if (!isNaN(num) && num > maxId) maxId = num;
    });
    let suggestedId = maxId + 1;

    App.openModal(`
      <h2>ساخت شناسه جدید</h2>
      <div class="form-group">
        <label>شماره ایدی (یونیک)</label>
        <input type="number" id="cDisplayId" placeholder="شماره ایدی" min="1" value="${suggestedId}">
      </div>
      <div class="form-group">
        <label>نام</label>
        <input type="text" id="cFirstName" placeholder="نام">
      </div>
      <div class="form-group">
        <label>نام خانوادگی</label>
        <input type="text" id="cLastName" placeholder="نام خانوادگی">
      </div>
      <div class="form-group">
        <label>شماره تماس</label>
        <input type="tel" id="cPhone" placeholder="شماره تماس">
      </div>
      <div class="form-group">
        <label>کد ملی (اختیاری)</label>
        <input type="text" id="cNationalCode" placeholder="کد ملی">
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Customers.saveCustomer()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveCustomer() {
    let displayId = parseInt(document.getElementById("cDisplayId").value);
    let firstName = document.getElementById("cFirstName").value.trim();
    let lastName = document.getElementById("cLastName").value.trim();
    let phone = document.getElementById("cPhone").value.trim();
    let nationalCode = document.getElementById("cNationalCode").value.trim();

    if (!displayId || displayId <= 0) {
      App.toast("شماره ایدی معتبر وارد کنید");
      return;
    }

    let customers = await DB.getAll("customers");
    let exists = customers.find((c) => c.displayId === displayId);
    if (exists) {
      App.toast("این شماره ایدی قبلاً استفاده شده");
      return;
    }

    if (!firstName) {
      App.toast("نام الزامی است");
      return;
    }

    let customer = {
      displayId: displayId,
      firstName: firstName,
      lastName: lastName || "",
      phone: phone,
      nationalCode: nationalCode,
      wallet: 0,
      debt: 0,
      discount: 0,
      rank: 0,
      totalPaid: 0,
      tournamentInterests: [],
      createdAt: new Date().toISOString(),
    };
    await DB.add("customers", customer);
    await DB.logActivity("ساخت شناسه", "ایدی #" + displayId + " - " + firstName + " " + lastName);
    App.closeModalForce();
    App.toast("شناسه با موفقیت ساخته شد");
    refresh();
  }

  async function showProfile(id) {
    let c = await DB.get("customers", id);
    if (!c) return;
    let payments = await DB.getByIndex("debtPayments", "by_customer", id);
    let charges = await DB.getByIndex("walletCharges", "by_customer", id);

    App.openModal(`
      <h2>پروفایل شناسه #${c.displayId || c.id}</h2>
      <div class="list-row">
        <span class="row-label">نام</span>
        <span class="row-value">${Utils.escapeHtml(((c.firstName || '') + ' ' + (c.lastName || '')).trim() || '-')}</span>
      </div>
      <div class="list-row">
        <span class="row-label">تلفن</span>
        <span class="row-value">${Utils.escapeHtml(c.phone || '-')}</span>
      </div>
      <div class="list-row">
        <span class="row-label">تاریخ عضویت</span>
        <span class="row-value">${c.createdAt ? Jalali.formatDate(c.createdAt) : '-'}</span>
      </div>
      <div class="list-row">
        <span class="row-label">موجودی</span>
        <span class="row-value amount positive">${Utils.formatCurrency(c.wallet)}</span>
      </div>
      <div class="list-row">
        <span class="row-label">بدهی</span>
        <span class="row-value amount debt">${Utils.formatCurrency(c.debt)}</span>
      </div>
      <div class="list-row">
        <span class="row-label">تخفیف</span>
        <span class="row-value">${c.discount || 0}%</span>
      </div>
      <div class="list-row">
        <span class="row-label">رتبه</span>
        <span class="row-value">${c.rank || 0}</span>
      </div>
      <div class="list-row">
        <span class="row-label">مجموع پرداختی</span>
        <span class="row-value">${Utils.formatCurrency(c.totalPaid || 0)}</span>
      </div>
      <hr class="section-divider">
      <h3>پرداخت‌ها و شارژها</h3>
      ${payments.length === 0 && charges.length === 0 ? '<div class="text-muted text-sm">بدون تراکنش</div>' : ''}
      ${payments.map((p) => `
        <div class="block-item">
          <span>پرداخت بدهی: ${Utils.formatCurrency(p.amount)} (${p.paymentType === 'cash' ? 'نقدی' : 'کارتی'})</span>
          <span class="text-muted text-sm">${Jalali.formatDateTime(p.date)}</span>
        </div>
      `).join("")}
      ${charges.map((ch) => `
        <div class="block-item">
          <span>شارژ کیف‌پول: ${Utils.formatCurrency(ch.amount)} (${ch.paymentType === 'cash' ? 'نقدی' : 'کارتی'})</span>
          <span class="text-muted text-sm">${Jalali.formatDateTime(ch.date)}</span>
        </div>
      `).join("")}
      <hr class="section-divider">
      <h3>ویرایش</h3>
      <div class="form-group">
        <label>درصد تخفیف</label>
        <input type="number" id="editDiscount" value="${c.discount || 0}" min="0" max="100">
      </div>
      <div class="form-group">
        <label>علاقه‌مندی تورنومنت</label>
        <label><input type="checkbox" id="tBillard" ${c.tournamentInterests && c.tournamentInterests.includes('billiard') ? 'checked' : ''}> بیلیارد</label>
        <label><input type="checkbox" id="tConsole" ${c.tournamentInterests && c.tournamentInterests.includes('console') ? 'checked' : ''}> کنسول</label>
        <label><input type="checkbox" id="tCS" ${c.tournamentInterests && c.tournamentInterests.includes('cs') ? 'checked' : ''}> سی‌اس</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Customers.saveProfile(${c.id})">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button>
      </div>
    `);
  }

  async function saveProfile(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    c.discount = parseInt(document.getElementById("editDiscount").value) || 0;
    let interests = [];
    if (document.getElementById("tBillard").checked) interests.push("billiard");
    if (document.getElementById("tConsole").checked) interests.push("console");
    if (document.getElementById("tCS").checked) interests.push("cs");
    c.tournamentInterests = interests;
    await DB.put("customers", c);
    await DB.logActivity("ویرایش شناسه", "ایدی #" + (c.displayId || c.id));
    App.toast("پروفایل ذخیره شد");
    App.closeModalForce();
    refresh();
  }

  async function showChargeWallet(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    App.openModal(`
      <h2>شارژ حساب - #${c.displayId || c.id}</h2>
      <div class="form-group">
        <label>موجودی فعلی: ${Utils.formatCurrency(c.wallet)}</label>
      </div>
      <div class="form-group">
        <label>مبلغ شارژ (تومان)</label>
        <input type="number" id="chargeAmount" placeholder="مبلغ" min="0">
      </div>
      <div class="form-group">
        <label>طریقه شارژ</label>
        <select id="chargePayType">
          <option value="cash">نقدی</option>
          <option value="card">کارتی</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Customers.doCharge(${id})">شارژ</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function doCharge(id) {
    let amount = parseInt(document.getElementById("chargeAmount").value) || 0;
    let payType = document.getElementById("chargePayType").value;
    if (amount <= 0) {
      App.toast("مبلغ نامعتبر");
      return;
    }
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    c.wallet += amount;
    await DB.put("customers", c);
    await DB.add("walletCharges", { customerId: id, amount: amount, paymentType: payType, date: new Date().toISOString() });
    await DB.logActivity("شارژ کیف‌پول", "ایدی #" + (c.displayId || c.id) + " - مبلغ: " + Utils.formatCurrency(amount) + " (" + (payType === 'cash' ? 'نقدی' : 'کارتی') + ")");
    App.toast("حساب با موفقیت شارژ شد");
    App.closeModalForce();
    refresh();
  }

  async function showPayDebt(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    App.openModal(`
      <h2>پرداخت بدهی - #${c.displayId || c.id}</h2>
      <div class="form-group">
        <label>بدهی فعلی: ${Utils.formatCurrency(c.debt)}</label>
      </div>
      <div class="form-group">
        <label>مبلغ پرداخت (تومان)</label>
        <input type="number" id="payAmount" placeholder="مبلغ" min="0">
      </div>
      <div class="form-group">
        <label>روش پرداخت</label>
        <select id="payType">
          <option value="cash">نقدی</option>
          <option value="card">کارتی</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Customers.doPayDebt(${id})">پرداخت</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function doPayDebt(id) {
    let amount = parseInt(document.getElementById("payAmount").value) || 0;
    let payType = document.getElementById("payType").value;
    if (amount <= 0) {
      App.toast("مبلغ نامعتبر");
      return;
    }
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    if (amount > c.debt) amount = c.debt;
    c.debt -= amount;
    c.totalPaid = (c.totalPaid || 0) + amount;
    await DB.put("customers", c);
    await DB.add("debtPayments", { customerId: id, amount: amount, paymentType: payType, date: new Date().toISOString() });
    await DB.logActivity("پرداخت بدهی", "ایدی #" + (c.displayId || c.id) + " - مبلغ: " + Utils.formatCurrency(amount) + " (" + (payType === 'cash' ? 'نقدی' : 'کارتی') + ")");
    App.toast("بدهی با موفقیت پرداخت شد");
    App.closeModalForce();
    refresh();
  }

  async function showManualAdjust(id) {
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    App.openModal(`
      <h2>اصلاح دستی - #${c.displayId || c.id}</h2>
      <div class="form-group">
        <label>موجودی فعلی: ${Utils.formatCurrency(c.wallet)}</label>
      </div>
      <div class="form-group">
        <label>بدهی فعلی: ${Utils.formatCurrency(c.debt)}</label>
      </div>
      <div class="form-group">
        <label>موجودی جدید</label>
        <input type="number" id="adjWallet" value="${c.wallet}" min="0">
      </div>
      <div class="form-group">
        <label>بدهی جدید</label>
        <input type="number" id="adjDebt" value="${c.debt}" min="0">
      </div>
      <div class="form-group">
        <label>دلیل اصلاح</label>
        <input type="text" id="adjReason" placeholder="دلیل اصلاح">
      </div>
      <div class="modal-actions">
        <button class="btn btn-warning" onclick="Customers.doManualAdjust(${id})">ذخیره اصلاح</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function doManualAdjust(id) {
    let reason = document.getElementById("adjReason").value.trim();
    if (!reason) {
      App.toast("دلیل اصلاح الزامی است");
      return;
    }
    let c = await DB.get("customers", id);
    if (!c) { App.toast("مشتری یافت نشد"); return; }
    let oldWallet = c.wallet;
    let oldDebt = c.debt;
    c.wallet = parseInt(document.getElementById("adjWallet").value) || 0;
    c.debt = parseInt(document.getElementById("adjDebt").value) || 0;
    await DB.put("customers", c);
    await DB.logActivity("اصلاح دستی", "ایدی #" + (c.displayId || c.id) + " - موجودی: " + oldWallet + "→" + c.wallet + " | بدهی: " + oldDebt + "→" + c.debt + " | دلیل: " + reason);
    App.toast("اصلاح ذخیره شد");
    App.closeModalForce();
    refresh();
  }

  async function getCustomerName(id) {
    let c = await DB.get("customers", id);
    if (c) return "#" + (c.displayId || c.id);
    return "شناسه #" + id;
  }

  async function quickCreate(firstName, lastName, phone) {
    let customers = await DB.getAll("customers");
    let maxId = 0;
    customers.forEach((c) => {
      let num = parseInt(c.displayId);
      if (!isNaN(num) && num > maxId) maxId = num;
    });
    let displayId = maxId + 1;

    let customer = {
      displayId: displayId,
      firstName: firstName,
      lastName: lastName || "",
      phone: phone || "",
      nationalCode: "",
      wallet: 0,
      debt: 0,
      discount: 0,
      rank: 0,
      totalPaid: 0,
      tournamentInterests: [],
      createdAt: new Date().toISOString(),
    };
    await DB.add("customers", customer);
    await DB.logActivity("ساخت سریع شناسه", "ایدی #" + displayId + " - " + firstName);
    return displayId;
  }

  function refresh() {
    let el = document.getElementById("tab-customers");
    if (el && el.classList.contains("active")) {
      render(el);
    }
  }

  return {
    render, showAddCustomer, saveCustomer, showProfile, saveProfile,
    showChargeWallet, doCharge, showPayDebt, doPayDebt,
    showManualAdjust, doManualAdjust, getCustomerName, quickCreate, filterList, refresh,
  };
})();
