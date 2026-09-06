const CustomerClub = (function () {
  let currentSubTab = "all";
  let currentSort = "totalPaid";
  let currentRankFilter = "";
  let currentInterestFilter = "";
  let currentSearch = "";

  const interestLabels = { billiard: "بیلیارد", console: "کنسول", cs: "سی‌اس" };
  const interestIcons = { billiard: "🎱", console: "🎮", cs: "🔫" };

  function computeRank(totalPaid, categories) {
    let best = null;
    for (let cat of categories) {
      for (let t = 0; t < (cat.tiers || 0); t++) {
        let threshold = (cat.baseThreshold || 0) + t * (cat.thresholdStep || 0);
        if (totalPaid >= threshold) {
          best = { category: cat.name, tier: t + 1, color: cat.color, threshold };
        }
      }
    }
    return best;
  }

  function getRankDiscount(rank, categories, tierDiscounts) {
    if (!rank) return 0;
    let key = rank.category + "_" + rank.tier;
    return tierDiscounts[key] || 0;
  }

  function computeStats(customers, sessions) {
    let totalCustomers = customers.length;
    let totalSessions = sessions.filter((s) => s.status === "settled").length;
    let totalRevenue = customers.reduce((s, c) => s + (c.totalPaid || 0), 0);
    let avgSpending = totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;
    return { totalCustomers, totalSessions, totalRevenue, avgSpending };
  }

  function getCategoryDistribution(customers, categories) {
    let dist = {};
    categories.forEach((c) => { dist[c.name] = 0; });
    dist["ندارد"] = 0;
    customers.forEach((c) => {
      let rank = computeRank(c.totalPaid || 0, categories);
      if (rank) { dist[rank.category] = (dist[rank.category] || 0) + 1; }
      else { dist["ندارد"] = (dist["ندارد"] || 0) + 1; }
    });
    return dist;
  }

  function getSessionStats(customerId, sessions) {
    let settled = sessions.filter((s) => s.status === "settled" && s.ids && s.ids.includes(customerId));
    let count = settled.length;
    let lastVisit = null;
    for (let s of settled) {
      if (s.settledAt && (!lastVisit || s.settledAt > lastVisit)) lastVisit = s.settledAt;
    }
    return { count, lastVisit };
  }

  function renderCard(c, sessions, categories, tierDiscounts) {
    let rank = computeRank(c.totalPaid || 0, categories);
    let rankDiscount = getRankDiscount(rank, categories, tierDiscounts);
    let effectiveDiscount = Math.max(c.discount || 0, rankDiscount);
    let ss = getSessionStats(c.id, sessions);
    let interests = (c.tournamentInterests || []);

    let rankBadge = rank
      ? `<span class="rank-badge" style="background:${rank.color};color:#fff">${rank.category} ${rank.tier}</span>`
      : `<span class="rank-badge rank-none">بدون رتبه</span>`;

    let interestChips = interests.length > 0
      ? interests.map((i) => `<span class="interest-chip">${interestIcons[i] || ""} ${interestLabels[i] || i}</span>`).join("")
      : `<span class="interest-chip interest-empty">—</span>`;

    let lastVisitStr = ss.lastVisit ? Jalali.formatDate(new Date(ss.lastVisit)) : "—";
    let memberSince = c.createdAt ? Jalali.formatDate(new Date(c.createdAt)) : "—";

    return `
      <div class="club-card" onclick="CustomerClub.openProfile(${c.id})">
        <div class="club-card-header">
          <div>
            <span class="club-card-name">${Utils.escapeHtml(c.firstName || "")} ${Utils.escapeHtml(c.lastName || "")}</span>
            <span class="club-card-id">#${c.displayId || c.id}</span>
          </div>
          ${rankBadge}
        </div>
        <div class="club-card-interests">${interestChips}</div>
        <div class="club-card-stats">
          <div class="club-stat"><span class="club-stat-value">${ss.count}</span><span class="club-stat-label">جلسه</span></div>
          <div class="club-stat"><span class="club-stat-value">${Utils.formatCurrencyShort(c.totalPaid || 0)}</span><span class="club-stat-label">مجموع خرج</span></div>
          <div class="club-stat"><span class="club-stat-value">${lastVisitStr}</span><span class="club-stat-label">آخرین مراجعه</span></div>
        </div>
        <div class="club-card-info">
          <span>کیف‌پول: ${Utils.formatCurrencyShort(c.wallet || 0)}</span>
          <span>تخفیف: ${effectiveDiscount}%</span>
          <span>عضویت: ${memberSince}</span>
        </div>
      </div>
    `;
  }

  async function render(el) {
    let customers = await DB.getAll("customers");
    let sessions = await DB.getAll("sessions");
    let clubSettings = await DB.getSetting("customerClub", { categories: [], tierDiscounts: {} });
    let categories = clubSettings.categories || [];
    let tierDiscounts = clubSettings.tierDiscounts || {};

    let stats = computeStats(customers, sessions);
    let dist = getCategoryDistribution(customers, categories);

    let allInterests = ["billiard", "console", "cs"];

    let filtered = customers.filter((c) => {
      if (currentSearch) {
        let q = currentSearch.toLowerCase();
        let name = (c.firstName + " " + c.lastName).toLowerCase();
        let did = String(c.displayId || c.id);
        if (!name.includes(q) && !did.includes(q)) return false;
      }
      if (currentRankFilter) {
        let rank = computeRank(c.totalPaid || 0, categories);
        let rankName = rank ? rank.category : "";
        if (rankName !== currentRankFilter) return false;
      }
      if (currentInterestFilter) {
        if (!(c.tournamentInterests || []).includes(currentInterestFilter)) return false;
      }
      return true;
    });

    if (currentSort === "totalPaid") filtered.sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0));
    else if (currentSort === "sessions") {
      filtered.sort((a, b) => {
        let sa = getSessionStats(a.id, sessions).count;
        let sb = getSessionStats(b.id, sessions).count;
        return sb - sa;
      });
    } else if (currentSort === "lastVisit") {
      filtered.sort((a, b) => {
        let la = getSessionStats(a.id, sessions).lastVisit || "";
        let lb = getSessionStats(b.id, sessions).lastVisit || "";
        return lb.localeCompare(la);
      });
    } else if (currentSort === "newest") {
      filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    } else if (currentSort === "name") {
      filtered.sort((a, b) => (a.firstName || "").localeCompare(b.firstName || ""));
    }

    let rankOptions = categories.map((c) => `<option value="${c.name}" ${currentRankFilter === c.name ? "selected" : ""}>${c.name}</option>`).join("");
    let interestOptions = allInterests.map((i) => `<option value="${i}" ${currentInterestFilter === i ? "selected" : ""}>${interestLabels[i]}</option>`).join("");

    let cardsHtml = filtered.map((c) => renderCard(c, sessions, categories, tierDiscounts)).join("");

    let distHtml = Object.entries(dist).map(([name, count]) =>
      `<div class="dist-bar"><span class="dist-label">${name}</span><div class="dist-track"><div class="dist-fill" style="width:${stats.totalCustomers > 0 ? Math.round(count / stats.totalCustomers * 100) : 0}%"></div></div><span class="dist-count">${count}</span></div>`
    ).join("");

    let topBySpending = [...customers].sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0)).slice(0, 10);
    let topBySessions = [...customers].sort((a, b) => getSessionStats(b.id, sessions).count - getSessionStats(a.id, sessions).count).slice(0, 10);

    let leaderboardSpendingHtml = topBySpending.map((c, i) => {
      let rank = computeRank(c.totalPaid || 0, categories);
      let badge = rank ? `<span class="rank-badge rank-sm" style="background:${rank.color}">${rank.category} ${rank.tier}</span>` : "";
      return `<div class="list-row"><span class="row-label">#${i + 1} ${Utils.escapeHtml(c.firstName)} ${Utils.escapeHtml(c.lastName)} ${badge}</span><span class="row-value">${Utils.formatCurrency(c.totalPaid || 0)}</span></div>`;
    }).join("");

    let leaderboardSessionsHtml = topBySessions.map((c, i) => {
      let ss = getSessionStats(c.id, sessions);
      let rank = computeRank(c.totalPaid || 0, categories);
      let badge = rank ? `<span class="rank-badge rank-sm" style="background:${rank.color}">${rank.category} ${rank.tier}</span>` : "";
      return `<div class="list-row"><span class="row-label">#${i + 1} ${Utils.escapeHtml(c.firstName)} ${Utils.escapeHtml(c.lastName)} ${badge}</span><span class="row-value">${ss.count} جلسه</span></div>`;
    }).join("");

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>باشگاه مشتریان</h2>
        </div>
        <div class="tabs" style="margin-bottom:12px">
          <button class="tab-btn ${currentSubTab === "all" ? "active" : ""}" onclick="CustomerClub.switchSubTab('all')">همه مشتریان</button>
          <button class="tab-btn ${currentSubTab === "leaderboard" ? "active" : ""}" onclick="CustomerClub.switchSubTab('leaderboard')">برترین‌ها</button>
        </div>
        <div id="clubContent"></div>
      </div>
    `;

    let contentEl = document.getElementById("clubContent");
    if (currentSubTab === "all") {
      contentEl.innerHTML = `
        <div class="club-summary">
          <div class="summary-item"><div class="summary-label">کل مشتریان</div><div class="summary-value">${stats.totalCustomers}</div></div>
          <div class="summary-item"><div class="summary-label">کل جلسات</div><div class="summary-value">${stats.totalSessions}</div></div>
          <div class="summary-item"><div class="summary-label">میانگین خرج</div><div class="summary-value">${Utils.formatCurrency(stats.avgSpending)}</div></div>
          <div class="summary-item"><div class="summary-label">مجموع درآمد</div><div class="summary-value">${Utils.formatCurrency(stats.totalRevenue)}</div></div>
        </div>
        <div class="club-dist">${distHtml}</div>
        <div class="club-controls">
          <input type="text" id="clubSearch" placeholder="جستجوی نام یا ایدی..." value="${Utils.escapeHtml(currentSearch)}" oninput="CustomerClub.onSearch(this.value)">
          <select id="clubRankFilter" onchange="CustomerClub.onRankFilter(this.value)">
            <option value="">همه رتبه‌ها</option>
            ${rankOptions}
            <option value="" ${!currentRankFilter ? "disabled" : ""}>— بدون رتبه —</option>
          </select>
          <select id="clubInterestFilter" onchange="CustomerClub.onInterestFilter(this.value)">
            <option value="">همه علایق</option>
            ${interestOptions}
          </select>
          <select id="clubSort" onchange="CustomerClub.onSort(this.value)">
            <option value="totalPaid" ${currentSort === "totalPaid" ? "selected" : ""}>بیشترین خرج</option>
            <option value="sessions" ${currentSort === "sessions" ? "selected" : ""}>بیشترین جلسه</option>
            <option value="lastVisit" ${currentSort === "lastVisit" ? "selected" : ""}>آخرین مراجعه</option>
            <option value="newest" ${currentSort === "newest" ? "selected" : ""}>جدیدترین</option>
            <option value="name" ${currentSort === "name" ? "selected" : ""}>نام</option>
          </select>
        </div>
        <div class="club-grid">
          ${cardsHtml || '<div class="text-muted" style="padding:20px;text-align:center">مشتری‌ای یافت نشد</div>'}
        </div>
      `;
    } else {
      contentEl.innerHTML = `
        <div class="report-section">
          <h3>برترین‌ها بر اساس مجموع خرج</h3>
          ${leaderboardSpendingHtml || '<div class="text-muted">داده‌ای موجود نیست</div>'}
        </div>
        <hr class="section-divider">
        <div class="report-section">
          <h3>برترین‌ها بر اساس تعداد جلسه</h3>
          ${leaderboardSessionsHtml || '<div class="text-muted">داده‌ای موجود نیست</div>'}
        </div>
      `;
    }
  }

  function switchSubTab(tab) {
    currentSubTab = tab;
    refresh();
  }

  function onSearch(val) { currentSearch = val; refresh(); }
  function onRankFilter(val) { currentRankFilter = val; refresh(); }
  function onInterestFilter(val) { currentInterestFilter = val; refresh(); }
  function onSort(val) { currentSort = val; refresh(); }

  async function openProfile(id) {
    await Customers.showProfile(id);
  }

  async function getRankDiscountForCustomer(customer) {
    let clubSettings = await DB.getSetting("customerClub", { categories: [], tierDiscounts: {} });
    let categories = clubSettings.categories || [];
    let tierDiscounts = clubSettings.tierDiscounts || {};
    let rank = computeRank(customer.totalPaid || 0, categories);
    return getRankDiscount(rank, categories, tierDiscounts);
  }

  function refresh() {
    let el = document.getElementById("tab-customerClub");
    if (el && el.classList.contains("active")) render(el);
  }

  return {
    render, refresh, switchSubTab, onSearch, onRankFilter, onInterestFilter, onSort,
    openProfile, getRankDiscountForCustomer, computeRank, getRankDiscount,
  };
})();
