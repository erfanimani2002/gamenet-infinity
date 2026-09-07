const Consoles = (function () {
  async function render(el) {
    let devices = await DB.getAll("devices");
    let consoles = devices.filter((d) => d.type === "console");
    let sessions = await DB.getAll("sessions");
    let customers = await DB.getAll("customers");
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
            return renderDeviceRow(d, session, rates, pricing, customers);
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

  function renderDeviceRow(device, session, rates, pricing, customers) {
    let statusClass = device.status === "free" ? "status-free" : "status-busy";
    let statusText = device.status === "tournament" ? "در حال مسابقه" : device.status === "free" ? "آزاد" : "در حال استفاده";

    if (session) {
      let blocks = session.timeBlocks || [];
      let lastBlock = blocks[blocks.length - 1];
      let timerHtml = "";
      if (lastBlock && !lastBlock.endTime) {
        timerHtml = `<span class="inline-timer" id="timer-${device.id}">00:00:00</span>`;
      }
      let idsHtml = (session.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ") || "?";

      return `
        <div class="device-item is-busy">
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

    // A device can be "busy" with no session record here if it's currently
    // tied up by a tournament match (device.status === "tournament") — in
    // that case there's nothing to start a normal session on top of.
    let isFreeForSession = device.status === "free" || !device.status;

    return `
      <div class="device-item">
        <img class="device-thumb" src="img/ps5-on.webp" alt="کنسول">
        <span class="device-name">${Utils.escapeHtml(device.name)}</span>
        <span class="device-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </span>
        <div class="device-actions">
          ${isFreeForSession
            ? `<button class="btn btn-sm btn-success" onclick="Consoles.startSession(${device.id})">شروع سشن</button>`
            : `<button class="btn btn-sm btn-outline" disabled>در حال مسابقه</button>`
          }
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
    await renderStartSessionModal(deviceId);
  }

  async function renderStartSessionModal(deviceId) {
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
        <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="Consoles.quickCreateCustomer(${deviceId})">+ مشتری جدید سریع</button>
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
    updateSelectedIds();
  }

  function quickCreateCustomer(deviceId) {
    Customers.promptQuickCreate(async (result) => {
      pickCustomer(result.id);
      await renderStartSessionModal(deviceId);
    });
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

  async function updateSelectedIds() {
    let el = document.getElementById("sSelectedIds");
    if (!el) return;
    if (selectedIds.length === 0) {
      el.innerHTML = '<span class="text-muted">هیچ شناسه‌ای انتخاب نشده</span>';
      return;
    }
    let customers = await DB.getAll("customers");
    el.innerHTML = selectedIds.map((id) => {
      let c = customers.find((cu) => cu.id === id);
      let label = c ? (c.displayId || c.id) : id;
      return `<span class="status-badge" style="margin:2px;">#${label} <button onclick="Consoles.removeSelectedId(${id})" style="background:none;border:none;cursor:pointer;color:red;">×</button></span>`;
    }).join("");
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
    let device = await DB.get("devices", deviceId);
    if (device && device.status && device.status !== "free") {
      App.toast("این دستگاه در حال استفاده در یک مسابقه است");
      return;
    }
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
      timeBlocks: [{ startTime: startTime.toISOString(), endTime: null, rate, controllerCount, deviceType: "console", price: 0 }],
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

    if (session.timeBlocks.length > 0 && session.timeBlocks[session.timeBlocks.length - 1].endTime === null) {
      App.toast("یک بلوک باز از قبل وجود دارد");
      return;
    }

    let pricing = await DB.getSetting("pricing", {});
    let rates = pricing.consoleRates || {};
    let rate = rates[session.controllerCount] || rates[1];

    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate, controllerCount: session.controllerCount, deviceType: session.deviceType || "console", price: 0 });
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
    let defaultPayerId = (session.ids || [])[0];
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
              <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, defaultPayerId, "payer_" + b.index)}</div>
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
    await Utils.guardDoubleClick(async () => {
      let sessions = await DB.getAll("sessions");
      let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!session) return { success: false };

      let block = session.timeBlocks[blockIndex];
      if (!block || !block.endTime || block.settled) { App.toast("بلوک قابل تسویه نیست"); return { success: false }; }

      let payerId = parseInt(document.getElementById("payer_" + blockIndex).value) || 0;
      let payType = document.getElementById("payType_" + blockIndex).value;
      let settlerEl = document.getElementById("settler_" + blockIndex);
      let settlerName = settlerEl ? settlerEl.options[settlerEl.selectedIndex]?.text : "";

      let customer = await DB.get("customers", payerId);
      let payResult = Utils.computePaymentUpdate(customer, block.price, payType);
      if (!payResult.success) {
        App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
        return { success: false };
      }
      block.settled = true;
      block.settlePayType = payResult.payType;
      block.payBreakdown = payResult.payBreakdown;
      block.settlerName = settlerName;
      block.settledAt = new Date().toISOString();

      // Customer balance update and block/session settlement land in one
      // IndexedDB transaction so a crash or reload between them can't leave a
      // payment applied with the block still marked unsettled (or vice versa).
      await DB.runAtomic([
        { store: "customers", type: "put", data: payResult.customer },
        { store: "sessions", type: "put", data: session },
        { store: "blockPayments", type: "add", data: {
          customerId: payerId, sessionId: session.id, deviceId,
          deviceType: block.deviceType || session.deviceType, blockIndex,
          amount: block.price, payType: payResult.payType, payBreakdown: payResult.payBreakdown, settlerName,
          date: new Date().toISOString()
        } },
      ]);
      await DB.logActivity("تسویه بلوک کنسول", "سشن #" + session.id + " | بلوک " + (blockIndex + 1) + " | " + Utils.formatCurrency(block.price) + " | " + payResult.payType + " | " + settlerName);
      App.toast("بلوک تسویه شد");
      settleBlock(deviceId);
      return { success: true };
    });
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
      if (mainCustomer) discount = Math.round(total * await Utils.getEffectiveDiscount(mainCustomer) / 100);
    }

    let customers = await DB.getAll("customers");
    let defaultPayerId = (session.ids || [])[0];
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>تسویه کل سشن</h2>
      <div class="list-row"><span class="row-label">زمان</span><span class="row-value">${Utils.formatCurrency(totalBlocks)}</span></div>
      <div class="list-row"><span class="row-label">آیتم‌ها</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      ${discount > 0 ? `<div class="list-row"><span class="row-label">تخفیف</span><span class="row-value amount positive">-${Utils.formatCurrency(discount)}</span></div>` : ''}
      <div class="list-row font-bold text-lg"><span class="row-label">جمع کل</span><span class="row-value amount">${Utils.formatCurrency(total - discount)}</span></div>
      <hr class="section-divider">
      <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, defaultPayerId, "payerId")}</div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="settlePayType"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option></select>
      </div>
      <div class="form-group"><label>کاربر تسویه‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Consoles.confirmSettleSession(${deviceId})">تسویه</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmSettleSession(deviceId) {
    await Utils.guardDoubleClick(async () => {
      let payerId = parseInt(document.getElementById("payerId").value) || 0;
      let payType = document.getElementById("settlePayType").value;
      let settlerName = Utils.getSettlerName();

      let sessions = await DB.getAll("sessions");
      let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!session) return { success: false };

      // Recompute the payable amount from the CURRENT session instead of trusting
      // the totals baked into the modal (which may have gone stale, e.g. after
      // the 23:35 boundary or an extra item was added).
      let lastBlock = session.timeBlocks[session.timeBlocks.length - 1];
      if (lastBlock && !lastBlock.endTime) {
        lastBlock.endTime = new Date().toISOString();
        let hours = (new Date(lastBlock.endTime) - new Date(lastBlock.startTime)) / 3600000;
        let pricing = await DB.getSetting("pricing", {});
        lastBlock.price = Utils.roundPrice(hours * lastBlock.rate, pricing.roundingUnit || 1000);
      }

      let unsettledBlocks = session.timeBlocks.filter((b) => !b.settled);
      let blockTotal = unsettledBlocks.reduce((s, b) => s + (b.price || 0), 0);
      let itemsTotal = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
      let gross = blockTotal + itemsTotal;

      let discount = 0;
      if (session.ids && session.ids.length > 0) {
        let mainCustomer = await DB.get("customers", session.ids[0]);
        if (mainCustomer) discount = Math.round(gross * await Utils.getEffectiveDiscount(mainCustomer) / 100);
      }
      // Floor at 0 so discount/credit items can never "credit" the wallet.
      let finalAmount = Math.max(0, gross - discount);

      let customer = await DB.get("customers", payerId);
      let payResult = Utils.computePaymentUpdate(customer, finalAmount, payType);
      if (!payResult.success) {
        App.toast("پرداخت ناموفق بود");
        return { success: false };
      }

      // Attribute the settle across the devices the session's blocks actually ran
      // on (see D), so a transfer doesn't dump already-priced console blocks into
      // billiard. Items are attributed to the final device.
      let byDevice = { console: 0, billiard: 0, pc: 0 };
      unsettledBlocks.forEach((b) => { byDevice[b.deviceType || session.deviceType] = (byDevice[b.deviceType || session.deviceType] || 0) + (b.price || 0); });
      byDevice[session.deviceType] = (byDevice[session.deviceType] || 0) + itemsTotal;
      if (gross > 0) {
        let factor = finalAmount / gross;
        byDevice.console = Math.round(byDevice.console * factor);
        byDevice.billiard = Math.round(byDevice.billiard * factor);
        byDevice.pc = Math.round(byDevice.pc * factor);
        let sum = byDevice.console + byDevice.billiard + byDevice.pc;
        let diff = finalAmount - sum;
        if (diff !== 0) byDevice[session.deviceType] = (byDevice[session.deviceType] || 0) + diff;
      }

      session.status = "settled";
      session.settledAt = new Date().toISOString();
      session.settlePayType = payResult.payType;
      session.payBreakdown = payResult.payBreakdown;
      session.settleAmount = finalAmount;
      session.discount = discount || 0;
      session.settleBreakdown = byDevice;
      session.settlerName = settlerName;
      session.settlePayerId = payerId;
      session.timeBlocks.forEach((b) => { b.settled = true; });

      let device = await DB.get("devices", deviceId);
      await DB.runAtomic([
        { store: "customers", type: "put", data: payResult.customer },
        { store: "sessions", type: "put", data: session },
        { store: "devices", type: "put", data: { ...device, status: "free" } },
      ]);
      await DB.logActivity("تسویه کل سشن کنسول", "سشن #" + session.id + " | مبلغ: " + Utils.formatCurrency(finalAmount) + " | " + payResult.payType + " | " + settlerName);
      App.stopTimer("timer-" + deviceId);
      App.closeModalForce();
      App.toast("تسویه انجام شد");
      refresh();
      return { success: true };
    });
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
      <div class="pick-list">
        ${cafeItems.map((item) => `<div class="pick-item" onclick="Consoles.addItemClick(${deviceId}, ${item.id}, 'cafe')"><span class="pick-name">${Utils.escapeHtml(item.name)}</span><span class="pick-meta">${Utils.formatCurrency(item.price)}</span></div>`).join("")}
      </div>
      <h3 style="margin-top:12px">جریمه/تخفیف</h3>
      <div class="pick-list">
        ${penalties.map((item) => `<div class="pick-item" onclick="Consoles.addItemClick(${deviceId}, ${item.id}, 'penalty')"><span class="pick-name">${Utils.escapeHtml(item.name)}</span><span class="pick-meta">${item.type === 'penalty' ? '+' : '-'}${Utils.formatCurrency(item.amount)}</span></div>`).join("")}
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
        session.items.push({ itemId, name: item.name, price: item.price, qty: 1, type: "cafe" });
        if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); }
      }
    } else {
      item = await DB.get("penaltyItems", itemId);
      if (item) {
        let price = item.type === "penalty" ? item.amount : -item.amount;
        session.items.push({ itemId, name: item.name, price, qty: 1, type: item.type });
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
    // The destination device type has its own pricing/count semantics (e.g. a
    // billiard table's rate is keyed by cue count, not the console's
    // controller count) — look up the rate fresh for the destination type
    // instead of reusing the source device's controllerCount value.
    let { rate: newRate, controllerCount: newControllerCount } = Utils.resolveTransferRate(pricing, targetDevice.type, session.controllerCount);

    session.deviceId = targetId;
    session.deviceType = targetDevice.type;
    session.controllerCount = newControllerCount;
    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate: newRate, controllerCount: newControllerCount, deviceType: targetDevice.type, price: 0 });

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

    let cafeItems = await DB.getAll("cafeItems");
    let allBp = await DB.getAll("blockPayments");
    let allCustomers = await DB.getAll("customers");
    let device = await DB.get("devices", deviceId);

    // Pre-compute cafe item stock changes.
    let cafeItemChanges = {};
    for (let it of (session.items || [])) {
      if (it.type === "cafe") {
        let cafeItem = it.itemId != null ? cafeItems.find((ci) => ci.id === it.itemId) : cafeItems.find((ci) => ci.name === it.name);
        if (cafeItem && !cafeItem.unlimited) {
          if (!cafeItemChanges[cafeItem.id]) cafeItemChanges[cafeItem.id] = { ...cafeItem };
          cafeItemChanges[cafeItem.id].stock += (it.qty || 1);
        }
      }
    }

    // Pre-compute customer payment reversals.
    let customerChanges = {};
    let blockPaymentRemovals = [];
    for (let i = 0; i < (session.timeBlocks || []).length; i++) {
      let b = session.timeBlocks[i];
      if (!b.settled || !b.settlePayType) continue;
      let bp = allBp.find((r) => r.sessionId === session.id && r.blockIndex === i);
      let payerId = bp ? bp.customerId : (session.ids && session.ids[0]);
      if (payerId) {
        if (!customerChanges[payerId]) {
          let c = allCustomers.find((x) => x.id === payerId);
          if (c) customerChanges[payerId] = { ...c };
        }
        let c = customerChanges[payerId];
        if (c) {
          let amount = b.price || 0;
          let payBreakdown = bp ? bp.payBreakdown : b.payBreakdown;
          if (payBreakdown && typeof payBreakdown === "object") {
            let w = payBreakdown.wallet || 0, d = payBreakdown.debt || 0, other = (payBreakdown.cash || 0) + (payBreakdown.card || 0);
            if (w) { c.wallet = (c.wallet || 0) + w; c.totalPaid = Math.max(0, (c.totalPaid || 0) - w); }
            if (d) { c.debt = Math.max(0, (c.debt || 0) - d); }
            if (other) { c.totalPaid = Math.max(0, (c.totalPaid || 0) - other); }
          } else if (b.settlePayType === "wallet") {
            c.wallet = (c.wallet || 0) + amount; c.totalPaid = Math.max(0, (c.totalPaid || 0) - amount);
          } else if (b.settlePayType === "debt") {
            c.debt = Math.max(0, (c.debt || 0) - amount);
          } else {
            c.totalPaid = Math.max(0, (c.totalPaid || 0) - amount);
          }
        }
      }
      if (bp) blockPaymentRemovals.push(bp);
    }

    App.stopTimer("timer-" + deviceId);
    await DB.runAtomic([
      ...Object.values(customerChanges).map((c) => ({ store: "customers", type: "put", data: c })),
      ...Object.values(cafeItemChanges).map((ci) => ({ store: "cafeItems", type: "put", data: ci })),
      ...blockPaymentRemovals.map((bp) => ({ store: "blockPayments", type: "remove", data: bp.id })),
      { store: "sessions", type: "remove", data: session.id },
      { store: "devices", type: "put", data: { ...device, status: "free" } },
    ]);
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
    cancelSession, quickCreateCustomer,
    filterCustomers, pickCustomer, removeSelectedId
  };
})();
