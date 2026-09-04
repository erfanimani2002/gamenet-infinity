const Consoles = (function () {
  async function render(el) {
    let devices = await DB.getAll("devices");
    let consoles = devices.filter((d) => d.type === "console");
    let sessions = await DB.getAll("sessions");
    let pricing = await DB.getSetting("pricing", {});
    let rates = pricing.consoleRates || { 1: 5000, 2: 7000, 3: 9000, 4: 11000 };

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>کنسول‌های پلی‌استیشن</h2>
        </div>
        <div class="device-list" id="consoleList">
          ${consoles.map((d) => {
            let session = sessions.find((s) => s.deviceId === d.id && s.status === "active");
            return renderDeviceRow(d, session, rates, pricing);
          }).join("")}
        </div>
      </div>
    `;
    el.innerHTML = html;

    consoles.forEach((d) => {
      let session = sessions.find((s) => s.deviceId === d.id && s.status === "active");
      if (session) {
        let block = session.timeBlocks && session.timeBlocks[session.timeBlocks.length - 1];
        if (block && !block.endTime) startTimerDisplay("timer-" + d.id, block.startTime);
      }
    });
  }

  function renderDeviceRow(device, session, rates, pricing) {
    let statusClass = device.status === "free" ? "status-free" : "status-busy";
    let statusText = device.status === "free" ? "آزاد" : "در حال استفاده";

    if (session) {
      let blocks = session.timeBlocks || [];
      let lastBlock = blocks[blocks.length - 1];
      let timerHtml = "";
      if (lastBlock && !lastBlock.endTime) {
        timerHtml = `<span class="inline-timer" id="timer-${device.id}">00:00:00</span>`;
      }
      let idsHtml = (session.ids || []).map((id) => "#" + id).join(", ") || "?";

      return `
        <div class="device-item" style="background: #fff7ed;">
          <img class="device-thumb" src="img/ps5-on.webp" alt="کنسول">
          <span class="device-name">${Utils.escapeHtml(device.name)}</span>
          <span class="device-status">
            <span class="status-badge status-busy">${statusText}</span>
            ${timerHtml}
            <span class="text-sm text-muted"> (${idsHtml})</span>
          </span>
          <div class="device-actions">
            <button class="btn btn-sm btn-outline" onclick="Consoles.showSessionDetail(${device.id})">جزئیات</button>
            ${lastBlock && !lastBlock.endTime ?
              `<button class="btn btn-sm btn-warning" onclick="Consoles.closeBlock(${device.id})">توقف</button>` :
              `<button class="btn btn-sm btn-success" onclick="Consoles.openBlock(${device.id})">شروع بلوک</button>`
            }
            <button class="btn btn-sm btn-outline" onclick="Consoles.settleBlock(${device.id})">تسویه بلوک</button>
            <button class="btn btn-sm btn-primary" onclick="Consoles.settleSession(${device.id})">تسویه کل</button>
            <button class="btn btn-sm btn-outline" onclick="Consoles.showAddItem(${device.id})">+ آیتم</button>
            <button class="btn btn-sm btn-outline" onclick="Consoles.transferSession(${device.id})">جابه‌جایی</button>
            <button class="btn btn-sm btn-danger" onclick="Consoles.cancelSession(${device.id})">لغو سشن</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="device-item">
        <img class="device-thumb" src="img/ps5-on.webp" alt="کنسول">
        <span class="device-name">${Utils.escapeHtml(device.name)}</span>
        <span class="device-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </span>
        <div class="device-actions">
          <button class="btn btn-sm btn-success" onclick="Consoles.startSession(${device.id})">شروع سشن</button>
        </div>
      </div>
    `;
  }

  function startTimerDisplay(timerId, startTime) {
    App.startTimer(timerId, () => {
      let el = document.getElementById(timerId);
      if (el) {
        let elapsed = Date.now() - new Date(startTime).getTime();
        el.textContent = Utils.formatTimerDisplay(elapsed);
      }
    });
  }

  let selectedIds = [];

  async function startSession(deviceId) {
    selectedIds = [];
    let customers = await DB.getAll("customers");
    App.openModal(`
      <h2>شروع سشن کنسول</h2>
      <div class="form-group">
        <label>انتخاب شناسه مشتری</label>
        <input type="text" id="sSearch" placeholder="جستجو..." oninput="Consoles.filterCustomers()">
        <div id="sCustomerList" style="max-height:200px;overflow-y:auto;margin-top:8px;">
          ${customers.map((c) => `
            <div class="list-row customer-pick" data-id="${c.id}" data-search="${String(c.displayId || c.id)}" onclick="Consoles.pickCustomer(${c.id})" style="cursor:pointer">
              <span class="row-label">#${c.displayId || c.id}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="form-group">
        <label>شناسه‌های انتخاب شده</label>
        <div id="sSelectedIds" class="text-muted text-sm">هیچ شناسه‌ای انتخاب نشده</div>
      </div>
      <div class="form-group">
        <label>تعداد کنترلر</label>
        <select id="sControllerCount">
          <option value="1">۱ کنترلر</option>
          <option value="2">۲ کنترلر</option>
          <option value="3">۳ کنترلر</option>
          <option value="4">۴ کنترلر</option>
        </select>
      </div>
      <div class="form-group">
        <label>زمان شروع (اختیاری)</label>
        <input type="time" id="sStartTime">
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Consoles.confirmStartSession(${deviceId})">شروع</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  function filterCustomers() {
    let q = document.getElementById("sSearch").value.toLowerCase();
    document.querySelectorAll(".customer-pick").forEach((row) => {
      row.style.display = row.dataset.search.includes(q) ? "flex" : "none";
    });
  }

  function pickCustomer(id) {
    if (!selectedIds.includes(id)) selectedIds.push(id);
    updateSelectedIds();
  }

  function removeSelectedId(id) {
    selectedIds = selectedIds.filter((i) => i !== id);
    updateSelectedIds();
  }

  function updateSelectedIds() {
    let el = document.getElementById("sSelectedIds");
    if (!el) return;
    if (selectedIds.length === 0) {
      el.innerHTML = '<span class="text-muted">هیچ شناسه‌ای انتخاب نشده</span>';
    } else {
      el.innerHTML = selectedIds.map((id) =>
        `<span class="status-badge" style="margin:2px;">#${id} <button onclick="Consoles.removeSelectedId(${id})" style="background:none;border:none;cursor:pointer;color:red;">×</button></span>`
      ).join("");
    }
  }

  function parseTimeInput(timeInput) {
    let now = new Date();
    let parts = timeInput.split(":");
    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d > now) d.setDate(d.getDate() - 1);
    return d;
  }

  async function confirmStartSession(deviceId) {
    if (selectedIds.length === 0) { App.toast("حداقل یک شناسه انتخاب کنید"); return; }
    let controllerCount = parseInt(document.getElementById("sControllerCount").value);
    let pricing = await DB.getSetting("pricing", {});
    let rates = pricing.consoleRates || { 1: 5000, 2: 7000, 3: 9000, 4: 11000 };
    let rate = rates[controllerCount] || rates[1];

    let startTime = new Date();
    let timeInput = document.getElementById("sStartTime").value;
    if (timeInput) {
      startTime = parseTimeInput(timeInput);
    }

    let session = {
      deviceId, deviceType: "console", ids: [...selectedIds], controllerCount,
      timeBlocks: [{ startTime: startTime.toISOString(), endTime: null, rate, controllerCount, price: 0 }],
      items: [], status: "active", createdAt: startTime.toISOString(),
    };

    await DB.add("sessions", session);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "busy" });
    await DB.logActivity("شروع سشن کنسول", "دستگاه #" + deviceId + " | شناسه‌ها: " + selectedIds.map((i) => "#" + i).join(", "));

    selectedIds = [];
    App.closeModalForce();
    App.toast("سشن شروع شد");
    refresh();
  }

  async function openBlock(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;
    let pricing = await DB.getSetting("pricing", {});
    let rates = pricing.consoleRates || {};
    let rate = rates[session.controllerCount] || rates[1];

    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate, controllerCount: session.controllerCount, price: 0 });
    await DB.put("sessions", session);
    await DB.logActivity("شروع بلوک کنسول", "سشن #" + session.id);
    refresh();
  }

  async function closeBlock(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;
    let lastBlock = session.timeBlocks[session.timeBlocks.length - 1];
    if (!lastBlock || lastBlock.endTime) return;

    lastBlock.endTime = new Date().toISOString();
    let hours = (new Date(lastBlock.endTime) - new Date(lastBlock.startTime)) / 3600000;
    let pricing = await DB.getSetting("pricing", {});
    lastBlock.price = Utils.roundPrice(hours * lastBlock.rate, pricing.roundingUnit || 1000);

    await DB.put("sessions", session);
    await DB.logActivity("توقف بلوک کنسول", "سشن #" + session.id + " | مبلغ: " + Utils.formatCurrency(lastBlock.price));
    App.stopTimer("timer-" + deviceId);
    refresh();
  }

  async function settleBlock(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let unsettledBlocks = session.timeBlocks.map((b, i) => ({ ...b, index: i })).filter((b) => b.endTime && !b.settled);
    if (unsettledBlocks.length === 0) { App.toast("بلوک تسویه‌نشده‌ای وجود ندارد"); return; }

    let customers = await DB.getAll("customers");
    let customerOptions = (session.ids || []).map((id) => {
      let c = customers.find((cu) => cu.id === id);
      return `<option value="${id}">#${c ? (c.displayId || c.id) : id}</option>`;
    }).join("");
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>تسویه بلوک‌های زمانی</h2>
      ${unsettledBlocks.map((b) => {
        let dur = Utils.formatDuration(new Date(b.endTime) - new Date(b.startTime));
        return `
          <div class="session-detail" style="margin-bottom:12px;">
            <div class="flex-between mb-2">
              <span><strong>بلوک ${b.index + 1}</strong> - ${Jalali.timeString(new Date(b.startTime))} تا ${Jalali.timeString(new Date(b.endTime))}</span>
              <span class="amount">${Utils.formatCurrency(b.price)}</span>
            </div>
            <div class="text-muted text-sm mb-2">${dur}</div>
            <div class="form-inline">
              <div class="form-group"><label>پرداخت‌کننده</label><select id="payer_${b.index}">${customerOptions}</select></div>
              <div class="form-group"><label>روش</label><select id="payType_${b.index}"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option></select></div>
              <div class="form-group"><label>تسویه‌کننده</label>${settlerHtml.replace('id="settlerSelect"', 'id="settler_' + b.index + '"')}</div>
              <button class="btn btn-sm btn-success" onclick="Consoles.settleSingleBlock(${deviceId}, ${b.index})">تسویه این بلوک</button>
            </div>
          </div>
        `;
      }).join("")}
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button>
      </div>
    `);
  }

  async function settleSingleBlock(deviceId, blockIndex) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let block = session.timeBlocks[blockIndex];
    if (!block || !block.endTime || block.settled) { App.toast("بلوک قابل تسویه نیست"); return; }

    let payerId = parseInt(document.getElementById("payer_" + blockIndex).value) || 0;
    let payType = document.getElementById("payType_" + blockIndex).value;
    let settlerEl = document.getElementById("settler_" + blockIndex);
    let settlerName = settlerEl ? settlerEl.options[settlerEl.selectedIndex]?.text : "";

    await Utils.applyPayment(payerId, block.price, payType);
    block.settled = true;
    block.settlePayType = payType;
    block.settlerName = settlerName;
    block.settledAt = new Date().toISOString();
    await DB.put("sessions", session);
    await DB.logActivity("تسویه بلوک کنسول", "سشن #" + session.id + " | بلوک " + (blockIndex + 1) + " | " + Utils.formatCurrency(block.price) + " | " + payType + " | " + settlerName);
    App.toast("بلوک تسویه شد");
    settleBlock(deviceId);
  }

  async function settleSession(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let lastBlock = session.timeBlocks[session.timeBlocks.length - 1];
    if (lastBlock && !lastBlock.endTime) {
      lastBlock.endTime = new Date().toISOString();
      let hours = (new Date(lastBlock.endTime) - new Date(lastBlock.startTime)) / 3600000;
      let pricing = await DB.getSetting("pricing", {});
      lastBlock.price = Utils.roundPrice(hours * lastBlock.rate, pricing.roundingUnit || 1000);
      await DB.put("sessions", session);
    }

    let totalBlocks = session.timeBlocks.filter((b) => !b.settled).reduce((s, b) => s + (b.price || 0), 0);
    let totalItems = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let total = totalBlocks + totalItems;

    let discount = 0;
    if (session.ids && session.ids.length > 0) {
      let mainCustomer = await DB.get("customers", session.ids[0]);
      if (mainCustomer && mainCustomer.discount) discount = Math.round(total * mainCustomer.discount / 100);
    }

    let customers = await DB.getAll("customers");
    let customerOptions = (session.ids || []).map((id) => {
      let c = customers.find((cu) => cu.id === id);
      return `<option value="${id}">#${c ? (c.displayId || c.id) : id}</option>`;
    }).join("");
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>تسویه کل سشن</h2>
      <div class="list-row"><span class="row-label">زمان</span><span class="row-value">${Utils.formatCurrency(totalBlocks)}</span></div>
      <div class="list-row"><span class="row-label">آیتم‌ها</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      ${discount > 0 ? `<div class="list-row"><span class="row-label">تخفیف</span><span class="row-value amount positive">-${Utils.formatCurrency(discount)}</span></div>` : ''}
      <div class="list-row font-bold text-lg"><span class="row-label">جمع کل</span><span class="row-value amount">${Utils.formatCurrency(total - discount)}</span></div>
      <hr class="section-divider">
      <div class="form-group"><label>پرداخت‌کننده</label><select id="payerId">${customerOptions}</select></div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="settlePayType"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option></select>
      </div>
      <div class="form-group"><label>کاربر تسویه‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Consoles.confirmSettleSession(${deviceId}, ${total}, ${discount})">تسویه</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmSettleSession(deviceId, total, discount) {
    let payerId = parseInt(document.getElementById("payerId").value) || 0;
    let payType = document.getElementById("settlePayType").value;
    let settlerName = Utils.getSettlerName();
    let finalAmount = total - (discount || 0);

    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    await Utils.applyPayment(payerId, finalAmount, payType);
    session.status = "settled";
    session.settledAt = new Date().toISOString();
    session.settlePayType = payType;
    session.settleAmount = finalAmount;
    session.discount = discount || 0;
    session.settlerName = settlerName;
    session.timeBlocks.forEach((b) => { b.settled = true; });
    await DB.put("sessions", session);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "free" });
    await DB.logActivity("تسویه کل سشن کنسول", "سشن #" + session.id + " | مبلغ: " + Utils.formatCurrency(finalAmount) + " | " + payType + " | " + settlerName);
    App.stopTimer("timer-" + deviceId);
    App.closeModalForce();
    App.toast("تسویه انجام شد");
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

    let blocksHtml = (session.timeBlocks || []).map((b, i) => {
      let duration = b.endTime ?
        Utils.formatDuration(new Date(b.endTime) - new Date(b.startTime)) :
        Utils.formatDuration(Date.now() - new Date(b.startTime).getTime()) + " (در حال اجرا)";
      return `<div class="block-item">
        <span>بلوک ${i + 1}: ${Jalali.timeString(new Date(b.startTime))} - ${b.endTime ? Jalali.timeString(new Date(b.endTime)) : '...'} ${b.settled ? '(تسویه شده)' : ''}</span>
        <span>${duration} | ${Utils.formatCurrency(b.price)}</span>
      </div>`;
    }).join("");

    let itemsHtml = (session.items || []).map((it) => `<div class="block-item"><span>${Utils.escapeHtml(it.name)} x${it.qty}</span><span>${Utils.formatCurrency(it.price * it.qty)}</span></div>`).join("");
    let totalItems = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let totalBlocks = (session.timeBlocks || []).reduce((s, b) => s + (b.price || 0), 0);

    App.openModal(`
      <div style="text-align:center;margin-bottom:12px;"><img src="img/ps5-on.webp" style="max-width:200px;border-radius:8px;"></div>
      <h2>جزئیات سشن - کنسول</h2>
      <div class="list-row"><span class="row-label">شناسه‌ها</span><span class="row-value">${idsHtml}</span></div>
      <div class="list-row"><span class="row-label">تعداد کنترلر</span><span class="row-value">${session.controllerCount || 1}</span></div>
      <hr class="section-divider">
      <h3>بلوک‌های زمانی</h3>
      ${blocksHtml}
      <div class="list-row font-bold"><span class="row-label">جمع زمان</span><span class="row-value">${Utils.formatCurrency(totalBlocks)}</span></div>
      <hr class="section-divider">
      <h3>آیتم‌ها</h3>
      ${itemsHtml || '<div class="text-muted text-sm">بدون آیتم</div>'}
      <div class="list-row font-bold"><span class="row-label">جمع آیتم‌ها</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      <div class="list-row font-bold text-lg"><span class="row-label">جمع کل</span><span class="row-value amount">${Utils.formatCurrency(totalBlocks + totalItems)}</span></div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  async function showAddItem(deviceId) {
    let cafeItems = await DB.getAll("cafeItems");
    let penalties = await DB.getAll("penaltyItems");

    App.openModal(`
      <h2>افزودن آیتم به سشن</h2>
      <h3>آیتم‌های کافی‌شاپ</h3>
      <div class="item-grid">
        ${cafeItems.map((item) => `<div class="item-card" onclick="Consoles.addItemClick(${deviceId}, ${item.id}, 'cafe')"><div class="item-name">${Utils.escapeHtml(item.name)}</div><div class="item-price">${Utils.formatCurrency(item.price)}</div></div>`).join("")}
      </div>
      <h3 style="margin-top:12px">جریمه/تخفیف</h3>
      <div class="item-grid">
        ${penalties.map((item) => `<div class="item-card ${item.type === 'penalty' ? 'penalty-item' : 'discount-item'}" onclick="Consoles.addItemClick(${deviceId}, ${item.id}, 'penalty')"><div class="item-name">${Utils.escapeHtml(item.name)}</div><div class="item-price">${item.type === 'penalty' ? '+' : '-'}${Utils.formatCurrency(item.amount)}</div></div>`).join("")}
      </div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  async function addItemClick(deviceId, itemId, source) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let item;
    if (source === "cafe") {
      item = await DB.get("cafeItems", itemId);
      if (item) {
        if (!item.unlimited && item.stock <= 0) { App.toast("موجودی تمام شده"); return; }
        session.items.push({ name: item.name, price: item.price, qty: 1, type: "cafe" });
        if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); }
      }
    } else {
      item = await DB.get("penaltyItems", itemId);
      if (item) {
        let price = item.type === "penalty" ? item.amount : -item.amount;
        session.items.push({ name: item.name, price, qty: 1, type: item.type });
      }
    }
    if (item) {
      await DB.put("sessions", session);
      await DB.logActivity("افزودن آیتم", item.name + " به سشن #" + session.id + " | " + Utils.formatCurrency(item.price));
      App.toast("آیتم اضافه شد");
      showSessionDetail(deviceId);
    }
  }

  async function transferSession(deviceId) {
    let devices = await DB.getAll("devices");
    let otherDevices = devices.filter((d) => d.id !== deviceId && (d.type === "console" || d.type === "billiard") && d.status === "free");
    if (otherDevices.length === 0) { App.toast("دستگاه آزادی موجود نیست"); return; }

    App.openModal(`
      <h2>جابه‌جایی سشن</h2>
      <div class="form-group"><label>دستگاه مقصد</label>
        <select id="transferTarget">${otherDevices.map((d) => `<option value="${d.id}">${Utils.escapeHtml(d.name)}</option>`).join("")}</select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-warning" onclick="Consoles.confirmTransfer(${deviceId})">جابه‌جایی</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmTransfer(deviceId) {
    let targetId = parseInt(document.getElementById("transferTarget").value);
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let lastBlock = session.timeBlocks[session.timeBlocks.length - 1];
    if (lastBlock && !lastBlock.endTime) {
      lastBlock.endTime = new Date().toISOString();
      let hours = (new Date(lastBlock.endTime) - new Date(lastBlock.startTime)) / 3600000;
      let pricing = await DB.getSetting("pricing", {});
      lastBlock.price = Utils.roundPrice(hours * lastBlock.rate, pricing.roundingUnit || 1000);
    }

    let targetDevice = await DB.get("devices", targetId);
    let pricing = await DB.getSetting("pricing", {});
    let newRate = targetDevice.type === "billiard" ?
      (pricing.billiardRates || {})[session.controllerCount] || 8000 :
      (pricing.consoleRates || {})[session.controllerCount] || 5000;

    session.deviceId = targetId;
    session.deviceType = targetDevice.type;
    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate: newRate, controllerCount: session.controllerCount, price: 0 });

    let oldDevice = await DB.get("devices", deviceId);
    await DB.put("sessions", session);
    await DB.put("devices", { ...oldDevice, status: "free" });
    await DB.put("devices", { ...targetDevice, status: "busy" });
    await DB.logActivity("جابه‌جایی سشن", "سشن #" + session.id + " از " + oldDevice.name + " به " + targetDevice.name);
    App.stopTimer("timer-" + deviceId);
    App.closeModalForce();
    App.toast("جابه‌جایی انجام شد");
    refresh();
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
    // Reverse payments from settled blocks
    for (let b of (session.timeBlocks || [])) {
      if (b.settled && b.settlePayType && session.ids && session.ids[0]) {
        await Reports.reversePayment(session.ids[0], b.price || 0, b.settlePayType);
      }
    }

    App.stopTimer("timer-" + deviceId);
    await DB.remove("sessions", session.id);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "free" });
    await DB.logActivity("لغو سشن کنسول", "سشن #" + session.id + " حذف شد");
    App.toast("سشن لغو شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-consoles");
    if (el && el.classList.contains("active")) render(el);
  }

  return {
    render, startSession, confirmStartSession, openBlock, closeBlock,
    settleBlock, settleSingleBlock, confirmSettleBlock: settleSingleBlock, settleSession, confirmSettleSession,
    showSessionDetail, showAddItem, addItemClick, transferSession, confirmTransfer,
    cancelSession,
    filterCustomers, pickCustomer, removeSelectedId
  };
})();
