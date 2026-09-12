const Billiard = (function () {
  async function render(el) {
    el.innerHTML = Utils.skeletonDeviceList(3);
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
      let idsHtml = (session.ids || []).map((id) => Utils.renderCustomerId(id, customers)).join(", ") || "?";
      let stickText = session.controllerCount === 4 ? "چهارچوب" : "دوچوب";

      return `
        <div class="device-item is-busy">
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
    let settlerHtml = await Utils.renderSettlerSelect();
    App.openModal(`
      <h2>شروع سشن بیلیارد</h2>
      <div class="form-group">
        <label>انتخاب شناسه</label>
        <input type="text" id="bSearch" placeholder="جستجو..." oninput="Billiard.filterCustomers()">
        <div class="customer-pick-list">
          ${customers.map((c) => {
            let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
            let idLabel = "#" + (c.displayId || c.id);
            let searchLabel = idLabel + (fullName ? " " + fullName : "");
            return `<div class="list-row customer-pick" data-search="${searchLabel}" onclick="Billiard.pickCustomer(${c.id})"><span class="row-label">${fullName ? fullName + " " + idLabel : idLabel}</span></div>`;
          }).join("")}
        </div>
        <button class="btn btn-sm btn-outline btn-quick-create" onclick="Billiard.quickCreateCustomer(${deviceId})">+ مشتری جدید سریع</button>
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
  async function updateSelectedIds() { let el = document.getElementById("bSelectedIds"); if (!el) return; if (selectedIds.length === 0) { el.innerHTML = '<span class="text-muted">هیچ شناسه‌ای</span>'; return; } let customers = await DB.getAll("customers"); el.innerHTML = selectedIds.map((id) => { let label = Utils.renderCustomerId(id, customers); return `<span class="status-badge" style="margin:2px;">${label} <button onclick="Billiard.removeSelectedId(${id})" style="background:none;border:none;cursor:pointer;color:red;">×</button></span>`; }).join(""); }

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

    let session = { deviceId, deviceType: "billiard", ids: [...selectedIds], controllerCount: stickCount, timeBlocks: [{ startTime: startTime.toISOString(), endTime: null, rate, controllerCount: stickCount, deviceType: "billiard", deviceId, price: 0 }], items: [], status: "active", createdAt: startTime.toISOString() };
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
    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate, controllerCount: session.controllerCount, deviceType: session.deviceType || "billiard", deviceId: session.deviceId, price: 0 });
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

    let customers = await DB.getAll("customers");
    let sessionCustomers = (session.ids || []).map((id) => customers.find((c) => c.id === id)).filter(Boolean);

    App.openModal(`
      <h2>توقف بلوک — چه کسی تسویه می‌کند؟</h2>
      <p class="text-muted text-sm">شناسه‌ای که انتخاب می‌کنید فقط برای یادآوری ذخیره می‌شود و لزوماً تسویه‌کننده واقعی نیست.</p>
      <div class="pick-list">
        ${sessionCustomers.map((c) => {
          let label = Utils.renderCustomerId(c.id, customers);
          return `<div class="pick-item" onclick="Billiard.confirmCloseBlock(${deviceId}, ${c.id})" style="cursor:pointer"><span class="pick-name">${label}</span></div>`;
        }).join("")}
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmCloseBlock(deviceId, expectedPayerId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;
    let lastBlock = session.timeBlocks[session.timeBlocks.length - 1];
    if (!lastBlock || lastBlock.endTime) return;

    let customers = await DB.getAll("customers");
    let payer = customers.find((c) => c.id === expectedPayerId);
    let expectedPayerName = payer ? Utils.renderCustomerId(expectedPayerId, customers) : "";

    lastBlock.endTime = new Date().toISOString();
    let hours = (new Date(lastBlock.endTime) - new Date(lastBlock.startTime)) / 3600000;
    let pricing = await DB.getSetting("pricing", {});
    lastBlock.price = Utils.roundPrice(hours * lastBlock.rate, pricing.roundingUnit || 1000);
    lastBlock.expectedPayerId = expectedPayerId;
    lastBlock.expectedPayerName = expectedPayerName;

    await DB.put("sessions", session);
    await DB.logActivity("توقف بلوک بیلیارد", "سشن #" + session.id + " | مبلغ: " + Utils.formatCurrency(lastBlock.price));
    App.stopTimer("timer-billiard-" + deviceId);
    App.closeModalForce();
    refresh();
  }

  async function settleBlock(deviceId) {
    let sessions = await DB.getAll("sessions");
    let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
    if (!session) return;

    let unsettledBlocks = session.timeBlocks.map((b, i) => ({ ...b, index: i })).filter((b) => b.endTime && !b.settled);
    if (unsettledBlocks.length === 0) { App.toast("بلوک تسویه‌نشده‌ای وجود ندارد"); return; }

    let customers = await DB.getAll("customers");
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>تسویه بلوک‌های بیلیارد</h2>
      ${unsettledBlocks.map((b) => {
        let dur = Utils.formatDuration(new Date(b.endTime) - new Date(b.startTime));
        let blockDefaultPayerId = b.expectedPayerId || (session.ids || [])[0];
        return `
          <div class="session-detail" style="margin-bottom:12px;">
            <div class="flex-between mb-2">
              <span><strong>بلوک ${b.index + 1}</strong> - ${Jalali.timeString(new Date(b.startTime))} تا ${Jalali.timeString(new Date(b.endTime))}</span>
              <span class="amount">${Utils.formatCurrency(b.price)}</span>
            </div>
            <div class="text-muted text-sm mb-2">${dur}</div>
            <div class="form-inline">
              <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, blockDefaultPayerId, "bPayer_" + b.index)}</div>
              <div class="form-group"><label>روش</label><select id="bPayType_${b.index}" onchange="Billiard.toggleCombinedPayment('bPayType_${b.index}', 'bCombinedFields_${b.index}', ${b.price})"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select></div>
