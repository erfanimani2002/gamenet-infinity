const Games = (function () {
  let currentSubTab = "games";

  async function render(el) {
    let games = await DB.getAll("games");
    let devices = await DB.getAll("devices");

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>بازی‌ها</h2>
          <button class="btn btn-primary" onclick="Games.showAddGame()">+ افزودن بازی</button>
        </div>
        <div class="tabs" style="margin-bottom:12px">
          <button class="tab-btn ${currentSubTab === 'games' ? 'active' : ''}" onclick="Games.switchSubTab('games')">بازی‌ها</button>
          <button class="tab-btn ${currentSubTab === 'devices' ? 'active' : ''}" onclick="Games.switchSubTab('devices')">دستگاه‌ها</button>
        </div>
        <div id="gamesContent"></div>
      </div>
    `;
    el.innerHTML = html;
    renderSubTab(document.getElementById("gamesContent"), games, devices);
  }

  function renderSubTab(container, games, devices) {
    if (currentSubTab === "games") {
      renderGamesView(container, games, devices);
    } else {
      renderDevicesView(container, games, devices);
    }
  }

  function renderGamesView(container, games, devices) {
    let consoleGames = games.filter((g) => g.type === "console");
    let pcGames = games.filter((g) => g.type === "pc");

    function deviceNames(gameId) {
      return devices
        .filter((d) => (d.games || []).includes(gameId))
        .map((d) => d.name)
        .join(", ");
    }

    container.innerHTML = `
      <div class="report-section">
        <h3>کنسول‌ها</h3>
        ${consoleGames.length === 0 ? '<div class="text-muted text-sm">بدون بازی</div>' : ''}
        <div class="item-grid">
          ${consoleGames.map((g) => `
            <div class="item-card" onclick="Games.showConnectDevices(${g.id})" style="cursor:pointer">
              <div class="item-name">${Utils.escapeHtml(g.name)}</div>
              <div class="item-price text-sm text-muted">${deviceNames(g.id) || 'بدون دستگاه'}</div>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); Games.deleteGame(${g.id})">حذف</button>
            </div>
          `).join("")}
        </div>
      </div>
      <hr class="section-divider">
      <div class="report-section">
        <h3>پی‌سی‌ها</h3>
        ${pcGames.length === 0 ? '<div class="text-muted text-sm">بدون بازی</div>' : ''}
        <div class="item-grid">
          ${pcGames.map((g) => `
            <div class="item-card" onclick="Games.showConnectDevices(${g.id})" style="cursor:pointer">
              <div class="item-name">${Utils.escapeHtml(g.name)}</div>
              <div class="item-price text-sm text-muted">${deviceNames(g.id) || 'بدون دستگاه'}</div>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); Games.deleteGame(${g.id})">حذف</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderDevicesView(container, games, devices) {
    let consoleDevices = devices.filter((d) => d.type === "console");
    let pcDevices = devices.filter((d) => d.type === "pc");

    function gameNames(deviceGames) {
      if (!deviceGames || deviceGames.length === 0) return 'بدون بازی';
      return deviceGames
        .map((gid) => {
          let g = games.find((gm) => gm.id === gid);
          return g ? g.name : null;
        })
        .filter((n) => n)
        .join(", ");
    }

    container.innerHTML = `
      <div class="report-section">
        <h3>کنسول‌ها</h3>
        ${consoleDevices.map((d) => `
          <div class="list-row">
            <span class="row-label">${Utils.escapeHtml(d.name)}</span>
            <span class="row-value text-sm text-muted">${gameNames(d.games)}</span>
          </div>
        `).join("")}
      </div>
      <hr class="section-divider">
      <div class="report-section">
        <h3>پی‌سی‌ها</h3>
        ${pcDevices.map((d) => `
          <div class="list-row">
            <span class="row-label">${Utils.escapeHtml(d.name)}</span>
            <span class="row-value text-sm text-muted">${gameNames(d.games)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function switchSubTab(tab) {
    currentSubTab = tab;
    refresh();
  }

  async function showAddGame() {
    App.openModal(`
      <h2>افزودن بازی جدید</h2>
      <div class="form-group">
        <label>نام بازی</label>
        <input type="text" id="newGameName" placeholder="نام بازی">
      </div>
      <div class="form-group">
        <label>نوع</label>
        <select id="newGameType">
          <option value="console">کنسول</option>
          <option value="pc">پی‌سی</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Games.saveNewGame()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveNewGame() {
    let name = document.getElementById("newGameName").value.trim();
    let type = document.getElementById("newGameType").value;
    if (!name) { App.toast("نام بازی را وارد کنید"); return; }
    await DB.add("games", { name, type });
    await DB.logActivity("افزودن بازی", name + " (" + type + ")");
    App.closeModalForce();
    App.toast("بازی اضافه شد");
    refresh();
  }

  async function deleteGame(id) {
    if (!confirm("آیا از حذف این بازی مطمئن هستید؟")) return;
    let game = await DB.get("games", id);
    let devices = await DB.getAll("devices");
    for (let d of devices) {
      if ((d.games || []).includes(id)) {
        d.games = d.games.filter((gid) => gid !== id);
        await DB.put("devices", d);
      }
    }
    await DB.remove("games", id);
    await DB.logActivity("حذف بازی", game.name);
    App.toast("بازی حذف شد");
    refresh();
  }

  async function showConnectDevices(gameId) {
    let game = await DB.get("games", gameId);
    if (!game) return;
    let devices = await DB.getAll("devices");
    let matchingDevices = devices.filter((d) => d.type === game.type);

    App.openModal(`
      <h2>اتصال دستگاه‌ها به بازی</h2>
      <p class="text-muted text-sm">${Utils.escapeHtml(game.name)}</p>
      <div style="margin:12px 0">
        ${matchingDevices.map((d) => {
          let connected = (d.games || []).includes(gameId);
          return `<div class="list-row" style="align-items:center">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" data-device-id="${d.id}" ${connected ? 'checked' : ''} style="width:18px;height:18px">
              <span>${Utils.escapeHtml(d.name)}</span>
            </label>
          </div>`;
        }).join("")}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Games.saveConnectDevices(${gameId})">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveConnectDevices(gameId) {
    let devices = await DB.getAll("devices");
    let checkboxes = document.querySelectorAll("#modalContent input[data-device-id]");
    for (let cb of checkboxes) {
      let deviceId = parseInt(cb.dataset.deviceId) || 0;
      let device = devices.find((d) => d.id === deviceId);
      if (!device) continue;
      if (!device.games) device.games = [];
      let hasGame = device.games.includes(gameId);
      if (cb.checked && !hasGame) {
        device.games.push(gameId);
        await DB.put("devices", device);
      } else if (!cb.checked && hasGame) {
        device.games = device.games.filter((gid) => gid !== gameId);
        await DB.put("devices", device);
      }
    }
    App.closeModalForce();
    App.toast("ذخیره شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-games");
    if (el && el.classList.contains("active")) render(el);
  }

  return { render, switchSubTab, showAddGame, saveNewGame, deleteGame, showConnectDevices, saveConnectDevices, refresh };
})();
