const Staff = (function () {
  async function render(el) {
    let staffList = await DB.getAll("staff");

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>پنل پرسنل</h2>
          <button class="btn btn-primary" onclick="Staff.showAddStaff()">+ پرسنل جدید</button>
        </div>
        ${staffList.length === 0 ? '<div class="empty-state">هنوز پرسنلی ثبت نشده</div>' : ''}
        ${staffList.map((s) => `
          <div class="list-row" style="flex-wrap:wrap;gap:8px;">
            <span class="row-value" style="font-weight:600;min-width:100px">${Utils.escapeHtml(s.name)}</span>
            <span class="row-value">
              ${(s.shifts || []).find((sh) => !sh.end && new Date(sh.start).toDateString() === new Date().toDateString()) ?
                `<span class="status-badge status-busy">در حال کار</span>
                 <button class="btn btn-sm btn-warning" onclick="Staff.endShift(${s.id})">پایان کار</button>` :
                `<span class="status-badge status-free">آزاد</span>
                 <button class="btn btn-sm btn-success" onclick="Staff.startShift(${s.id})">شروع کار</button>`
              }
            </span>
            <button class="btn btn-sm btn-outline" onclick="Staff.showStaffDetail(${s.id})">جزئیات</button>
          </div>
        `).join("")}
      </div>
    `;
    el.innerHTML = html;
  }

  function showAddStaff() {
    App.openModal(`
      <h2>افزودن پرسنل</h2>
      <div class="form-group"><label>نام</label><input type="text" id="staffName" placeholder="نام پرسنل"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Staff.saveStaff()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveStaff() {
    let name = document.getElementById("staffName").value.trim();
    if (!name) { App.toast("نام الزامی است"); return; }
    await DB.add("staff", { name, shifts: [], consumption: [] });
    await DB.logActivity("افزودن پرسنل", name);
    App.closeModalForce(); App.toast("ذخیره شد"); refresh();
  }

  async function startShift(staffId) {
    let staff = await DB.get("staff", staffId);
    if (!staff.shifts) staff.shifts = [];
    staff.shifts.push({ start: new Date().toISOString(), end: null });
    await DB.put("staff", staff);
    await DB.logActivity("شروع شیفت", staff.name);
    App.toast("شیفت شروع شد"); refresh();
  }

  async function endShift(staffId) {
    let staff = await DB.get("staff", staffId);
    let active = staff.shifts.find((s) => !s.end);
    if (active) {
      active.end = new Date().toISOString();
      await DB.put("staff", staff);
      let hours = (new Date(active.end) - new Date(active.start)) / 3600000;
      await DB.logActivity("پایان شیفت", staff.name + " - " + hours.toFixed(1) + " ساعت");
    }
    App.toast("شیفت تمام شد"); refresh();
  }

  async function showStaffDetail(staffId) {
    let staff = await DB.get("staff", staffId);
    let today = new Date();
    let jalaliToday = Jalali.getTodayJalali();

    let totalMonthlyHours = 0;
    let monthlyShifts = (staff.shifts || []).filter((s) => {
      let d = new Date(s.start);
      let j = Jalali.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return j.year === jalaliToday.year && j.month === jalaliToday.month;
    });
    monthlyShifts.forEach((s) => {
      if (s.end) totalMonthlyHours += (new Date(s.end) - new Date(s.start)) / 3600000;
    });

    let monthlyConsumption = (staff.consumption || []).filter((c) => {
      let d = new Date(c.date);
      let j = Jalali.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return j.year === jalaliToday.year && j.month === jalaliToday.month;
    });

    let consumptionByType = {};
    monthlyConsumption.forEach((c) => {
      if (!consumptionByType[c.name]) consumptionByType[c.name] = { qty: 0, total: 0 };
      consumptionByType[c.name].qty += c.qty;
      consumptionByType[c.name].total += c.price * c.qty;
    });

    App.openModal(`
      <h2>${Utils.escapeHtml(staff.name)}</h2>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn btn-primary" onclick="Staff.showActivityTab(${staffId})" id="btnActivity">فعالیت</button>
        <button class="btn btn-outline" onclick="Staff.showStatsTab(${staffId})" id="btnStats">آمار</button>
      </div>

      <div id="staffTabContent"></div>

      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);

    showActivityTab(staffId);
  }

  async function showActivityTab(staffId) {
    let staff = await DB.get("staff", staffId);
    let todayShift = (staff.shifts || []).find((s) => !s.end && new Date(s.start).toDateString() === new Date().toDateString());

    let cafeItems = await DB.getAll("cafeItems");

    document.getElementById("staffTabContent").innerHTML = `
      <div id="activitySection">
        <div style="margin-bottom:12px;">
          ${todayShift ?
            `<span class="status-badge status-busy">در حال کار از ${Jalali.timeString(new Date(todayShift.start))}</span>
             <button class="btn btn-sm btn-warning" onclick="Staff.endShift(${staffId}); Staff.showActivityTab(${staffId});">پایان کار</button>` :
            `<span class="status-badge status-free">آزاد</span>
             <button class="btn btn-sm btn-success" onclick="Staff.startShift(${staffId}); Staff.showActivityTab(${staffId});">شروع کار</button>`
          }
        </div>
        <h3>افزودن مصرف</h3>
        <div class="item-grid">
          ${cafeItems.map((item) => `<div class="item-card" onclick="Staff.addConsumption(${staffId}, ${item.id}); Staff.showActivityTab(${staffId});"><div class="item-name">${Utils.escapeHtml(item.name)}</div><div class="item-price">${Utils.formatCurrency(item.price)}</div></div>`).join("")}
        </div>
        <h3 style="margin-top:12px">آخرین مصرف‌ها</h3>
        ${(staff.consumption || []).slice(-5).reverse().map((c) => `<div class="block-item"><span>${Utils.escapeHtml(c.name)} x${c.qty} - ${Utils.formatCurrency(c.price * c.qty)}</span><span class="text-muted text-sm">${Jalali.formatDateTime(c.date)}</span></div>`).join("") || '<div class="text-muted text-sm">بدون مصرف</div>'}
      </div>
    `;
  }

  async function showStatsTab(staffId) {
    let staff = await DB.get("staff", staffId);
    let jalaliToday = Jalali.getTodayJalali();

    let totalMonthlyHours = 0;
    let monthlyShifts = (staff.shifts || []).filter((s) => {
      let d = new Date(s.start);
      let j = Jalali.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return j.year === jalaliToday.year && j.month === jalaliToday.month;
    });
    monthlyShifts.forEach((s) => { if (s.end) totalMonthlyHours += (new Date(s.end) - new Date(s.start)) / 3600000; });

    let monthlyConsumption = (staff.consumption || []).filter((c) => {
      let d = new Date(c.date);
      let j = Jalali.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return j.year === jalaliToday.year && j.month === jalaliToday.month;
    });

    let consumptionByType = {};
    monthlyConsumption.forEach((c) => {
      if (!consumptionByType[c.name]) consumptionByType[c.name] = { qty: 0, total: 0, price: c.price };
      consumptionByType[c.name].qty += c.qty;
      consumptionByType[c.name].total += c.price * c.qty;
    });

    let totalConsumption = monthlyConsumption.reduce((s, c) => s + (c.price * c.qty), 0);

    document.getElementById("staffTabContent").innerHTML = `
      <div id="statsSection">
        <h3>آمار ماه جاری (${jalaliToday.year}/${jalaliToday.month})</h3>
        <div class="list-row"><span class="row-label">ساعات کار</span><span class="row-value font-bold">${totalMonthlyHours.toFixed(1)} ساعت</span></div>
        <div class="list-row"><span class="row-label">تعداد شیفت</span><span class="row-value">${monthlyShifts.length}</span></div>
        <div class="list-row"><span class="row-label">مجموع مصرف</span><span class="row-value amount">${Utils.formatCurrency(totalConsumption)}</span></div>
        <hr class="section-divider">
        <h3>جزئیات مصرف</h3>
        ${Object.entries(consumptionByType).map(([name, data]) => `
          <div class="list-row">
            <span class="row-value">${Utils.escapeHtml(name)}</span>
            <span class="row-value">${data.qty} عدد</span>
            <span class="row-value">${Utils.formatCurrency(data.price)} / عدد</span>
            <span class="row-value amount">${Utils.formatCurrency(data.total)}</span>
          </div>
        `).join("") || '<div class="text-muted text-sm">بدون مصرف</div>'}
        <hr class="section-divider">
        <h3>تاریخچه شیفت‌ها</h3>
        ${monthlyShifts.reverse().map((s) => {
          let dur = s.end ? Utils.formatDuration(new Date(s.end) - new Date(s.start)) : "در حال اجرا";
          return `<div class="block-item"><span>${Jalali.formatDateTime(new Date(s.start))} - ${s.end ? Jalali.timeString(new Date(s.end)) : '...'}</span><span>${dur}</span></div>`;
        }).join("") || '<div class="text-muted text-sm">بدون شیفت</div>'}
      </div>
    `;
  }

  async function addConsumption(staffId, itemId) {
    let staff = await DB.get("staff", staffId);
    let item = await DB.get("cafeItems", itemId);
    if (!item) return;
    if (!staff.consumption) staff.consumption = [];
    staff.consumption.push({ itemId, name: item.name, price: item.price, qty: 1, date: new Date().toISOString() });
    if (!item.unlimited && item.stock > 0) { item.stock--; await DB.put("cafeItems", item); } else if (!item.unlimited && item.stock <= 0) { App.toast("موجودی آیتم تمام شده است"); return; }
    await DB.put("staff", staff);
    await DB.logActivity("مصرف پرسنل", staff.name + " - " + item.name + " | " + Utils.formatCurrency(item.price));
    App.toast("مصرف ثبت شد");
  }

  function refresh() { let el = document.getElementById("tab-staff"); if (el && el.classList.contains("active")) render(el); }

  return { render, showAddStaff, saveStaff, startShift, endShift, showStaffDetail, showActivityTab, showStatsTab, addConsumption, refresh };
})();
