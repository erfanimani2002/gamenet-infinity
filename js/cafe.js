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
    if (!item.unlimited && item.stock <= 0) {
      App.toast("موجودی تمام شده");
      return;
    }
    let existing = cart.find((c) => c.id === itemId);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ id: itemId, name: item.name, price: item.price, qty: 1 });
    }
    if (!item.unlimited) {
      item.stock--;
      await DB.put("cafeItems", item);
    }
    updateCartDisplay();
    App.toast("به سبد اضافه شد");
  }

  function removeFromCart(index) {
    let item = cart[index];
    DB.get("cafeItems", item.id).then((cafeItem) => {
      if (cafeItem && !cafeItem.unlimited) {
        cafeItem.stock += item.qty;
        DB.put("cafeItems", cafeItem);
      }
    });
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
          ${customers.map((c) => `
            <div class="list-row customer-pick" data-name="${(c.firstName+' '+c.lastName).toLowerCase()}" onclick="Cafe.pickCustomer(${c.id})" style="cursor:pointer">
              <span class="row-label">#${c.displayId || c.id}</span>
            </div>
          `).join("")}
        </div>
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
      row.style.display = row.dataset.name.includes(q) ? "flex" : "none";
    });
  }

  async function pickCustomer(id) {
    selectedCustomerId = id;
    let c = await DB.get("customers", id);
    document.getElementById("cafeSelectedId").innerHTML = c ? "#" + (c.displayId || c.id) : "#" + id;
  }

  async function placeOrder() {
    if (!selectedCustomerId) {
      App.toast("شناسه مشتری را انتخاب کنید");
      return;
    }
    let payType = document.getElementById("cafePayType").value;
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    if (payType === "wallet") {
      let customer = await DB.get("customers", selectedCustomerId);
      if (!customer) { App.toast("مشتری یافت نشد"); return; }
      if (customer.wallet >= total) {
        customer.wallet -= total;
        customer.totalPaid = (customer.totalPaid || 0) + total;
        await DB.put("customers", customer);
      } else {
        let remaining = total - customer.wallet;
        customer.totalPaid = (customer.totalPaid || 0) + customer.wallet;
        customer.wallet = 0;
        customer.debt = (customer.debt || 0) + remaining;
        await DB.put("customers", customer);
      }
    } else if (payType === "debt") {
      let customer = await DB.get("customers", selectedCustomerId);
      if (!customer) { App.toast("مشتری یافت نشد"); return; }
      customer.debt = (customer.debt || 0) + total;
      await DB.put("customers", customer);
    } else {
      let customer = await DB.get("customers", selectedCustomerId);
      if (customer) {
        customer.totalPaid = (customer.totalPaid || 0) + total;
        await DB.put("customers", customer);
      }
    }

    let order = {
      customerId: selectedCustomerId,
      items: [...cart],
      total: total,
      payType: payType,
      createdAt: new Date().toISOString(),
    };

    await DB.add("cafeOrders", order);
    await DB.logActivity("سفارش کافی‌شاپ", "شناسه #" + selectedCustomerId + " | مبلغ: " + Utils.formatCurrency(total) + " | " + payType);

    cart = [];
    selectedCustomerId = null;
    App.closeModalForce();
    App.toast("سفارش ثبت شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-cafe");
    if (el && el.classList.contains("active")) {
      cart = [];
      render(el);
    }
  }

  return { render, addToCart, removeFromCart, showNewOrder, placeOrder, filterCustomers, pickCustomer, refresh };
})();
