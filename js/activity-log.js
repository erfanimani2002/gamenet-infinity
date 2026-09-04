const ActivityLog = (function () {
  async function render(el) {
    let logs = await DB.getAll("activityLog");
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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
            <div class="list-row log-item" data-search="${(log.event + ' ' + log.details).toLowerCase()}">
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
