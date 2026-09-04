const Inventory = (function () {
  async function render(el) {
    let items = await DB.getAll("cafeItems");
    let html = `
      <div class="card">
        <div class="card-header">
          <h2>موجودی انبار/یخچال</h2>
          <button class="btn btn-primary" onclick="Inventory.showAddItem()">+ آیتم جدید</button>
        </div>
        ${items.length === 0 ? '<div class="empty-state">هنوز آیتمی تعریف نشده</div>' : ''}
        ${items.map((item) => `
          <div class="list-row">
            <span class="row-value" style="font-weight:500">${Utils.escapeHtml(item.name)}</span>
            <span class="row-value">${Utils.formatCurrency(item.price)}</span>
            <span class="row-value ${item.unlimited ? '' : (item.stock <= 5 ? 'amount negative' : '')}">${item.unlimited ? 'موجودی: نامحدود' : 'موجودی: ' + item.stock}</span>
            <button class="btn btn-sm btn-outline" onclick="Inventory.showEditItem(${item.id})">ویرایش</button>
            <button class="btn btn-sm btn-danger" onclick="Inventory.deleteItem(${item.id})">حذف</button>
          </div>
        `).join("")}
      </div>
    `;
    el.innerHTML = html;
  }

  function showAddItem() {
    App.openModal(`
      <h2>افزودن آیتم کافی‌شاپ</h2>
      <div class="form-group"><label>نام آیتم</label><input type="text" id="itemName" placeholder="نام"></div>
      <div class="form-group"><label>قیمت (تومان)</label><input type="number" id="itemPrice" placeholder="قیمت" min="0"></div>
      <div class="form-group"><label><input type="checkbox" id="itemUnlimited" onchange="Inventory.toggleStockField()"> موجودی نامحدود (شمارش مهم نیست)</label></div>
      <div class="form-group" id="stockFieldGroup"><label>موجودی اولیه</label><input type="number" id="itemStock" placeholder="موجودی" min="0"></div>
      <div class="form-group"><label>تصویر (اختیاری)</label><input type="file" id="itemImage" accept="image/*"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Inventory.saveItem()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  function toggleStockField() {
    let unlimited = document.getElementById("itemUnlimited").checked;
    document.getElementById("stockFieldGroup").style.display = unlimited ? "none" : "block";
  }

  async function saveItem() {
    let name = document.getElementById("itemName").value.trim();
    let price = parseInt(document.getElementById("itemPrice").value) || 0;
    let unlimited = document.getElementById("itemUnlimited").checked;
    let stock = unlimited ? -1 : (parseInt(document.getElementById("itemStock").value) || 0);
    if (!name) { App.toast("نام آیتم الزامی است"); return; }

    let imageData = null;
    let fileInput = document.getElementById("itemImage");
    if (fileInput.files.length > 0) {
      imageData = await readFileAsDataURL(fileInput.files[0]);
    }

    await DB.add("cafeItems", { name, price, stock, unlimited, image: imageData });
    await DB.logActivity("افزودن آیتم", name);
    App.closeModalForce();
    App.toast("آیتم ذخیره شد");
    refresh();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function showEditItem(id) {
    let item = await DB.get("cafeItems", id);
    if (!item) { App.toast("آیتم یافت نشد"); return; }
    App.openModal(`
      <h2>ویرایش آیتم</h2>
      <div class="form-group"><label>نام</label><input type="text" id="editItemName" value="${Utils.escapeHtml(item.name)}"></div>
      <div class="form-group"><label>قیمت</label><input type="number" id="editItemPrice" value="${item.price}" min="0"></div>
      <div class="form-group"><label><input type="checkbox" id="editItemUnlimited" ${item.unlimited ? 'checked' : ''} onchange="Inventory.toggleEditStockField()"> موجودی نامحدود</label></div>
      <div class="form-group" id="editStockFieldGroup" style="${item.unlimited ? 'display:none' : ''}"><label>موجودی</label><input type="number" id="editItemStock" value="${item.unlimited ? 0 : item.stock}" min="0"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Inventory.updateItem(${id})">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  function toggleEditStockField() {
    let unlimited = document.getElementById("editItemUnlimited").checked;
    document.getElementById("editStockFieldGroup").style.display = unlimited ? "none" : "block";
  }

  async function updateItem(id) {
    let item = await DB.get("cafeItems", id);
    if (!item) { App.toast("آیتم یافت نشد"); return; }
    item.name = document.getElementById("editItemName").value.trim();
    item.price = parseInt(document.getElementById("editItemPrice").value) || 0;
    item.unlimited = document.getElementById("editItemUnlimited").checked;
    item.stock = item.unlimited ? -1 : (parseInt(document.getElementById("editItemStock").value) || 0);
    await DB.put("cafeItems", item);
    await DB.logActivity("ویرایش آیتم", item.name);
    App.closeModalForce();
    App.toast("آیتم ذخیره شد");
    refresh();
  }

  async function deleteItem(id) {
    if (!confirm("آیا از حذف این آیتم مطمئن هستید؟")) return;
    let item = await DB.get("cafeItems", id);
    if (!item) { App.toast("آیتم یافت نشد"); return; }
    await DB.remove("cafeItems", id);
    await DB.logActivity("حذف آیتم", item.name);
    App.toast("آیتم حذف شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-inventory");
    if (el && el.classList.contains("active")) {
      render(el);
    }
  }

  return { render, showAddItem, saveItem, toggleStockField, showEditItem, updateItem, deleteItem, toggleEditStockField, refresh };
})();