<div id="bCombinedFields_${b.index}" style="display:none; margin-top:8px;">
  <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="bCombinedCardAmount_${b.index}" min="0" oninput="Billiard.updateCombinedCheck('bCombinedCardAmount_${b.index}', 'bCombinedCashAmount_${b.index}', 'bCombinedCheck_${b.index}', ${b.price})"></div>
  <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="bCombinedCashAmount_${b.index}" min="0" oninput="Billiard.updateCombinedCheck('bCombinedCardAmount_${b.index}', 'bCombinedCashAmount_${b.index}', 'bCombinedCheck_${b.index}', ${b.price})"></div>
  <div id="bCombinedCheck_${b.index}" class="text-sm" style="margin-top:4px;"></div>
</div>
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

      // Re-verify the block hasn't been settled between the modal open and confirm
      // (race-condition guard: another tab/window could have settled the same block).
      let freshSessions = await DB.getAll("sessions");
      let freshSession = freshSessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!freshSession) { App.toast("سشن دیگری فعال نیست"); return { success: false }; }
      let freshBlock = freshSession.timeBlocks[blockIndex];
      if (!freshBlock || freshBlock.settled) { App.toast("این بلوک قبلاً تسویه شده"); return { success: false }; }
      session = freshSession;
      block = freshBlock;

      let payerId = parseInt(document.getElementById("bPayer_" + blockIndex).value) || 0;
      let payType = document.getElementById("bPayType_" + blockIndex).value;
      if (payType === "combined") {
        let cardAmt = parseInt(document.getElementById("bCombinedCardAmount_" + blockIndex).value) || 0;
        let cashAmt = parseInt(document.getElementById("bCombinedCashAmount_" + blockIndex).value) || 0;
        if (cardAmt + cashAmt !== block.price) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        payType = { card: cardAmt, cash: cashAmt };
      }
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
    // Preview-only projection of the currently-open block's price. This must NOT
    // mutate session.timeBlocks or persist via DB.put — this modal can be cancelled,
    // and the real close-and-persist happens in confirmSettleSession on confirmation.
    let lastBlock = session.timeBlocks[session.timeBlocks.length - 1];
    let projectedOpenBlockPrice = null;
    if (lastBlock && !lastBlock.endTime) {
      let projectedEndTime = new Date().toISOString();
      let hours = (new Date(projectedEndTime) - new Date(lastBlock.startTime)) / 3600000;
      let pricing = await DB.getSetting("pricing", {});
      projectedOpenBlockPrice = Utils.roundPrice(hours * lastBlock.rate, pricing.roundingUnit || 1000);
    }

    let totalBlocks = session.timeBlocks.filter((b) => !b.settled).reduce((s, b) => s + (b === lastBlock ? (projectedOpenBlockPrice || 0) : (b.price || 0)), 0);
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
<div class="form-group"><label>روش پرداخت</label><select id="settlePayType" onchange="Billiard.toggleCombinedPayment('settlePayType', 'combinedFieldsSession', ${total - discount})"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select></div>
<div id="combinedFieldsSession" style="display:none; margin-top:8px;">
  <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="bCombinedCardAmountSession" min="0" oninput="Billiard.updateCombinedCheck('bCombinedCardAmountSession', 'bCombinedCashAmountSession', 'bCombinedCheckSession', ${total - discount})"></div>
  <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="bCombinedCashAmountSession" min="0" oninput="Billiard.updateCombinedCheck('bCombinedCardAmountSession', 'bCombinedCashAmountSession', 'bCombinedCheckSession', ${total - discount})"></div>
  <div id="bCombinedCheckSession" class="text-sm" style="margin-top:4px;"></div>
