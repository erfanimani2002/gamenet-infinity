const AdminPanel = (function () {
  async function render(el) {
    let pricing = await DB.getSetting("pricing", {});
    let devices = await DB.getAll("devices");
    let users = await DB.getAll("users");
    let consoleDevices = devices.filter((d) => d.type === "console");
    let billiardDevices = devices.filter((d) => d.type === "billiard");
    let pcDevices = devices.filter((d) => d.type === "pc");

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>پنل مدیریت</h2>
        </div>

        <div class="report-section">
          <h3>قیمت‌گذاری</h3>
          <div class="form-inline">
            <div class="form-group">
              <label>کنسول ۱ کنترلر (تومان/ساعت)</label>
              <input type="number" id="rate1" value="${(pricing.consoleRates || {})[1] || 5000}" min="0">
            </div>
            <div class="form-group">
              <label>کنسول ۲ کنترلر</label>
              <input type="number" id="rate2" value="${(pricing.consoleRates || {})[2] || 7000}" min="0">
            </div>
            <div class="form-group">
              <label>کنسول ۳ کنترلر</label>
              <input type="number" id="rate3" value="${(pricing.consoleRates || {})[3] || 9000}" min="0">
            </div>
            <div class="form-group">
              <label>کنسول ۴ کنترلر</label>
              <input type="number" id="rate4" value="${(pricing.consoleRates || {})[4] || 11000}" min="0">
            </div>
          </div>
          <div class="form-inline">
            <div class="form-group">
              <label>بیلیارد دوچوب</label>
              <input type="number" id="billiard2" value="${(pricing.billiardRates || {})[2] || 8000}" min="0">
            </div>
            <div class="form-group">
              <label>بیلیارد چهارچوب</label>
              <input type="number" id="billiard4" value="${(pricing.billiardRates || {})[4] || 12000}" min="0">
            </div>
            <div class="form-group">
              <label>واحد رند کردن</label>
              <input type="number" id="roundingUnit" value="${pricing.roundingUnit || 1000}" min="100">
            </div>
          </div>
          <button class="btn btn-primary mt-2" onclick="AdminPanel.savePricing()">ذخیره قیمت‌ها</button>
        </div>

        <hr class="section-divider">

        <div class="report-section">
          <h3>مدیریت دستگاه‌ها</h3>
          <h4 style="margin-bottom:8px">کنسول‌ها</h4>
          ${consoleDevices.map((d) => `
            <div class="list-row">
              <span class="row-value">${Utils.escapeHtml(d.name)}</span>
              <button class="btn btn-sm btn-outline" onclick="AdminPanel.editDevice(${d.id})">ویرایش</button>
              <button class="btn btn-sm btn-danger" onclick="AdminPanel.deleteDevice(${d.id})">حذف</button>
            </div>
          `).join("")}
          <button class="btn btn-sm btn-outline mt-2" onclick="AdminPanel.addDevice('console')">+ افزودن کنسول</button>

          <h4 style="margin:12px 0 8px">میزهای بیلیارد</h4>
          ${billiardDevices.map((d) => `
            <div class="list-row">
              <span class="row-value">${Utils.escapeHtml(d.name)}</span>
              <button class="btn btn-sm btn-outline" onclick="AdminPanel.editDevice(${d.id})">ویرایش</button>
              <button class="btn btn-sm btn-danger" onclick="AdminPanel.deleteDevice(${d.id})">حذف</button>
            </div>
          `).join("")}
          <button class="btn btn-sm btn-outline mt-2" onclick="AdminPanel.addDevice('billiard')">+ افزودن میز بیلیارد</button>

          <h4 style="margin:12px 0 8px">پی‌سی‌ها</h4>
          ${pcDevices.map((d) => `
            <div class="list-row">
              <span class="row-value">${Utils.escapeHtml(d.name)}</span>
              <button class="btn btn-sm btn-outline" onclick="AdminPanel.editDevice(${d.id})">ویرایش</button>
              <button class="btn btn-sm btn-danger" onclick="AdminPanel.deleteDevice(${d.id})">حذف</button>
            </div>
          `).join("")}
          <button class="btn btn-sm btn-outline mt-2" onclick="AdminPanel.addDevice('pc')">+ افزودن پی‌سی</button>
        </div>

        <hr class="section-divider">

        <div class="report-section">
          <h3>مدیریت آیتم‌های کافی‌شاپ</h3>
          <div id="inventorySection"></div>
        </div>

        <hr class="section-divider">

        <div class="report-section">
          <h3>آیتم‌های جریمه/تخفیف</h3>
          <div id="penaltySection"></div>
        </div>

        <hr class="section-divider">

        <div class="report-section">
          <h3>مدیریت کاربران سیستم</h3>
          ${users.map((u) => `
            <div class="list-row">
              <span class="row-value">${Utils.escapeHtml(u.username)}</span>
              <span class="row-value">${u.role === 'manager' ? 'مدیر' : 'ادمین'}</span>
              <span class="row-value">${Utils.escapeHtml(u.name)}</span>
            </div>
          `).join("")}
          <button class="btn btn-sm btn-outline mt-2" onclick="AdminPanel.addUser()">+ کاربر جدید</button>
        </div>
      </div>
    `;
    el.innerHTML = html;

    Inventory.render(document.getElementById("inventorySection"));
    Penalties.render(document.getElementById("penaltySection"));
  }

  async function savePricing() {
    let pricing = {
      consoleRates: {
        1: parseInt(document.getElementById("rate1").value) || 5000,
        2: parseInt(document.getElementById("rate2").value) || 7000,
        3: parseInt(document.getElementById("rate3").value) || 9000,
        4: parseInt(document.getElementById("rate4").value) || 11000,
      },
      billiardRates: {
        2: parseInt(document.getElementById("billiard2").value) || 8000,
        4: parseInt(document.getElementById("billiard4").value) || 12000,
      },
      roundingUnit: parseInt(document.getElementById("roundingUnit").value) || 1000,
    };
    await DB.setSetting("pricing", pricing);
    await DB.logActivity("ذخیره قیمت‌ها", "نرخ‌ها به‌روزرسانی شد");
    App.toast("قیمت‌ها ذخیره شد");
  }

  async function addDevice(type) {
    let names = { console: "کنسول", billiard: "میز بیلیارد", pc: "پی‌سی" };
    let devices = await DB.getAll("devices");
    let count = devices.filter((d) => d.type === type).length + 1;

    await DB.add("devices", {
      name: names[type] + " " + count,
      type: type,
      status: "free",
      games: [],
    });
    await DB.logActivity("افزودن دستگاه", names[type] + " " + count);
    App.toast("دستگاه اضافه شد");
    refresh();
  }

  async function editDevice(id) {
    let device = await DB.get("devices", id);
    App.openModal(`
      <h2>ویرایش ${Utils.escapeHtml(device.name)}</h2>
      <div class="form-group"><label>نام</label><input type="text" id="editDevName" value="${Utils.escapeHtml(device.name)}"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="AdminPanel.saveDevice(${id})">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveDevice(id) {
    let device = await DB.get("devices", id);
    device.name = document.getElementById("editDevName").value.trim();
    await DB.put("devices", device);
    await DB.logActivity("ویرایش دستگاه", device.name);
    App.closeModalForce();
    App.toast("ذخیره شد");
    refresh();
  }

  async function deleteDevice(id) {
    if (!confirm("آیا از حذف این دستگاه مطمئن هستید؟")) return;
    let device = await DB.get("devices", id);
    await DB.remove("devices", id);
    await DB.logActivity("حذف دستگاه", device.name);
    App.toast("دستگاه حذف شد");
    refresh();
  }

  async function addUser() {
    App.openModal(`
      <h2>افزودن کاربر</h2>
      <div class="form-group"><label>نام کاربری</label><input type="text" id="newUsername" placeholder="نام کاربری"></div>
      <div class="form-group"><label>رمز عبور</label><input type="password" id="newPassword" placeholder="رمز عبور"></div>
      <div class="form-group"><label>نام</label><input type="text" id="newName" placeholder="نام نمایشی"></div>
      <div class="form-group"><label>نقش</label>
        <select id="newRole"><option value="admin">ادمین</option><option value="manager">مدیر</option></select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="AdminPanel.saveUser()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveUser() {
    let username = document.getElementById("newUsername").value.trim();
    let password = document.getElementById("newPassword").value.trim();
    let name = document.getElementById("newName").value.trim();
    let role = document.getElementById("newRole").value;
    if (!username || !password) { App.toast("نام کاربری و رمز عبور الزامی است"); return; }
    await DB.add("users", { username, password, role, name });
    await DB.logActivity("افزودن کاربر", username + " (" + (role === 'manager' ? 'مدیر' : 'ادمین') + ")");
    App.closeModalForce();
    App.toast("کاربر ذخیره شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-adminPanel");
    if (el && el.classList.contains("active")) render(el);
  }

  return { render, savePricing, addDevice, editDevice, saveDevice, deleteDevice, addUser, saveUser, refresh };
})();
