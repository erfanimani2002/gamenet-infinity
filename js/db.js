const DB = (function () {
  const DB_NAME = "GameNetInfinity";
  const DB_VERSION = 4;
  let db = null;

  const STORES = {
    users: { keyPath: "id", autoIncrement: true },
    customers: { keyPath: "id", autoIncrement: true },
    devices: { keyPath: "id", autoIncrement: true },
    sessions: { keyPath: "id", autoIncrement: true },
    timeBlocks: { keyPath: "id", autoIncrement: true },
    cafeOrders: { keyPath: "id", autoIncrement: true },
    cafeItems: { keyPath: "id", autoIncrement: true },
    penaltyItems: { keyPath: "id", autoIncrement: true },
    purchases: { keyPath: "id", autoIncrement: true },
    staff: { keyPath: "id", autoIncrement: true },
    activityLog: { keyPath: "id", autoIncrement: true },
    settings: { keyPath: "key" },
    debtPayments: { keyPath: "id", autoIncrement: true },
    walletCharges: { keyPath: "id", autoIncrement: true },
    dailySummaries: { keyPath: "date" },
    games: { keyPath: "id", autoIncrement: true },
    tournaments: { keyPath: "id", autoIncrement: true },
    matches: { keyPath: "id", autoIncrement: true },
    tournamentParticipants: { keyPath: "id", autoIncrement: true },
    blockPayments: { keyPath: "id", autoIncrement: true },
  };

  const INDEXES = {
    sessions: [
      { name: "by_device", keyPath: "deviceId" },
      { name: "by_status", keyPath: "status" },
      { name: "by_created", keyPath: "createdAt" },
    ],
    timeBlocks: [{ name: "by_session", keyPath: "sessionId" }],
    cafeOrders: [{ name: "by_created", keyPath: "createdAt" }],
    activityLog: [{ name: "by_timestamp", keyPath: "timestamp" }],
    debtPayments: [{ name: "by_customer", keyPath: "customerId" }],
    walletCharges: [{ name: "by_customer", keyPath: "customerId" }],
    purchases: [{ name: "by_date", keyPath: "date" }],
    matches: [{ name: "by_tournament", keyPath: "tournamentId" }],
    tournamentParticipants: [{ name: "by_tournament", keyPath: "tournamentId" }],
    blockPayments: [{ name: "by_session", keyPath: "sessionId" }],
  };

  function open() {
    return new Promise((resolve, reject) => {
      if (db) {
        resolve(db);
        return;
      }
      let request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        let database = event.target.result;
        for (let storeName in STORES) {
          let store;
          if (!database.objectStoreNames.contains(storeName)) {
            store = database.createObjectStore(storeName, STORES[storeName]);
          } else {
            store = event.target.transaction.objectStore(storeName);
          }
          if (INDEXES[storeName]) {
            INDEXES[storeName].forEach((idx) => {
              if (!store.indexNames.contains(idx.name)) {
                store.createIndex(idx.name, idx.keyPath);
              }
            });
          }
        }
      };
    });
  }

  function getStore(storeName, mode) {
    let tx = db.transaction(storeName, mode || "readonly");
    return tx.objectStore(storeName);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function add(storeName, data) {
    await open();
    let store = getStore(storeName, "readwrite");
    return reqToPromise(store.add(data));
  }

  async function put(storeName, data) {
    await open();
    let store = getStore(storeName, "readwrite");
    return reqToPromise(store.put(data));
  }

  async function get(storeName, key) {
    await open();
    let store = getStore(storeName, "readonly");
    return reqToPromise(store.get(key));
  }

  async function getAll(storeName) {
    await open();
    let store = getStore(storeName, "readonly");
    let result = await reqToPromise(store.getAll());
    return result || [];
  }

  async function getByIndex(storeName, indexName, value) {
    await open();
    let store = getStore(storeName, "readonly");
    let index = store.index(indexName);
    let result = await reqToPromise(index.getAll(value));
    return result || [];
  }

  async function remove(storeName, key) {
    await open();
    let store = getStore(storeName, "readwrite");
    return reqToPromise(store.delete(key));
  }

  async function clear(storeName) {
    await open();
    let store = getStore(storeName, "readwrite");
    return reqToPromise(store.clear());
  }

  async function getSetting(key, defaultValue) {
    await open();
    let store = getStore("settings", "readonly");
    let result = await reqToPromise(store.get(key));
    return result ? result.value : defaultValue;
  }

  async function setSetting(key, value) {
    await open();
    let store = getStore("settings", "readwrite");
    return reqToPromise(store.put({ key: key, value: value }));
  }

  async function exportAll() {
    await open();
    let data = {};
    let storeNames = Object.keys(STORES);
    return new Promise((resolve, reject) => {
      let tx = db.transaction(storeNames, "readonly");
      let completed = 0;
      storeNames.forEach((name) => {
        let store = tx.objectStore(name);
        let req = store.getAll();
        req.onsuccess = () => {
          data[name] = req.result;
          completed++;
          if (completed === storeNames.length) resolve(data);
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function importAll(data) {
    await open();
    let storeNames = Object.keys(STORES).filter((n) => data[n]);
    if (storeNames.length === 0) return;
    return new Promise((resolve, reject) => {
      let tx = db.transaction(storeNames, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      storeNames.forEach((name) => {
        let store = tx.objectStore(name);
        store.clear();
        let items = data[name] || [];
        items.forEach((item) => { store.add(item); });
      });
    });
  }

  function logActivity(event, details, userId) {
    return add("activityLog", {
      event: event,
      details: details || "",
      userId: userId || null,
      timestamp: new Date().toISOString(),
    });
  }

  async function initDefaults() {
    await open();
    let pricing = await getSetting("pricing");
    if (!pricing) {
      await setSetting("pricing", {
        consoleRates: { 1: 5000, 2: 7000, 3: 9000, 4: 11000 },
        billiardRates: { 2: 8000, 4: 12000 },
        pcRate: 3000,
        roundingUnit: 1000,
      });
    }
    let devices = await getAll("devices");
    if (devices.length === 0) {
      for (let i = 1; i <= 4; i++) {
        await add("devices", { name: "کنسول " + i, type: "console", status: "free", games: [] });
      }
      for (let i = 1; i <= 3; i++) {
        await add("devices", { name: "میز بیلیارد " + i, type: "billiard", status: "free", games: [] });
      }
      for (let i = 1; i <= 5; i++) {
        await add("devices", { name: "پی‌سی " + i, type: "pc", status: "free", games: [] });
      }
    }
    let users = await getAll("users");
    if (users.length === 0) {
      await add("users", { username: "admin", password: "admin", role: "admin", name: "ادمین" });
      await add("users", { username: "manager", password: "manager", role: "manager", name: "مدیر" });
    }
  }

  return {
    open,
    add,
    put,
    get,
    getAll,
    getByIndex,
    remove,
    clear,
    getSetting,
    setSetting,
    exportAll,
    importAll,
    logActivity,
    initDefaults,
  };
})();
