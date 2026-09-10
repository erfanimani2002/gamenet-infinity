const Tournaments = (function () {
  const GAME_TYPES = {
    football: { label: "فوتبال", icon: "consoles", teamSize: 1 },
    billiard: { label: "بیلیارد", icon: "billiard", teamSize: 1 },
    cs2: { label: "CS2", icon: "games", teamSize: 5 },
  };

  const STATUS = {
    draft: { label: "پیش‌نویس", color: "var(--text-muted)" },
    open: { label: "باز", color: "var(--success)" },
    in_progress: { label: "در حال برگزاری", color: "var(--info)" },
    completed: { label: "تکمیل شده", color: "var(--text-muted)" },
  };

  async function render(el) {
    let tournaments = await DB.getAll("tournaments");
    tournaments.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>مسابقات</h2>
          <button class="btn btn-primary" onclick="Tournaments.showCreateTournament()">+ مسابقه جدید</button>
        </div>
        ${tournaments.length === 0 ? '<div class="empty-state"><div class="empty-icon">' + (typeof Icons !== "undefined" ? Icons.get("tournaments", 40) : "") + '</div>هنوز مسابقه‌ای ثبت نشده</div>' : ''}
        ${tournaments.map((t) => renderTournamentCard(t)).join("")}
      </div>
    `;
    el.innerHTML = html;
  }

  function renderTournamentCard(t) {
    let info = GAME_TYPES[t.gameType] || GAME_TYPES.football;
    let st = STATUS[t.status] || STATUS.draft;
    let participants = (t.participants || []).length;
    let dateStr = t.startDate || "تاریخ مشخص نشده";
    if (t.endDate && t.endDate !== t.startDate) dateStr += " - " + t.endDate;

    let actions = "";
    if (t.status === "draft") {
      actions = `
        <button class="btn btn-sm btn-outline" onclick="Tournaments.editTournament(${t.id})">ویرایش</button>
        <button class="btn btn-sm btn-success" onclick="Tournaments.changeStatus(${t.id}, 'open')">باز کردن ثبت‌نام</button>
        <button class="btn btn-sm btn-danger" onclick="Tournaments.deleteTournament(${t.id})">حذف</button>
      `;
    } else if (t.status === "open") {
      actions = `
        <button class="btn btn-sm btn-outline" onclick="Tournaments.manageTournament(${t.id})">مدیریت شرکت‌کنندگان</button>
        <button class="btn btn-sm btn-primary" onclick="Tournaments.startTournament(${t.id})">شروع مسابقه</button>
        <button class="btn btn-sm btn-outline" onclick="Tournaments.changeStatus(${t.id}, 'draft')">بازگشت به پیش‌نویس</button>
      `;
    } else if (t.status === "in_progress") {
      actions = `
        <button class="btn btn-sm btn-outline" onclick="Tournaments.manageTournament(${t.id})">مشاهده براکت</button>
        <button class="btn btn-sm btn-success" onclick="Tournaments.changeStatus(${t.id}, 'completed')">تکمیل مسابقه</button>
      `;
    } else {
      actions = `
        <button class="btn btn-sm btn-outline" onclick="Tournaments.manageTournament(${t.id})">مشاهده نتایج</button>
        <button class="btn btn-sm btn-danger" onclick="Tournaments.deleteTournament(${t.id})">حذف</button>
      `;
    }

    return `
      <div class="list-row" style="flex-direction:column;align-items:stretch;gap:8px;padding:14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="item-icon">${(typeof Icons !== "undefined" ? Icons.get(info.icon, 20) : "")}</span>
          <span class="font-bold" style="font-size:15px;">${Utils.escapeHtml(t.name)}</span>
          <span class="status-badge" style="background:${st.color}20;color:${st.color};margin-right:auto;">${st.label}</span>
        </div>
        <div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);flex-wrap:wrap;">
          <span>${info.label}${t.billiardFormat ? ' (' + (t.billiardFormat === '2stick' ? 'دوچوب' : 'چهارچوب') + ')' : ''}</span>
          <span>${participants} شرکت‌کننده</span>
          <span>حق ورود: ${Utils.formatCurrency(t.entryFee)}</span>
          <span>${dateStr}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${actions}</div>
      </div>
    `;
  }

  // ─── CREATE TOURNAMENT ───────────────────────────────

  async function showCreateTournament(editData) {
    let isEdit = !!editData;
    let t = editData || { name: "", gameType: "football", bracketType: "elimination", participantCount: 8, teamSize: 1, billiardFormat: "2stick", entryFee: 0, prizes: [{ place: 1, label: "قهرمان", amount: 0 }], startDate: "", endDate: "", pcRateManual: 0 };

    App.openModal(`
      <h2>${isEdit ? 'ویرایش مسابقه' : 'مسابقه جدید'}</h2>
      <div class="form-group"><label>نام مسابقه</label><input type="text" id="tName" value="${Utils.escapeHtml(t.name)}"></div>
      <div class="form-group"><label>نوع بازی</label>
        <select id="tGameType" onchange="Tournaments.onGameTypeChange()">
          <option value="football" ${t.gameType === 'football' ? 'selected' : ''}>فوتبال (کنسول)</option>
          <option value="billiard" ${t.gameType === 'billiard' ? 'selected' : ''}>بیلیارد</option>
          <option value="cs2" ${t.gameType === 'cs2' ? 'selected' : ''}>CS2 (پی‌سی)</option>
        </select>
      </div>
      <div class="form-group"><label>نوع براکت</label>
        <select id="tBracketType">
          <option value="elimination" ${t.bracketType === 'elimination' ? 'selected' : ''}>حذفی</option>
          <option value="league" ${t.bracketType === 'league' ? 'selected' : ''}>لیگی (دوره‌ای)</option>
        </select>
      </div>
      <div id="tExtraFields"></div>
      <div class="form-group"><label>تعداد شرکت‌کنندگان</label><input type="number" id="tParticipantCount" value="${t.participantCount}" min="2"></div>
      <div class="form-group"><label>تاریخ شروع</label><input type="text" id="tStartDate" value="${t.startDate || ''}" placeholder="مثلاً ۱۴۰۴/۰۳/۱۵"></div>
      <div class="form-group"><label>تاریخ پایان (اختیاری)</label><input type="text" id="tEndDate" value="${t.endDate || ''}"></div>
      <div class="form-group"><label>حق ورود (تومان)</label><input type="number" id="tEntryFee" value="${t.entryFee}" min="0"></div>
      <div class="form-group"><label>نرخ ساعتی PC (تومان) — اختیاری</label><input type="number" id="tPcRate" value="${t.pcRateManual || 0}" min="0"></div>
      <hr class="section-divider">
      <h3 style="margin-bottom:10px;">جوایز</h3>
      <div id="tPrizesList"></div>
      <button class="btn btn-sm btn-outline mt-2" onclick="Tournaments.addPrizeRow()">+ افزودن جایزه</button>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Tournaments.saveTournament(${isEdit ? t.id : 'null'})">${isEdit ? 'ذخیره' : 'ایجاد'}</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
    onGameTypeChange();
    renderPrizes(t.prizes || []);
  }

  function onGameTypeChange() {
    let gameType = document.getElementById("tGameType").value;
    let extra = document.getElementById("tExtraFields");
    if (gameType === "billiard") {
      extra.innerHTML = `
        <div class="form-group"><label>فرمت بیلیارد</label>
          <select id="tBilliardFormat">
            <option value="2stick">دوچوب (۱v۱)</option>
            <option value="4stick">چهارچوب (۲v۲)</option>
          </select>
        </div>
      `;
    } else if (gameType === "cs2") {
      extra.innerHTML = `
        <div class="form-group"><label>تعداد بازیکن هر تیم</label><input type="number" id="tTeamSize" value="5" min="1" max="10"></div>
      `;
    } else {
      extra.innerHTML = "";
    }
  }

  function renderPrizes(prizes) {
    let el = document.getElementById("tPrizesList");
    if (!el) return;
    el.innerHTML = prizes.map((p, i) => `
      <div class="list-row" style="gap:8px;">
        <span style="min-width:60px;font-size:12px;color:var(--text-muted);">رتبه ${i + 1}</span>
        <input type="text" class="prize-label" value="${Utils.escapeHtml(p.label || '')}" placeholder="عنوان" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
        <input type="number" class="prize-amount" value="${p.amount || 0}" min="0" placeholder="مبلغ" style="width:120px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
        <button class="btn btn-sm btn-danger" onclick="Tournaments.removePrizeRow(${i})">✕</button>
      </div>
    `).join("");
  }

  function addPrizeRow() {
    let prizes = getCurrentPrizes();
    prizes.push({ place: prizes.length + 1, label: "", amount: 0 });
    renderPrizes(prizes);
  }

  function removePrizeRow(idx) {
    let prizes = getCurrentPrizes();
    prizes.splice(idx, 1);
    renderPrizes(prizes);
  }

  function getCurrentPrizes() {
    let labels = document.querySelectorAll(".prize-label");
    let amounts = document.querySelectorAll(".prize-amount");
    let prizes = [];
    labels.forEach((l, i) => {
      prizes.push({ place: i + 1, label: l.value, amount: parseInt(amounts[i].value) || 0 });
    });
    return prizes;
  }

  async function saveTournament(editId) {
    let name = document.getElementById("tName").value.trim();
    if (!name) { App.toast("نام مسابقه را وارد کنید"); return; }

    let data = {
      name: name,
      gameType: document.getElementById("tGameType").value,
      bracketType: document.getElementById("tBracketType").value,
      participantCount: parseInt(document.getElementById("tParticipantCount").value) || 8,
      entryFee: parseInt(document.getElementById("tEntryFee").value) || 0,
      pcRateManual: parseInt(document.getElementById("tPcRate").value) || 0,
      startDate: document.getElementById("tStartDate").value.trim(),
      endDate: document.getElementById("tEndDate").value.trim(),
      prizes: getCurrentPrizes(),
    };

    if (data.gameType === "billiard") {
      data.billiardFormat = document.getElementById("tBilliardFormat")?.value || "2stick";
      data.teamSize = data.billiardFormat === "4stick" ? 2 : 1;
    } else if (data.gameType === "cs2") {
      data.teamSize = parseInt(document.getElementById("tTeamSize")?.value) || 5;
    } else {
      data.teamSize = 1;
    }

    if (editId) {
      let existing = await DB.get("tournaments", editId);
      Object.assign(existing, data);
      await DB.put("tournaments", existing);
      await DB.logActivity("ویرایش مسابقه", name);
    } else {
      data.status = "draft";
      data.participants = [];
      data.matches = [];
      data.createdAt = new Date().toISOString();
      await DB.add("tournaments", data);
      await DB.logActivity("ایجاد مسابقه", name);
    }

    App.closeModalForce();
    App.toast(editId ? "ذخیره شد" : "مسابقه ایجاد شد");
    refresh();
  }

  async function editTournament(id) {
    let t = await DB.get("tournaments", id);
    if (t) showCreateTournament(t);
  }

  async function deleteTournament(id) {
    let t = await DB.get("tournaments", id);
    if (!t) { App.toast("مسابقه یافت نشد"); return; }
    if (!confirm("آیا از حذف این مسابقه مطمئن هستید؟ مبالغ تسویه‌شده و حق ورودهای دریافت‌شده به مشتریان بازگردانده می‌شود.")) return;

    let matches;
    try { matches = await DB.getByIndex("matches", "by_tournament", id); } catch (e) { matches = (await DB.getAll("matches")).filter((m) => m.tournamentId === id); }

    // Reverse settled match payments before deleting the matches themselves.
    let allBp = await DB.getAll("blockPayments");
    for (let m of matches) {
      if (!m.settled) continue;
      let bp = allBp.find((r) => r.deviceType === "tournament" && r.matchId === m.id);
      if (bp) {
        await Reports.reversePayment(bp.customerId, bp.amount, bp.payType, bp.payBreakdown);
        await DB.remove("blockPayments", bp.id);
      } else {
        // Fall back to the match loser for records predating blockPayments tracking.
        let loserId = m.winner ? (m.winner === m.playerA ? m.playerB : m.playerA) : (m.playerA || m.playerB);
        if (loserId) await Reports.reversePayment(loserId, m.settleAmount || 0, m.settlePayType || "cash");
      }
    }
    for (let m of matches) await DB.remove("matches", m.id);

    // Reverse collected entry fees.
    if (t.entryFeeStatus) {
      for (let participantId in t.entryFeeStatus) {
        let efs = t.entryFeeStatus[participantId];
        if (!efs || !efs.collected) continue;
        await Reports.reversePayment(efs.payerId || parseInt(participantId), t.entryFee, efs.payType, efs.payBreakdown);
      }
    }

    // Reverse prize payouts and delete their rows. A wallet payout is credited
    // back by subtracting the wallet (floored at 0); cash/card payouts only have
    // their row removed — we do NOT fabricate cash back into the till.
    let prizePayouts = (await DB.getAll("prizePayouts")).filter((p) => p.tournamentId === id);
    for (let p of prizePayouts) {
      if (p.payType === "wallet" && p.customerId) {
        let winner = await DB.get("customers", p.customerId);
        if (winner) {
          winner.wallet = Math.max(0, (winner.wallet || 0) - (p.amount || 0));
          await DB.put("customers", winner);
        }
      }
      await DB.remove("prizePayouts", p.id);
    }

    let parts;
    try { parts = await DB.getByIndex("tournamentParticipants", "by_tournament", id); } catch (e) { parts = []; }
    for (let p of parts) await DB.remove("tournamentParticipants", p.id);
    await DB.remove("tournaments", id);
    await DB.logActivity("حذف مسابقه", t.name + " — مبالغ تسویه‌شده و حق ورودها بازگردانده شد");
    App.toast("مسابقه حذف شد");
    refresh();
  }

  async function changeStatus(id, newStatus) {
    let t = await DB.get("tournaments", id);
    if (!t) return;
    t.status = newStatus;
    await DB.put("tournaments", t);
    await DB.logActivity("تغییر وضعیت مسابقه", t.name + " → " + STATUS[newStatus].label);
    App.toast("وضعیت تغییر کرد");
    refresh();
  }

  // ─── MANAGE TOURNAMENT ───────────────────────────────

  async function manageTournament(id) {
    let t = await DB.get("tournaments", id);
    if (!t) { App.toast("مسابقه یافت نشد"); return; }
    let matches;
    try { matches = await DB.getByIndex("matches", "by_tournament", id); } catch (e) { matches = (await DB.getAll("matches")).filter((m) => m.tournamentId === id); }
    let customers = await DB.getAll("customers");
    let participants = t.participants || [];
    let allPayouts = await DB.getAll("prizePayouts");
    let tournamentPayouts = allPayouts.filter((p) => p.tournamentId === id);

    let gameInfo = GAME_TYPES[t.gameType];
    let st = STATUS[t.status];

    let participantHtml = participants.map((pid) => getParticipantName(pid, customers)).join(", ");

    let matchesHtml = t.bracketType === "league"
      ? renderLeagueBracket(matches, t, customers)
      : renderBracket(matches, t, customers);
    let standingsHtml = t.bracketType === "league" ? renderLeagueStandings(matches, customers, participants) : "";

    App.openModal(`
      <h2>${Utils.escapeHtml(t.name)}</h2>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin-bottom:12px;">
          <span class="status-badge" style="background:${st.color}20;color:${st.color};">${st.label}</span>
          <span>${gameInfo.label}</span>
          <span>حق ورود: ${Utils.formatCurrency(t.entryFee)}</span>
        </div>

        ${t.status === 'open' || t.status === 'draft' ? `
        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">شرکت‌کنندگان (${participants.length}/${t.participantCount})</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${participants.map((pid, i) => {
            let label = getParticipantName(pid, customers);
            return `<span class="status-badge status-free" style="cursor:pointer;" onclick="Tournaments.removeParticipant(${id}, ${pid})">${Utils.escapeHtml(label)} ✕</span>`;
          }).join("")}
        </div>
        <div class="form-group">
          <select id="addParticipantSelect" style="width:100%;">
            <option value="">انتخاب شناسه...</option>
            ${customers.filter((c) => !participants.includes(c.id)).map((c) => {
              let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
              let idLabel = c.displayId || c.id;
              let label = fullName ? fullName + " #" + idLabel : "#" + idLabel;
              return `<option value="${c.id}">${label}</option>`;
            }).join("")}
          </select>
        </div>
        <button class="btn btn-sm btn-outline" onclick="Tournaments.addParticipant(${id})">افزودن شرکت‌کننده</button>
        ` : `
        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">شرکت‌کنندگان (${participants.length})</h3>
        <div style="font-size:13px;color:var(--text-secondary);">${participantHtml || 'بدون شرکت‌کننده'}</div>
        `}

        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">براکت</h3>
        ${matchesHtml}

        ${standingsHtml}

        ${(t.status === 'in_progress' || t.status === 'completed') ? '<hr class="section-divider">' + renderAccounting(t, matches, customers, tournamentPayouts) : ''}

        <div class="modal-actions">
          <button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button>
        </div>
    `, 'modal-wide');
  }

  // ─── BRACKET RENDERING ──────────────────────────────

  function renderBracket(matches, tournament, customers) {
    if (!matches || matches.length === 0) {
      return '<div class="text-muted text-sm">براکت هنوز تولید نشده. ابتدا مسابقه را شروع کنید.</div>';
    }

    let rounds = {};
    matches.forEach((m) => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    let totalRounds = Math.max(...Object.keys(rounds).map(Number));

    let html = '<div class="bracket">';

    for (let r = 1; r <= totalRounds; r++) {
      let roundMatches = (rounds[r] || []).sort((a, b) => a.matchIndex - b.matchIndex);

      html += `<div class="bracket-round">`;
      html += `<div class="bracket-round-label">${getRoundLabel(r, totalRounds)}</div>`;
      html += `<div class="bracket-round-matches">`;

      roundMatches.forEach((m) => {
        html += renderMatchBox(m, customers);
      });

      html += `</div></div>`;

      if (r < totalRounds) {
        let pairCount = Math.ceil(roundMatches.length / 2);
        html += '<div class="bracket-connector-col">';
        for (let p = 0; p < pairCount; p++) {
          html += `<div class="bracket-connector-group">
            <div class="line-h-top"></div>
            <div class="line-h-bottom"></div>
            <div class="line-v"></div>
            <div class="line-h-mid"></div>
          </div>`;
        }
        html += '</div>';
      }
    }

    html += '</div>';
    return html;
  }

  function renderLeagueBracket(matches, tournament, customers) {
    if (!matches || matches.length === 0) {
      return '<div class="text-muted text-sm">براکت هنوز تولید نشده. ابتدا مسابقه را شروع کنید.</div>';
    }

    let rounds = {};
    matches.forEach((m) => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    let totalRounds = Math.max(...Object.keys(rounds).map(Number));
    let html = '<div class="league-bracket">';

    for (let r = 1; r <= totalRounds; r++) {
      let roundMatches = (rounds[r] || []).sort((a, b) => a.matchIndex - b.matchIndex);
      html += `<div class="league-round-card">
        <div class="league-round-title">دور ${r}</div>`;

      roundMatches.forEach((m) => {
        let isCompleted = m.status === "completed";
        let isEmpty = !m.playerA && !m.playerB;
        let nameA = getParticipantName(m.playerA, customers);
        let nameB = getParticipantName(m.playerB, customers);
        let scoreA = m.scoreA != null ? m.scoreA : "";
        let scoreB = m.scoreB != null ? m.scoreB : "";
        let winnerA = isCompleted && m.winner === m.playerA;
        let winnerB = isCompleted && m.winner === m.playerB;

        html += `<div class="league-match-row${isCompleted ? ' completed' : ''}${isEmpty ? ' empty' : ''}" onclick="Tournaments.openMatch(${m.id})">
          <span class="league-match-num">#${m.matchIndex + 1}</span>
          <span class="league-match-player${winnerA ? ' winner' : ''}">${nameA}</span>
          <span class="league-match-score">${isCompleted ? scoreA + ' - ' + scoreB : 'vs'}</span>
          <span class="league-match-player${winnerB ? ' winner' : ''}">${nameB}</span>
        </div>`;
      });

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderMatchBox(m, customers) {
    let isEmpty = !m.playerA && !m.playerB;
    let isReady = m.playerA && m.playerB && m.status !== "completed";
    let isCompleted = m.status === "completed";

    let nameA = getParticipantName(m.playerA, customers);
    let nameB = getParticipantName(m.playerB, customers);

    let scoreA = m.scoreA != null ? m.scoreA : "";
    let scoreB = m.scoreB != null ? m.scoreB : "";

    let winnerA = isCompleted && m.winner === m.playerA;
    let winnerB = isCompleted && m.winner === m.playerB;

    let classes = ["bracket-match-box"];
    if (isCompleted) classes.push("completed");
    if (isEmpty) classes.push("empty");
    if (isReady) classes.push("ready");

    return `<div class="${classes.join(" ")}" onclick="Tournaments.openMatch(${m.id})">
      <div class="match-header">بازی ${m.matchIndex + 1}</div>
      <div class="player-row ${winnerA ? "winner" : ""}">
        <span class="player-name">${nameA}</span>
        <span class="player-score">${scoreA}</span>
      </div>
      <div class="player-row ${winnerB ? "winner" : ""}">
        <span class="player-name">${nameB}</span>
        <span class="player-score">${scoreB}</span>
      </div>
    </div>`;
  }

  function getRoundLabel(round, totalRounds) {
    if (totalRounds === 1) return "فینال";
    if (round === totalRounds) return "فینال";
    if (round === totalRounds - 1) return "نیمه‌نهایی";
    if (round === totalRounds - 2 && totalRounds >= 3) return "ربع‌نهایی";
    return `دور ${round}`;
  }

  // Tournament UI shows participant full name with ID number.
  function getParticipantName(id, customers) {
    if (Array.isArray(id)) {
      return id.map((pid) => {
        let c = customers.find((cu) => cu.id === pid);
        if (!c) return '?';
        let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
        let displayNum = c.displayId || c.id;
        if (fullName) return fullName + " (#" + displayNum + ")";
        return '#' + displayNum;
      }).join(" & ");
    }
    let c = customers.find((cu) => cu.id === id);
    if (!c) return id ? '#' + id : 'تعریف نشده';
    let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
    let displayNum = c.displayId || c.id;
    if (fullName) return fullName + " (#" + displayNum + ")";
    return '#' + displayNum;
  }

  async function addParticipant(tournamentId) {
    let sel = document.getElementById("addParticipantSelect");
    let customerId = parseInt(sel.value);
    if (!customerId) return;
    let t = await DB.get("tournaments", tournamentId);
    if (!t) return;
    if (!t.participants) t.participants = [];
    if (t.participants.includes(customerId)) { App.toast("این شناسه قبلاً اضافه شده"); return; }
    if (t.participants.length >= t.participantCount) { App.toast("ظرفیت تکمیل است"); return; }
    t.participants.push(customerId);
    await DB.put("tournaments", t);
    manageTournament(tournamentId);
  }

  async function removeParticipant(tournamentId, customerId) {
    let t = await DB.get("tournaments", tournamentId);
    if (!t) return;
    t.participants = (t.participants || []).filter((p) => p !== customerId);
    await DB.put("tournaments", t);
    manageTournament(tournamentId);
  }

  // ─── START TOURNAMENT ────────────────────────────────

  async function startTournament(id) {
    let t = await DB.get("tournaments", id);
    if (!t) return;
    if (t.status === "in_progress" || t.status === "completed") { App.toast("مسابقه قبلاً شروع شده"); return; }
    let participants = t.participants || [];
    if (participants.length < 2) { App.toast("حداقل ۲ شرکت‌کننده لازم است"); return; }

    let matches = generateBracket(t, participants);
    let savedMatches = [];
    for (let m of matches) {
      // DB.add() resolves with the generated key itself (a number), not the
      // stored object — assign it back onto `m` before using it as an id
      // (the previous `saved.id` here was always undefined).
      let savedId = await DB.add("matches", m);
      m.id = savedId;
      t.matches = t.matches || [];
      t.matches.push(savedId);
      savedMatches.push(m);
    }

    // Bye slots are created already "completed" with a winner but haven't
    // gone through advanceWinner() yet — do that now (after every match has
    // a real id) so the bye recipient is pushed into their round-2 match
    // immediately, instead of the bracket showing an empty round-2 slot
    // until someone manually intervenes.
    for (let m of savedMatches) {
      if (m.isBye) await advanceWinner(m);
    }

    t.status = "in_progress";
    t.entryFeeStatus = {};
    participants.forEach((pid) => { t.entryFeeStatus[pid] = { collected: false }; });
    await DB.put("tournaments", t);
    await DB.logActivity("شروع مسابقه", t.name + " — " + matches.length + " بازی");
    App.toast("مسابقه شروع شد!");
    refresh();
  }

  function generateBracket(t, participants) {
    if (t.bracketType === "elimination") {
      return generateEliminationBracket(t, participants);
    }
    return generateLeagueBracket(t, participants);
  }

  // Single-elimination bracket sizing must be based on the next power of two
  // at-or-above the participant count (not on `n` directly), because
  // advanceWinner()'s progression math (nextMatchIndex = floor(matchIndex/2))
  // assumes a perfect binary tree from round to round. With an `n`-based
  // round size (the old behaviour) that assumption breaks for any non-
  // power-of-2 participant count: later rounds end up with fewer incoming
  // winners than slots, and matches get stuck waiting for a "player" that
  // will never arrive. Sizing rounds off `bracketSize` fixes that structurally,
  // and any leftover slots (`bracketSize - n`) become byes: a participant
  // with no round-1 opponent who is automatically marked the winner of an
  // already-"completed" round-1 slot, so bracket progression starts correctly
  // without any manual assignment.
  function generateEliminationBracket(t, participants) {
    let n = participants.length;
    let bracketSize = 2;
    while (bracketSize < n) bracketSize *= 2;
    let totalRounds = Math.log2(bracketSize);
    let byeCount = bracketSize - n;
    let round1Count = bracketSize / 2;
    let matches = [];

    // Participants are seeded into round 1 in their current list order (no
    // random-seeding option exists elsewhere in the app to honor here).
    // The first `byeCount` round-1 slots each get a single participant and
    // an automatic bye; the remaining slots are normal 2-player matches.
    let pIdx = 0;
    for (let i = 0; i < round1Count; i++) {
      let isByeMatch = i < byeCount;
      let playerA = pIdx < n ? participants[pIdx++] : null;
      let playerB = isByeMatch ? null : (pIdx < n ? participants[pIdx++] : null);
      let isBye = isByeMatch && playerA != null;

      matches.push({
        tournamentId: t.id,
        round: 1,
        matchIndex: i,
        playerA: playerA,
        playerB: playerB,
        scoreA: isBye ? 1 : null,
        scoreB: isBye ? 0 : null,
        winner: isBye ? playerA : null,
        deviceId: null,
        timerStart: null,
        timerEnd: null,
        deviceCost: 0,
        items: [],
        status: isBye ? "completed" : "pending",
        settled: false,
        settlePayType: null,
        settleAmount: 0,
        settlerName: "",
        settledAt: null,
        isBye: isBye,
      });
    }

    for (let round = 2; round <= totalRounds; round++) {
      let matchCount = bracketSize / Math.pow(2, round);
      for (let i = 0; i < matchCount; i++) {
        matches.push({
          tournamentId: t.id,
          round: round,
          matchIndex: i,
          playerA: null,
          playerB: null,
          scoreA: null,
          scoreB: null,
          winner: null,
          deviceId: null,
          timerStart: null,
          timerEnd: null,
          deviceCost: 0,
          items: [],
          status: "pending",
          settled: false,
          settlePayType: null,
          settleAmount: 0,
          settlerName: "",
          settledAt: null,
        });
      }
    }
    return matches;
  }

  function generateLeagueBracket(t, participants) {
    let n = participants.length;
    let isOdd = n % 2 !== 0;
    let players = isOdd ? [...participants, null] : [...participants];
    let totalRounds = players.length - 1;
    let matchesPerRound = players.length / 2;
    let matches = [];

    for (let round = 1; round <= totalRounds; round++) {
      for (let i = 0; i < matchesPerRound; i++) {
        let pA = players[i];
        let pB = players[players.length - 1 - i];
        if (pA === null || pB === null) continue;
        matches.push({
          tournamentId: t.id,
          round: round,
          matchIndex: i,
          playerA: pA,
          playerB: pB,
          scoreA: null,
          scoreB: null,
          winner: null,
          deviceId: null,
          timerStart: null,
          timerEnd: null,
          deviceCost: 0,
          items: [],
          status: "pending",
          settled: false,
          settlePayType: null,
          settleAmount: 0,
          settlerName: "",
          settledAt: null,
        });
      }
      let last = players.pop();
      players.splice(1, 0, last);
    }
    return matches;
  }

  // ─── MATCH DAY ───────────────────────────────────────

  async function openMatch(matchId) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    let tournament = await DB.get("tournaments", match.tournamentId);
    if (!tournament) return;
    let customers = await DB.getAll("customers");
    let devices = await DB.getAll("devices");
    let cafeItems = await DB.getAll("cafeItems");
    let penalties = await DB.getAll("penaltyItems");

    let participants = tournament.participants || [];
    let allMatches;
    try { allMatches = await DB.getByIndex("matches", "by_tournament", match.tournamentId); } catch (e) { allMatches = (await DB.getAll("matches")).filter((m) => m.tournamentId === match.tournamentId); }

    let assignedIds = allMatches
      .filter((m) => m.id !== matchId && m.round === match.round)
      .reduce((arr, m) => { if (m.playerA) arr.push(m.playerA); if (m.playerB) arr.push(m.playerB); return arr; }, []);

    let availablePlayers = participants.filter((p) => !assignedIds.includes(p));

    let hasBothPlayers = match.playerA && match.playerB;
    let isEmpty = !match.playerA && !match.playerB;

    let nameA = getParticipantName(match.playerA, customers);
    let nameB = getParticipantName(match.playerB, customers);

    let itemsHtml = (match.items || []).map((it) => `
      <div class="block-item">
        <span>${Utils.escapeHtml(it.name)} x${it.qty} → ${it.assignedTo ? getParticipantName(it.assignedTo, customers) : 'نامشخص'}</span>
        <span>${Utils.formatCurrency(it.price * it.qty)}</span>
      </div>
    `).join("");

    let totalItems = (match.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let timerDisplay = match.timerStart
      ? (match.timerEnd
        ? Utils.formatDuration(new Date(match.timerEnd) - new Date(match.timerStart))
        : Utils.formatDuration(Date.now() - new Date(match.timerStart).getTime()) + " (در حال اجرا)")
      : "شروع نشده";

    let matchDevices = devices.filter((d) => {
      let typeOk = tournament.gameType === "football" ? d.type === "console"
        : tournament.gameType === "billiard" ? d.type === "billiard"
        : tournament.gameType === "cs2" ? d.type === "pc"
        : false;
      if (!typeOk) return false;
      // Devices already busy (normal session or another match) are hidden
      // from the picker, except the device already assigned to *this* match
      // so it stays selectable while its timer is running.
      return d.status === "free" || d.id === match.deviceId;
    });

    let playerAssignmentHtml = "";
    if (!hasBothPlayers) {
      let alreadySelected = [match.playerA, match.playerB].filter(Boolean);
      let optionsHtml = availablePlayers.concat(alreadySelected).map((pid) => {
        let label = getParticipantName(pid, customers);
        return `<option value="${pid}">${Utils.escapeHtml(label)}</option>`;
      }).join("");

      playerAssignmentHtml = `
        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">انتخاب بازیکنان</h3>
        <div class="form-group">
          <label>بازیکن اول</label>
          <select id="assignPlayerA" style="width:100%;">
            <option value="">انتخاب...</option>
            ${optionsHtml}
          </select>
        </div>
        <div class="form-group">
          <label>بازیکن دوم</label>
          <select id="assignPlayerB" style="width:100%;">
            <option value="">انتخاب...</option>
            ${optionsHtml}
          </select>
        </div>
        <button class="btn btn-sm btn-primary" onclick="Tournaments.assignMatchPlayers(${matchId})">انتخاب بازیکنان</button>
      `;
    }

    App.openModal(`
      <div style="max-height:80vh;overflow-y:auto;">
        <h2>بازی ${match.matchIndex + 1} — دور ${match.round}</h2>
        <div style="font-size:15px;margin-bottom:12px;font-weight:600;">${nameA} vs ${nameB}</div>

        ${playerAssignmentHtml}

        ${hasBothPlayers ? `
        <div class="form-group"><label>انتخاب دستگاه</label>
          <select id="matchDevice">
            <option value="">انتخاب...</option>
            ${matchDevices.map((d) => `<option value="${d.id}" ${match.deviceId === d.id ? 'selected' : ''}>${Utils.escapeHtml(d.name)}</option>`).join("")}
          </select>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="font-family:monospace;font-size:18px;font-weight:700;" id="matchTimer">${timerDisplay}</span>
          ${!match.timerStart
            ? `<button class="btn btn-sm btn-success" onclick="Tournaments.startMatchTimer(${matchId})">شروع</button>`
            : match.timerEnd
              ? `<button class="btn btn-sm btn-outline" disabled>توقف</button>`
              : `<button class="btn btn-sm btn-warning" onclick="Tournaments.stopMatchTimer(${matchId})">توقف</button>`
          }
        </div>

        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">آیتم‌ها</h3>
        ${itemsHtml || '<div class="text-muted text-sm">بدون آیتم</div>'}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          ${cafeItems.map((item) => `<button class="btn btn-sm btn-outline" onclick="Tournaments.showAddMatchItem(${matchId}, ${item.id}, 'cafe')">${Utils.escapeHtml(item.name)} ${Utils.formatCurrency(item.price)}</button>`).join("")}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
          ${penalties.map((item) => `<button class="btn btn-sm btn-outline" onclick="Tournaments.showAddMatchItem(${matchId}, ${item.id}, 'penalty')">${Utils.escapeHtml(item.name)}</button>`).join("")}
        </div>

        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">نتیجه</h3>
        <div class="form-inline">
          <div class="form-group">
            <label>${nameA}</label>
            <input type="number" id="scoreA" value="${match.scoreA != null ? match.scoreA : ''}" min="0" style="width:80px;">
          </div>
          <div class="form-group">
            <label>${nameB}</label>
            <input type="number" id="scoreB" value="${match.scoreB != null ? match.scoreB : ''}" min="0" style="width:80px;">
          </div>
          <button class="btn btn-sm btn-primary" onclick="Tournaments.saveMatchResult(${matchId})">ثبت نتیجه</button>
        </div>

        <hr class="section-divider">
        <h3 style="margin-bottom:8px;">خلاصه هزینه</h3>
        <div style="font-size:13px;">
          <div>هزینه دستگاه: ${Utils.formatCurrency(match.deviceCost || 0)} ${match.winner ? '→ بازنده: ' + getParticipantName(match.winner === match.playerA ? match.playerB : match.playerA, customers) : ''}</div>
          <div>جمع آیتم‌ها: ${Utils.formatCurrency(totalItems)}</div>
          <div style="font-weight:700;margin-top:4px;">جمع کل: ${Utils.formatCurrency((match.deviceCost || 0) + totalItems)}</div>
        </div>
        ${match.settled
          ? '<div style="margin-top:8px;"><span class="status-badge status-free" style="font-size:12px;">تسویه شده ✓ — ' + Utils.formatCurrency(match.settleAmount || 0) + ' — ' + (match.settlePayType === 'wallet' ? 'کیف‌پول' : match.settlePayType === 'debt' ? 'بدهکاری' : match.settlePayType === 'cash' ? 'نقدی' : 'کارتی') + '</span></div>'
          : ((match.deviceCost || 0) + totalItems > 0 ? '<div style="margin-top:8px;"><button class="btn btn-sm btn-success" onclick="Tournaments.settleMatch(' + matchId + ')">تسویه این بازی</button></div>' : '')
        }
        ` : ''}

        <div class="modal-actions">
          <button class="btn btn-outline" onclick="App.closeModalForce()">بستن</button>
        </div>
      </div>
    `);
  }

  async function assignMatchPlayers(matchId) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    let playerA = parseInt(document.getElementById("assignPlayerA").value);
    let playerB = parseInt(document.getElementById("assignPlayerB").value);
    if (!playerA || !playerB) { App.toast("هر دو بازیکن را انتخاب کنید"); return; }
    if (playerA === playerB) { App.toast("بازیکنان باید متفاوت باشند"); return; }

    match.playerA = playerA;
    match.playerB = playerB;
    await DB.put("matches", match);
    App.toast("بازیکنان انتخاب شدند");
    manageTournament(match.tournamentId);
  }

  async function startMatchTimer(matchId) {
    let match = await DB.get("matches", matchId);
    if (!match) return;

    let deviceId = document.getElementById("matchDevice")?.value;
    if (deviceId) match.deviceId = parseInt(deviceId);

    if (match.deviceId) {
      // A tournament match's device must be marked busy the same way a
      // normal session does, and vice versa a device already running a
      // normal session (or a different match) must block this match from
      // starting — otherwise the same physical console/table could be
      // double-booked by a session and a match simultaneously.
      let device = await DB.get("devices", match.deviceId);
      if (!device) { App.toast("دستگاه یافت نشد"); return; }
      if (device.status && device.status !== "free") {
        App.toast("این دستگاه در حال استفاده است");
        return;
      }
      await DB.put("devices", { ...device, status: "tournament" });
    }

    match.timerStart = new Date().toISOString();
    match.status = "active";

    await DB.put("matches", match);
    openMatch(matchId);
  }

  async function stopMatchTimer(matchId) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    match.timerEnd = new Date().toISOString();

    if (match.deviceId) {
      let tournament = await DB.get("tournaments", match.tournamentId);
      let pricing = await DB.getSetting("pricing", {});
      let rate = tournament.pcRateManual || 0;
      if (!rate) {
        let device = await DB.get("devices", match.deviceId);
        if (device && device.type === "console") {
          rate = (pricing.consoleRates || {})[1] || 5000;
        } else if (device && device.type === "billiard") {
          rate = (pricing.billiardRates || {})[2] || 8000;
        }
      }
      let durationHours = (new Date(match.timerEnd) - new Date(match.timerStart)) / 3600000;
      match.deviceCost = Utils.roundPrice(rate * durationHours, pricing.roundingUnit || 1000);

      // Free the device now that the match's timer has been settled/stopped,
      // the same way session-end frees a device — otherwise it would stay
      // stuck as busy forever after the match finishes.
      let device = await DB.get("devices", match.deviceId);
      if (device && device.status === "tournament") {
        await DB.put("devices", { ...device, status: "free" });
      }
    }

    await DB.put("matches", match);
    openMatch(matchId);
  }

  async function showAddMatchItem(matchId, itemId, source) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    let customers = await DB.getAll("customers");
    let matchPlayers = [match.playerA, match.playerB].filter(Boolean);

    let item;
    if (source === "cafe") {
      let items = await DB.getAll("cafeItems");
      item = items.find((i) => i.id === itemId);
    } else {
      let items = await DB.getAll("penaltyItems");
      item = items.find((i) => i.id === itemId);
    }
    if (!item) return;

    App.openModal(`
      <h2>افزودن آیتم: ${Utils.escapeHtml(item.name)}</h2>
      <div class="form-group"><label>تعداد</label><input type="number" id="matchItemQty" value="1" min="1"></div>
      <div class="form-group"><label>محاسبه به حساب</label>
        <select id="matchItemAssign">
          ${matchPlayers.map((pid) => {
            let c = customers.find((cu) => cu.id === pid);
            let fullName = c ? ((c.firstName || "") + " " + (c.lastName || "")).trim() : "";
            let idLabel = c ? (c.displayId || c.id) : pid;
            let label = fullName ? fullName + " #" + idLabel : "#" + idLabel;
            return `<option value="${pid}">${label}</option>`;
          }).join("")}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Tournaments.saveMatchItem(${matchId}, ${itemId}, '${source}')">افزودن</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveMatchItem(matchId, itemId, source) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    let qty = parseInt(document.getElementById("matchItemQty").value) || 1;
    let assignedTo = parseInt(document.getElementById("matchItemAssign").value) || null;

    let item;
    if (source === "cafe") {
      let items = await DB.getAll("cafeItems");
      item = items.find((i) => i.id === itemId);
        if (item) {
        if (!item.unlimited && item.stock < qty) { App.toast("موجودی کافی نیست"); return; }
        if (!item.unlimited) { item.stock -= qty; await DB.put("cafeItems", item); }
      }
    } else {
      let items = await DB.getAll("penaltyItems");
      item = items.find((i) => i.id === itemId);
    }
    if (!item) return;

    let price = source === "penalty" ? (item.type === "penalty" ? item.amount : -item.amount) : item.price;

    if (!match.items) match.items = [];
    match.items.push({ name: item.name, price: price, qty: qty, source: source, assignedTo: assignedTo });
    await DB.put("matches", match);
    openMatch(matchId);
  }

  async function saveMatchResult(matchId) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    let scoreA = parseInt(document.getElementById("scoreA").value);
    let scoreB = parseInt(document.getElementById("scoreB").value);

    if (isNaN(scoreA) || isNaN(scoreB)) { App.toast("نتایج را وارد کنید"); return; }

    let oldWinner = match.winner;

    match.scoreA = scoreA;
    match.scoreB = scoreB;

    if (scoreA > scoreB) {
      match.winner = match.playerA;
    } else if (scoreB > scoreA) {
      match.winner = match.playerB;
    } else {
      match.winner = null;
    }

    match.status = "completed";
    await DB.put("matches", match);

    if (oldWinner && !match.winner) {
      let tournament = await DB.get("tournaments", match.tournamentId);
      if (tournament && tournament.bracketType === "elimination") {
        let allMatches;
        try { allMatches = await DB.getByIndex("matches", "by_tournament", match.tournamentId); } catch (e) { allMatches = (await DB.getAll("matches")).filter((m) => m.tournamentId === match.tournamentId); }
        let nextRound = match.round + 1;
        let nextMatchIdx = Math.floor(match.matchIndex / 2);
        let nextMatch = allMatches.find((m) => m.round === nextRound && m.matchIndex === nextMatchIdx);
        if (nextMatch) {
          if (match.matchIndex % 2 === 0) {
            nextMatch.playerA = null;
          } else {
            nextMatch.playerB = null;
          }
          await DB.put("matches", nextMatch);
        }
      }
    } else {
      await advanceWinner(match);
    }

    App.toast("نتیجه ثبت شد");
    openMatch(matchId);
  }

  async function advanceWinner(match) {
    if (!match.winner) return;
    let tournament = await DB.get("tournaments", match.tournamentId);
    if (!tournament || tournament.bracketType !== "elimination") return;

    let allMatches;
    try { allMatches = await DB.getByIndex("matches", "by_tournament", match.tournamentId); } catch (e) { allMatches = (await DB.getAll("matches")).filter((m) => m.tournamentId === match.tournamentId); }

    let nextRound = match.round + 1;
    let nextMatchIdx = Math.floor(match.matchIndex / 2);
    let nextMatch = allMatches.find((m) => m.round === nextRound && m.matchIndex === nextMatchIdx);

    if (nextMatch) {
      if (match.matchIndex % 2 === 0) {
        nextMatch.playerA = match.winner;
      } else {
        nextMatch.playerB = match.winner;
      }
      await DB.put("matches", nextMatch);
    }
  }

  // ─── ACCOUNTING ────────────────────────────────────────

  async function collectEntryFee(tournamentId, participantId) {
    let t = await DB.get("tournaments", tournamentId);
    if (!t) return;
    if (!t.entryFee || t.entryFee <= 0) { App.toast("حق ورود تعریف نشده"); return; }
    let customers = await DB.getAll("customers");
    let name = getParticipantName(participantId, customers);
    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>دریافت حق ورود</h2>
      <div class="list-row"><span class="row-label">شرکت‌کننده</span><span class="row-value">${Utils.escapeHtml(name)}</span></div>
      <div class="list-row font-bold"><span class="row-label">مبلغ</span><span class="row-value amount">${Utils.formatCurrency(t.entryFee)}</span></div>
      <hr class="section-divider">
      <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, participantId, "entryPayerId")}</div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="entryPayType" onchange="Tournaments.toggleCombinedPayment('entryPayType', 'entryCombinedFields', ${t.entryFee})"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select>
      </div>
      <div id="entryCombinedFields" style="display:none; margin-top:8px;">
        <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="entryCombinedCardAmount" min="0" oninput="Tournaments.updateCombinedCheck('entryCombinedCardAmount', 'entryCombinedCashAmount', 'entryCombinedCheck', ${t.entryFee})"></div>
        <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="entryCombinedCashAmount" min="0" oninput="Tournaments.updateCombinedCheck('entryCombinedCardAmount', 'entryCombinedCashAmount', 'entryCombinedCheck', ${t.entryFee})"></div>
        <div id="entryCombinedCheck" class="text-sm" style="margin-top:4px;"></div>
      </div>
      <div class="form-group"><label>تسویه‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Tournaments.confirmCollectEntryFee(${tournamentId}, ${participantId})">دریافت</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmCollectEntryFee(tournamentId, participantId) {
    await Utils.guardDoubleClick(async () => {
      let t = await DB.get("tournaments", tournamentId);
      if (!t) return { success: false };
      if (!t.entryFeeStatus) t.entryFeeStatus = {};
      if (t.entryFeeStatus[participantId] && t.entryFeeStatus[participantId].collected) {
        App.toast("حق ورود این شرکت‌کننده قبلاً دریافت شده");
        return { success: false };
      }
      let payerId = parseInt(document.getElementById("entryPayerId").value) || participantId;
      let payType = document.getElementById("entryPayType").value;
      if (payType === "combined") {
        let cardAmt = parseInt(document.getElementById("entryCombinedCardAmount").value) || 0;
        let cashAmt = parseInt(document.getElementById("entryCombinedCashAmount").value) || 0;
        if (cardAmt + cashAmt !== t.entryFee) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        payType = { card: cardAmt, cash: cashAmt };
      }
      let settlerName = Utils.getSettlerName();

      let customer = await DB.get("customers", payerId);
      if (!customer) { App.toast("پرداخت‌کننده نامعتبر است"); return { success: false }; }
      let payResult = Utils.computePaymentUpdate(customer, t.entryFee, payType);
      if (!payResult.success) {
        App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
        return { success: false };
      }

      t.entryFeeStatus[participantId] = { collected: true, payerId, payType: payResult.payType, payBreakdown: payResult.payBreakdown, settlerName, settledAt: new Date().toISOString() };
      await DB.runAtomic([
        { store: "customers", type: "put", data: payResult.customer },
        { store: "tournaments", type: "put", data: t },
      ]);

      await DB.logActivity("دریافت حق ورود مسابقه", t.name + " — " + Utils.formatCurrency(t.entryFee));
      App.closeModalForce();
      App.toast("حق ورود دریافت شد");
      manageTournament(tournamentId);
      return { success: true };
    });
  }

  async function settleMatch(matchId) {
    let match = await DB.get("matches", matchId);
    if (!match) return;
    let tournament = await DB.get("tournaments", match.tournamentId);
    if (!tournament) return;
    let customers = await DB.getAll("customers");

    let totalItems = (match.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
    let total = (match.deviceCost || 0) + totalItems;

    if (total <= 0) { App.toast("هزینه‌ای برای تسویه وجود ندارد"); return; }

    let loserId = match.winner ? (match.winner === match.playerA ? match.playerB : match.playerA) : (match.playerA || match.playerB);

    let settlerHtml = await Utils.renderSettlerSelect();

    App.openModal(`
      <h2>تسویه بازی</h2>
      <div class="list-row"><span class="row-label">بازی</span><span class="row-value">دور ${match.round} — بازی ${match.matchIndex + 1}</span></div>
      <div class="list-row"><span class="row-label">هزینه دستگاه</span><span class="row-value">${Utils.formatCurrency(match.deviceCost || 0)}</span></div>
      <div class="list-row"><span class="row-label">آیتم‌ها</span><span class="row-value">${Utils.formatCurrency(totalItems)}</span></div>
      <div class="list-row font-bold text-lg"><span class="row-label">جمع کل</span><span class="row-value amount">${Utils.formatCurrency(total)}</span></div>
      <hr class="section-divider">
      <div class="form-group"><label>پرداخت‌کننده</label>${Utils.renderPayerSelect(customers, loserId, "matchPayerId")}</div>
      <div class="form-group"><label>روش پرداخت</label>
        <select id="matchPayType" onchange="Tournaments.toggleCombinedPayment('matchPayType', 'matchCombinedFields', ${total})"><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="cash">نقدی</option><option value="card">کارتی</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select>
      </div>
      <div id="matchCombinedFields" style="display:none; margin-top:8px;">
        <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="matchCombinedCardAmount" min="0" oninput="Tournaments.updateCombinedCheck('matchCombinedCardAmount', 'matchCombinedCashAmount', 'matchCombinedCheck', ${total})"></div>
        <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="matchCombinedCashAmount" min="0" oninput="Tournaments.updateCombinedCheck('matchCombinedCardAmount', 'matchCombinedCashAmount', 'matchCombinedCheck', ${total})"></div>
        <div id="matchCombinedCheck" class="text-sm" style="margin-top:4px;"></div>
      </div>
      <div class="form-group"><label>تسویه‌کننده</label>${settlerHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Tournaments.confirmSettleMatch(${matchId}, ${total})">تسویه</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmSettleMatch(matchId, total) {
    await Utils.guardDoubleClick(async () => {
      let match = await DB.get("matches", matchId);
      if (!match) return { success: false };
      if (match.settled) { App.toast("این بازی قبلاً تسویه شده"); return { success: false }; }
      let payerId = parseInt(document.getElementById("matchPayerId").value) || 0;
      let payType = document.getElementById("matchPayType").value;
      if (payType === "combined") {
        let cardAmt = parseInt(document.getElementById("matchCombinedCardAmount").value) || 0;
        let cashAmt = parseInt(document.getElementById("matchCombinedCashAmount").value) || 0;
        if (cardAmt + cashAmt !== effectiveTotal) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        payType = { card: cardAmt, cash: cashAmt };
      }
      let settlerName = Utils.getSettlerName();

      // Recompute the total from the match itself, not the amount baked into the
      // modal button (items may have been added after the modal opened).
      let totalItems = (match.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
      let effectiveTotal = (match.deviceCost || 0) + totalItems;
      if (effectiveTotal <= 0) { App.toast("هزینه‌ای برای تسویه وجود ندارد"); return { success: false }; }

      let customer = await DB.get("customers", payerId);
      if (!customer) { App.toast("پرداخت‌کننده نامعتبر است"); return { success: false }; }

      let payResult = Utils.computePaymentUpdate(customer, effectiveTotal, payType);
      if (!payResult.success) {
        App.toast(payResult.reason === "insufficient_wallet" ? "موجودی کیف‌پول کافی نیست" : "پرداخت ناموفق بود");
        return { success: false };
      }

      match.settled = true;
      match.settlePayType = payResult.payType;
      match.payBreakdown = payResult.payBreakdown;
      match.settleAmount = effectiveTotal;
      match.settlerName = settlerName;
      match.settledAt = new Date().toISOString();

      await DB.runAtomic([
        { store: "customers", type: "put", data: payResult.customer },
        { store: "matches", type: "put", data: match },
        { store: "blockPayments", type: "add", data: {
          customerId: payerId, sessionId: null, matchId: match.id,
          deviceId: match.deviceId || null, deviceType: "tournament", blockIndex: null,
          amount: effectiveTotal, payType: payResult.payType, payBreakdown: payResult.payBreakdown, settlerName: settlerName,
          date: match.settledAt,
        } },
      ]);

      let tournament = await DB.get("tournaments", match.tournamentId);
      await DB.logActivity("تسویه بازی مسابقه", (tournament ? tournament.name : '') + " — " + Utils.formatCurrency(effectiveTotal));
      App.closeModalForce();
      App.toast("بازی تسویه شد");
      manageTournament(match.tournamentId);
      return { success: true };
    });
  }

  async function settleAllMatches(tournamentId) {
    let t = await DB.get("tournaments", tournamentId);
    if (!t) return;
    let matches;
    try { matches = await DB.getByIndex("matches", "by_tournament", tournamentId); } catch (e) { matches = (await DB.getAll("matches")).filter((m) => m.tournamentId === tournamentId); }

    let unsettled = matches.filter((m) => !m.settled && ((m.deviceCost || 0) > 0 || (m.items || []).length > 0));
    if (unsettled.length === 0) { App.toast("بازی تسویه‌نشده‌ای وجود ندارد"); return; }

    App.openModal(`
      <h2>تسویه همه بازی‌ها</h2>
      <div class="list-row"><span class="row-label">تعداد بازی‌ها</span><span class="row-value">${unsettled.length}</span></div>
      <div class="text-muted text-sm" style="margin-bottom:8px;">هزینه هر بازی از بازنده آن بازی دریافت می‌شود.</div>
      <div class="form-group"><label>روش پرداخت (برای همه بازی‌ها)</label>
        <select id="bulkSettlePayType" onchange="Tournaments.toggleCombinedPayment('bulkSettlePayType', 'bulkCombinedFields', ${total})"><option value="cash">نقدی</option><option value="card">کارتی</option><option value="wallet">کیف‌پول</option><option value="debt">بدهکاری</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select>
      </div>
      <div id="bulkCombinedFields" style="display:none; margin-top:8px;">
        <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="bulkCombinedCardAmount" min="0" oninput="Tournaments.updateCombinedCheck('bulkCombinedCardAmount', 'bulkCombinedCashAmount', 'bulkCombinedCheck', ${total})"></div>
        <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="bulkCombinedCashAmount" min="0" oninput="Tournaments.updateCombinedCheck('bulkCombinedCardAmount', 'bulkCombinedCashAmount', 'bulkCombinedCheck', ${total})"></div>
        <div id="bulkCombinedCheck" class="text-sm" style="margin-top:4px;"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Tournaments.confirmSettleAllMatches(${tournamentId})">تسویه</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmSettleAllMatches(tournamentId) {
    await Utils.guardDoubleClick(async () => {
      let t = await DB.get("tournaments", tournamentId);
      if (!t) return { success: false };
      let payType = document.getElementById("bulkSettlePayType")?.value || "cash";
      if (payType === "combined") {
        let cardAmt = parseInt(document.getElementById("bulkCombinedCardAmount").value) || 0;
        let cashAmt = parseInt(document.getElementById("bulkCombinedCashAmount").value) || 0;
        let totalGrand = 0;
        let matches;
        try { matches = await DB.getByIndex("matches", "by_tournament", tournamentId); } catch (e) { matches = (await DB.getAll("matches")).filter((m) => m.tournamentId === tournamentId); }
        let unsettled = matches.filter((m) => !m.settled && ((m.deviceCost || 0) > 0 || (m.items || []).length > 0));
        for (let m of unsettled) {
          let totalItems = (m.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
          totalGrand += (m.deviceCost || 0) + totalItems;
        }
        if (cardAmt + cashAmt !== totalGrand) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        payType = { card: cardAmt, cash: cashAmt };
      }
      let matches;
      try { matches = await DB.getByIndex("matches", "by_tournament", tournamentId); } catch (e) { matches = (await DB.getAll("matches")).filter((m) => m.tournamentId === tournamentId); }

      let unsettled = matches.filter((m) => !m.settled && ((m.deviceCost || 0) > 0 || (m.items || []).length > 0));
      if (unsettled.length === 0) { App.toast("بازی تسویه‌نشده‌ای وجود ندارد"); return { success: false }; }

      let settledCount = 0, skippedCount = 0;
      for (let m of unsettled) {
        let totalItems = (m.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
        let total = (m.deviceCost || 0) + totalItems;
        if (total <= 0) continue;

        let loserId = m.winner ? (m.winner === m.playerA ? m.playerB : m.playerA) : (m.playerA || m.playerB);
        if (!loserId) continue;

        let customer = await DB.get("customers", loserId);
        if (!customer) { skippedCount++; continue; }
        let payResult = Utils.computePaymentUpdate(customer, total, payType);
        if (!payResult.success) { skippedCount++; continue; }
        m.settled = true;
        m.settlePayType = payResult.payType;
        m.payBreakdown = payResult.payBreakdown;
        m.settleAmount = total;
        m.settlerName = "تسویه خودکار";
        m.settledAt = new Date().toISOString();

        await DB.runAtomic([
          { store: "customers", type: "put", data: payResult.customer },
          { store: "matches", type: "put", data: m },
          { store: "blockPayments", type: "add", data: {
            customerId: loserId, sessionId: null, matchId: m.id,
            deviceId: m.deviceId || null, deviceType: "tournament", blockIndex: null,
            amount: total, payType: payResult.payType, payBreakdown: payResult.payBreakdown, settlerName: "تسویه خودکار",
            date: m.settledAt,
          } },
        ]);
        settledCount++;
      }

      await DB.logActivity("تسویه همه بازی‌ها", t.name + " — " + settledCount + " بازی | روش: " + payType);
      App.closeModalForce();
      App.toast(skippedCount > 0 ? (settledCount + " بازی تسویه شد، " + skippedCount + " بازی به‌دلیل کمبود موجودی کیف‌پول رد شد") : "همه بازی‌ها تسویه شد");
      manageTournament(tournamentId);
      return { success: true };
    });
  }

  async function payoutPrize(tournamentId, place) {
    let t = await DB.get("tournaments", tournamentId);
    if (!t) return;
    let prize = (t.prizes || []).find((p) => p.place === place);
    if (!prize) { App.toast("جایزه یافت نشد"); return; }
    let existing = (await DB.getAll("prizePayouts")).find((p) => p.tournamentId === tournamentId && p.place === place);
    if (existing) { App.toast("این جایزه قبلاً پرداخت شده است"); return; }

    let participants = t.participants || [];
    let customers = await DB.getAll("customers");
    let customerOptions = participants.map((pid) => {
      let label = getParticipantName(pid, customers);
      return `<option value="${pid}">${Utils.escapeHtml(label)}</option>`;
    }).join("");

    App.openModal(`
      <h2>پرداخت جایزه</h2>
      <div class="list-row"><span class="row-label">جایگاه</span><span class="row-value">${Utils.escapeHtml(prize.label || ('جایگاه ' + prize.place))}</span></div>
      <div class="list-row font-bold"><span class="row-label">مبلغ</span><span class="row-value amount">${Utils.formatCurrency(prize.amount)}</span></div>
      <hr class="section-divider">
      <div class="form-group"><label>برنده</label><select id="prizeWinnerId">${customerOptions}</select></div>
      <div class="form-group"><label>نحوه پرداخت</label>
        <select id="prizePayoutMethod" onchange="Tournaments.toggleCombinedPayment('prizePayoutMethod', 'prizeCombinedFields', ${prize.amount})"><option value="cash">نقد (از صندوق)</option><option value="card">کارتی</option><option value="wallet">افزودن به کیف‌پول</option><option value="combined">ترکیبی (نقدی + کارتی)</option></select>
      </div>
      <div id="prizeCombinedFields" style="display:none; margin-top:8px;">
        <div class="form-group"><label>مبلغ کارتی</label><input type="number" id="prizeCombinedCardAmount" min="0" oninput="Tournaments.updateCombinedCheck('prizeCombinedCardAmount', 'prizeCombinedCashAmount', 'prizeCombinedCheck', ${prize.amount})"></div>
        <div class="form-group"><label>مبلغ نقدی</label><input type="number" id="prizeCombinedCashAmount" min="0" oninput="Tournaments.updateCombinedCheck('prizeCombinedCardAmount', 'prizeCombinedCashAmount', 'prizeCombinedCheck', ${prize.amount})"></div>
        <div id="prizeCombinedCheck" class="text-sm" style="margin-top:4px;"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Tournaments.confirmPayoutPrize(${tournamentId}, ${place})">پرداخت</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function confirmPayoutPrize(tournamentId, place) {
    await Utils.guardDoubleClick(async () => {
      let t = await DB.get("tournaments", tournamentId);
      if (!t) return { success: false };
      let prize = (t.prizes || []).find((p) => p.place === place);
      if (!prize) { App.toast("جایزه یافت نشد"); return { success: false }; }
      let existing = (await DB.getAll("prizePayouts")).find((p) => p.tournamentId === tournamentId && p.place === place);
      if (existing) { App.toast("این جایزه قبلاً پرداخت شده است"); return { success: false }; }

      let winnerId = parseInt(document.getElementById("prizeWinnerId").value) || 0;
      let method = document.getElementById("prizePayoutMethod").value;
      if (method === "combined") {
        let cardAmt = parseInt(document.getElementById("prizeCombinedCardAmount").value) || 0;
        let cashAmt = parseInt(document.getElementById("prizeCombinedCashAmount").value) || 0;
        if (cardAmt + cashAmt !== prize.amount) { App.toast("مبلغ‌ها با کل مطابقت ندارد"); return { success: false }; }
        method = { card: cardAmt, cash: cashAmt };
      }
      if (!winnerId) { App.toast("برنده را انتخاب کنید"); return { success: false }; }

      // A cash/card payout is money leaving the till (like a purchase); crediting
      // the wallet instead just moves it onto the customer's account, so it is
      // recorded but doesn't reduce the day's cash reconciliation total.
      let payoutRecord = { tournamentId, place, customerId: winnerId, amount: prize.amount, payType: (typeof method === "object") ? "combined" : (method === "wallet" ? "wallet" : method), date: new Date().toISOString() };
      let ops = [];
      if (method === "wallet" || (typeof method === "object" && method.wallet > 0)) {
        let customer = await DB.get("customers", winnerId);
        if (!customer) { App.toast("مشتری یافت نشد"); return { success: false }; }
        let walletAmt = typeof method === "object" ? (method.wallet || 0) : prize.amount;
        customer.wallet = (customer.wallet || 0) + walletAmt;
        ops.push({ store: "customers", type: "put", data: customer });
      } else if (typeof method === "object") {
        // For combined, use computePaymentUpdate
        let customer = await DB.get("customers", winnerId);
        if (!customer) { App.toast("مشتری یافت نشد"); return { success: false }; }
        let payResult = Utils.computePaymentUpdate(customer, prize.amount, method);
        if (!payResult.success) { App.toast("پرداخت ناموفق بود"); return { success: false }; }
        ops.push({ store: "customers", type: "put", data: payResult.customer });
        payoutRecord.payType = payResult.payType;
      }
      ops.push({ store: "prizePayouts", type: "add", data: payoutRecord });

      await DB.runAtomic(ops);

      await DB.logActivity("پرداخت جایزه مسابقه", t.name + " — " + (prize.label || ('جایگاه ' + place)) + " — " + Utils.formatCurrency(prize.amount));
      App.closeModalForce();
      App.toast("جایزه پرداخت شد");
      manageTournament(tournamentId);
      return { success: true };
    });
  }

  function renderAccounting(tournament, matches, customers, prizePayouts) {
    prizePayouts = prizePayouts || [];
    let participants = tournament.participants || [];
    let entryFee = tournament.entryFee || 0;
    let entryFeeStatus = tournament.entryFeeStatus || {};

    let entryFeeHtml = participants.map((pid) => {
      let name = getParticipantName(pid, customers);
      let status = entryFeeStatus[pid];
      let collected = status && status.collected;
      return `<div class="list-row" style="align-items:center;">
        <span class="row-label" style="flex:1;">${Utils.escapeHtml(name)}</span>
        <span class="row-value" style="margin-left:8px;">${Utils.formatCurrency(entryFee)}</span>
        ${collected
          ? '<span class="status-badge status-free" style="font-size:11px;">دریافت شده ✓</span>'
          : '<button class="btn btn-sm btn-success" onclick="Tournaments.collectEntryFee(' + tournament.id + ', ' + pid + ')">تسویه ▶</button>'
        }
      </div>`;
    }).join("");

    let collectedCount = participants.filter((pid) => entryFeeStatus[pid] && entryFeeStatus[pid].collected).length;
    let totalEntryFees = collectedCount * entryFee;

    let unsettledMatches = matches.filter((m) => (m.deviceCost || 0) > 0 || (m.items || []).length > 0);
    let settledCount = unsettledMatches.filter((m) => m.settled).length;

    let matchCostHtml = unsettledMatches.map((m) => {
      let nameA = getParticipantName(m.playerA, customers);
      let nameB = getParticipantName(m.playerB, customers);
      let totalItems = (m.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
      let total = (m.deviceCost || 0) + totalItems;
      return `<div class="list-row" style="flex-direction:column;align-items:stretch;gap:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;font-weight:600;">دور ${m.round} — بازی ${m.matchIndex + 1}: ${Utils.escapeHtml(nameA)} vs ${Utils.escapeHtml(nameB)}</span>
          <span class="amount" style="font-size:13px;">${Utils.formatCurrency(total)}</span>
        </div>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--text-muted);">
          <span>دستگاه: ${Utils.formatCurrency(m.deviceCost || 0)}</span>
          <span>آیتم‌ها: ${Utils.formatCurrency(totalItems)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${m.settled
            ? '<span class="status-badge status-free" style="font-size:11px;">تسویه شده ✓ — ' + Utils.formatCurrency(m.settleAmount || 0) + '</span>'
            : '<button class="btn btn-sm btn-success" onclick="Tournaments.settleMatch(' + m.id + ')">تسویه ▶</button>'
          }
        </div>
      </div>`;
    }).join("");

    let totalMatchCosts = unsettledMatches.reduce((s, m) => {
      let totalItems = (m.items || []).reduce((s2, i) => s2 + (i.price * i.qty), 0);
      return s + (m.deviceCost || 0) + totalItems;
    }, 0);

    let totalSettledMatchCosts = unsettledMatches.filter((m) => m.settled).reduce((s, m) => {
      let totalItems = (m.items || []).reduce((s2, i) => s2 + (i.price * i.qty), 0);
      return s + (m.deviceCost || 0) + totalItems;
    }, 0);

    let prizes = tournament.prizes || [];
    let prizesHtml = prizes.filter((p) => (p.amount || 0) > 0).map((p) => {
      let payout = prizePayouts.find((po) => po.place === p.place);
      let winnerName = payout ? getParticipantName(payout.customerId, customers) : "";
      return `<div class="list-row" style="align-items:center;">
        <span class="row-label" style="flex:1;">${Utils.escapeHtml(p.label || ('جایگاه ' + p.place))}</span>
        <span class="row-value" style="margin-left:8px;">${Utils.formatCurrency(p.amount)}</span>
        ${payout
          ? '<span class="status-badge status-free" style="font-size:11px;">پرداخت شده به ' + Utils.escapeHtml(winnerName) + ' ✓</span>'
          : '<button class="btn btn-sm btn-success" onclick="Tournaments.payoutPrize(' + tournament.id + ', ' + p.place + ')">پرداخت جایزه ▶</button>'
        }
      </div>`;
    }).join("");
    let totalPrizePayouts = prizePayouts.reduce((s, p) => s + (p.amount || 0), 0);

    return `
      <div class="accounting-section" style="margin-top:16px;">
        <h3 style="margin-bottom:8px;">حسابداری</h3>

        <div style="margin-bottom:16px;">
          <h4 style="margin-bottom:6px;font-size:13px;">حق ورود (${Utils.formatCurrency(entryFee)} × ${participants.length} نفر)</h4>
          ${entryFeeHtml || '<div class="text-muted text-sm">شرکت‌کننده‌ای وجود ندارد</div>'}
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted);">جمع دریافتی: ${Utils.formatCurrency(totalEntryFees)} (${collectedCount}/${participants.length})</div>
        </div>

        <div style="margin-bottom:16px;">
          <h4 style="margin-bottom:6px;font-size:13px;">هزینه بازی‌ها (${unsettledMatches.length} بازی)</h4>
          ${matchCostHtml || '<div class="text-muted text-sm">بازی‌ای با هزینه وجود ندارد</div>'}
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted);">جمع کل: ${Utils.formatCurrency(totalMatchCosts)} — تسویه شده: ${Utils.formatCurrency(totalSettledMatchCosts)}</div>
        </div>

        ${unsettledMatches.length > 0 && settledCount < unsettledMatches.length ? '<button class="btn btn-sm btn-success" onclick="Tournaments.settleAllMatches(' + tournament.id + ')" style="margin-bottom:12px;">تسویه همه بازی‌ها</button>' : ''}

        ${prizesHtml ? `
        <div style="margin-bottom:16px;">
          <h4 style="margin-bottom:6px;font-size:13px;">جوایز</h4>
          ${prizesHtml}
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted);">جمع پرداخت‌شده: ${Utils.formatCurrency(totalPrizePayouts)} (${prizePayouts.length}/${prizes.filter((p) => (p.amount || 0) > 0).length})</div>
        </div>
        ` : ''}

        <div class="list-row font-bold" style="margin-top:8px;">
          <span class="row-label">جمع درآمد حق ورود</span>
          <span class="row-value amount positive">${Utils.formatCurrency(totalEntryFees)}</span>
        </div>
        <div class="list-row font-bold">
          <span class="row-label">جمع هزینه بازی‌ها</span>
          <span class="row-value amount">${Utils.formatCurrency(totalSettledMatchCosts)}</span>
        </div>
        ${totalPrizePayouts > 0 ? `
        <div class="list-row font-bold">
          <span class="row-label">جمع پرداخت جوایز</span>
          <span class="row-value amount">${Utils.formatCurrency(totalPrizePayouts)}</span>
        </div>
        ` : ''}
        <div class="list-row font-bold text-lg" style="border-top:2px solid var(--border);padding-top:8px;">
          <span class="row-label">خالص</span>
          <span class="row-value amount ${totalEntryFees - totalSettledMatchCosts - totalPrizePayouts >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(totalEntryFees - totalSettledMatchCosts - totalPrizePayouts)}</span>
        </div>
      </div>
    `;
  }

  // ─── UTILITIES ───────────────────────────────────────

  // ─── LEAGUE STANDINGS ──────────────────────────────

  function renderLeagueStandings(matches, customers, participants) {
    let stats = {};
    participants.forEach((pid) => {
      stats[pid] = { mp: 0, gs: 0, gc: 0, gd: 0, pts: 0 };
    });

    matches.filter((m) => m.status === "completed" && m.playerA && m.playerB).forEach((m) => {
      let a = m.playerA, b = m.playerB;
      if (!stats[a]) stats[a] = { mp: 0, gs: 0, gc: 0, gd: 0, pts: 0 };
      if (!stats[b]) stats[b] = { mp: 0, gs: 0, gc: 0, gd: 0, pts: 0 };

      let sa = m.scoreA || 0, sb = m.scoreB || 0;
      stats[a].mp++; stats[b].mp++;
      stats[a].gs += sa; stats[a].gc += sb;
      stats[b].gs += sb; stats[b].gc += sa;

      if (sa > sb) { stats[a].pts += 3; }
      else if (sb > sa) { stats[b].pts += 3; }
      else { stats[a].pts += 1; stats[b].pts += 1; }
    });

    participants.forEach((pid) => {
      stats[pid].gd = stats[pid].gs - stats[pid].gc;
    });

    let sorted = participants.slice().sort((a, b) => {
      let sa = stats[a], sb = stats[b];
      if (sb.pts !== sa.pts) return sb.pts - sa.pts;
      if (sb.gd !== sa.gd) return sb.gd - sa.gd;
      if (sb.gs !== sa.gs) return sb.gs - sa.gs;
      return sa.gc - sb.gc;
    });

    let rows = sorted.map((pid, i) => {
      let s = stats[pid];
      let name = getParticipantName(pid, customers);
      return `<tr>
        <td>${i + 1}</td>
        <td>${Utils.escapeHtml(name)}</td>
        <td>${s.mp}</td>
        <td>${s.gs}</td>
        <td>${s.gc}</td>
        <td>${s.gd > 0 ? '+' : ''}${s.gd}</td>
        <td class="font-bold">${s.pts}</td>
      </tr>`;
    }).join("");

    return `
      <div style="margin-top:12px;">
        <h3 style="margin-bottom:8px;">جدول رده‌بندی</h3>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-light);text-align:right;">
                <th style="padding:8px 6px;">#</th>
                <th style="padding:8px 6px;text-align:right;">بازیکن</th>
                <th style="padding:8px 6px;">بازی</th>
                <th style="padding:8px 6px;">گل زده</th>
                <th style="padding:8px 6px;">گل خورده</th>
                <th style="padding:8px 6px;">تفاضل</th>
                <th style="padding:8px 6px;">امتیاز</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function refresh() {
    let el = document.getElementById("tab-tournaments");
    if (el && el.classList.contains("active")) render(el);
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
    render,
    showCreateTournament,
    onGameTypeChange,
    addPrizeRow,
    removePrizeRow,
    saveTournament,
    editTournament,
    deleteTournament,
    changeStatus,
    manageTournament,
    addParticipant,
    removeParticipant,
    startTournament,
    openMatch,
    assignMatchPlayers,
    startMatchTimer,
    stopMatchTimer,
    showAddMatchItem,
    saveMatchItem,
    saveMatchResult,
    collectEntryFee,
    confirmCollectEntryFee,
    settleMatch,
    confirmSettleMatch,
    settleAllMatches,
    confirmSettleAllMatches,
    payoutPrize,
    confirmPayoutPrize,
    refresh,
    toggleCombinedPayment,
    updateCombinedCheck
  };
})();
