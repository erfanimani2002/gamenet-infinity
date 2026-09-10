const Utils = (function () {
  function getReportRange(now) {
    let d = now instanceof Date ? now : new Date();
    let yesterday = new Date(d);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 35, 0, 0);
    let today = new Date(d);
    today.setHours(23, 35, 0, 0);
    if (d >= today) {
      yesterday = new Date(today);
      today.setDate(today.getDate() + 1);
    }
    return { start: yesterday, end: today };
  }

  function getCurrentReportRange(now) {
    let d = now instanceof Date ? now : new Date();
    let today = new Date(d);
    today.setHours(23, 35, 0, 0);
    let start;
    if (d >= today) {
      start = today;
    } else {
      start = new Date(d);
      start.setDate(start.getDate() - 1);
      start.setHours(23, 35, 0, 0);
    }
    return { start, end: d };
  }

  // The business day that is "currently open" for reporting purposes runs
  // [23:35, next 23:35) — see getReportRange. Its Jalali calendar label is the
  // date of the range's *end* boundary (the day whose 23:35 closes it), NOT
  // the date `now` happens to fall on. Example: at 23:40 on day N, `now`'s
  // calendar date is still N, but the open business day already ends at
  // 23:35 on day N+1 — so its key must be N+1, not N. Anything that persists
  // a "day key" (closeDay, exports) must derive it this way instead of calling
  // Jalali.getTodayJalali()/formatDate(new Date()) directly, or it will save
  // under the wrong calendar date for the ~24-minute window after 23:35.
  function getBusinessDayKey(range) {
    range = range || getReportRange();
    let j = Jalali.gregorianToJalali(range.end.getFullYear(), range.end.getMonth() + 1, range.end.getDate());
    return j.year + "/" + String(j.month).padStart(2, "0") + "/" + String(j.day).padStart(2, "0");
  }

  function roundPrice(price, unit) {
    if (!unit || unit <= 0) return price;
    return Math.ceil(price / unit) * unit;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("fa-IR") + " تومان";
  }

  function formatCurrencyShort(amount) {
    return Number(amount).toLocaleString("fa-IR");
  }

  function calculateTimeBlocksPrice(blocks, rate) {
    let total = 0;
    blocks.forEach((b) => {
      if (b.endTime && b.startTime) {
        let minutes = Math.max(0, (new Date(b.endTime) - new Date(b.startTime)) / 60000);
        let hours = minutes / 60;
        total += hours * rate;
      }
    });
    return total;
  }

  function calculateSessionDuration(blocks) {
    let totalMs = 0;
    blocks.forEach((b) => {
      if (b.endTime && b.startTime) {
        let diff = new Date(b.endTime) - new Date(b.startTime);
        if (diff > 0) totalMs += diff;
      } else if (b.startTime && !b.endTime) {
        let diff = Date.now() - new Date(b.startTime).getTime();
        if (diff > 0) totalMs += diff;
      }
    });
    return totalMs;
  }

  function formatDuration(ms) {
    let totalMinutes = Math.floor(ms / 60000);
    let hours = Math.floor(totalMinutes / 60);
    let minutes = totalMinutes % 60;
    return hours + " ساعت و " + minutes + " دقیقه";
  }

  function formatTimerDisplay(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0")
    );
  }

  function isInRange(date, start, end) {
    let d = new Date(date);
    // End is exclusive: consecutive business-day ranges from getReportRange share
    // a boundary instant (day N's end === day N+1's start), so an inclusive end
    // would double-count a transaction landing exactly on that millisecond.
    return d >= new Date(start) && d < new Date(end);
  }

  function escapeHtml(str) {
    let div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function renderSelectLabel(list, value) {
    if (!list || !value) return value;
    let item = list.find((l) => l.value === value);
    return item ? item.label : value;
  }

  // Computes the customer mutation for a payment WITHOUT writing it to the DB,
  // so callers can persist it atomically alongside other store writes via
  // DB.runAtomic. Returns { success, customer, payType, payBreakdown }.
  //
  // ONE WALLET RULE: a "wallet" payment that exceeds the available balance is
  // SPLIT — the available wallet is applied as wallet, the remainder as debt —
  // instead of being rejected (or, worse, silently spilled into debt while the
  // record keeps a fake "wallet" payType). `payBreakdown` records every leg
  // ({ wallet, debt, cash, card }) so reversePayment can undo each leg exactly.
  function computePaymentUpdate(customer, amount, payType) {
    if (!customer) return { success: false, reason: "no_customer" };
    let breakdown = { wallet: 0, debt: 0, cash: 0, card: 0 };
    let effective = payType;
    if (typeof payType === "object") {
      let obj = payType;
      let sum = (obj.wallet || 0) + (obj.debt || 0) + (obj.cash || 0) + (obj.card || 0);
      if (sum !== amount) return { success: false, reason: "breakdown_sum_mismatch" };
      breakdown.wallet = obj.wallet || 0;
      breakdown.debt = obj.debt || 0;
      breakdown.cash = obj.cash || 0;
      breakdown.card = obj.card || 0;
      customer.totalPaid = (customer.totalPaid || 0) + amount;
      effective = "combined";
    } else if (payType === "cash") {
      breakdown.cash = amount;
      customer.totalPaid = (customer.totalPaid || 0) + amount;
    } else if (payType === "card") {
      breakdown.card = amount;
      customer.totalPaid = (customer.totalPaid || 0) + amount;
    } else if (payType === "debt") {
      breakdown.debt = amount;
      customer.debt = (customer.debt || 0) + amount;
    } else if (payType === "wallet") {
      let wallet = customer.wallet || 0;
      if (wallet >= amount) {
        breakdown.wallet = amount;
        customer.wallet = wallet - amount;
        customer.totalPaid = (customer.totalPaid || 0) + amount;
      } else {
        breakdown.wallet = wallet;
        breakdown.debt = amount - wallet;
        customer.wallet = 0;
        customer.totalPaid = (customer.totalPaid || 0) + wallet;
        customer.debt = (customer.debt || 0) + (amount - wallet);
        effective = "split";
      }
    } else {
      // Unknown method: preserve old behaviour (treat as paid / cash leg).
      breakdown.cash = amount;
      customer.totalPaid = (customer.totalPaid || 0) + amount;
    }
    return { success: true, customer, payType: effective, payBreakdown: breakdown };
  }

  async function applyPayment(customerId, amount, payType) {
    let customer = await DB.get("customers", customerId);
    let result = computePaymentUpdate(customer, amount, payType);
    if (!result.success) return result;
    await DB.put("customers", result.customer);
    return { success: true, payType: result.payType, payBreakdown: result.payBreakdown };
  }

  // Prevents a double-click (or a second click before the first finishes) from
  // firing the same settle/payment action twice. Disables the clicked button
  // for the duration of `fn`, re-enabling it only if `fn` throws or returns a
  // falsy/`{success:false}` result — a successful action normally closes the
  // modal or re-renders, so there's no button left to re-enable.
  // The button is detected via document.activeElement (a clicked button gains
  // focus in every browser), NOT window.event, which is undefined in Firefox.
  async function guardDoubleClick(fn) {
    let btn = document.activeElement;
    if (btn && btn.tagName !== "BUTTON") btn = null;
    if (btn) {
      if (btn.disabled) return { success: false, alreadyLocked: true }; // already processing
      btn.disabled = true;
    }
    try {
      let result = await fn();
      if (btn && (!result || result.success === false)) btn.disabled = false;
      return result;
    } catch (err) {
      if (btn) btn.disabled = false;
      throw err;
    }
  }

  async function getSettlerOptions() {
    let users = await DB.getAll("users");
    let staff = await DB.getAll("staff");
    let options = [];
    users.forEach((u) => options.push({ value: "user_" + u.id, label: u.name + " (مدیریت)" }));
    staff.forEach((s) => options.push({ value: "staff_" + s.id, label: s.name + " (پرسنل)" }));
    return options;
  }

  async function renderSettlerSelect(selected) {
    let options = await getSettlerOptions();
    let html = `<select id="settlerSelect">
        ${options.map((o) => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`).join("")}
      </select>`;
    return html;
  }

  function getSettlerName() {
    let el = document.getElementById("settlerSelect");
    if (!el) return "";
    return el.options[el.selectedIndex]?.text || "";
  }

  async function getCustomerDisplayId(id) {
    let c = await DB.get("customers", id);
    return c ? "#" + (c.displayId || c.id) : "#" + id;
  }

  function renderCustomerId(customerId, customers) {
    let c = customers.find((cu) => cu.id === customerId);
    if (!c) return "#" + customerId;
    let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
    let displayNum = c.displayId || c.id;
    if (fullName) return fullName + " (#" + displayNum + ")";
    return "#" + displayNum;
  }

  // Given a destination device type and a controller/cue count carried over
  // from the device a session is being transferred *from*, resolves the rate
  // + a valid count for the destination. The incoming count may have no
  // meaning on the destination type (e.g. a console session's controllerCount
  // of 1 carried onto a billiard table, where valid cue counts are 2/4) — in
  // that case we fall back to a sensible default count for the destination
  // type instead of silently defaulting the *price* while keeping a
  // nonsensical count on the block.
  function resolveTransferRate(pricing, deviceType, controllerCount) {
    let rates = deviceType === "billiard" ? (pricing.billiardRates || {}) : (pricing.consoleRates || {});
    let defaultCount = deviceType === "billiard" ? 2 : 1;
    let fallbackRate = deviceType === "billiard" ? 8000 : 5000;
    // Ensure count is valid: if rates[controllerCount] doesn't exist, use defaultCount
    let count = (rates[controllerCount] != null && rates[controllerCount] !== undefined) ? controllerCount : defaultCount;
    // Ensure rate is always valid
    let rate = rates[count] != null ? rates[count] : fallbackRate;
    return { rate, controllerCount: count };
  }

  // Renders a payer picker that lists ALL customers (not just those already
  // attached to the session/order being settled), with a search input to
  // filter by ID — following the same search-then-pick pattern used elsewhere
  // (e.g. Consoles.filterCustomers) but built on a plain <select> so existing
  // `document.getElementById(selectId).value` reads keep working unchanged.
  // `defaultId` (usually the session's first customer) is preselected for
  // convenience but any customer can still be chosen.
  function renderPayerSelect(customers, defaultId, selectId) {
    let selected = defaultId != null && customers.some((c) => c.id === defaultId)
      ? defaultId
      : (customers[0] && customers[0].id);
    let options = customers.map((c) => {
      let idLabel = String(c.displayId || c.id);
      let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
      let label = fullName ? fullName + " (#" + idLabel + ")" : "#" + idLabel;
      return `<option value="${c.id}" ${c.id === selected ? 'selected' : ''} data-search="${idLabel}">${label}</option>`;
    }).join("");
    return `
      <input type="text" placeholder="جستجوی شناسه..." style="width:100%;margin-bottom:4px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;box-sizing:border-box;" oninput="Utils.filterPayerSelect(this)">
      <select id="${selectId}">${options}</select>
    `;
  }

  function filterPayerSelect(input) {
    let q = input.value.toLowerCase();
    let select = input.nextElementSibling;
    if (!select) return;
    Array.from(select.options).forEach((opt) => {
      opt.hidden = !(opt.dataset.search || "").toLowerCase().includes(q);
    });
  }

  const jalaliWeekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
  function getJalaliWeekday(date) {
    let d = date instanceof Date ? date : new Date(date);
    let jsDay = d.getDay();
    return jalaliWeekdays[(jsDay + 1) % 7];
  }

  async function getEffectiveDiscount(customer) {
    if (!customer) return 0;
    let manualDiscount = customer.discount || 0;
    let rankDiscount = await CustomerClub.getRankDiscountForCustomer(customer);
    return Math.max(manualDiscount, rankDiscount);
  }

  // Splits a leg-object ({cash,card,wallet,debt}, e.g. the payBreakdown produced
  // by computePaymentUpdate) across categories (e.g. entrance/items/other) using
  // a categoryBreakdown ({entrance,items,other}) whose values sum to the same
  // total amount the legs represent. Used so a single overnight payment that
  // covers several charge categories at once can still be reported per category
  // without re-deriving the split later from incomplete information.
  function splitLegsByCategory(overallLegs, categoryBreakdown, categories) {
    let result = {};
    let cb = categoryBreakdown || {};
    let sum = categories.reduce((s, cat) => s + (cb[cat] || 0), 0);
    categories.forEach((cat) => {
      let frac = sum > 0 ? (cb[cat] || 0) / sum : (cat === categories[categories.length - 1] ? 1 : 0);
      result[cat] = {
        cash: (overallLegs.cash || 0) * frac,
        card: (overallLegs.card || 0) * frac,
        wallet: (overallLegs.wallet || 0) * frac,
        debt: (overallLegs.debt || 0) * frac,
      };
    });
    return result;
  }

  return {
    getReportRange, getCurrentReportRange, getBusinessDayKey, roundPrice, generateId,
    splitLegsByCategory,
    formatCurrency, formatCurrencyShort, calculateTimeBlocksPrice,
    calculateSessionDuration, formatDuration, formatTimerDisplay,
    isInRange, escapeHtml, renderSelectLabel,
    applyPayment, computePaymentUpdate, guardDoubleClick, getSettlerOptions, renderSettlerSelect, getSettlerName, getCustomerDisplayId, renderCustomerId,
    getJalaliWeekday, resolveTransferRate, renderPayerSelect, filterPayerSelect,
    getEffectiveDiscount,
  };
})();
