const App = (function () {
  let activeTab = "consoles";
  let timerIntervals = {};

  const SIDEBAR = [
    {
      id: "devices", label: "دستگاه‌ها", items: [
        { tab: "consoles", icon: "🎮", label: "کنسول‌ها" },
        { tab: "billiard", icon: "🎱", label: "بیلیارد" },
        { tab: "pcs", icon: "💻", label: "پی‌سی" },
      ],
    },
    {
      id: "sales", label: "فروش و خدمات", items: [
        { tab: "cafe", icon: "☕", label: "کافی‌شاپ" },
        { tab: "games", icon: "🎯", label: "بازی‌ها" },
      ],
    },
    {
      id: "customers", label: "مشتریان", items: [
        { tab: "customers", icon: "👤", label: "شناسه‌ها" },
        { tab: "debts", icon: "💰", label: "بدهی‌ها" },
      ],
    },
    {
      id: "reports", label: "گزارش‌ها", items: [
        { tab: "reports", icon: "📊", label: "گزارش روزانه" },
        { tab: "instantReport", icon: "⚡", label: "گزارش لحظه‌ای" },
        { tab: "monthlyReport", icon: "📅", label: "گزارش ماهانه", managerOnly: true },
        { tab: "activityLog", icon: "📋", label: "لاگ فعالیت" },
      ],
    },
    {
      id: "management", label: "مدیریت", items: [
        { tab: "purchases", icon: "🛒", label: "خریدها" },
        { tab: "inventory", icon: "📦", label: "موجودی" },
        { tab: "staff", icon: "👥", label: "پرسنل" },
        { tab: "backup", icon: "💾", label: "پشتیبان‌گیری" },
        { tab: "adminPanel", icon: "⚙️", label: "پنل مدیریت", managerOnly: true },
      ],
    },
    {
      id: "tournaments", label: "مسابقات", items: [
        { tab: "tournaments", icon: "🏆", label: "مسابقات" },
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
    let isMgr = Auth.isManager();
    let html = SIDEBAR.filter((g) => {
      if (g.id === "reports" || g.id === "management") {
        return g.items.some((item) => !item.managerOnly || isMgr);
      }
      return true;
    }).map((group) => {
      let visibleItems = group.items.filter((item) => !item.managerOnly || isMgr);
      if (visibleItems.length === 0) return "";
      return `
        <div class="sidebar-group">
          <div class="sidebar-header">${group.label}</div>
          ${visibleItems.map((item) => `
            <div class="sidebar-item" data-tab="${item.tab}" onclick="App.switchTab('${item.tab}')">
              <span class="item-icon">${item.icon}</span>
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
    if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
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
    startTimer,
    stopTimer,
    stopAllTimers,
    getActiveTab,
    toggleUserMenu,
    toggleTheme,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
