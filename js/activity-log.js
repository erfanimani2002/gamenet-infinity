const ActivityLog = (function () {
  // Login/logout events reveal who is on shift; hide them from admins (they are
  // of interest only to a manager). Keep everything visible to managers.
  const PRIVATE_EVENTS = ["لاگین", "لاگ‌اوت"];

  function visibleLogs(logs) {
    if (Auth.isManager()) return logs;
    return logs.filter((l) => !PRIVATE_EVENTS.includes(l.event));
  }

  async function render(el) {
    let logs = await DB.getAll("activityLog");
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    logs = visibleLogs(logs);

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>لاگ فعالیت</h2>
          <div class="text-muted text-sm">${logs.length} رویداد</div>
        </div>
        <div class="search-box mb-4">
          <input type="text" id="logSearch" placeholder="جستجو..." oninput="ActivityLog.filterLogs()">
        </div>
        <div style="max-height:600px;overflow-y:auto;" id="logList">
          ${logs.length === 0 ? '<div class="empty-state">هنوز رویدادی ثبت نشده</div>' : ''}
          ${logs.map((log) => `
            <div class="list-row log-item" data-search="${Utils.escapeHtml((log.event + ' ' + (log.details || '')).toLowerCase())}">
              <span class="row-label" style="min-width:120px">${Jalali.formatDateTime(log.timestamp)}</span>
              <span class="row-value" style="font-weight:500">${Utils.escapeHtml(log.event)}</span>
              <span class="row-value text-muted text-sm">${Utils.escapeHtml(log.details || '')}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  function filterLogs() {
    let q = document.getElementById("logSearch").value.toLowerCase();
    document.querySelectorAll(".log-item").forEach((row) => {
      row.style.display = row.dataset.search.includes(q) ? "flex" : "none";
    });
  }

  return { render, filterLogs };
})();
