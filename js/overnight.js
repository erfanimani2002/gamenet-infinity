// Overnight Reservations
//
// ACCOUNTING MODEL (see spec in the feature request for the full rationale):
//
// - Each reservation locks its own `entranceFee` at creation time from the
//   admin-configured default (pricing.overnightEntranceFee). Changing the
//   default afterward never touches existing reservations — this is why the
//   fee lives on the reservation record itself, not re-read from settings.
// - `items` (food/drink/other charges) live directly on the reservation,
//   exactly like Consoles/Billiard session items, each with its own addedAt
//   timestamp for traceability. `type` is 'cafe' (draws from/returns to
//   cafeItems stock) or 'other' (manual charge, e.g. an incidental fee).
// - The entrance fee and items are charge categories, never merged into one
//   transaction. Money movement (the only thing with a real timestamp for
//   business-date/reporting purposes) is recorded separately in
//   `overnightTransactions`, an append-only ledger of type 'payment',
//   'refund', or 'writeoff'. Charges themselves are derived from the
//   reservation record on demand (computeTotals) rather than duplicated as
//   separate charge transactions, so there is exactly one source of truth for
//   "what is owed" and one for "what has moved".
// - A payment can be partial and can happen at any time, in any order,
//   relative to the entrance fee vs items — computeTotals only cares about
//   totals, never about which charge "came first".
// - Cancellation NEVER deletes the reservation or any transaction. Any unpaid
//   remainder is written off (type 'writeoff', no money moves, no revenue
//   impact) so cancelled reservations stop showing a balance without ever
//   being counted as revenue. Money already collected is only reversed via an
//   explicit, separate "refund" action — never automatically — and refunds
//   are capped to what remains un-refunded so re-running it can't double-pay.
const Overnight = (function () {
  const CATEGORIES = ["entrance", "items", "other"];

  function typeLabel(type) {
    return type === "console" ? "کنسول" : type === "billiard" ? "بیلیارد" : "پی‌سی";
  }
  function statusLabel(status) {
    return status === "active" ? "فعال" : status === "completed" ? "تکمیل‌شده" : "لغوشده";
  }
  function payTypeLabel(pt) {
    return pt === "wallet" ? "کیف‌پول" : pt === "debt" ? "بدهکاری" : pt === "card" ? "کارتی" : "نقدی";
  }

  // Applies a percentage discount to a price, rounded to the nearest toman.
  function applyDiscountPct(price, pct) {
    if (!pct) return price;
    return Math.round(price * (1 - pct / 100));
  }

  // Per-reservation lock for item-adding. Utils.guardDoubleClick only disables
  // <button> elements, but the cafe item picker is a clickable <div>
  // (.pick-item), so it wouldn't be protected by that alone. Without this,
  // two rapid clicks both read the same reservation/stock before either write
  // lands, and the second write silently overwrites the first (lost item,
  // wrong stock count).
  let itemAddLocks = new Set();
  async function withItemLock(id, fn) {
    if (itemAddLocks.has(id)) return { success: false, alreadyLocked: true };
    itemAddLocks.add(id);
    try {
      return await fn();
    } finally {
      itemAddLocks.delete(id);
    }
  }

  // ---- Derived totals — the ONLY place balances are computed, so every
  // screen and every accounting decision (payment cap, refund cap, writeoff
  // amount) reads from the same numbers. -----------------------------------
  function computeTotals(reservation, transactions) {
    let active = (transactions || []).filter((t) => t.reservationId === reservation.id && t.status !== "voided");

    let entranceCharge = reservation.entranceFee || 0;
    let itemsCharge = (reservation.items || []).filter((it) => it.type !== "other").reduce((s, it) => s + it.price * it.qty, 0);
    let otherCharge = (reservation.items || []).filter((it) => it.type === "other").reduce((s, it) => s + it.price * it.qty, 0);
    let charges = { entrance: entranceCharge, items: itemsCharge, other: otherCharge };

    let paid = { entrance: 0, items: 0, other: 0 };
    let refunded = { entrance: 0, items: 0, other: 0 };
    let writtenOff = { entrance: 0, items: 0, other: 0 };
    let totalPayments = 0, totalRefunds = 0, totalWriteoffs = 0;

    active.forEach((t) => {
      let cb = t.categoryBreakdown || {};
      if (t.type === "payment") {
        totalPayments += t.amount;
        CATEGORIES.forEach((c) => { paid[c] += cb[c] || 0; });
      } else if (t.type === "refund") {
        totalRefunds += t.amount;
        CATEGORIES.forEach((c) => { refunded[c] += cb[c] || 0; });
      } else if (t.type === "writeoff") {
        totalWriteoffs += t.amount;
        CATEGORIES.forEach((c) => { writtenOff[c] += cb[c] || 0; });
      }
    });

    let remaining = {};
    CATEGORIES.forEach((c) => {
      remaining[c] = Math.max(0, charges[c] - writtenOff[c] - paid[c]);
    });
    let totalCharges = charges.entrance + charges.items + charges.other;
    let effectiveCharges = totalCharges - totalWriteoffs;
    let remainingBalance = Math.max(0, remaining.entrance + remaining.items + remaining.other);
    let netPaid = totalPayments - totalRefunds;

    let paymentStatus = totalCharges <= 0 ? "n/a" : remainingBalance <= 0 && netPaid > 0 ? "paid" : netPaid > 0 ? "partial" : "unpaid";

    return {
      charges, totalCharges, effectiveCharges, paid, refunded, writtenOff,
      totalPayments, totalRefunds, totalWriteoffs, remaining, remainingBalance,
      netPaid, paymentStatus,
    };
  }

  async function getTransactionsFor(reservationId) {
    return DB.getByIndex("overnightTransactions", "by_reservation", reservationId);
  }

  // ---- List tab -------------------------------------------------------
  async function render(el) {
    let reservations = await DB.getAll("overnightReservations");
    reservations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let allTx = await DB.getAll("overnightTransactions");
    let customers = await DB.getAll("customers");

    let rows = await Promise.all(reservations.map(async (r) => {
      let totals = computeTotals(r, allTx);
      let customer = customers.find((c) => c.id === r.customerId);
      let statusClass = r.status === "active" ? "status-busy" : r.status === "completed" ? "status-free" : "status-cancelled";
      return `
        <div class="list-row">
          <span class="row-value">#${r.id}</span>
          <span class="row-value">${customer ? Utils.renderCustomerId(r.customerId, customers) : "—"}</span>
          <span class="row-value">${typeLabel(r.type)}</span>
          <span class="status-badge ${statusClass}">${statusLabel(r.status)}</span>
          <span class="row-value">ورودی: ${Utils.formatCurrency(totals.charges.entrance)}</span>
          <span class="row-value">آیتم‌ها: ${Utils.formatCurrency(totals.charges.items + totals.charges.other)}</span>
          <span class="row-value">پرداخت‌شده: ${Utils.formatCurrency(totals.netPaid)}</span>
          <span class="row-value ${totals.remainingBalance > 0 ? 'amount negative' : 'amount positive'}">مانده: ${Utils.formatCurrency(totals.remainingBalance)}</span>
          <button class="btn btn-sm btn-outline" onclick="Overnight.viewReservation(${r.id})">جزئیات</button>
        </div>
      `;
    }));

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>رزروهای شب</h2>
          <button class="btn btn-primary" onclick="Overnight.showAddReservation()">+ افزودن رزرو</button>
        </div>
        ${rows.join("") || '<div class="text-muted">رزروی برای شب جاری ثبت نشده</div>'}
      </div>
    `;
    el.innerHTML = html;
  }

  // ---- Create ------------------------------------------------------------
  async function showAddReservation() {
    let customers = await DB.getAll("customers");
    let pricing = await DB.getSetting("pricing", {});
    let fee = pricing.overnightEntranceFee != null ? pricing.overnightEntranceFee : 100000;

    App.openModal(`
      <h2>رزرو شب جدید</h2>
      <div class="form-group"><label>مشتری</label>${Utils.renderPayerSelect(customers, customers[0] && customers[0].id, "newResCustomer")}</div>
      <div class="form-group"><label>نوع خدمت</label>
        <select id="newResType">
          <option value="pc">پی‌سی</option>
          <option value="console">کنسول</option>
          <option value="billiard">بیلیارد</option>
        </select>
      </div>
      <div class="form-group"><label>ورودی رزرو شب (تومان)</label><input type="number" id="newResFee" value="${fee}" min="0"></div>
      <div class="form-group"><label>یادداشت</label><input type="text" id="newResNotes" placeholder="اختیاری"></div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Overnight.createReservation()">ثبت رزرو</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function createReservation() {
    await Utils.guardDoubleClick(async () => {
      let customerId = parseInt(document.getElementById("newResCustomer").value) || 0;
      let type = document.getElementById("newResType").value;
      let baseFee = parseInt(document.getElementById("newResFee").value) || 0;
      let notes = document.getElementById("newResNotes").value.trim();
      if (!customerId) { App.toast("مشتری را انتخاب کنید"); return { success: false }; }

      // Lock the customer's club discount at creation time too — same rule as
      // the entrance fee itself: a later change to the customer's rank/discount
      // never touches an already-created reservation.
      let customer = await DB.get("customers", customerId);
      let discountPercent = customer ? await Utils.getEffectiveDiscount(customer) : 0;
      let entranceFee = applyDiscountPct(baseFee, discountPercent);

      let reservation = {
        customerId, type, status: "active",
        createdAt: new Date().toISOString(),
        checkIn: new Date().toISOString(),
        checkOut: null,
        entranceFee, // locked permanently at creation — never re-read from settings again
        discountPercent, // locked at creation, applied to entrance fee above and to items as they're added
        items: [],
        notes,
        cancelledAt: null, cancelReason: null,
      };
      let id = await DB.add("overnightReservations", reservation);
      await DB.logActivity("رزرو شب جدید", "رزرو #" + id + " | " + typeLabel(type) + " | ورودی: " + Utils.formatCurrency(entranceFee) + (discountPercent > 0 ? " | تخفیف: " + discountPercent + "%" : ""));
      App.toast("رزرو ثبت شد");
      App.closeModalForce();
      refresh();
      return { success: true };
    });
  }

  function refresh() {
    let el = document.getElementById("tab-overnight");
    if (el) render(el);
  }

  // ---- Detail / transaction history --------------------------------------
  async function viewReservation(id) {
    let r = await DB.get("overnightReservations", id);
    if (!r) return;
    let customer = await DB.get("customers", r.customerId);
    let allTx = await getTransactionsFor(id);
    allTx.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let totals = computeTotals(r, allTx);

    let itemsHtml = (r.items || []).map((it, i) => `
      <div class="list-row">
        <span class="row-value">${Utils.escapeHtml(it.name)}</span>
        <span class="row-value">x${it.qty}</span>
        <span class="row-value amount">${Utils.formatCurrency(it.price * it.qty)}</span>
        <span class="text-muted text-sm">${Jalali.timeString(new Date(it.addedAt))}</span>
      </div>
    `).join("");

    let txHtml = allTx.map((t) => `
      <div class="list-row">
        <span class="row-value">${t.type === "payment" ? "پرداخت" : t.type === "refund" ? "استرداد" : "بخشش مانده (لغو)"}</span>
        <span class="row-value amount ${t.type === "refund" ? "negative" : ""}">${Utils.formatCurrency(t.amount)}</span>
        <span class="row-value">${t.payType ? payTypeLabel(t.payType) : "—"}</span>
        <span class="text-muted text-sm">${t.settlerName || ""}</span>
        <span class="text-muted text-sm">${Jalali.formatDateTime(new Date(t.timestamp))}</span>
      </div>
    `).join("");

    let canPay = r.status !== "cancelled" && totals.remainingBalance > 0;
    let canAddItem = r.status === "active";
    let canCancel = r.status !== "cancelled";
    let canComplete = r.status === "active";
    let canRefund = r.status === "cancelled" && (totals.totalPayments - totals.totalRefunds) > 0;

    App.openModal(`
      <h2>رزرو #${r.id} — ${customer ? Utils.renderCustomerId(r.customerId, customers) : "—"}</h2>
      <div class="list-row"><span class="row-label">نوع</span><span class="row-value">${typeLabel(r.type)}</span></div>
      <div class="list-row"><span class="row-label">وضعیت</span><span class="row-value">${statusLabel(r.status)}</span></div>
      <div class="list-row"><span class="row-label">ورود</span><span class="row-value">${Jalali.formatDateTime(new Date(r.checkIn))}</span></div>
      ${r.checkOut ? `<div class="list-row"><span class="row-label">خروج</span><span class="row-value">${Jalali.formatDateTime(new Date(r.checkOut))}</span></div>` : ""}
      ${r.notes ? `<div class="list-row"><span class="row-label">یادداشت</span><span class="row-value">${Utils.escapeHtml(r.notes)}</span></div>` : ""}
      ${r.status === "cancelled" && r.cancelReason ? `<div class="list-row"><span class="row-label">دلیل لغو</span><span class="row-value">${Utils.escapeHtml(r.cancelReason)}</span></div>` : ""}
      <hr class="section-divider">
      ${r.discountPercent > 0 ? `<div class="list-row"><span class="row-label">تخفیف باشگاه مشتریان</span><span class="row-value amount positive">${r.discountPercent}%</span></div>` : ""}
      <div class="list-row"><span class="row-label">ورودی رزرو شب</span><span class="row-value amount">${Utils.formatCurrency(totals.charges.entrance)}</span></div>
      <div class="list-row"><span class="row-label">جمع آیتم‌ها/غذا</span><span class="row-value amount">${Utils.formatCurrency(totals.charges.items)}</span></div>
      ${totals.charges.other > 0 ? `<div class="list-row"><span class="row-label">سایر هزینه‌ها</span><span class="row-value amount">${Utils.formatCurrency(totals.charges.other)}</span></div>` : ""}
      <div class="list-row font-bold"><span class="row-label">جمع کل</span><span class="row-value amount">${Utils.formatCurrency(totals.totalCharges)}</span></div>
      <div class="list-row"><span class="row-label">پرداخت‌شده</span><span class="row-value amount positive">${Utils.formatCurrency(totals.totalPayments)}</span></div>
      ${totals.totalRefunds > 0 ? `<div class="list-row"><span class="row-label">استردادشده</span><span class="row-value amount negative">${Utils.formatCurrency(totals.totalRefunds)}</span></div>` : ""}
      ${totals.totalWriteoffs > 0 ? `<div class="list-row"><span class="row-label">بخشیده‌شده (لغو)</span><span class="row-value amount">${Utils.formatCurrency(totals.totalWriteoffs)}</span></div>` : ""}
      <div class="list-row font-bold text-lg"><span class="row-label">مانده</span><span class="row-value ${totals.remainingBalance > 0 ? 'amount negative' : 'amount positive'}">${Utils.formatCurrency(totals.remainingBalance)}</span></div>

      <hr class="section-divider">
      <h3>آیتم‌ها</h3>
      ${itemsHtml || '<div class="text-muted text-sm">بدون آیتم</div>'}
      ${canAddItem ? `<button class="btn btn-sm btn-outline mt-2" onclick="Overnight.showAddItem(${r.id})">+ افزودن آیتم</button>` : ""}

      <hr class="section-divider">
      <h3>تراکنش‌ها</h3>
      ${txHtml || '<div class="text-muted text-sm">تراکنشی ثبت نشده</div>'}

      <hr class="section-divider">
      <div class="modal-actions" style="flex-wrap:wrap">
        ${canPay ? `<button class="btn btn-success" onclick="Overnight.showRecordPayment(${r.id})">ثبت پرداخت</button>` : ""}
        ${canComplete ? `<button class="btn btn-primary" onclick="Overnight.completeReservation(${r.id})">تکمیل رزرو</button>` : ""}
        ${canRefund ? `<button class="btn btn-outline" onclick="Overnight.showRefund(${r.id})">استرداد وجه</button>` : ""}
        ${canCancel ? `<button class="btn btn-danger" onclick="Overnight.showCancel(${r.id})">لغو رزرو</button>` : ""}
        <button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button>
      </div>
    `);
  }

  // ---- Items ---------------------------------------------------------
  async function showAddItem(id) {
    let cafeItems = await DB.getAll("cafeItems");
    App.openModal(`
      <h2>افزودن آیتم به رزرو #${id}</h2>
      <div class="pick-list">
        ${cafeItems.map((item) => `<div class="pick-item" onclick="Overnight.addItemClick(${id}, ${item.id}, 'cafe')"><span class="pick-name">${Utils.escapeHtml(item.name)}</span><span class="pick-meta">${Utils.formatCurrency(item.price)}</span></div>`).join("")}
      </div>
      <hr class="section-divider">
      <h3>هزینه دلخواه</h3>
      <div class="form-inline">
        <div class="form-group"><label>عنوان</label><input type="text" id="customItemName"></div>
        <div class="form-group"><label>مبلغ</label><input type="number" id="customItemPrice" min="0"></div>
        <button class="btn btn-sm btn-outline" onclick="Overnight.addCustomItem(${id})">افزودن</button>
      </div>
      <div class="modal-actions"><button class="btn btn-outline" onclick="Overnight.viewReservation(${id})">بازگشت</button></div>
    `);
  }

  async function addItemClick(id, itemId, source) {
    await withItemLock(id, async () => {
      let reservation = await DB.get("overnightReservations", id);
      if (!reservation || reservation.status !== "active") return { success: false };
      let item = await DB.get("cafeItems", itemId);
      if (!item) return { success: false };
      if (!item.unlimited && item.stock <= 0) { App.toast("موجودی تمام شده"); return { success: false }; }

      let price = applyDiscountPct(item.price, reservation.discountPercent || 0);
      reservation.items.push({ itemId, name: item.name, price, qty: 1, type: "cafe", addedAt: new Date().toISOString() });
      let updatedItem = item.unlimited ? null : { ...item, stock: item.stock - 1 };

      await DB.runAtomic([
        { store: "overnightReservations", type: "put", data: reservation },
        ...(updatedItem ? [{ store: "cafeItems", type: "put", data: updatedItem }] : []),
      ]);
      await DB.logActivity("افزودن آیتم به رزرو شب", "رزرو #" + id + " | " + item.name + " | " + Utils.formatCurrency(price));
      App.toast("آیتم اضافه شد");
      showAddItem(id);
      return { success: true };
    });
  }

  async function addCustomItem(id) {
    let name = document.getElementById("customItemName").value.trim();
    let inputPrice = parseInt(document.getElementById("customItemPrice").value) || 0;
    if (!name || inputPrice <= 0) { App.toast("عنوان و مبلغ معتبر وارد کنید"); return; }

    await withItemLock(id, async () => {
      let reservation = await DB.get("overnightReservations", id);
      if (!reservation || reservation.status !== "active") return { success: false };

      let price = applyDiscountPct(inputPrice, reservation.discountPercent || 0);
      reservation.items.push({ itemId: null, name, price, qty: 1, type: "other", addedAt: new Date().toISOString() });
      await DB.put("overnightReservations", reservation);
      await DB.logActivity("افزودن هزینه دلخواه به رزرو شب", "رزرو #" + id + " | " + name + " | " + Utils.formatCurrency(price));
      App.toast("هزینه اضافه شد");
      showAddItem(id);
      return { success: true };
    });
  }

  // ---- Payment ---------------------------------------------------------
  async function showRecordPayment(id) {
    let reservation = await DB.get("overnightReservations", id);
    if (!reservation) return;
    let allTx = await getTransactionsFor(id);
    let totals = computeTotals(reservation, allTx);
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>ثبت پرداخت — رزرو #${id}</h2>
      <div class="list-row"><span class="row-label">مانده قابل پرداخت</span><span class="row-value amount">${Utils.formatCurrency(totals.remainingBalance)}</span></div>
      <div class="form-group"><label>مبلغ پرداخت</label><input type="number" id="payAmount" value="${totals.remainingBalance}" min="1" max="${totals.remainingBalance}"></div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="payMethod" onchange="Overnight.toggleCombinedPayment('payMethod', 'payCombinedFields', ${totals.remainingBalance})"><option value="cash">نقدی</option><option value="card">کارتی</option><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select>
      </div>
      <div id="payCombinedFields" style="display:none; margin-top:8px;">
        <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="payCombinedCardAmount" min="0" oninput="Overnight.updateCombinedCheck('payCombinedCardAmount', 'payCombinedCashAmount', 'payCombinedCheck', ${totals.remainingBalance})"></div>
        <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="payCombinedCashAmount" min="0" oninput="Overnight.updateCombinedCheck('payCombinedCardAmount', 'payCombinedCashAmount', 'payCombinedCheck', ${totals.remainingBalance})"></div>
        <div id="payCombinedCheck" class="text-sm" style="margin-top:4px;"></div>
      </div>
      <div class="form-group"><label>ثبت‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Overnight.recordPayment(${id})">ثبت پرداخت</button>
        <button class="btn btn-outline" onclick="Overnight.viewReservation(${id})">انصراف</button>
      </div>
    `);
  }

  async function recordPayment(id) {
    await Utils.guardDoubleClick(async () => {
      let amountInput = parseInt(document.getElementById("payAmount").value) || 0;
      let payType = document.getElementById("payMethod").value;
      if (payType === "combined") {
        let cardAmt = parseInt(document.getElementById("payCombinedCardAmount").value) || 0;
        let cashAmt = parseInt(document.getElementById("payCombinedCashAmount").value) || 0;
        if (cardAmt + cashAmt !== amountInput) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        payType = { card: cardAmt, cash: cashAmt };
      }
      let settlerName = Utils.getSettlerName();

      let reservation = await DB.get("overnightReservations", id);
      if (!reservation || reservation.status === "cancelled") { App.toast("این رزرو لغو شده است"); return { success: false }; }

      let allTx = await getTransactionsFor(id);
      let totals = computeTotals(reservation, allTx);
      // Hard cap on the server-side function too (not just the input's max=),
      // so a stale/edited value can never push the balance negative.
      let amount = Math.min(amountInput, totals.remainingBalance);
      if (amount <= 0) { App.toast("مبلغ نامعتبر است"); return { success: false }; }

      // Waterfall allocation entrance -> items -> other, based on what's
      // actually still outstanding per category right now.
      let categoryBreakdown = { entrance: 0, items: 0, other: 0 };
      let left = amount;
      CATEGORIES.forEach((c) => {
        if (left <= 0) return;
        let take = Math.min(left, totals.remaining[c]);
        categoryBreakdown[c] = take;
        left -= take;
      });

      let customer = await DB.get("customers", reservation.customerId);
      let payResult = Utils.computePaymentUpdate(customer, amount, payType);
      if (!payResult.success) { App.toast("پرداخت ناموفق بود"); return { success: false }; }

      let tx = {
        reservationId: id, customerId: reservation.customerId, type: "payment",
        amount, payType: payResult.payType, payBreakdown: payResult.payBreakdown,
        categoryBreakdown, settlerName, timestamp: new Date().toISOString(), status: "active",
      };

      await DB.runAtomic([
        { store: "customers", type: "put", data: payResult.customer },
        { store: "overnightTransactions", type: "add", data: tx },
      ]);
      await DB.logActivity("پرداخت رزرو شب", "رزرو #" + id + " | " + Utils.formatCurrency(amount) + " | " + payResult.payType + " | " + settlerName);
      App.toast("پرداخت ثبت شد");
      viewReservation(id);
      return { success: true };
    });
  }

  // ---- Completion --------------------------------------------------------
  async function completeReservation(id) {
    let reservation = await DB.get("overnightReservations", id);
    if (!reservation || reservation.status !== "active") return;
    reservation.status = "completed";
    reservation.checkOut = new Date().toISOString();
    await DB.put("overnightReservations", reservation);
    await DB.logActivity("تکمیل رزرو شب", "رزرو #" + id);
    App.toast("رزرو تکمیل شد");
    viewReservation(id);
  }

  // ---- Cancellation (idempotent, never deletes) --------------------------
  async function showCancel(id) {
    App.openModal(`
      <h2>لغو رزرو #${id}</h2>
      <p class="text-muted text-sm">مانده پرداخت‌نشده بخشیده می‌شود. مبالغ پرداخت‌شده از طریق «استرداد وجه» به‌صورت جداگانه قابل بازگشت است. این عملیات رزرو و تاریخچه تراکنش‌ها را حذف نمی‌کند.</p>
      <div class="form-group"><label>دلیل لغو (اختیاری)</label><input type="text" id="cancelReason"></div>
      <div class="modal-actions">
        <button class="btn btn-danger" onclick="Overnight.cancelReservation(${id})">تایید لغو</button>
        <button class="btn btn-outline" onclick="Overnight.viewReservation(${id})">انصراف</button>
      </div>
    `);
  }

  async function cancelReservation(id) {
    await Utils.guardDoubleClick(async () => {
      let reservation = await DB.get("overnightReservations", id);
      if (!reservation) return { success: false };
      // Idempotent: cancelling an already-cancelled reservation is a no-op,
      // so a duplicate click/request can never create a second writeoff.
      if (reservation.status === "cancelled") { App.toast("این رزرو قبلاً لغو شده است"); App.closeModalForce(); return { success: true }; }

      let reasonEl = document.getElementById("cancelReason");
      let reason = reasonEl ? reasonEl.value.trim() : "";

      let allTx = await getTransactionsFor(id);
      let totals = computeTotals(reservation, allTx);

      let cafeItemChanges = {};
      if (reservation.status === "active") {
        // Reservation never reached completion — restock any cafe items,
        // mirroring how an active console/billiard session is unwound.
        let cafeItems = await DB.getAll("cafeItems");
        for (let it of reservation.items || []) {
          if (it.type === "cafe" && it.itemId != null) {
            let ci = cafeItems.find((c) => c.id === it.itemId);
            if (ci && !ci.unlimited) {
              if (!cafeItemChanges[ci.id]) cafeItemChanges[ci.id] = { ...ci };
              cafeItemChanges[ci.id].stock += it.qty || 1;
            }
          }
        }
      }

      let ops = [];
      if (totals.remainingBalance > 0) {
        let categoryBreakdown = { entrance: totals.remaining.entrance, items: totals.remaining.items, other: totals.remaining.other };
        ops.push({
          store: "overnightTransactions", type: "add", data: {
            reservationId: id, customerId: reservation.customerId, type: "writeoff",
            amount: totals.remainingBalance, categoryBreakdown, settlerName: "",
            timestamp: new Date().toISOString(), status: "active",
          },
        });
      }

      reservation.status = "cancelled";
      reservation.cancelledAt = new Date().toISOString();
      reservation.cancelReason = reason;
      ops.push({ store: "overnightReservations", type: "put", data: reservation });
      ops.push(...Object.values(cafeItemChanges).map((ci) => ({ store: "cafeItems", type: "put", data: ci })));

      await DB.runAtomic(ops);
      await DB.logActivity("لغو رزرو شب", "رزرو #" + id + (reason ? " | دلیل: " + reason : "") + (totals.remainingBalance > 0 ? " | مانده بخشیده‌شده: " + Utils.formatCurrency(totals.remainingBalance) : ""));
      App.toast("رزرو لغو شد");
      viewReservation(id);
      return { success: true };
    });
  }

  // ---- Refund (only for cancelled reservations with money already paid) --
  async function showRefund(id) {
    let reservation = await DB.get("overnightReservations", id);
    let allTx = await getTransactionsFor(id);
    let totals = computeTotals(reservation, allTx);
    let refundable = Math.max(0, totals.totalPayments - totals.totalRefunds);
    if (refundable <= 0) { App.toast("مبلغی برای استرداد باقی نمانده"); return; }

    App.openModal(`
      <h2>استرداد وجه — رزرو #${id}</h2>
      <div class="list-row"><span class="row-label">قابل استرداد</span><span class="row-value amount">${Utils.formatCurrency(refundable)}</span></div>
      <div class="form-group"><label>مبلغ استرداد</label><input type="number" id="refundAmount" value="${refundable}" min="1" max="${refundable}"></div>
      <div class="form-group"><label>روش استرداد</label>
        <select id="refundMethod" onchange="Overnight.toggleCombinedPayment('refundMethod', 'refundCombinedFields', ${refundable})"><option value="cash">نقدی</option><option value="card">کارتی</option><option value="wallet">اعتبار کیف‌پول</option><option value="debt">بخشش بدهی</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select>
      </div>
      <div id="refundCombinedFields" style="display:none; margin-top:8px;">
        <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="refundCombinedCardAmount" min="0" oninput="Overnight.updateCombinedCheck('refundCombinedCardAmount', 'refundCombinedCashAmount', 'refundCombinedCheck', ${refundable})"></div>
        <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="refundCombinedCashAmount" min="0" oninput="Overnight.updateCombinedCheck('refundCombinedCardAmount', 'refundCombinedCashAmount', 'refundCombinedCheck', ${refundable})"></div>
        <div id="refundCombinedCheck" class="text-sm" style="margin-top:4px;"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-danger" onclick="Overnight.refundReservation(${id})">تایید استرداد</button>
        <button class="btn btn-outline" onclick="Overnight.viewReservation(${id})">انصراف</button>
      </div>
    `);
  }

  async function refundReservation(id) {
    await Utils.guardDoubleClick(async () => {
      let reservation = await DB.get("overnightReservations", id);
      if (!reservation || reservation.status !== "cancelled") { App.toast("فقط رزرو لغوشده قابل استرداد است"); return { success: false }; }

      let allTx = await getTransactionsFor(id);
      let totals = computeTotals(reservation, allTx);
      let refundable = Math.max(0, totals.totalPayments - totals.totalRefunds);

      let amountInput = parseInt(document.getElementById("refundAmount").value) || 0;
      let method = document.getElementById("refundMethod").value;
      if (method === "combined") {
        let cardAmt = parseInt(document.getElementById("refundCombinedCardAmount").value) || 0;
        let cashAmt = parseInt(document.getElementById("refundCombinedCashAmount").value) || 0;
        if (cardAmt + cashAmt !== amountInput) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        method = { card: cardAmt, cash: cashAmt };
      }
      // Capped server-side, so a duplicate submit or a stale max= can never
      // refund more than was actually collected.
      let amount = Math.min(amountInput, refundable);
      if (amount <= 0) { App.toast("مبلغ نامعتبر است"); return { success: false }; }

      let customer = await DB.get("customers", reservation.customerId);
      if (!customer) { App.toast("مشتری یافت نشد"); return { success: false }; }
      let updated = { ...customer };
      if (method === "wallet" || (typeof method === "object" && method.wallet > 0)) {
        updated.wallet = (updated.wallet || 0) + (typeof method === "object" ? (method.wallet || 0) : amount);
        updated.totalPaid = Math.max(0, (updated.totalPaid || 0) - (typeof method === "object" ? (method.wallet || 0) : amount));
      } else if (method === "debt" || (typeof method === "object" && method.debt > 0)) {
        updated.debt = Math.max(0, (updated.debt || 0) - (typeof method === "object" ? (method.debt || 0) : amount));
      } else if (typeof method === "object") {
        // Combined payment - reverse each leg
        updated.totalPaid = Math.max(0, (updated.totalPaid || 0) - amount);
      } else {
        updated.totalPaid = Math.max(0, (updated.totalPaid || 0) - amount); // cash/card actually leaving the till
      }

      // Attribute the refund across categories proportionally to what was
      // actually paid in each category, for reporting purposes only. Rounded
      // to whole tomans (fractional amounts from a raw proportional split
      // would otherwise show up in reports), with any rounding remainder put
      // on the last category so the parts still sum exactly to `amount`.
      let paidTotal = totals.paid.entrance + totals.paid.items + totals.paid.other;
      let categoryBreakdown = { entrance: 0, items: 0, other: 0 };
      if (paidTotal > 0) {
        let assigned = 0;
        CATEGORIES.forEach((c, i) => {
          if (i === CATEGORIES.length - 1) {
            categoryBreakdown[c] = amount - assigned;
          } else {
            let share = Math.round(amount * (totals.paid[c] / paidTotal));
            categoryBreakdown[c] = share;
            assigned += share;
          }
        });
      } else {
        categoryBreakdown.other = amount;
      }

      let payType = method === "wallet" ? "wallet" : method === "debt" ? "debt" : method;
      let payBreakdown = { wallet: 0, debt: 0, cash: 0, card: 0 };
      payBreakdown[payType] = amount;

      let tx = {
        reservationId: id, customerId: reservation.customerId, type: "refund",
        amount, payType, payBreakdown, categoryBreakdown,
        settlerName: "", timestamp: new Date().toISOString(), status: "active",
      };

      await DB.runAtomic([
        { store: "customers", type: "put", data: updated },
        { store: "overnightTransactions", type: "add", data: tx },
      ]);
      await DB.logActivity("استرداد وجه رزرو شب", "رزرو #" + id + " | " + Utils.formatCurrency(amount) + " | " + payTypeLabel(payType));
      App.toast("استرداد ثبت شد");
      viewReservation(id);
      return { success: true };
    });
  }

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
    let card = parseInt(document.getElementById(fieldsId).querySelector('[id$="CombinedCardAmount"]').value) || 0;
    let cash = parseInt(document.getElementById(fieldsId).querySelector('[id$="CombinedCashAmount"]').value) || 0;
    let sum = card + cash;
    let checkEl = document.getElementById(fieldsId).querySelector('[id$="CombinedCheck"]');
    if (checkEl) {
      checkEl.textContent = sum === total ? "✓ مطابقت دارد" : `⚠ جمع: ${Utils.formatCurrency(sum)} (کل: ${Utils.formatCurrency(total)})`;
      checkEl.style.color = sum === total ? "green" : "red";
    }
  }

  return {
    render, showAddReservation, createReservation, viewReservation,
    showAddItem, addItemClick, addCustomItem,
    showRecordPayment, recordPayment,
    completeReservation,
    showCancel, cancelReservation,
    showRefund, refundReservation,
    computeTotals, getTransactionsFor, CATEGORIES,
    toggleCombinedPayment, updateCombinedCheck
  };
})();
