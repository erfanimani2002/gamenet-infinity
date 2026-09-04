const Penalties = (function () {
  async function render(el) {
    let items = await DB.getAll("penaltyItems");
    let html = `
      <div class="card">
        <div class="card-header">
          <h2>آیتم‌های جریمه و تخفیف</h2>
          <button class="btn btn-primary" onclick="Penalties.showAddItem()">+ آیتم جدید</button>
        </div>
        ${items.length === 0 ? '<div class="empty-state">هنوز آیتمی تعریف نشده</div>' : ''}
        ${items.map((item) => `
          <div class="list-row ${item.type === 'penalty' ? 'penalty-item' : 'discount-item'}">
            <span class="row-value" style="font-weight:500">${Utils.escapeHtml(item.name)}</span>
            <span class="row-value ${item.type === 'penalty' ? 'amount negative' : 'amount positive'}">${item.type === 'penalty' ? 'جریمه' : 'تخفیف'}: ${Utils.formatCurrency(item.amount)}</span>
            <button class="btn btn-sm btn-outline" onclick="Penalties.showEditItem(${item.id})">ویرایش</button>
            <button class="btn btn-sm btn-danger" onclick="Penalties.deleteItem(${item.id})">حذف</button>
          </div>
        `).join("")}
      </div>
    `;
    el.innerHTML = html;
  }

  function showAddItem() {
    App.openModal(`
      <h2>افزودن آیتم جریمه/تخفیف</h2>
      <div class="form-group"><label>نام</label><input type="text" id="penName" placeholder="نام آیتم"></div>
      <div class="form-group"><label>مبلغ (تومان)</label><input type="number" id="penAmount" placeholder="مبلغ" min="0"></div>
      <div class="form-group"><label>نوع</label>
        <select id="penType"><option value="penalty">جریمه</option><option value="discount">تخفیف</option></select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Penalties.saveItem()">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function saveItem() {
    let name = document.getElementById("penName").value.trim();
    let amount = parseInt(document.getElementById("penAmount").value) || 0;
    let type = document.getElementById("penType").value;
    if (!name) { App.toast("نام الزامی است"); return; }

    await DB.add("penaltyItems", { name, amount, type });
    await DB.logActivity("افزودن آیتم جریمه/تخفیف", name + " (" + (type === 'penalty' ? 'جریمه' : 'تخفیف') + ")");
    App.closeModalForce();
    App.toast("آیتم ذخیره شد");
    refresh();
  }

  async function showEditItem(id) {
    let item = await DB.get("penaltyItems", id);
    App.openModal(`
      <h2>ویرایش آیتم</h2>
      <div class="form-group"><label>نام</label><input type="text" id="editPenName" value="${Utils.escapeHtml(item.name)}"></div>
      <div class="form-group"><label>مبلغ</label><input type="number" id="editPenAmount" value="${item.amount}" min="0"></div>
      <div class="form-group"><label>نوع</label>
        <select id="editPenType"><option value="penalty" ${item.type==='penalty'?'selected':''}>جریمه</option><option value="discount" ${item.type==='discount'?'selected':''}>تخفیف</option></select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="Penalties.updateItem(${id})">ذخیره</button>
        <button class="btn btn-outline" onclick="App.closeModalForce()">انصراف</button>
      </div>
    `);
  }

  async function updateItem(id) {
    let item = await DB.get("penaltyItems", id);
    item.name = document.getElementById("editPenName").value.trim();
    item.amount = parseInt(document.getElementById("editPenAmount").value) || 0;
    item.type = document.getElementById("editPenType").value;
    await DB.put("penaltyItems", item);
    await DB.logActivity("ویرایش آیتم جریمه/تخفیف", item.name + " (" + (item.type === 'penalty' ? 'جریمه' : 'تخفیف') + ")");
    App.closeModalForce();
    App.toast("ذخیره شد");
    refresh();
  }

  async function deleteItem(id) {
    if (!confirm("حذف شود؟")) return;
    let item = await DB.get("penaltyItems", id);
    if (!item) { App.toast("آیتم یافت نشد"); return; }
    await DB.remove("penaltyItems", id);
    await DB.logActivity("حذف آیتم جریمه/تخفیف", item.name);
    App.toast("حذف شد");
    refresh();
  }

  function refresh() {
    let el = document.getElementById("tab-adminPanel");
    if (el && el.classList.contains("active")) AdminPanel.render(el);
  }

  return { render, showAddItem, saveItem, showEditItem, updateItem, deleteItem, refresh };
})();
