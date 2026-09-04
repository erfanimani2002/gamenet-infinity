(async function seedTestData() {
  const DB_NAME = "GameNetInfinity";
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      let req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        let db = e.target.result;
        let stores = {
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
        };
        let indexes = {
          sessions: [["by_device", "deviceId"], ["by_status", "status"], ["by_created", "createdAt"]],
          timeBlocks: [["by_session", "sessionId"]],
          cafeOrders: [["by_created", "createdAt"]],
          activityLog: [["by_timestamp", "timestamp"]],
          debtPayments: [["by_customer", "customerId"]],
          walletCharges: [["by_customer", "customerId"]],
          purchases: [["by_date", "date"]],
        };
        for (let [name, opts] of Object.entries(stores)) {
          if (!db.objectStoreNames.contains(name)) {
            let store = db.createObjectStore(name, { keyPath: opts.keyPath, autoIncrement: opts.autoIncrement });
            if (indexes[name]) {
              indexes[name].forEach(([idxName, idxKey]) => store.createIndex(idxName, idxKey));
            }
          }
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function addRec(db, store, rec) {
    return new Promise((resolve, reject) => {
      let tx = db.transaction(store, "readwrite");
      let req = tx.objectStore(store).add(rec);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(db, store) {
    return new Promise((resolve, reject) => {
      let tx = db.transaction(store, "readonly");
      let req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[rand(0, arr.length - 1)]; }

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
  function gregorianToJalali(gy, gm, gd) {
    var jdn = toJDN(gy, gm, gd);
    var d = jdn - 1948320;
    var jy = 1;
    var leapYears = [1,5,9,13,17,22,26,30];
    while (d > 0) { var yd = (leapYears.indexOf(jy%33)>=0)?366:365; if (d < yd) break; d -= yd; jy++; }
    var jm = 1;
    while (d > 0) { var md = jm<=6?31:jm<=11?30:((leapYears.indexOf(jy%33)>=0)?30:29); if (d < md) break; d -= md; jm++; }
    return { year: jy, month: jm, day: d + 1 };
  }

  var LEAP = [1,5,9,13,17,22,26,30];

  const firstNames = ["علي","رضا","محمد","امير","سعيد","حسين","جواد","مهدی","احمد","فرهاد","بهزاد","داريوش","کاوه","آرش","بهرام","پدرام","میلاد","اميد","پوريا","آرمان","محمدرضا","سينا","بهنام","فريد","وحيد","محمدمهدی","پارسا","دانیال","آرمین","کيان","روزين","آرام","آريان","سامان","بنيامين","فرزين","hamid","javad","mehrdad","nima","omid","peyman","reza","saeed","mohammad","ali","reza","hasan","hossein"];
  const lastNames = ["احمدي","رضوي","محمدي","عليزاده","حيدري","فتحي","کريمي","نوري","صاري","سلطاني"," Hashemi","موسوي","کريمي","مرادي","احمدي","حسيني","قورباني","جعفري","razavi","fallahi","zakeri","rafiei","sharifi","taheri","bakhtiari","تيموري","jamali","shahrokhi","bahadori","amiri","bayat","cheloi","daghighi","esfahani","ghasemi","heidari","jalili","khosravi","mohebbi","najafi","rahimi","salehi","shafiei","yazdani","karimi","moradi"];
  const phonePrefixes = ["0912","0913","0914","0915","0916","0917","0918","0919","0935","0936","0937","0938","0939"];
  const cafeItemNames = ["Chai","Nescafe","Espresso","Hot Chocolate","Water","Soda","Beer","Chips","Puff","Biscuit","Chocolate","Ice Cream","Sandwich","Pizza","Burger","Salad","Macaroni","Tea"];
  const cafeItemNamesFA = ["چاي","نسکافه","قهوه اسپرسو","هات چاکلت","آب معدنی","نوشابه","دلستر","چيپس","پفک","بيسکوييت","شکلات","بستني","ساندويچ","پيتزا","همبرگر","سالاد","ماکاروني","چاي"];

  console.log("Starting test data generation...");
  let db = await openDB();

  let users = await getAll(db, "users");
  if (users.length === 0) {
    await addRec(db, "users", { username: "admin", password: "admin", role: "admin", name: "ادمین" });
    await addRec(db, "users", { username: "manager", password: "manager", role: "manager", name: "مدیر" });
    console.log("Created users");
  }

  let devices = await getAll(db, "devices");
  if (devices.length === 0) {
    for (let i = 1; i <= 10; i++) await addRec(db, "devices", { name: "PS5-" + i, type: "console", status: "free", games: [] });
    for (let i = 1; i <= 10; i++) await addRec(db, "devices", { name: "Pool-" + i, type: "billiard", status: "free", games: [] });
    for (let i = 1; i <= 10; i++) await addRec(db, "devices", { name: "PC-" + i, type: "pc", status: "free", games: [] });
    console.log("Created 30 devices");
  }

  let cafeItems = await getAll(db, "cafeItems");
  if (cafeItems.length === 0) {
    let prices = [3000,5000,8000,7000,2000,3000,4000,5000,3000,2000,5000,4000,15000,20000,18000,12000,15000,3000];
    for (let i = 0; i < cafeItemNamesFA.length; i++) {
      await addRec(db, "cafeItems", { name: cafeItemNamesFA[i], price: prices[i], category: "cafe", unlimited: true, stock: 9999 });
    }
    console.log("Created cafe items");
  }

  let pItems = await getAll(db, "penaltyItems");
  if (pItems.length === 0) {
    await addRec(db, "penaltyItems", { name: "جریمه دیرکرد", amount: 10000, type: "penalty" });
    await addRec(db, "penaltyItems", { name: "تخفیف ویژه", amount: 5000, type: "discount" });
  }

  let settings = await getAll(db, "settings");
  if (settings.length === 0) {
    await addRec(db, "settings", { key: "pricing", value: { consoleRates: {1:5000,2:7000,3:9000,4:11000}, billiardRates: {2:8000,4:12000}, pcRate: 3000, roundingUnit: 1000 } });
  }

  let staff = await getAll(db, "staff");
  if (staff.length === 0) {
    await addRec(db, "staff", { name: "علی رضایی", role: "cashier", phone: "09121234567", active: true, shifts: [], consumption: [] });
    await addRec(db, "staff", { name: "رضا محمدی", role: "cashier", phone: "09131234567", active: true, shifts: [], consumption: [] });
  }

  let existingCustomers = await getAll(db, "customers");
  let customerIds = existingCustomers.map(c => c.id);
  let maxDisplayId = 0;
  existingCustomers.forEach((c) => {
    let num = parseInt(c.displayId);
    if (!isNaN(num) && num > maxDisplayId) maxDisplayId = num;
  });
  let nextDisplayId = maxDisplayId + 1;

  if (existingCustomers.length < 150) {
    for (let i = existingCustomers.length; i < 150; i++) {
      let cid = await addRec(db, "customers", {
        firstName: pick(firstNames),
        lastName: pick(lastNames),
        phone: pick(phonePrefixes) + String(rand(1000000, 9999999)),
        wallet: rand(0, 5) === 0 ? rand(50000, 500000) : 0,
        discount: rand(1, 10) === 1 ? rand(5, 15) : 0,
        debt: rand(1, 8) === 1 ? rand(10000, 200000) : 0,
        displayId: nextDisplayId,
        nationalCode: String(rand(1000000000, 9999999999)),
        rank: "bronze",
        totalPaid: 0,
        tournamentInterests: [],
        createdAt: new Date(Date.now() - rand(0, 90) * 86400000).toISOString(),
      });
      customerIds.push(cid);
      nextDisplayId++;
    }
  }
  console.log("Customers ready: " + customerIds.length);

  let allDevices = await getAll(db, "devices");
  let consoleDevs = allDevices.filter(d => d.type === "console");
  let billiardDevs = allDevices.filter(d => d.type === "billiard");
  let pcDevs = allDevices.filter(d => d.type === "pc");
  let allCafeItems = await getAll(db, "cafeItems");

  let today = new Date();
  let sessionsCreated = 0, ordersCreated = 0, purchasesCreated = 0;

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    let date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    let jd = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    let numCustomersToday = rand(100, 130);
    let dayCids = [];
    for (let i = 0; i < numCustomersToday; i++) {
      let c = pick(customerIds);
      if (!dayCids.includes(c)) dayCids.push(c);
    }

    let devGroups = [
      { devs: consoleDevs, type: "console", min: 2, max: 4 },
      { devs: billiardDevs, type: "billiard", min: 2, max: 3 },
      { devs: pcDevs, type: "pc", min: 3, max: 5 },
    ];

    for (let dg of devGroups) {
      for (let dev of dg.devs) {
        let numSessions = rand(dg.min, dg.max);
        for (let s = 0; s < numSessions; s++) {
          let startH = rand(6, 23);
          let startM = rand(0, 59);
          let durMin = rand(30, 300);
          let endTotalMin = startH * 60 + startM + durMin;
          let endH = Math.floor(endTotalMin / 60) % 24;
          let endM = endTotalMin % 60;

          let startTime = new Date(date);
          startTime.setHours(startH, startM, 0, 0);
          let endTime = new Date(date);
          endTime.setHours(endH, endM, 0, 0);
          if (endH < startH) endTime.setDate(endTime.getDate() + 1);

          let hours = (endTime - startTime) / 3600000;
          let rate = dg.type === "console" ? pick([5000,7000,9000,11000]) : dg.type === "billiard" ? pick([8000,12000]) : 3000;
          let price = Math.max(1000, Math.round(hours * rate / 1000) * 1000);
          let cc = dg.type === "console" ? rand(1,4) : dg.type === "billiard" ? pick([2,4]) : 1;
          let ids = [pick(dayCids)];
          if (rand(1,4) === 1) ids.push(pick(dayCids));

          let payType = pick(["cash","card","wallet","debt"]);
          let items = [];
          let ni = rand(0, 3);
          for (let it = 0; it < ni; it++) {
            let ci = pick(allCafeItems);
            items.push({ name: ci.name, price: ci.price, qty: 1, type: "cafe" });
          }
          let itemsTotal = items.reduce((s, i) => s + i.price * i.qty, 0);

          await addRec(db, "sessions", {
            deviceId: dev.id, deviceType: dg.type, ids: ids, controllerCount: cc,
            timeBlocks: [{ startTime: startTime.toISOString(), endTime: endTime.toISOString(), rate: rate, controllerCount: cc, price: price, settled: true, settlePayType: payType, settlerName: pick(["علی رضایی","رضا محمدی"]), settledAt: endTime.toISOString() }],
            items: items, status: "settled", createdAt: startTime.toISOString(), settledAt: endTime.toISOString(),
            settlePayType: payType, settleAmount: price + itemsTotal, settlerName: pick(["علی رضایی","رضا محمدی"]),
          });
          sessionsCreated++;
        }
      }
    }

    let numOrders = rand(20, 40);
    for (let o = 0; o < numOrders; o++) {
      let ot = new Date(date);
      ot.setHours(rand(8, 23), rand(0, 59), 0, 0);
      let orderItems = [];
      for (let it = 0; it < rand(1, 4); it++) {
        let ci = pick(allCafeItems);
        orderItems.push({ name: ci.name, price: ci.price, qty: rand(1, 3) });
      }
      await addRec(db, "cafeOrders", {
        customerId: pick(dayCids), items: orderItems,
        total: orderItems.reduce((s, i) => s + i.price * i.qty, 0),
        payType: pick(["cash","card"]), createdAt: ot.toISOString(),
      });
      ordersCreated++;
    }

    let numPurchases = rand(5, 15);
    let purchaseDescs = ["آب معدنی","نوشابه","چیپس","پفک","بیسکوییت","شکلات","بستنی","لبنیات","نان","مرغ","برنج","روغن","شکر","چای","قهوه","شیرینی","میوه","سبزی","گوشت","ماکارونی"];
    for (let p = 0; p < numPurchases; p++) {
      let pt = new Date(date);
      pt.setHours(rand(8, 20), rand(0, 59), 0, 0);
      let payType = pick(["cash","pasargad","other"]);
      let thirdParty = payType === "other" ? pick(["فردین","bilal","amir","reza","mehran"]) : "";
      let settled = payType === "other" && rand(1,3) === 1;
      await addRec(db, "purchases", {
        category: pick(["items","fridge"]), description: pick(purchaseDescs),
        amount: rand(50000, 2000000), paymentType: payType, thirdParty: thirdParty,
        date: pt.toISOString(), settled: settled,
        settledWith: settled ? pick(["cash","pasargad"]) : null,
        settledAt: settled ? pt.toISOString() : null,
      });
      purchasesCreated++;
    }

    let numDebts = rand(2, 5);
    for (let dp = 0; dp < numDebts; dp++) {
      let dt = new Date(date);
      dt.setHours(rand(10, 22), rand(0, 59), 0, 0);
      await addRec(db, "debtPayments", {
        customerId: pick(dayCids), amount: rand(20000, 500000),
        paymentType: pick(["cash","card"]), date: dt.toISOString(),
        note: pick(["پرداخت نقدی","تسویه بدهی",""]),
      });
    }

    let numCharges = rand(1, 3);
    for (let c = 0; c < numCharges; c++) {
      let ct = new Date(date);
      ct.setHours(rand(10, 22), rand(0, 59), 0, 0);
      await addRec(db, "walletCharges", {
        customerId: pick(dayCids), amount: rand(50000, 500000),
        paymentType: pick(["cash","card"]), date: ct.toISOString(),
      });
    }

    if (dayOffset % 5 === 0) {
      console.log("Day " + (30 - dayOffset) + "/30 - " + jd.year + "/" + String(jd.month).padStart(2,"0") + "/" + String(jd.day).padStart(2,"0") + " - " + numCustomersToday + " customers");
    }
  }

  console.log("\n=== DONE ===");
  console.log("Sessions: " + sessionsCreated);
  console.log("Orders: " + ordersCreated);
  console.log("Purchases: " + purchasesCreated);
  console.log("Customers: " + customerIds.length);
  console.log("============");

  db.close();
  alert("داده‌ها ایجاد شد! صفحه را رفرش کنید.");
})();
