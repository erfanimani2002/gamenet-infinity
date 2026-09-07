const App = (function () {
  let activeTab = "consoles";
  let timerIntervals = {};

  const SIDEBAR = [
    {
      id: "devices", label: "دستگاه‌ها", items: [
        { tab: "consoles", icon: "consoles", label: "کنسول‌ها" },
        { tab: "billiard", icon: "billiard", label: "بیلیارد" },
        { tab: "pcs", icon: "pcs", label: "پی‌سی" },
      ],
    },
    {
      id: "sales", label: "فروش و خدمات", items: [
        { tab: "cafe", icon: "cafe", label: "کافی‌شاپ" },
        { tab: "games", icon: "games", label: "بازی‌ها" },
        { tab: "overnight", icon: "overnight", label: "رزروهای شب" },
      ],
    },
    {
      id: "customers", label: "مشتریان", items: [
        { tab: "customers", icon: "customers", label: "شناسه‌ها" },
        { tab: "customerClub", icon: "customerClub", label: "باشگاه مشتریان" },
        { tab: "debts", icon: "debts", label: "بدهی‌ها" },
      ],
    },
    {
      id: "reports", label: "گزارش‌ها", items: [
        { tab: "reports", icon: "reports", label: "گزارش روزانه" },
        { tab: "instantReport", icon: "instantReport", label: "گزارش لحظه‌ای" },
        { tab: "monthlyReport", icon: "monthlyReport", label: "گزارش ماهانه" },
        { tab: "activityLog", icon: "activityLog", label: "لاگ فعالیت" },
      ],
    },
    {
      id: "management", label: "مدیریت", items: [
        { tab: "purchases", icon: "purchases", label: "خریدها" },
        { tab: "inventory", icon: "inventory", label: "موجودی" },
        { tab: "staff", icon: "staff", label: "پرسنل" },
        { tab: "backup", icon: "backup", label: "پشتیبان‌گیری" },
        { tab: "adminPanel", icon: "adminPanel", label: "پنل مدیریت" },
      ],
    },
    {
      id: "tournaments", label: "مسابقات", items: [
        { tab: "tournaments", icon: "tournaments", label: "مسابقات" },
      ],
    },
  ];

  function init() {
    initTheme();

    DB.open().then(async () => {
      await DB.initDefaults();
      let user = Auth.getSession();
      if (user) {
        showApp(user);
      }
    });

    document.getElementById("loginPass").addEventListener("keypress", (e) => {
      if (e.key === "Enter") doLogin();
    });
    document.getElementById("loginUser").addEventListener("keypress", (e) => {
      if (e.key === "Enter") document.getElementById("loginPass").focus();
    });

    document.addEventListener("click", (e) => {
      let dropdown = document.getElementById("userDropdown");
      let menu = document.getElementById("userMenu");
      if (dropdown && menu && !dropdown.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = "none";
      }
    });
  }

  function renderSidebar() {
    let html = SIDEBAR.filter((g) => {
      if (g.id === "reports" || g.id === "management") {
        return g.items.some((item) => Auth.canAccess(item.tab));
      }
      return true;
    }).map((group) => {
      let visibleItems = group.items.filter((item) => Auth.canAccess(item.tab));
      if (visibleItems.length === 0) return "";
      return `
        <div class="sidebar-group">
          <div class="sidebar-header">${group.label}</div>
          ${visibleItems.map((item) => `
            <div class="sidebar-item" data-tab="${item.tab}" onclick="App.switchTab('${item.tab}')" title="${item.label}">
              <span class="item-icon">${(typeof Icons !== "undefined" ? Icons.get(item.icon, 18) : item.icon)}</span>
              <span>${item.label}</span>
            </div>
          `).join("")}
        </div>
      `;
    }).join("");
    document.getElementById("sidebarMenu").innerHTML = html;
  }

  async function doLogin() {
    let u = document.getElementById("loginUser").value.trim();
    let p = document.getElementById("loginPass").value.trim();
    let err = document.getElementById("loginError");
    err.textContent = "";
    if (!u || !p) {
      err.textContent = "نام کاربری و رمز عبور را وارد کنید";
      return;
    }
    try {
      let user = await Auth.login(u, p);
      showApp(user);
    } catch (e) {
      err.textContent = e.message;
    }
  }

  function showApp(user) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "flex";
    document.getElementById("userDisplay").textContent = user.username;
    document.getElementById("roleDisplay").textContent =
      user.role === "manager" ? "مدیر" : "ادمین";

    renderSidebar();
    switchTab("consoles");

    Reports.autoClosePastDays();

    startDayCloseReminder();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      Reports.autoClosePastDays();
    }
  });

  let dayCloseReminderState = { day: null, fired: {} };
  const DAY_CLOSE_MARKERS = [
    { h: 23, m: 25, msg: "۱۰ دقیقه تا پایان روز کاری (۲۳:۳۵) — لطفاً برای بستن صندوق آماده شوید." },
    { h: 23, m: 30, msg: "۵ دقیقه تا پایان روز کاری (۲۳:۳۵) — صندوق را شمارش کنید." },
    { h: 23, m: 35, msg: "روز کاری بسته شد. تطبیق صندوق را در گزارش ماهانه ثبت کنید." },
  ];

  function startDayCloseReminder() {
    function tick() {
      let now = new Date();
      let dayKey = now.toDateString();
      if (dayCloseReminderState.day !== dayKey) {
        dayCloseReminderState = { day: dayKey, fired: {} };
      }
      let hh = now.getHours();
      let mm = now.getMinutes();
      DAY_CLOSE_MARKERS.forEach((marker) => {
        let key = marker.h + ":" + marker.m;
        if (hh === marker.h && mm === marker.m && !dayCloseReminderState.fired[key]) {
          dayCloseReminderState.fired[key] = true;
          toast(marker.msg);
        }
      });
      Reports.autoClosePastDays(now);
    }
    tick();
    timerIntervals["dayCloseTick"] = setInterval(tick, 30000);

    Backup.writeAutoBackup();
    timerIntervals["autoBackup"] = setInterval(() => Backup.writeAutoBackup(), 10 * 60 * 1000);
  }

  async function doLogout() {
    stopAllTimers();
    await Auth.logout();
    document.getElementById("appScreen").style.display = "none";
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("loginUser").value = "";
    document.getElementById("loginPass").value = "";
    document.getElementById("loginError").textContent = "";
    document.getElementById("userMenu").style.display = "none";
  }

  function toggleUserMenu() {
    let menu = document.getElementById("userMenu");
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".sidebar-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-content").forEach((c) => {
      c.classList.remove("active");
    });
    let el = document.getElementById("tab-" + tab);
    if (el) el.classList.add("active");

    document.getElementById("userMenu").style.display = "none";
    refreshTab(tab);
  }

  function refreshTab(tab) {
    switch (tab) {
      case "consoles":
        Consoles.render(document.getElementById("tab-consoles"));
        break;
      case "billiard":
        Billiard.render(document.getElementById("tab-billiard"));
        break;
      case "pcs":
        PCs.render(document.getElementById("tab-pcs"));
        break;
      case "cafe":
        Cafe.render(document.getElementById("tab-cafe"));
        break;
      case "customers":
        Customers.render(document.getElementById("tab-customers"));
        break;
      case "customerClub":
        CustomerClub.render(document.getElementById("tab-customerClub"));
        break;
      case "debts":
        Debts.render(document.getElementById("tab-debts"));
        break;
      case "reports":
        Reports.renderDaily(document.getElementById("tab-reports"));
        break;
      case "instantReport":
        Reports.renderInstant(document.getElementById("tab-instantReport"));
        break;
      case "purchases":
        Purchases.render(document.getElementById("tab-purchases"));
        break;
      case "inventory":
        Inventory.render(document.getElementById("tab-inventory"));
        break;
      case "staff":
        Staff.render(document.getElementById("tab-staff"));
        break;
      case "activityLog":
        ActivityLog.render(document.getElementById("tab-activityLog"));
        break;
      case "backup":
        Backup.render(document.getElementById("tab-backup"));
        break;
      case "monthlyReport":
        if (Auth.isManager()) Reports.renderMonthly(document.getElementById("tab-monthlyReport"));
        break;
      case "adminPanel":
        if (Auth.isManager()) AdminPanel.render(document.getElementById("tab-adminPanel"));
        break;
      case "games":
        Games.render(document.getElementById("tab-games"));
        break;
      case "tournaments":
        Tournaments.render(document.getElementById("tab-tournaments"));
        break;
      case "overnight":
        Overnight.render(document.getElementById("tab-overnight"));
        break;
    }
  }

  function openModal(html, className) {
    let modal = document.getElementById("modalContent");
    modal.className = "modal" + (className ? " " + className : "");
    modal.innerHTML = html;
    document.getElementById("modalOverlay").classList.add("active");
  }

  function closeModal(e) {
    if (e && e.target !== document.getElementById("modalOverlay")) return;
    document.getElementById("modalOverlay").classList.remove("active");
    document.getElementById("modalContent").className = "modal";
  }

  function closeModalForce() {
    document.getElementById("modalOverlay").classList.remove("active");
    document.getElementById("modalContent").className = "modal";
  }

  function toast(msg) {
    let t = document.getElementById("toast");
    t.textContent = msg;
    t.style.display = "block";
    setTimeout(() => {
      t.style.display = "none";
    }, 2500);
  }

  // Persistent warnings: unlike toast() (auto-hides after 2.5s), these stay on
  // screen until the underlying problem clears itself (caller calls
  // clearPersistentWarning) or the user manually dismisses them with "×".
  // `key` identifies the warning so calling showPersistentWarning again with
  // the same key updates the existing banner in place instead of stacking a
  // duplicate — used e.g. by the auto-backup failure warning, which re-fires
  // on every failed retry.
  function showPersistentWarning(key, html) {
    let container = document.getElementById("persistentWarnings");
    if (!container) return;
    let existing = container.querySelector(`[data-warning-key="${key}"]`);
    let body = existing ? existing.querySelector(".persistent-warning-body") : null;
    if (body) {
      body.innerHTML = html;
      return;
    }
    let el = document.createElement("div");
    el.className = "persistent-warning";
    el.dataset.warningKey = key;
    el.innerHTML = `
      <div class="persistent-warning-body">${html}</div>
      <button class="persistent-warning-close" onclick="App.clearPersistentWarning('${key}')" title="بستن">×</button>
    `;
    container.appendChild(el);
  }

  function clearPersistentWarning(key) {
    let container = document.getElementById("persistentWarnings");
    if (!container) return;
    let existing = container.querySelector(`[data-warning-key="${key}"]`);
    if (existing) existing.remove();
  }

  function startTimer(id, callback) {
    stopTimer(id);
    timerIntervals[id] = setInterval(callback, 1000);
  }

  function stopTimer(id) {
    if (timerIntervals[id]) {
      clearInterval(timerIntervals[id]);
      delete timerIntervals[id];
    }
  }

  function stopAllTimers() {
    for (let id in timerIntervals) {
      clearInterval(timerIntervals[id]);
    }
    timerIntervals = {};
  }

  function getActiveTab() {
    return activeTab;
  }

  function initTheme() {
    let saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);
  }

  function toggleTheme() {
    let current = document.documentElement.getAttribute("data-theme");
    let next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    let icon = document.getElementById("themeIcon");
    let label = document.getElementById("themeLabel");
    if (icon) icon.innerHTML = (typeof Icons !== "undefined" ? Icons.get(theme === "dark" ? "moon" : "sun", 16) : (theme === "dark" ? "🌙" : "☀️"));
    if (label) label.textContent = theme === "dark" ? "حالت روشن" : "حالت تاریک";
  }

  return {
    init,
    doLogin,
    doLogout,
    switchTab,
    refreshTab,
    openModal,
    closeModal,
    closeModalForce,
    toast,
    showPersistentWarning,
    clearPersistentWarning,
    startTimer,
    stopTimer,
    stopAllTimers,
    getActiveTab,
    toggleUserMenu,
    toggleTheme,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
