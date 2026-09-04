const Auth = (function () {
  let currentUser = null;

  async function login(username, password) {
    let users = await DB.getAll("users");
    let user = users.find(
      (u) => u.username === username && u.password === password
    );
    if (user) {
      currentUser = { id: user.id, username: user.username, role: user.role, name: user.name };
      localStorage.setItem("gnet_user", JSON.stringify(currentUser));
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
    localStorage.removeItem("gnet_user");
  }

  function getSession() {
    if (currentUser) return currentUser;
    let saved = localStorage.getItem("gnet_user");
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
    const adminAllowed = [
      "consoles", "billiard", "pcs", "cafe", "customers", "debts",
      "inventory", "penalties", "purchases", "staff", "activityLog",
      "backup", "instantReport",
    ];
    return adminAllowed.includes(feature);
  }

  return { login, logout, getSession, isAdmin, isManager, canAccess };
})();
