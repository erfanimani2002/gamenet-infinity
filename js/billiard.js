const Billiard = (function () {
  async function render(el) {
    let devices = await DB.getAll("devices");
    let tables = devices.filter((d) => d.type === "billiard");
    let sessions = await DB.getAll("sessions");
    let customers = await DB.getAll("customers");
    let pricing = await DB.getSetting("pricing", {});
    let rates = pricing.billiardRates || { 2: 8000, 4: 12000 };

    let html = `
      <div class="card">
        <div class="card-header"><h2>میزهای بیلیارد</h2></div>
        <div class="device-list">
          ${tables.map((d) => {
            let session = sessions.find((s) => s.deviceId === d.id && s.status === "active");
            return renderDeviceRow(d, session, rates, customers);
          }).join("")}
        </div>
      </div>
    `;
    el.innerHTML = html;

    tables.forEach((d) => {
      let session = sessions.find((s) => s.deviceId === d.id && s.status === "active");
      if (session) {
        let block = session.timeBlocks && session.timeBlocks[session.timeBlocks.length - 1];
        if (block && !block.endTime) startTimerDisplay("timer-billiard-" + d.id, block.startTime);
      }
    });
  }

  function renderDeviceRow(device, session, rates, customers) {
    let statusClass = device.status === "free" ? "status-free" : "status-busy";
    let statusText = device.status === "tournament" ? "در حال مسابقه" : device.status === "free" ? "آزاد" : "در حال استفاده";

    if (session) {
      let lastBlock = session.timeBlocks && session.timeBlocks[session.timeBlocks.length - 1];
      let timerHtml = lastBlock && !lastBlock.endTime ? `<span class="inline-timer" id="timer-billiard-${device.id}">00:00:00</span>` : "";
      let idsHtml = (session.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ") || "?";
      let stickText = session.controllerCount === 4 ? "چهارچوب" : "دوچوب";

      return `
        <div class="device-item" style="background: #fff7ed;">
          <img class="device-thumb" src="img/pool.webp" alt="بیلیارد">
          <span class="device-name">${Utils.escapeHtml(device.name)}</span>
          <span class="device-status">
            <span class="status-badge status-busy">${statusText}</span>
            <span class="text-sm text-muted">(${stickText})</span>
            ${timerHtml}
            <span class="text-sm text-muted"> (${idsHtml})</span>
          </span>
          <div class="device-actions">
            <button class="btn btn-sm btn-outline" onclick="Billiard.showSessionDetail(${device.id})">جزئیات</button>
            ${lastBlock && !lastBlock.endTime ?
              `<button class="btn btn-sm btn-warning" onclick="Billiard.closeBlock(${device.id})">توقف</button>` :
              `<button class="btn btn-sm btn-success" onclick="Billiard.openBlock(${device.id})">شروع بلوک</button>`}
            <button class="btn btn-sm btn-outline" onclick="Billiard.settleBlock(${device.id})">تسویه بلوک</button>
            <button class="btn btn-sm btn-primary" onclick="Billiard.settleSession(${device.id})">تسویه کل</button>
            <button class="btn btn-sm btn-outline" onclick="Billiard.showAddItem(${device.id})">+ آیتم</button>
            <button class="btn btn-sm btn-outline" onclick="Billiard.transferSession(${device.id})">جابه‌جایی</button>
            <button class="btn btn-sm btn-danger" onclick="Billiard.cancelSession(${device.id})">لغو سشن</button>
          </div>
        </div>`;
    }

    let isFreeForSession = device.status === "free" || !device.status;

    return `
      <div class="device-item">
        <img class="device-thumb" src="img/pool.webp" alt="بیلیارد">
        <span class="device-name">${Utils.escapeHtml(device.name)}</span>
        <span class="device-status"><span class="status-badge ${statusClass}">${statusText}</span></span>
        <div class="device-actions">
          ${isFreeForSession
            ? `<button class="btn btn-sm btn-success" onclick="Billiard.startSession(${device.id})">شروع سشن</button>`
            : `<button class="btn btn-sm btn-outline" disabled>در حال مسابقه</button>`
          }
        </div>
      </div>`;
  }

  function startTimerDisplay(timerId, startTime) {
    App.startTimer(timerId, () => {
      let el = document.getElementById(timerId);
      if (el) el.textContent = Utils.formatTimerDisplay(Date.now() - new Date(startTime).getTime());
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
      <h2>شروع سشن بیلیارد</h2>
      <div class="form-group">
        <label>انتخاب شناسه</label>
        <input type="text" id="bSearch" placeholder="جستجو..." oninput="Billiard.filterCustomers()">
        <div style="max-height:200px;overflow-y:auto;margin-top:8px;">
          ${customers.map((c) => `<div class="list-row customer-pick" data-search="${String(c.displayId || c.id)}" onclick="Billiard.pickCustomer(${c.id})" style="cursor:pointer"><span class="row-label">#${c.displayId || c.id}</span></div>`).join("")}
        </div>
        <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="Billiard.quickCreateCustomer(${deviceId})">+ مشتری جدید سریع</button>
      </div>
      <div class="form-group"><label>انتخاب شده</label><div id="bSelectedIds" class="text-muted text-sm">هیچ شناسه‌ای</div></div>
      <div class="form-group"><label>تعداد چوب</label><select id="bStickCount"><option value="2">دوچوب</option><option value="4">چهارچوب</option></select></div>
      <div class="form-group"><label>زمان شروع (اختیاری)</label><input type="time" id="bStartTime"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Billiard.confirmStartSession(${deviceId})">شروع</button>
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

  function filterCustomers() { let q = document.getElementById("bSearch").value.toLowerCase(); document.querySelectorAll(".customer-pick").forEach((r) => { r.style.display = r.dataset.search.includes(q) ? "flex" : "none"; }); }
  function pickCustomer(id) { if (!selectedIds.includes(id)) selectedIds.push(id); updateSelectedIds(); }
  function removeSelectedId(id) { selectedIds = selectedIds.filter((i) => i !== id); updateSelectedIds(); }
  async function updateSelectedIds() { let el = document.getElementById("bSelectedIds"); if (!el) return; if (selectedIds.length === 0) { el.innerHTML = '<span class="text-muted">هیچ شناسه‌ای</span>'; return; } let customers = await DB.getAll("customers"); el.innerHTML = selectedIds.map((id) => { let c = customers.find((cu) => cu.id === id); let label = c ? (c.displayId || c.id) : id; return `<span class="status-badge" style="margin:2px;">#${label} <button onclick="Billiard.removeSelectedId(${id})" style="background:none;border:none;cursor:pointer;color:red;">×</button></span>`; }).join(""); }

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
    if (selectedIds.length === 0) { App.toast("حداقل یک شناسه"); return; }
    let device = await DB.get("devices", deviceId);
    if (device && device.status && device.status !== "free") {
      App.toast("این دستگاه در حال استفاده در یک مسابقه است");
      return;
    }
    let stickCount = parseInt(document.getElementById("bStickCount").value);
    let pricing = await DB.getSetting("pricing", {});
    let rate = (pricing.billiardRates || {})[stickCount] || 8000;
    let startTime = new Date();
    let timeInput = document.getElementById("bStartTime").value;
    if (timeInput) { startTime = parseTimeInput(timeInput); }

    let session = { deviceId, deviceType: "billiard", ids: [...selectedIds], controllerCount: stickCount, timeBlocks: [{ startTime: startTime.toISOString(), endTime: null, rate, controllerCount: stickCount, deviceType: "billiard", price: 0 }], items: [], status: "active", createdAt: startTime.toISOString() };
    await DB.add("sessions", session);
    await DB.put("devices", { ...await DB.get("devices", deviceId), status: "busy" });
    await DB.logActivity("شروع سشن بیلیارد", "میز #" + deviceId + " | " + (stickCount === 4 ? "چهارچوب" : "دوچوب") + " | " + selectedIds.map((i) => "#" + i).join(", "));
    selectedIds = []; App.closeModalForce(); App.toast("سشن شروع شد"); refresh();
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
    let rate = (pricing.billiardRates || {})[session.controllerCount] || 8000;
    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate, controllerCount: session.controllerCount, deviceType: session.deviceType || "billiard", price: 0 });
    await DB.put("sessions", session);
    await DB.logActivity("شروع بلوک بیلیارد", "سشن #" + session.id);
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
    await DB.logActivity("توقف بلوک بیلیارد", "سشن #" + session.id + " | مبلغ: " + Utils.formatCurrency(lastBlock.price));
    App.stopTimer("timer-billiard-" + deviceId);
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
      <h2>تسویه بلوک‌های بیلیارد</h2>
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
              <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, defaultPayerId, "bPayer_" + b.index)}</div>
              <div class="form-group"><label>روش</label><select id="bPayType_${b.index}"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option></select></div>
              <div class="form-group"><label>تسویه‌کننده</label>${settlerHtml.replace('id="settlerSelect"', 'id="bSettler_' + b.index + '"')}</div>
              <button class="btn btn-sm btn-success" onclick="Billiard.settleSingleBlock(${deviceId}, ${b.index})">تسویه این بلوک</button>
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

      let payerId = parseInt(document.getElementById("bPayer_" + blockIndex).value) || 0;
      let payType = document.getElementById("bPayType_" + blockIndex).value;
      let settlerEl = document.getElementById("bSettler_" + blockIndex);
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
      await DB.logActivity("تسویه بلوک بیلیارد", "سشن #" + session.id + " | بلوک " + (blockIndex + 1) + " | " + Utils.formatCurrency(block.price) + " | " + payResult.payType + " | " + settlerName);
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
      let mc = await DB.get("customers", session.ids[0]);
      if (mc) discount = Math.round(total * await Utils.getEffectiveDiscount(mc) / 100);
    }

    let customers = await DB.getAll("customers");
    let defaultPayerId = (session.ids || [])[0];
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>تسویه کل سشن بیلیارد</h2>
      <div class="list-row"><span class="row-label">زمان</span><span class="row-value">${Utils.formatCurrency(totalBlocks)}</span></div>
      <div class="list-row"><span class="row-label">آیتم</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      ${discount > 0 ? `<div class="list-row"><span class="row-label">تخفیف</span><span class="row-value amount positive">-${Utils.formatCurrency(discount)}</span></div>` : ''}
      <div class="list-row font-bold text-lg"><span class="row-label">کل</span><span class="row-value amount">${Utils.formatCurrency(total - discount)}</span></div>
      <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, defaultPayerId, "payerId")}</div>
      <div class="form-group"><label>روش پرداخت</label><select id="settlePayType"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option></select></div>
      <div class="form-group"><label>تسویه‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Billiard.confirmSettleSession(${deviceId})">تسویه</button>
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

      // Recompute from the current session instead of trusting baked-in totals.
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
        let mc = await DB.get("customers", session.ids[0]);
        if (mc) discount = Math.round(gross * await Utils.getEffectiveDiscount(mc) / 100);
      }
      let finalAmount = Math.max(0, gross - discount);

      let customer = await DB.get("customers", payerId);
      let payResult = Utils.computePaymentUpdate(customer, finalAmount, payType);
      if (!payResult.success) {
        App.toast("پرداخت ناموفق بود");
        return { success: false };
      }

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

      session.status = "settled"; session.settledAt = new Date().toISOString(); session.settlePayType = payResult.payType; session.payBreakdown = payResult.payBreakdown; session.settleAmount = finalAmount; session.discount = discount || 0; session.settleBreakdown = byDevice; session.settlerName = settlerName; session.settlePayerId = payerId;
      session.timeBlocks.forEach((b) => { b.settled = true; });

      let device = await DB.get("devices", deviceId);
      await DB.runAtomic([
        { store: "customers", type: "put", data: payResult.customer },
        { store: "sessions", type: "put", data: session },
        { store: "devices", type: "put", data: { ...device, status: "free" } },
      ]);
      await DB.logActivity("تسویه کل بیلیارد", "سشن #" + session.id + " | " + Utils.formatCurrency(finalAmount) + " | " + payResult.payType + " | " + settlerName);
      App.stopTimer("timer-billiard-" + deviceId); App.closeModalForce(); App.toast("تسویه شد"); refresh();
      return { success: true };
    });
  }

  async function showSessionDetail(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;
    let customers = await DB.getAll("customers");
    let idsHtml = (session.ids || []).map((id) => { let c = customers.find((cu) => cu.id === id); return "#" + (c ? (c.displayId || c.id) : id); }).join(", ");
    let blocksHtml = (session.timeBlocks || []).map((b, i) => {
      let dur = b.endTime ? Utils.formatDuration(new Date(b.endTime) - new Date(b.startTime)) : Utils.formatDuration(Date.now() - new Date(b.startTime).getTime()) + " (ادامه)";
      return `<div class="block-item"><span>بلوک ${i + 1}: ${Jalali.timeString(new Date(b.startTime))} - ${b.endTime ? Jalali.timeString(new Date(b.endTime)) : '...'} ${b.settled ? '(تسویه)' : ''}</span><span>${dur} | ${Utils.formatCurrency(b.price)}</span></div>`;
    }).join("");
    let itemsHtml = (session.items || []).map((it) => `<div class="block-item"><span>${Utils.escapeHtml(it.name)} x${it.qty}</span><span>${Utils.formatCurrency(it.price * it.qty)}</span></div>`).join("");
    let totalItems = (session.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let totalBlocks = (session.timeBlocks || []).reduce((s, b) => s + (b.price || 0), 0);
    let stickText = session.controllerCount === 4 ? "چهارچوب" : "دوچوب";

    App.openModal(`
      <div style="text-align:center;margin-bottom:12px;"><img src="img/pool.webp" style="max-width:200px;border-radius:8px;"></div>
      <h2>جزئیات - بیلیارد (${stickText})</h2>
      <div class="list-row"><span class="row-label">شناسه‌ها</span><span class="row-value">${idsHtml}</span></div>
      <hr class="section-divider"><h3>بلوک‌ها</h3>${blocksHtml}
      <div class="list-row font-bold"><span class="row-label">جمع</span><span class="row-value">${Utils.formatCurrency(totalBlocks)}</span></div>
      <hr class="section-divider"><h3>آیتم‌ها</h3>${itemsHtml || '<div class="text-muted text-sm">بدون آیتم</div>'}
      <div class="list-row font-bold"><span class="row-label">جمع</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      <div class="list-row font-bold text-lg"><span class="row-label">کل</span><span class="row-value amount">${Utils.formatCurrency(totalBlocks + totalItems)}</span></div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  async function showAddItem(deviceId) {
    let cafeItems = await DB.getAll("cafeItems");
    let penalties = await DB.getAll("penaltyItems");
    App.openModal(`
      <h2>افزودن آیتم</h2>
      <h3>کافی‌شاپ</h3>
      <div class="item-grid">${cafeItems.map((item) => `<div class="item-card" onclick="Billiard.addItemClick(${deviceId}, ${item.id}, 'cafe')"><div class="item-name">${Utils.escapeHtml(item.name)}</div><div class="item-price">${Utils.formatCurrency(item.price)}</div></div>`).join("")}</div>
      <h3 style="margin-top:12px">جریمه/تخفیف</h3>
      <div class="item-grid">${penalties.map((item) => `<div class="item-card ${item.type === 'penalty' ? 'penalty-item' : 'discount-item'}" onclick="Billiard.addItemClick(${deviceId}, ${item.id}, 'penalty')"><div class="item-name">${Utils.escapeHtml(item.name)}</div></div>`).join("")}</div>
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
      if (item) { if (!item.unlimited && item.stock <= 0) { App.toast("موجودی تمام"); return; } session.items.push({ itemId, name: item.name, price: item.price, qty: 1, type: "cafe" }); if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); } }
    } else {
      item = await DB.get("penaltyItems", itemId);
      if (item) { let price = item.type === "penalty" ? item.amount : -item.amount; session.items.push({ itemId, name: item.name, price, qty: 1, type: item.type }); }
    }
    if (item) { await DB.put("sessions", session); await DB.logActivity("افزودن آیتم به بیلیارد", item.name + " به سشن #" + session.id + " | " + Utils.formatCurrency(item.price)); App.toast("اضافه شد"); showSessionDetail(deviceId); }
  }

  async function transferSession(deviceId) {
    let devices = await DB.getAll("devices");
    let otherDevices = devices.filter((d) => d.id !== deviceId && (d.type === "console" || d.type === "billiard") && d.status === "free");
    if (otherDevices.length === 0) { App.toast("دستگاه آزاد نیست"); return; }
    App.openModal(`
      <h2>جابه‌جایی</h2>
      <div class="form-group"><label>مقصد</label><select id="transferTarget">${otherDevices.map((d) => `<option value="${d.id}">${Utils.escapeHtml(d.name)}</option>`).join("")}</select></div>
      <div class="modal-actions">
        <button class="btn btn-warning" onclick="Billiard.confirmTransfer(${deviceId})">جابه‌جایی</button>
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
    // Look up the rate fresh for the destination device type instead of
    // reusing the source device's controllerCount, which has no meaning on
    // the destination type (see Utils.resolveTransferRate).
    let { rate: newRate, controllerCount: newControllerCount } = Utils.resolveTransferRate(pricing, targetDevice.type, session.controllerCount);
    session.deviceId = targetId; session.deviceType = targetDevice.type; session.controllerCount = newControllerCount;
    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate: newRate, controllerCount: newControllerCount, deviceType: targetDevice.type, price: 0 });
    let oldDevice = await DB.get("devices", deviceId);
    await DB.put("sessions", session);
    await DB.put("devices", { ...oldDevice, status: "free" });
    await DB.put("devices", { ...targetDevice, status: "busy" });
    await DB.logActivity("جابه‌جایی سشن بیلیارد", "سشن #" + session.id + " از " + oldDevice.name + " به " + targetDevice.name);
    App.stopTimer("timer-billiard-" + deviceId); App.closeModalForce(); refresh();
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

    App.stopTimer("timer-billiard-" + deviceId);
    await DB.runAtomic([
      ...Object.values(customerChanges).map((c) => ({ store: "customers", type: "put", data: c })),
      ...Object.values(cafeItemChanges).map((ci) => ({ store: "cafeItems", type: "put", data: ci })),
      ...blockPaymentRemovals.map((bp) => ({ store: "blockPayments", type: "remove", data: bp.id })),
      { store: "sessions", type: "remove", data: session.id },
      { store: "devices", type: "put", data: { ...device, status: "free" } },
    ]);
    await DB.logActivity("لغو سشن بیلیارد", "سشن #" + session.id + " حذف شد");
    App.toast("سشن لغو شد");
    refresh();
  }

  function refresh() { let el = document.getElementById("tab-billiard"); if (el && el.classList.contains("active")) render(el); }

  return { render, startSession, confirmStartSession, openBlock, closeBlock, settleBlock, settleSingleBlock, settleSession, confirmSettleSession, showSessionDetail, showAddItem, addItemClick, transferSession, confirmTransfer, cancelSession, quickCreateCustomer, filterCustomers, pickCustomer, removeSelectedId, refresh };
})();
