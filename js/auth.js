const Auth = (function () {
  let currentUser = null;

  async function hashPassword(password) {
    var encoder = new TextEncoder();
    var data = encoder.encode(password);
    var hashBuffer = await crypto.subtle.digest("SHA-256", data);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  async function login(username, password) {
    var users = await DB.getAll("users");
    var hashedInput = await hashPassword(password);
    var user = null;
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (u.username !== username) continue;
      if (u.password === hashedInput) { user = u; break; }
      if (u.password === password) {
        user = u;
        u.password = hashedInput;
        await DB.put("users", u);
        break;
      }
    }
    if (user) {
      currentUser = { id: user.id, username: user.username, role: user.role, name: user.name };
      sessionStorage.setItem("gnet_user", JSON.stringify(currentUser));
      await DB.logActivity("لاگین", "ورود کاربر: " + user.username, currentUser.id);
      return currentUser;
    } else {
      throw new Error("نام کاربری یا رمز عبور اشتباه است");
    }
  }

  async function logout() {
    if (currentUser) {
      await DB.logActivity("لاگ‌اوت", "خروج کاربر: " + currentUser.username, currentUser.id);
    }
    currentUser = null;
    sessionStorage.removeItem("gnet_user");
  }

  function getSession() {
    if (currentUser) return currentUser;
    var saved = sessionStorage.getItem("gnet_user");
    if (saved) {
      currentUser = JSON.parse(saved);
      return currentUser;
    }
    return null;
  }

  function isAdmin() {
    return currentUser && currentUser.role === "admin";
  }

  function isManager() {
    return currentUser && currentUser.role === "manager";
  }

  function canAccess(feature) {
    if (isManager()) return true;
    var adminAllowed = [
      "consoles", "billiard", "pcs", "cafe", "customers", "customerClub", "debts",
      "inventory", "penalties", "purchases", "staff", "activityLog",
      "backup", "instantReport", "reports", "games", "tournaments",
    ];
    return adminAllowed.includes(feature);
  }

  return { login, logout, getSession, isAdmin, isManager, canAccess, hashPassword };
})();
