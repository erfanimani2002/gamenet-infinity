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
              ${(s.shifts || []).find((sh) => !sh.end) ?
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
    let active = staff.shifts.find((s) => !s.end);
    if (active) { App.toast("این پرسنل از قبل شیفت باز دارد"); return; }
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
    let todayShift = (staff.shifts || []).find((s) => !s.end);

    let cafeItems = await DB.getAll("cafeItems");

    document.getElementById("staffTabContent").innerHTML = `
      <div id="activitySection">
        <div style="margin-bottom:12px;">
          ${todayShift ?
            `<span class="status-badge status-busy">در حال کار از ${Jalali.timeString(new Date(todayShift.start))}</span>
             <button class="btn btn-sm btn-warning" onclick="Staff.endShiftAndRefreshTab(${staffId})">پایان کار</button>` :
            `<span class="status-badge status-free">آزاد</span>
             <button class="btn btn-sm btn-success" onclick="Staff.startShiftAndRefreshTab(${staffId})">شروع کار</button>`
          }
        </div>
        <h3>افزودن مصرف</h3>
        <div class="pick-list">
          ${cafeItems.map((item) => `<div class="pick-item" onclick="Staff.addConsumptionAndRefreshTab(${staffId}, ${item.id})"><span class="pick-name">${Utils.escapeHtml(item.name)}</span><span class="pick-meta">${Utils.formatCurrency(item.price)}</span></div>`).join("")}
        </div>
        <h3 style="margin-top:12px">آخرین مصرف‌ها</h3>
        ${(() => {
          let consumption = staff.consumption || [];
          let recentIndices = consumption.map((c, i) => i).slice(-5).reverse();
          if (recentIndices.length === 0) return '<div class="text-muted text-sm">بدون مصرف</div>';
          return recentIndices.map((i) => {
            let c = consumption[i];
            return `<div class="block-item" style="align-items:center;">
              <span>${Utils.escapeHtml(c.name)} × ${c.qty}</span>
              <span style="display:flex;align-items:center;gap:6px;">
                <button class="btn btn-sm btn-outline" onclick="Staff.updateConsumptionQty(${staffId}, ${i}, -1)">−</button>
                <span>${Utils.formatCurrency(c.price * c.qty)}</span>
                <button class="btn btn-sm btn-outline" onclick="Staff.updateConsumptionQty(${staffId}, ${i}, 1)">+</button>
                <button class="btn btn-sm btn-outline" onclick="Staff.removeConsumption(${staffId}, ${i})">🗑</button>
              </span>
            </div>`;
          }).join("");
        })()}
      </div>
    `;
  }

  async function showStatsTab(staffId) {
    let staff = await DB.get("staff", staffId);
    let now = new Date();
    let jalaliToday = Jalali.getTodayJalali();

    // Hours for a shift: its duration, or elapsed time until now if still open.
    const shiftHoursNow = (s) => {
      let end = s.end ? new Date(s.end) : now;
      return Math.max(0, (end - new Date(s.start)) / 3600000);
    };

    let monthlyShifts = (staff.shifts || []).filter((s) => {
      let d = new Date(s.start);
      let j = Jalali.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return j.year === jalaliToday.year && j.month === jalaliToday.month;
    });
    // Monthly total includes an open shift's elapsed hours so far.
    let totalMonthlyHours = monthlyShifts.reduce((sum, s) => sum + shiftHoursNow(s), 0);

    // Calendar-today hours (business-day boundary not required here); an open
    // shift is counted as elapsed time until now.
    let todayShifts = (staff.shifts || []).filter((s) => {
      let d = new Date(s.start);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
    let todayHours = todayShifts.reduce((sum, s) => sum + shiftHoursNow(s), 0);

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
        <div class="list-row"><span class="row-label">ساعات کار امروز</span><span class="row-value font-bold">${todayHours.toFixed(1)} ساعت</span></div>
        <div class="list-row"><span class="row-label">ساعات کار (این ماه)</span><span class="row-value font-bold">${totalMonthlyHours.toFixed(1)} ساعت</span></div>
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
          let dur = s.end ? Utils.formatDuration(new Date(s.end) - new Date(s.start)) : Utils.formatDuration(now - new Date(s.start)) + " (در حال اجرا)";
          return `<div class="block-item"><span>${Jalali.formatDateTime(new Date(s.start))} - ${s.end ? Jalali.timeString(new Date(s.end)) : '...'}</span><span>${dur}</span></div>`;
        }).join("") || '<div class="text-muted text-sm">بدون شیفت</div>'}
      </div>
    `;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Locked per-staff (see PCs.addItemClick for the same pattern/rationale) so
  // two rapid clicks on the same staff member's cafe-item picker (a
  // .pick-item <div>, not protected by Utils.guardDoubleClick) can't both
  // read stock/consumption before either write lands. Concurrent clicks for
  // two different staff members use different lock keys and don't block
  // each other. On alreadyLocked, quietly return (no toast).
  async function addConsumption(staffId, itemId) {
    let result = await Utils.withLock("staff-consumption:" + staffId, async () => {
      let staff = await DB.get("staff", staffId);
      let item = await DB.get("cafeItems", itemId);
      if (!item) return;
      if (!item.unlimited && item.stock <= 0) { App.toast("موجودی آیتم تمام شده است"); return; }
      if (!staff.consumption) staff.consumption = [];

      let now = new Date();
      // Same item added again the same day is a repeat purchase, not a
      // separate line: bump the existing row's qty instead of pushing a
      // new one (otherwise "چیپس x1" would keep appearing on its own line
      // every time instead of becoming "چیپس x2").
      let existing = staff.consumption.find((c) => c.itemId === itemId && isSameDay(new Date(c.date), now));
      if (existing) {
        existing.qty++;
        existing.date = now.toISOString();
      } else {
        staff.consumption.push({ itemId, name: item.name, price: item.price, qty: 1, date: now.toISOString() });
      }

      if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); }
      await DB.put("staff", staff);
      await DB.logActivity("مصرف پرسنل", staff.name + " - " + item.name + " | " + Utils.formatCurrency(item.price));
      App.toast("مصرف ثبت شد");
    });
    if (result && result.alreadyLocked) return;
  }

  // Same lock-per-staff pattern as addConsumption/PCs.updateItemQty: keeps a
  // rapid +/- click from racing another write to this staff member's
  // consumption list or the shared cafeItems stock count.
  async function updateConsumptionQty(staffId, index, delta) {
    let result = await Utils.withLock("staff-consumption:" + staffId, async () => {
      let staff = await DB.get("staff", staffId);
      if (!staff.consumption || !staff.consumption[index]) return;
      let entry = staff.consumption[index];
      let newQty = entry.qty + delta;

      let cafeItem = entry.itemId != null ? await DB.get("cafeItems", entry.itemId) : null;

      if (delta > 0) {
        if (cafeItem && !cafeItem.unlimited && cafeItem.stock <= 0) { App.toast("موجودی تمام شده"); return; }
        if (cafeItem && !cafeItem.unlimited) { cafeItem.stock--; await DB.put("cafeItems", cafeItem); }
      } else if (delta < 0 && cafeItem && !cafeItem.unlimited) {
        cafeItem.stock++;
        await DB.put("cafeItems", cafeItem);
      }

      if (newQty <= 0) {
        staff.consumption.splice(index, 1);
      } else {
        entry.qty = newQty;
      }

      await DB.put("staff", staff);
    });
    if (result && result.alreadyLocked) return;
    await showActivityTab(staffId);
  }

  async function removeConsumption(staffId, index) {
    let result = await Utils.withLock("staff-consumption:" + staffId, async () => {
      let staff = await DB.get("staff", staffId);
      if (!staff.consumption || !staff.consumption[index]) return;
      let entry = staff.consumption[index];

      if (entry.itemId != null) {
        let cafeItem = await DB.get("cafeItems", entry.itemId);
        if (cafeItem && !cafeItem.unlimited) {
          cafeItem.stock += entry.qty;
          await DB.put("cafeItems", cafeItem);
        }
      }

      staff.consumption.splice(index, 1);
      await DB.put("staff", staff);
      await DB.logActivity("حذف آیتم مصرف", entry.name + " - " + staff.name);
    });
    if (result && result.alreadyLocked) return;
    await showActivityTab(staffId);
  }

  // Wrappers that await the underlying action before re-rendering the activity
  // tab, so a rapid re-render can't race ahead of the DB write it depends on.
  async function startShiftAndRefreshTab(staffId) { await startShift(staffId); await showActivityTab(staffId); }
  async function endShiftAndRefreshTab(staffId) { await endShift(staffId); await showActivityTab(staffId); }
  async function addConsumptionAndRefreshTab(staffId, itemId) { await addConsumption(staffId, itemId); await showActivityTab(staffId); }

  function refresh() { let el = document.getElementById("tab-staff"); if (el && el.classList.contains("active")) render(el); }

  return {
    render, showAddStaff, saveStaff, startShift, endShift, showStaffDetail, showActivityTab, showStatsTab, addConsumption,
    updateConsumptionQty, removeConsumption,
    startShiftAndRefreshTab, endShiftAndRefreshTab, addConsumptionAndRefreshTab,
    refresh,
  };
})();
