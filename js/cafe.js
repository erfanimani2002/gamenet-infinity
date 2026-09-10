const Cafe = (function () {
  let cart = [];

  async function render(el) {
    let items = await DB.getAll("cafeItems");

    let html = `
      <div class="card">
        <div class="card-header">
          <h2>کافی‌شاپ - سفارش آزاد</h2>
          <button class="btn btn-primary" onclick="Cafe.showNewOrder()">+ سفارش جدید</button>
        </div>
        <h3 style="margin-bottom:8px">آیتم‌های موجود</h3>
        <div class="item-grid">
          ${items.map((item) => `
            <div class="item-card" onclick="Cafe.addToCart(${item.id})">
              ${item.image ? `<img class="item-img" src="${item.image}" alt="${Utils.escapeHtml(item.name)}">` : `<div class="item-img item-img-placeholder">${(typeof Icons !== "undefined" ? Icons.get("cafe", 24) : "")}</div>`}
              <div class="item-name">${Utils.escapeHtml(item.name)}</div>
              <div class="item-price">${Utils.formatCurrency(item.price)}</div>
              <div class="item-stock">${item.unlimited ? 'موجودی: نامحدود' : 'موجودی: ' + item.stock}</div>
            </div>
          `).join("")}
          ${items.length === 0 ? '<div class="text-muted">هنوز آیتمی تعریف نشده</div>' : ''}
        </div>
        <hr class="section-divider">
        <h3>سبد خرید</h3>
        <div id="cafeCart">
          ${renderCart()}
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  function renderCart() {
    if (cart.length === 0) {
      return '<div class="text-muted text-sm">سبد خالی است</div>';
    }
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    return `
      ${cart.map((item, i) => `
        <div class="list-row">
          <span class="row-value">${Utils.escapeHtml(item.name)}</span>
          <span class="row-value">x${item.qty}</span>
          <span class="row-value amount">${Utils.formatCurrency(item.price * item.qty)}</span>
          <button class="btn btn-sm btn-danger" onclick="Cafe.removeFromCart(${i})">حذف</button>
        </div>
      `).join("")}
      <div class="list-row font-bold">
        <span class="row-label">جمع کل</span>
        <span class="row-value amount">${Utils.formatCurrency(total)}</span>
      </div>
    `;
  }

  async function addToCart(itemId) {
    let item = await DB.get("cafeItems", itemId);
    if (!item) return;
    let existing = cart.find((c) => c.id === itemId);
    let qtyAlreadyInCart = existing ? existing.qty : 0;
    if (!item.unlimited && item.stock <= qtyAlreadyInCart) {
      App.toast("موجودی تمام شده");
      return;
    }
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ id: itemId, name: item.name, price: item.price, qty: 1 });
    }
    updateCartDisplay();
    App.toast("به سبد اضافه شد");
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartDisplay();
  }

  function updateCartDisplay() {
    let el = document.getElementById("cafeCart");
    if (el) el.innerHTML = renderCart();
  }

  async function showNewOrder() {
    if (cart.length === 0) {
      App.toast("سبد خرید خالی است");
      return;
    }

    let customers = await DB.getAll("customers");
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    App.openModal(`
      <h2>ثبت سفارش کافی‌شاپ</h2>
      <div class="form-group">
        <label>انتخاب شناسه مشتری</label>
        <input type="text" id="cafeSearch" placeholder="جستجو..." oninput="Cafe.filterCustomers()">
        <div style="max-height:150px;overflow-y:auto;margin-top:8px;">
          ${customers.map((c) => {
            let fullName = ((c.firstName || "") + " " + (c.lastName || "")).trim();
            let idLabel = "#" + (c.displayId || c.id);
            let searchLabel = idLabel + (fullName ? " " + fullName : "");
            return `<div class="list-row customer-pick" data-search="${searchLabel}" onclick="Cafe.pickCustomer(${c.id})" style="cursor:pointer">
              <span class="row-label">${fullName ? fullName + " " + idLabel : idLabel}</span>
            </div>`;
          }).join("")}
        </div>
        <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="Cafe.quickCreateCustomer()">+ مشتری جدید سریع</button>
      </div>
      <div class="form-group">
        <label>شناسه انتخاب شده</label>
        <div id="cafeSelectedId" class="text-muted text-sm">انتخاب نشده</div>
      </div>
      <div class="form-group">
        <label>روش پرداخت</label>
        <select id="cafePayType">
          <option value="cash">نقدی</option>
          <option value="card">کارتی</option>
          <option value="wallet">کیف‌پول</option>
          <option value="debt">بدهکاری</option>
        </select>
      </div>
      <div class="list-row font-bold">
        <span class="row-label">جمع کل</span>
        <span class="row-value amount">${Utils.formatCurrency(total)}</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-success" onclick="Cafe.placeOrder()">ثبت سفارش</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  let selectedCustomerId = null;

  function filterCustomers() {
    let q = document.getElementById("cafeSearch").value.toLowerCase();
    document.querySelectorAll(".customer-pick").forEach((row) => {
      row.style.display = (row.dataset.search || "").includes(q) ? "flex" : "none";
    });
  }

  async function pickCustomer(id) {
    selectedCustomerId = id;
    let customers = await DB.getAll("customers");
    document.getElementById("cafeSelectedId").innerHTML = Utils.renderCustomerId(id, customers);
  }

  // "مشتری جدید سریع" — same inline create used by the console/billiard/pc
  // session pickers; on creation it selects the new customer and re-renders the
  // order modal so its ID shows as selected.
  function quickCreateCustomer() {
    Customers.promptQuickCreate(async (result) => {
      pickCustomer(result.id);
      await showNewOrder();
    });
  }

  async function placeOrder() {
    await Utils.guardDoubleClick(async () => {
      if (!selectedCustomerId) {
        App.toast("شناسه مشتری را انتخاب کنید");
        return { success: false };
      }
      let payType = document.getElementById("cafePayType").value;
      let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      if (total <= 0) { App.toast("سبد خرید خالی است"); return { success: false }; }

      // Re-check stock now (reserved at checkout, not add-to-cart) and capture
      // the live cafeItems rows so stock can be deducted in the SAME atomic
      // transaction as the payment and order write below.
      let cafeItemMap = {};
      for (let cartItem of cart) {
        let dbItem = await DB.get("cafeItems", cartItem.id);
        if (dbItem && !dbItem.unlimited && dbItem.stock < cartItem.qty) {
          App.toast("موجودی «" + dbItem.name + "» کافی نیست");
          return { success: false };
        }
        cafeItemMap[cartItem.id] = dbItem;
      }

      // ONE WALLET RULE: computePaymentUpdate splits an insufficient wallet into
      // wallet + debt legs and returns the effective payType + payBreakdown, so
      // the order never records a fake "wallet" payType on top of hidden debt.
      let customer = await DB.get("customers", selectedCustomerId);
      if (!customer) { App.toast("مشتری یافت نشد"); return { success: false }; }
      let payResult = Utils.computePaymentUpdate(customer, total, payType);
      if (!payResult.success) { App.toast("پرداخت ناموفق بود"); return { success: false }; }

      let order = {
        customerId: selectedCustomerId,
        items: cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total: total,
        payType: payResult.payType,
        payBreakdown: payResult.payBreakdown,
        createdAt: new Date().toISOString(),
      };

      // customers + cafeItems (stock) + cafeOrders write in one transaction, so
      // a crash can't pay without recording the order, or deduct stock without a
      // payment. Nothing is committed on failure, so no rollback is needed.
      let ops = [{ store: "customers", type: "put", data: payResult.customer }];
      for (let cartItem of cart) {
        let dbItem = cafeItemMap[cartItem.id];
        if (dbItem && !dbItem.unlimited) {
          dbItem.stock -= cartItem.qty;
          ops.push({ store: "cafeItems", type: "put", data: dbItem });
        }
      }
      ops.push({ store: "cafeOrders", type: "add", data: order });

      await DB.runAtomic(ops);
      await DB.logActivity("سفارش کافی‌شاپ", "شناسه #" + selectedCustomerId + " | مبلغ: " + Utils.formatCurrency(total) + " | " + payResult.payType);

      cart = [];
      selectedCustomerId = null;
      App.closeModalForce();
      App.toast("سفارش ثبت شد");
      refresh();
      return { success: true };
    });
  }

  function refresh() {
    let el = document.getElementById("tab-cafe");
    if (el && el.classList.contains("active")) {
      cart = [];
      render(el);
    }
  }

  return { render, addToCart, removeFromCart, showNewOrder, placeOrder, filterCustomers, pickCustomer, quickCreateCustomer, refresh };
})();
