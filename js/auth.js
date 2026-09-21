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
      currentUser = { id: user.id, username: user.username, role: user.role, name: user.name, mustChangePassword: !!user.mustChangePassword };
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
      try { currentUser = JSON.parse(saved); }
      catch (e) { sessionStorage.removeItem("gnet_user"); return null; }
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

  function mustChangePassword() {
    return currentUser && currentUser.mustChangePassword;
  }

  async function changeMyPassword(newPassword) {
    var users = await DB.getAll("users");
    var user = users.find(function (u) { return u.id === currentUser.id; });
    if (!user) throw new Error("کاربر یافت نشد");
    user.password = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await DB.put("users", user);
    currentUser.mustChangePassword = false;
    sessionStorage.setItem("gnet_user", JSON.stringify(currentUser));
  }

  // Used for staff clock-out PIN checks: the manager's own account password
  // is always accepted as a valid clock-out credential for any staff member.
  async function verifyManagerPassword(password) {
    if (!password) return false;
    var users = await DB.getAll("users");
    var managers = users.filter(function (u) { return u.role === "manager"; });
    if (managers.length === 0) return false;
    var hashedInput = await hashPassword(password);
    return managers.some(function (u) { return u.password === hashedInput || u.password === password; });
  }

  return { login, logout, getSession, isAdmin, isManager, canAccess, hashPassword, mustChangePassword, changeMyPassword, verifyManagerPassword };
})();