</div>
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
      if (payType === "combined") {
        let cardAmt = parseInt(document.getElementById("bCombinedCardAmountSession").value) || 0;
        let cashAmt = parseInt(document.getElementById("bCombinedCashAmountSession").value) || 0;
        let finalAmount = Math.max(0, gross - discount);
        if (cardAmt + cashAmt !== finalAmount) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        payType = { card: cardAmt, cash: cashAmt };
      }
      let settlerName = Utils.getSettlerName();

      let sessions = await DB.getAll("sessions");
      let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!session) { App.toast("سشن یافت نشد"); return { success: false }; }
      // Re-verify: session may have been settled by another tab between modal
      // open and confirm.  Without this check the same session could be
      // double-settled (double-charging the customer).
      if (session.status !== "active") { App.toast("این سشن قبلاً تسویه شده"); return { success: false }; }

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
    let devices = await DB.getAll("devices");
    let idsHtml = (session.ids || []).map((id) => Utils.renderCustomerId(id, customers)).join(", ");
    let blocksHtml = (session.timeBlocks || []).map((b, i) => {
      let dur = b.endTime ? Utils.formatDuration(new Date(b.endTime) - new Date(b.startTime)) : Utils.formatDuration(Date.now() - new Date(b.startTime).getTime()) + " (ادامه)";
      let blockDevice = b.deviceId ? devices.find((d) => d.id === b.deviceId) : null;
      let blockDeviceLabel = blockDevice ? " — " + blockDevice.name : "";
      let expectedPayerLabel = (b.endTime && b.expectedPayerName) ? " | انتظار: " + b.expectedPayerName : "";
      return `<div class="block-item"><span>بلوک ${i + 1}${blockDeviceLabel}: ${Jalali.timeString(new Date(b.startTime))} - ${b.endTime ? Jalali.timeString(new Date(b.endTime)) : '...'} ${b.settled ? '(تسویه)' : ''}</span><span>${dur} | ${Utils.formatCurrency(b.price)}${expectedPayerLabel}</span></div>`;
    }).join("");
    let itemsHtml = (session.items || []).map((it, i) => `<div class="block-item" style="align-items:center;"><span>${Utils.escapeHtml(it.name)} × ${it.qty}</span><span style="display:flex;align-items:center;gap:6px;"><button class="btn btn-sm btn-outline" onclick="Billiard.updateItemQty(${deviceId}, ${i}, -1)">−</button><span>${Utils.formatCurrency(it.price * it.qty)}</span><button class="btn btn-sm btn-outline" onclick="Billiard.updateItemQty(${deviceId}, ${i}, 1)">+</button><button class="btn btn-sm btn-outline" onclick="Billiard.removeItem(${deviceId}, ${i})">🗑</button></span></div>`).join("");
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
      <div class="pick-list">${cafeItems.map((item) => `<div class="pick-item" onclick="Billiard.addItemClick(${deviceId}, ${item.id}, 'cafe')"><span class="pick-name">${Utils.escapeHtml(item.name)}</span><span class="pick-meta">${Utils.formatCurrency(item.price)}</span></div>`).join("")}</div>
      <h3 style="margin-top:12px">جریمه/تخفیف</h3>
      <div class="pick-list">${penalties.map((item) => `<div class="pick-item" onclick="Billiard.addItemClick(${deviceId}, ${item.id}, 'penalty')"><span class="pick-name">${Utils.escapeHtml(item.name)}</span></div>`).join("")}</div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button></div>
    `);
  }

  // See PCs.addItemClick for why the whole function (not just the "cafe"
  // branch) is locked per-device, and why alreadyLocked returns quietly.
  async function addItemClick(deviceId, itemId, source) {
    let result = await Utils.withLock("session-item:billiard:" + deviceId, async () => {
      let sessions = await DB.getAll("sessions");
      let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!session) return;
      let item;
      if (source === "cafe") {
        item = await DB.get("cafeItems", itemId);
        if (item) {
          let existing = session.items.find((it) => it.itemId === itemId);
          if (existing) {
            if (!item.unlimited && item.stock <= 0) { App.toast("موجودی تمام"); return; }
            existing.qty++;
            if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); }
          } else {
            if (!item.unlimited && item.stock <= 0) { App.toast("موجودی تمام"); return; }
            session.items.push({ itemId, name: item.name, price: item.price, qty: 1, type: "cafe" });
            if (!item.unlimited) { item.stock--; await DB.put("cafeItems", item); }
          }
        }
      } else {
        item = await DB.get("penaltyItems", itemId);
        if (item) {
          let existing = session.items.find((it) => it.itemId === itemId);
          let price = item.type === "penalty" ? item.amount : -item.amount;
          if (existing) {
            existing.qty++;
          } else {
            session.items.push({ itemId, name: item.name, price, qty: 1, type: item.type });
          }
        }
      }
      if (item) { await DB.put("sessions", session); await DB.logActivity("افزودن آیتم به بیلیارد", item.name + " به سشن #" + session.id); App.toast("اضافه شد"); showSessionDetail(deviceId); }
    });
    if (result && result.alreadyLocked) return;
  }

  async function updateItemQty(deviceId, index, delta) {
    let result = await Utils.withLock("session-item:billiard:" + deviceId, async () => {
      let sessions = await DB.getAll("sessions");
      let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!session || !session.items[index]) return;

      let item = session.items[index];
      let newQty = item.qty + delta;

      if (delta > 0 && item.type === "cafe") {
        let cafeItem = await DB.get("cafeItems", item.itemId);
        if (cafeItem && !cafeItem.unlimited && cafeItem.stock <= 0) {
          App.toast("موجودی تمام شده");
          return;
        }
        if (cafeItem && !cafeItem.unlimited) {
          cafeItem.stock--;
          await DB.put("cafeItems", cafeItem);
        }
      }

      if (delta < 0 && item.type === "cafe") {
        let cafeItem = item.itemId != null ? await DB.get("cafeItems", item.itemId) : null;
        if (cafeItem && !cafeItem.unlimited) {
          cafeItem.stock++;
          await DB.put("cafeItems", cafeItem);
        }
      }

      if (newQty <= 0) {
        if (item.type === "cafe") {
          let cafeItem = item.itemId != null ? await DB.get("cafeItems", item.itemId) : null;
          if (cafeItem && !cafeItem.unlimited) {
            cafeItem.stock += item.qty;
            await DB.put("cafeItems", cafeItem);
          }
        }
        session.items.splice(index, 1);
      } else {
        item.qty = newQty;
      }

      await DB.put("sessions", session);
      showSessionDetail(deviceId);
    });
    if (result && result.alreadyLocked) return;
  }

  async function removeItem(deviceId, index) {
    let result = await Utils.withLock("session-item:billiard:" + deviceId, async () => {
      let sessions = await DB.getAll("sessions");
      let session = sessions.find((s) => s.deviceId === deviceId && s.status === "active");
      if (!session || !session.items[index]) return;

      let item = session.items[index];
      if (item.type === "cafe") {
        let cafeItem = item.itemId != null ? await DB.get("cafeItems", item.itemId) : null;
        if (cafeItem && !cafeItem.unlimited) {
          cafeItem.stock += item.qty;
          await DB.put("cafeItems", cafeItem);
        }
      }

      session.items.splice(index, 1);
      await DB.put("sessions", session);
      showSessionDetail(deviceId);
    });
    if (result && result.alreadyLocked) return;
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
    session.timeBlocks.push({ startTime: new Date().toISOString(), endTime: null, rate: newRate, controllerCount: newControllerCount, deviceType: targetDevice.type, deviceId: targetId, price: 0 });
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
          // prefer the individual blockPayment record; fall back to the
          // block's own payBreakdown (set by settleSingleBlock); then to
          // the session-level payBreakdown (set by confirmSettleSession
          // which settles all blocks at once without per-block breakdowns).
          let payBreakdown = bp ? bp.payBreakdown : (b.payBreakdown || session.payBreakdown);
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

  function toggleCombinedPayment(selectId, fieldsId, total) {
    let payType = document.getElementById(selectId).value;
    let fields = document.getElementById(fieldsId);
    if (fields) fields.style.display = payType === "combined" ? "block" : "none";
    if (payType === "combined") updateCombinedCheckTotal(fieldsId, total);
  }

  function updateCombinedCheck(cardId, cashId, checkId, total) {
    let card = parseInt(document.getElementById(cardId).value) || 0;
    let cash = parseInt(document.getElementById(cashId).value) || 0;
    let sum = card + cash;
    let el = document.getElementById(checkId);
    if (!el) return;
    el.textContent = sum === total ? "✓ مطابقت دارد" : `⚠ جمع: ${Utils.formatCurrency(sum)} (کل: ${Utils.formatCurrency(total)})`;
    el.style.color = sum === total ? "green" : "red";
  }

  function updateCombinedCheckTotal(fieldsId, total) {
    let card = parseInt(document.getElementById(fieldsId).querySelector('[id^="bCombinedCardAmount"]').value) || 0;
    let cash = parseInt(document.getElementById(fieldsId).querySelector('[id^="bCombinedCashAmount"]').value) || 0;
    let sum = card + cash;
    let checkEl = document.getElementById(fieldsId).querySelector('[id^="bCombinedCheck"]');
    if (checkEl) {
      checkEl.textContent = sum === total ? "✓ مطابقت دارد" : `⚠ جمع: ${Utils.formatCurrency(sum)} (کل: ${Utils.formatCurrency(total)})`;
      checkEl.style.color = sum === total ? "green" : "red";
    }
  }

  return { render, startSession, confirmStartSession, openBlock, closeBlock, confirmCloseBlock, settleBlock, settleSingleBlock, settleSession, confirmSettleSession, showSessionDetail, showAddItem, addItemClick, updateItemQty, removeItem, transferSession, confirmTransfer, cancelSession, quickCreateCustomer, filterCustomers, pickCustomer, removeSelectedId, refresh, toggleCombinedPayment, updateCombinedCheck };
})();
