const Backup = (function () {
  // Tracks the outcome of the automatic (every-10-minutes) backup so both the
  // Backup tab and a persistent warning banner (see showBackupFailureWarning)
  // can reflect it. In-memory only — resets on page reload, which is fine
  // since writeAutoBackup() runs again shortly after every reload/login.
  let backupStatus = { lastSuccessAt: null, lastFailureAt: null, lastError: null, consecutiveFailures: 0 };

  function renderAutoBackupStatus() {
    let failedMoreRecently = backupStatus.lastFailureAt &&
      (!backupStatus.lastSuccessAt || backupStatus.lastFailureAt > backupStatus.lastSuccessAt);

    if (failedMoreRecently) {
      return `
        <div class="alert-box alert-warning" style="margin-bottom:12px;">
          <div><strong>بکاپ خودکار ناموفق بود</strong> (آخرین تلاش: ${Jalali.formatDateTime(backupStatus.lastFailureAt)})</div>
          <div class="text-sm">خطا: ${Utils.escapeHtml(backupStatus.lastError || '')}</div>
          <button class="btn btn-sm btn-outline mt-2" onclick="Backup.retryAutoBackup()">تلاش مجدد</button>
        </div>
      `;
    }
    if (backupStatus.lastSuccessAt) {
      return `
        <div class="text-muted text-sm" style="margin-bottom:12px;">
          آخرین بکاپ خودکار موفق: ${Jalali.formatDateTime(backupStatus.lastSuccessAt)}
        </div>
      `;
    }
    return "";
  }

  async function render(el) {
    let html = `
      <div class="card">
        <div class="card-header">
          <h2>پشتیبان‌گیری</h2>
        </div>
        <div class="report-section">
          <h3>خروجی اکسل</h3>
          <p class="text-muted text-sm mb-2">خروجی اکسل شامل تمام تراکنش‌ها، بدهی‌ها، ایدی‌ها، موجودی و غیره</p>
          <button class="btn btn-primary" onclick="Backup.exportExcel()">دانلود فایل اکسل</button>
        </div>
        <hr class="section-divider">
        <div class="report-section">
          <h3>پشتیبان کامل (JSON)</h3>
          ${renderAutoBackupStatus()}
          <p class="text-muted text-sm mb-2">فایل JSON شامل تمام داده‌های اپ قابل بازیابی</p>
          <div class="flex-gap">
            <button class="btn btn-primary" onclick="Backup.exportJSON()">دانلود بک‌آپ</button>
            <button class="btn btn-outline" onclick="Backup.triggerImport()">بازیابی از فایل</button>
            <input type="file" id="importFile" accept=".json" style="display:none" onchange="Backup.importJSON(event)">
          </div>
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  function refresh() {
    let el = document.getElementById("tab-backup");
    if (el && el.classList.contains("active")) render(el);
  }

  async function exportExcel() {
    try {
      let data = await DB.exportAll();

      let wb = XLSX.utils.book_new();

      if (data.customers && data.customers.length) {
        let ws = XLSX.utils.json_to_sheet(data.customers.map((c) => ({
          "ایدی": c.id, "نام": c.firstName, "نام خانوادگی": c.lastName, "شماره": c.phone,
          "موجودی": c.wallet, "بدهی": c.debt, "تخفیف": c.discount, "مجموع پرداختی": c.totalPaid,
        })));
        XLSX.utils.book_append_sheet(wb, ws, "شناسه‌ها");
      }

      if (data.sessions && data.sessions.length) {
        let devices = data.devices || [];
        let customers = data.customers || [];
        let ws = XLSX.utils.json_to_sheet(data.sessions.filter((s) => s.status === "settled").map((s) => {
          let device = devices.find((d) => d.id === s.deviceId);
          return {
            "نوع": s.deviceType, "دستگاه": device ? device.name : s.deviceId,
            "مبلغ": s.settleAmount, "روش پرداخت": s.settlePayType,
            "تاریخ": s.settledAt ? Jalali.formatDateTime(s.settledAt) : "",
            "تسویه‌کننده": s.settlerName || "",
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "تراکنش‌ها");
      }

      if (data.debtPayments && data.debtPayments.length) {
        let customers = data.customers || [];
        let ws = XLSX.utils.json_to_sheet(data.debtPayments.map((p) => {
          let c = customers.find((cu) => cu.id === p.customerId);
          return {
            "شناسه": p.customerId, "نام": c ? c.firstName + " " + c.lastName : "",
            "مبلغ": p.amount, "روش": p.paymentType === 'cash' ? 'نقدی' : 'کارتی',
            "تاریخ": Jalali.formatDateTime(p.date),
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "پرداخت بدهی");
      }

      if (data.purchases && data.purchases.length) {
        let ws = XLSX.utils.json_to_sheet(data.purchases.map((p) => ({
          "دسته": p.category === 'items' ? 'موارد' : 'یخچال', "توضیحات": p.description,
          "مبلغ": p.amount, "روش پرداخت": p.paymentType, "شخص ثالث": p.thirdParty || "",
          "تاریخ": Jalali.formatDateTime(p.date),
        })));
        XLSX.utils.book_append_sheet(wb, ws, "خریدها");
      }

      if (data.staff && data.staff.length) {
        let ws = XLSX.utils.json_to_sheet(data.staff.map((s) => {
          let totalHours = (s.shifts || []).reduce((sum, sh) => {
            if (sh.end) return sum + (new Date(sh.end) - new Date(sh.start)) / 3600000;
            return sum;
          }, 0);
          return { "نام": s.name, "ساعات کل": totalHours.toFixed(1) };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "پرسنل");
      }

      if (data.cafeOrders && data.cafeOrders.length) {
        let customers = data.customers || [];
        let ws = XLSX.utils.json_to_sheet(data.cafeOrders.map((o) => {
          let c = customers.find((cu) => cu.id === o.customerId);
          return {
            "شناسه": c ? "#" + (c.displayId || c.id) : o.customerId,
            "آیتم‌ها": (o.items || []).map((i) => i.name + " x" + i.qty).join("، "),
            "جمع": o.total, "روش پرداخت": o.payType,
            "تاریخ": o.createdAt ? Jalali.formatDateTime(o.createdAt) : "",
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "سفارشات کافی‌شاپ");
      }

      if (data.walletCharges && data.walletCharges.length) {
        let customers = data.customers || [];
        let ws = XLSX.utils.json_to_sheet(data.walletCharges.map((c) => {
          let cust = customers.find((cu) => cu.id === c.customerId);
          return {
            "شناسه": cust ? "#" + (cust.displayId || cust.id) : c.customerId,
            "مبلغ": c.amount, "روش": c.paymentType === 'cash' ? 'نقدی' : 'کارتی',
            "تاریخ": Jalali.formatDateTime(c.date),
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "شارژ کیف‌پول");
      }

      if (data.cafeItems && data.cafeItems.length) {
        let ws = XLSX.utils.json_to_sheet(data.cafeItems.map((it) => ({
          "نام": it.name, "قیمت": it.price,
          "موجودی": it.unlimited ? "نامحدود" : it.stock,
        })));
        XLSX.utils.book_append_sheet(wb, ws, "موجودی کافی‌شاپ");
      }

      if (data.dailySummaries && data.dailySummaries.length) {
        let ws = XLSX.utils.json_to_sheet(data.dailySummaries.map((s) => ({
          "تاریخ": s.date, "نقدی ورودی": s.cashIn, "کارتی ورودی": s.cardIn,
          "نقدی خروجی": s.cashOut, "کارتی خروجی": s.cardOut,
        })));
        XLSX.utils.book_append_sheet(wb, ws, "بستن روز");
      }

      if (data.blockPayments && data.blockPayments.length) {
        let customers = data.customers || [];
        let ws = XLSX.utils.json_to_sheet(data.blockPayments.map((bp) => {
          let c = customers.find((cu) => cu.id === bp.customerId);
          return {
            "نوع": bp.deviceType === "tournament" ? "تسویه بازی مسابقه" : "تسویه بلوک",
            "شناسه": c ? "#" + (c.displayId || c.id) : bp.customerId,
            "مبلغ": bp.amount, "روش": bp.payType, "تسویه‌کننده": bp.settlerName || "",
            "تاریخ": bp.date ? Jalali.formatDateTime(bp.date) : "",
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "تسویه بلوک/مسابقه");
      }

      if (data.prizePayouts && data.prizePayouts.length) {
        let customers = data.customers || [];
        let tournaments = data.tournaments || [];
        let ws = XLSX.utils.json_to_sheet(data.prizePayouts.map((p) => {
          let c = customers.find((cu) => cu.id === p.customerId);
          let t = tournaments.find((tt) => tt.id === p.tournamentId);
          return {
            "مسابقه": t ? t.name : "", "جایگاه": p.place,
            "شناسه": c ? "#" + (c.displayId || c.id) : p.customerId,
            "مبلغ": p.amount, "روش": p.payType,
            "تاریخ": p.date ? Jalali.formatDateTime(p.date) : "",
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "جوایز");
      }

      if (data.overnightReservations && data.overnightReservations.length) {
        let customers = data.customers || [];
        let allOvernightTx = data.overnightTransactions || [];
        let ws = XLSX.utils.json_to_sheet(data.overnightReservations.map((r) => {
          let c = customers.find((cu) => cu.id === r.customerId);
          let totals = Overnight.computeTotals(r, allOvernightTx);
          return {
            "شناسه": c ? "#" + (c.displayId || c.id) : r.customerId,
            "نوع": r.type === "console" ? "کنسول" : r.type === "billiard" ? "بیلیارد" : "پی‌سی",
            "وضعیت": r.status === "active" ? "فعال" : r.status === "completed" ? "تکمیل‌شده" : "لغوشده",
            "ورودی": totals.charges.entrance, "آیتم‌ها": totals.charges.items, "سایر": totals.charges.other,
            "جمع کل": totals.totalCharges, "پرداخت‌شده": totals.totalPayments,
            "استردادشده": totals.totalRefunds, "بخشیده‌شده": totals.totalWriteoffs,
            "مانده": totals.remainingBalance,
            "ورود": r.checkIn ? Jalali.formatDateTime(r.checkIn) : "",
            "خروج": r.checkOut ? Jalali.formatDateTime(r.checkOut) : "",
          };
        }));
        XLSX.utils.book_append_sheet(wb, ws, "رزروهای شب");
      }

      XLSX.writeFile(wb, "گیمنت_اینفینیتی_بک‌آپ_" + Jalali.formatDate(new Date()).replace(/\//g, "-") + ".xlsx");
      App.toast("فایل اکسل دانلود شد");
    } catch (e) {
      App.toast("خطا در خروجی اکسل: " + e.message);
    }
  }

  async function exportJSON() {
    try {
      let data = await DB.exportAll();
      data._exportDate = new Date().toISOString();
      data._version = 1;
      let json = JSON.stringify(data, null, 2);
      let blob = new Blob([json], { type: "application/json" });
      let url = URL.createObjectURL(blob);
      let a = document.createElement("a");
      a.href = url;
      a.download = "گیمنت_اینفینیتی_بک‌آپ_" + Jalali.formatDate(new Date()).replace(/\//g, "-") + ".json";
      a.click();
      URL.revokeObjectURL(url);
      await DB.logActivity("بک‌آپ JSON", "خروجی کامل داده‌ها");
      App.toast("بک‌آپ دانلود شد");
    } catch (e) {
      App.toast("خطا: " + e.message);
    }
  }

  function triggerImport() {
    document.getElementById("importFile").click();
  }

  async function importJSON(event) {
    let file = event.target.files[0];
    if (!file) return;
    if (!confirm("آیا از بازیابی این فایل مطمئن هستید؟ تمام داده‌های فعلی بازنویسی می‌شوند.")) return;

    try {
      let text = await file.text();
      let data = JSON.parse(text);
      await DB.importAll(data);
      await DB.logActivity("بازیابی بک‌آپ", "بازیابی از فایل JSON");
      App.toast("بازیابی با موفقیت انجام شد. صفحه را رفرش کنید.");
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      App.toast("خطا در بازیابی: " + e.message);
    }
    event.target.value = "";
  }

  async function writeAutoBackup() {
    try {
      let data = await DB.exportAll();
      data._exportDate = new Date().toISOString();
      data._version = 1;
      data._name = "gamenet-auto-backup.json";
      let res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("backup http " + res.status);
      await DB.logActivity("بک‌آپ خودکار", new Date().toLocaleTimeString("fa-IR"));

      backupStatus.lastSuccessAt = new Date().toISOString();
      backupStatus.consecutiveFailures = 0;
      backupStatus.lastError = null;
      App.clearPersistentWarning("backup");
      refresh();
    } catch (e) {
      console.error("auto backup failed", e);
      backupStatus.lastFailureAt = new Date().toISOString();
      backupStatus.lastError = e.message || String(e);
      backupStatus.consecutiveFailures++;
      showBackupFailureWarning();
      refresh();
    }
  }

  // Persistent (not auto-hiding) banner so a silently-failing 10-minute auto
  // backup can't go unnoticed. Re-fires on every failed retry, but
  // App.showPersistentWarning replaces the existing "backup"-keyed banner in
  // place rather than stacking a new one each time.
  function showBackupFailureWarning() {
    App.showPersistentWarning("backup", `
      <strong>⚠ بکاپ خودکار ناموفق بود</strong>
      <div>آخرین خطا: ${Utils.escapeHtml(backupStatus.lastError || "")}</div>
      <div>راه‌حل پیشنهادی: مطمئن شوید سرور برنامه در حال اجراست (فایل start-app.bat را دوباره اجرا کنید)، یا برنامه را ببندید و دوباره باز کنید.</div>
      <button class="btn btn-sm btn-outline mt-2" onclick="Backup.retryAutoBackup()">تلاش مجدد</button>
    `);
  }

  async function retryAutoBackup() {
    await writeAutoBackup();
  }

  return { render, exportExcel, exportJSON, triggerImport, importJSON, writeAutoBackup, retryAutoBackup, refresh };
})();
