const PCs = (function () {
  async function render(el) {
    let devices = await DB.getAll("devices");
    let pcs = devices.filter((d) => d.type === "pc");
    let sessions = await DB.getAll("sessions");

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>پی‌سی‌ها</h2>
        </div>
        <div class="device-list">
          ${pcs.map((d) => {
            let session = sessions.find((s) => s.deviceId === d.id && s.status === "active");
            return renderPCRow(d, session);
          }).join("")}
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  function renderPCRow(device, session) {
    if (session) {
      let idsHtml = (session.ids || []).map((id) => "#" + id).join(", ") || "?";
      return `
        <div class="device-item" style="background: #fff7ed;">
          <img class="device-thumb" src="img/pc-on.webp" alt="پی‌سی">
          <span class="device-name">${Utils.escapeHtml(device.name)}</span>
          <span class="device-status">
            <span class="status-badge status-busy">روشن</span>
            <span class="text-sm text-muted"> (${idsHtml})</span>
          </span>
          <div class="device-actions">
            <button class="btn btn-sm btn-outline" onclick="PCs.showSessionDetail(${device.id})">جزئیات</button>
            <button class="btn btn-sm btn-warning" onclick="PCs.turnOff(${device.id})">خاموش + تسویه</button>
            <button class="btn btn-sm btn-outline" onclick="PCs.showAddItem(${device.id})">+ آیتم</button>
            <button class="btn btn-sm btn-danger" onclick="PCs.cancelSession(${device.id})">لغو سشن</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="device-item">
        <img class="device-thumb" src="img/pc-on.webp" alt="پی‌سی">
        <span class="device-name">${Utils.escapeHtml(device.name)}</span>
        <span class="device-status">
          <span class="status-badge status-free">خاموش</span>
        </span>
        <div class="device-actions">
          <button class="btn btn-sm btn-success" onclick="PCs.turnOn(${device.id})">روشن کردن</button>
        </div>
      </div>
    `;
  }

  let selectedIds = [];

  async function turnOn(deviceId) {
    selectedIds = [];
    let customers = await DB.getAll("customers");
    App.openModal(`
      <h2>روشن کردن پی‌سی</h2>
      <div class="form-group">
        <label>انتخاب شناسه مشتری</label>
        <input type="text" id="pcSearch" placeholder="جستجو..." oninput="PCs.filterCustomers()">
        <div id="pcCustomerList" style="max-height:200px;overflow-y:auto;margin-top:8px;">
          ${customers.map((c) => `
            <div class="list-row customer-pick" data-id="${c.id}" data-search="${String(c.displayId || c.id)}" onclick="PCs.pickCustomer(${c.id})" style="cursor:pointer">
              <span class="row-label">#${c.displayId || c.id}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="form-group">
        <label>شناسه انتخاب شده</label>
        <div id="pcSelectedIds" class="text-muted text-sm">انتخاب نشده</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="PCs.confirmTurnOn(${deviceId})">روشن شود</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  function filterCustomers() {
    let q = document.getElementById("pcSearch").value.toLowerCase();
    document.querySelectorAll(".customer-pick").forEach((row) => {
      row.style.display = row.dataset.search.includes(q) ? "flex" : "none";
    });
  }

  function pickCustomer(id) {
    selectedIds = [id];
    updateSelectedIds();
  }

  function updateSelectedIds() {
    let el = document.getElementById("pcSelectedIds");
    if (!el) return;
    if (selectedIds.length === 0) {
      el.innerHTML = '<span class="text-muted">انتخاب نشده</span>';
    } else {
      el.innerHTML = selectedIds.map((id) => `<span class="status-badge">#${id}</span>`).join(" ");
    }
  }

  async function confirmTurnOn(deviceId) {
    if (selectedIds.length === 0) { App.toast("شناسه را انتخاب کنید"); return; }

    let session = {
      deviceId, deviceType: "pc", ids: [...selectedIds], controllerCount: 1,
      timeBlocks: [{ startTime: new Date().toISOString(), endTime: null, rate: 0, price: 0 }],
      items: [], status: "active", createdAt: new Date().toISOString(),
    };

    await DB.add("sessions", session);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "busy" });
    await DB.logActivity("روشن کردن پی‌سی", "دستگاه #" + deviceId + " | شناسه: #" + selectedIds[0]);
    selectedIds = [];
    App.closeModalForce();
    App.toast("پی‌سی روشن شد");
    refresh();
  }

  async function turnOff(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let totalItems = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let customers = await DB.getAll("customers");
    let customerOptions = (session.ids || []).map((id) => {
      let c = customers.find((cu) => cu.id === id);
      return `<option value="${id}">#${c ? (c.displayId || c.id) : id}</option>`;
    }).join("");
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>خاموش کردن پی‌سی + تسویه</h2>
      <div class="list-row"><span class="row-label">هزینه آیتم‌ها</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      <hr class="section-divider">
      <div class="form-group"><label>مبلغ بازی (تومان) - دستی وارد شود</label><input type="number" id="pcGameAmount" placeholder="مبلغ" min="0" value="0"></div>
      <div class="form-group"><label>پرداخت‌کننده</label><select id="payerId">${customerOptions}</select></div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="settlePayType"><option value="cash">نقدی</option><option value="card">کارتی</option><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option></select>
      </div>
      <div class="form-group"><label>کاربر تسویه‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="PCs.confirmTurnOff(${deviceId})">خاموش + تسویه</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmTurnOff(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let gameAmount = parseInt(document.getElementById("pcGameAmount").value) || 0;
    let totalItems = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let total = gameAmount + totalItems;
    let payerId = parseInt(document.getElementById("payerId").value) || 0;
    let payType = document.getElementById("settlePayType").value;
    let settlerName = Utils.getSettlerName();

    await Utils.applyPayment(payerId, total, payType);

    session.status = "settled";
    session.settledAt = new Date().toISOString();
    session.settlePayType = payType;
    session.settleAmount = total;
    session.gameAmount = gameAmount;
    session.settlerName = settlerName;
    await DB.put("sessions", session);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "free" });
    await DB.logActivity("خاموش + تسویه پی‌سی", "سشن #" + session.id + " | بازی: " + Utils.formatCurrency(gameAmount) + " | آیتم: " + Utils.formatCurrency(totalItems) + " | " + payType + " | " + settlerName);
    App.closeModalForce();
    App.toast("پی‌سی خاموش و تسویه شد");
    refresh();
  }

  async function showSessionDetail(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let customers = await DB.getAll("customers");
    let idsHtml = (session.ids || []).map((id) => {
      let c = customers.find((cu) => cu.id === id);
      return "#" + (c ? (c.displayId || c.id) : id);
    }).join(", ");

    let itemsHtml = (session.items || []).map((it) => `<div class="block-item"><span>${Utils.escapeHtml(it.name)} x${it.qty}</span><span>${Utils.formatCurrency(it.price * it.qty)}</span></div>`).join("");
    let totalItems = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let duration = Utils.formatDuration(Date.now() - new Date(session.createdAt).getTime());

    App.openModal(`
      <div style="text-align:center;margin-bottom:12px;"><img src="img/pc-on.webp" style="max-width:200px;border-radius:8px;"></div>
      <h2>جزئیات پی‌سی</h2>
      <div class="list-row"><span class="row-label">شناسه</span><span class="row-value">${idsHtml}</span></div>
      <div class="list-row"><span class="row-label">مدت</span><span class="row-value">${duration}</span></div>
      <hr class="section-divider">
      <h3>آیتم‌ها</h3>
      ${itemsHtml || '<div class="text-muted text-sm">بدون آیتم</div>'}
      <div class="list-row font-bold"><span class="row-label">جمع آیتم‌ها</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  async function showAddItem(deviceId) {
    let cafeItems = await DB.getAll("cafeItems");
    App.openModal(`
      <h2>افزودن آیتم</h2>
      <div class="item-grid">
        ${cafeItems.map((item) => `<div class="item-card" onclick="PCs.addItemClick(${deviceId}, ${item.id})"><div class="item-name">${Utils.escapeHtml(item.name)}</div><div class="item-price">${Utils.formatCurrency(item.price)}</div></div>`).join("")}
      </div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  async function addItemClick(deviceId, itemId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;
    let item = await DB.get("cafeItems", itemId);
    if (!item) return;
    if (!item.unlimited && item.stock <= 0) { App.toast("موجودی تمام شده"); return; }

    session.items.push({ name: item.name, price: item.price, qty: 1, type: "cafe" });
    if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); }
    await DB.put("sessions", session);
    await DB.logActivity("افزودن آیتم به پی‌سی", item.name + " به سشن #" + session.id);
    App.toast("آیتم اضافه شد");
    showSessionDetail(deviceId);
  }

  async function cancelSession(deviceId) {
    if (!confirm("آیا از لغو این سشن مطمئن هستید؟ تمام اطلاعات حذف خواهد شد.")) return;
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    // Restore stock for cafe items
    for (let it of (session.items || [])) {
      if (it.type === "cafe") {
        let cafeItem = (await DB.getAll("cafeItems")).find((ci) => ci.name === it.name);
        if (cafeItem && !cafeItem.unlimited) { cafeItem.stock += (it.qty || 1); await DB.put("cafeItems", cafeItem); }
      }
    }

    // Reverse payments from settled time blocks
    for (let b of (session.timeBlocks || [])) {
      if (b.settled && b.settlePayType && session.ids && session.ids[0]) {
        await Reports.reversePayment(session.ids[0], b.price || 0, b.settlePayType);
      }
    }
    // Remove block payment records
    let allBp = await DB.getAll("blockPayments");
    for (let bp of allBp.filter((bp) => bp.sessionId === session.id)) {
      await DB.remove("blockPayments", bp.id);
    }

    await DB.remove("sessions", session.id);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "free" });
    await DB.logActivity("لغو سشن پی‌سی", "سشن #" + session.id + " حذف شد");
    App.toast("سشن لغو شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-pcs");
    if (el && el.classList.contains("active")) render(el);
  }

  return {
    render, turnOn, confirmTurnOn, turnOff, confirmTurnOff,
    showSessionDetail, showAddItem, addItemClick, cancelSession,
    filterCustomers, pickCustomer, refresh,
  };
})();
