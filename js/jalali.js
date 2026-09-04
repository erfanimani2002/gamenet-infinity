const Jalali = (function () {
  function toJDN(gy, gm, gd) {
    var a = Math.floor((14 - gm) / 12);
    var y = gy + 4800 - a;
    var m = gm + 12 * a - 3;
    return gd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  }

  function fromJDN(jdn) {
    var l = jdn + 68569;
    var n = Math.floor(4 * l / 146097);
    l = l - Math.floor((146097 * n + 3) / 4);
    var i = Math.floor(4000 * (l + 1) / 1461001);
    l = l - Math.floor(1461 * i / 4) + 31;
    var j = Math.floor(80 * l / 2447);
    var d = l - Math.floor(2447 * j / 80);
    l = Math.floor(j / 11);
    var m = j + 2 - 12 * l;
    var y = 100 * (n - 49) + i + l;
    return { year: y, month: m, day: d };
  }

  function isJalaliLeapYear(jy) {
    return [1, 5, 9, 13, 17, 22, 26, 30].indexOf(jy % 33) >= 0;
  }

  function jalaliMonthDays(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isJalaliLeapYear(jy) ? 30 : 29;
  }

  function gregorianToJalali(gy, gm, gd) {
    var jdn = toJDN(gy, gm, gd);
    var d = jdn - 1948320;
    var jy = 1;
    while (d > 0) {
      var yd = isJalaliLeapYear(jy) ? 366 : 365;
      if (d < yd) break;
      d -= yd;
      jy++;
    }
    var jm = 1;
    while (d > 0) {
      var md = jalaliMonthDays(jy, jm);
      if (d < md) break;
      d -= md;
      jm++;
    }
    return { year: jy, month: jm, day: d + 1 };
  }

  function jalaliToGregorian(jy, jm, jd) {
    var d = 0;
    for (var y = 1; y < jy; y++) d += isJalaliLeapYear(y) ? 366 : 365;
    for (var m = 1; m < jm; m++) d += jalaliMonthDays(jy, m);
    d += jd - 1;
    return fromJDN(d + 1948320);
  }

  function formatDate(date) {
    var d = date instanceof Date ? date : new Date(date);
    var j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return j.year + "/" + String(j.month).padStart(2, "0") + "/" + String(j.day).padStart(2, "0");
  }

  function formatDateTime(date) {
    var d = date instanceof Date ? date : new Date(date);
    var j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return j.year + "/" + String(j.month).padStart(2, "0") + "/" + String(j.day).padStart(2, "0") + " " + h + ":" + m;
  }

  function timeString(date) {
    var d = date instanceof Date ? date : new Date(date);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function getJalaliMonthDays(jy, jm) {
    return jalaliMonthDays(jy, jm);
  }

  function getTodayJalali() {
    var now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function getJalaliFirstDayOfMonth(jy, jm) {
    var g = jalaliToGregorian(jy, jm, 1);
    return new Date(g.year, g.month - 1, g.day);
  }

  return {
    gregorianToJalali,
    jalaliToGregorian,
    formatDate,
    formatDateTime,
    timeString,
    getJalaliMonthDays,
    isJalaliLeapYear,
    getTodayJalali,
    getJalaliFirstDayOfMonth,
  };
})();
