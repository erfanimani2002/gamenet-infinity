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
    let yesterday = new Date(d);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 35, 0, 0);
    return { start: yesterday, end: d };
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
        let minutes = (new Date(b.endTime) - new Date(b.startTime)) / 60000;
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
        totalMs += new Date(b.endTime) - new Date(b.startTime);
      } else if (b.startTime && !b.endTime) {
        totalMs += Date.now() - new Date(b.startTime).getTime();
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
    return d >= new Date(start) && d <= new Date(end);
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

  async function applyPayment(customerId, amount, payType) {
    let customer = await DB.get("customers", customerId);
    if (!customer) return;

    if (payType === "wallet") {
      if (customer.wallet >= amount) {
        customer.wallet -= amount;
        customer.totalPaid = (customer.totalPaid || 0) + amount;
      } else {
        let remaining = amount - customer.wallet;
        customer.totalPaid = (customer.totalPaid || 0) + customer.wallet;
        customer.wallet = 0;
        customer.debt = (customer.debt || 0) + remaining;
      }
    } else if (payType === "debt") {
      customer.debt = (customer.debt || 0) + amount;
    } else {
      customer.totalPaid = (customer.totalPaid || 0) + amount;
    }
    await DB.put("customers", customer);
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

  const jalaliWeekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
  function getJalaliWeekday(date) {
    let d = date instanceof Date ? date : new Date(date);
    let jsDay = d.getDay();
    return jalaliWeekdays[(jsDay + 1) % 7];
  }

  return {
    getReportRange, getCurrentReportRange, roundPrice, generateId,
    formatCurrency, formatCurrencyShort, calculateTimeBlocksPrice,
    calculateSessionDuration, formatDuration, formatTimerDisplay,
    isInRange, escapeHtml, renderSelectLabel,
    applyPayment, getSettlerOptions, renderSettlerSelect, getSettlerName, getCustomerDisplayId,
    getJalaliWeekday,
  };
})();
