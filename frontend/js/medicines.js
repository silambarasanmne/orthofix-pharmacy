/* ==========================================================================
   MEDICINE & INVENTORY MANAGEMENT MODULE
   ========================================================================== */

const Medicines = {
  list: [],
  editingId: null,
  importValidRows: [],

  init() {
    this.bindEvents();
    this.loadMedicines();
    this.loadCategories();
  },

  bindEvents() {
    const searchInput = document.getElementById('med-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.loadMedicines());
    }

    const categorySelect = document.getElementById('med-filter-category');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.loadMedicines());
    }

    const statusSelect = document.getElementById('med-filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => this.loadMedicines());
    }

    // Medicine Form Submit
    const medForm = document.getElementById('form-medicine');
    if (medForm) {
      medForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMedicine();
      });
    }

    // Stock Adjustment Form Submit
    const stockForm = document.getElementById('form-stock-adjust');
    if (stockForm) {
      stockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveStockAdjustment();
      });
    }

    // Excel File Upload Input
    const fileInput = document.getElementById('excel-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.previewExcelImport(e.target.files[0]);
        }
      });
    }
  },

  async loadMedicines() {
    try {
      const search = document.getElementById('med-search-input')?.value || '';
      const category = document.getElementById('med-filter-category')?.value || 'All';
      const status = document.getElementById('med-filter-status')?.value || '';

      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (category && category !== 'All') queryParams.append('category', category);
      if (status) queryParams.append('status', status);

      const res = await API.get(`/medicines?${queryParams.toString()}`);
      if (res.success) {
        this.list = res.medicines;
        this.renderTable();
      }
    } catch (error) {
      UI.showToast('Failed to load inventory medicines.', 'error');
    }
  },

  async loadCategories() {
    try {
      const res = await API.get('/medicines/categories');
      if (res.success) {
        const select = document.getElementById('med-filter-category');
        if (!select) return;
        select.innerHTML = '<option value="All">All Categories</option>';
        res.categories.forEach(cat => {
          select.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
      }
    } catch (error) {
      console.error(error);
    }
  },

  renderTable() {
    const tbody = document.getElementById('medicines-table-body');
    if (!tbody) return;

    if (this.list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2rem; color: #64748b;">
            No medicines match the selected filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.list.map(m => {
      let badgeClass = 'badge-instock';
      if (m.stock_status === 'LOW STOCK') badgeClass = 'badge-lowstock';
      if (m.stock_status === 'OUT OF STOCK') badgeClass = 'badge-outstock';
      if (m.stock_status === 'EXPIRED') badgeClass = 'badge-expired';

      return `
        <tr>
          <td><strong>#${m.id}</strong></td>
          <td>
            <strong style="font-size: 0.92rem;">${m.name}</strong>
            <br><small style="color: #64748b;">${m.generic_name}</small>
          </td>
          <td><span class="badge" style="background:#e0f2fe; color:#0284c7;">${m.category}</span></td>
          <td>${m.batch_number}</td>
          <td>${m.expiry_date}</td>
          <td>${UI.formatCurrency(m.purchase_price)}</td>
          <td style="font-weight: 700; color: #0284c7;">${UI.formatCurrency(m.selling_price)}</td>
          <td>
            <strong style="font-size: 1rem;">${m.current_stock}</strong>
            <small style="color: #64748b;">(Min: ${m.minimum_stock})</small>
          </td>
          <td><span class="badge ${badgeClass}">${m.stock_status}</span></td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn btn-secondary btn-sm" onclick="Medicines.openStockModal(${m.id})" title="Adjust Stock">📦 Stock</button>
              <button class="btn btn-primary btn-sm" onclick="Medicines.openEditModal(${m.id})" title="Edit Medicine">✏️ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="Medicines.deleteMedicine(${m.id})" title="Delete Medicine">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddModal() {
    this.editingId = null;
    document.getElementById('modal-med-title').textContent = '➕ Add New Medicine';
    document.getElementById('form-medicine').reset();
    document.getElementById('med-id-hidden').value = '';
    UI.openModal('modal-medicine');
  },

  openEditModal(id) {
    const med = this.list.find(m => m.id === id);
    if (!med) return;

    this.editingId = id;
    document.getElementById('modal-med-title').textContent = '✏️ Edit Medicine';
    document.getElementById('med-id-hidden').value = med.id;
    document.getElementById('med-name').value = med.name;
    document.getElementById('med-generic').value = med.generic_name;
    document.getElementById('med-category').value = med.category;
    document.getElementById('med-manufacturer').value = med.manufacturer || '';
    document.getElementById('med-batch').value = med.batch_number;
    document.getElementById('med-expiry').value = med.expiry_date;
    document.getElementById('med-pprice').value = med.purchase_price;
    document.getElementById('med-sprice').value = med.selling_price;
    document.getElementById('med-stock').value = med.current_stock;
    document.getElementById('med-minstock').value = med.minimum_stock;
    document.getElementById('med-gst').value = med.gst_percent || 12.0;
    document.getElementById('med-barcode').value = med.barcode || '';
    document.getElementById('med-desc').value = med.description || '';

    UI.openModal('modal-medicine');
  },

  async saveMedicine() {
    const payload = {
      name: document.getElementById('med-name').value,
      generic_name: document.getElementById('med-generic').value,
      category: document.getElementById('med-category').value,
      manufacturer: document.getElementById('med-manufacturer').value,
      batch_number: document.getElementById('med-batch').value,
      expiry_date: document.getElementById('med-expiry').value,
      purchase_price: document.getElementById('med-pprice').value,
      selling_price: document.getElementById('med-sprice').value,
      current_stock: document.getElementById('med-stock').value,
      minimum_stock: document.getElementById('med-minstock').value,
      gst_percent: document.getElementById('med-gst').value,
      barcode: document.getElementById('med-barcode').value,
      description: document.getElementById('med-desc').value
    };

    try {
      if (this.editingId) {
        const res = await API.put(`/medicines/${this.editingId}`, payload);
        if (res.success) {
          UI.showToast('Medicine updated successfully!', 'success');
          UI.closeModal('modal-medicine');
          this.loadMedicines();
        }
      } else {
        const res = await API.post('/medicines', payload);
        if (res.success) {
          UI.showToast('Medicine added successfully!', 'success');
          UI.closeModal('modal-medicine');
          this.loadMedicines();
        }
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to save medicine.', 'error');
    }
  },

  openStockModal(id) {
    const med = this.list.find(m => m.id === id);
    if (!med) return;

    document.getElementById('stock-med-id').value = med.id;
    document.getElementById('stock-med-name').textContent = med.name;
    document.getElementById('stock-med-current').textContent = med.current_stock;
    document.getElementById('stock-change-qty').value = '';
    document.getElementById('stock-reason').value = 'Restock';

    UI.openModal('modal-stock');
  },

  async saveStockAdjustment() {
    const medId = document.getElementById('stock-med-id').value;
    const changeQty = document.getElementById('stock-change-qty').value;
    const reason = document.getElementById('stock-reason').value;

    try {
      const res = await API.post(`/medicines/${medId}/stock`, {
        change_quantity: changeQty,
        reason
      });
      if (res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-stock');
        this.loadMedicines();
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to adjust stock.', 'error');
    }
  },

  async deleteMedicine(id) {
    const med = this.list.find(m => m.id === id);
    if (!med) return;

    if (confirm(`Are you sure you want to delete "${med.name}"? This action cannot be undone.`)) {
      try {
        const res = await API.delete(`/medicines/${id}`);
        if (res.success) {
          UI.showToast(res.message, 'success');
          this.loadMedicines();
        }
      } catch (error) {
        UI.showToast(error.message || 'Failed to delete medicine.', 'error');
      }
    }
  },

  // EXCEL IMPORT WORKFLOW
  openImportModal() {
    document.getElementById('excel-file-input').value = '';
    document.getElementById('import-preview-section').style.display = 'none';
    UI.openModal('modal-import-excel');
  },

  async downloadTemplate() {
    await API.downloadFile('/medicines/template', 'medicine_import_template.xlsx');
  },

  async previewExcelImport(file) {
    const formData = new FormData();
    formData.append('excel_file', file);

    try {
      UI.showToast('Parsing & validating Excel file...', 'info');
      const res = await API.post('/medicines/import-preview', formData);
      if (res.success) {
        this.importValidRows = res.valid_rows;
        this.renderImportPreview(res);
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to parse Excel file.', 'error');
    }
  },

  renderImportPreview(data) {
    const container = document.getElementById('import-preview-section');
    const summaryBox = document.getElementById('import-summary-counts');
    const tableBody = document.getElementById('import-preview-table-body');
    const confirmBtn = document.getElementById('btn-confirm-import');

    if (!container || !summaryBox || !tableBody) return;

    container.style.display = 'block';

    summaryBox.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center;">
        <span class="badge badge-instock" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">
          ✅ ${data.valid_count} Valid Records
        </span>
        ${data.invalid_count > 0 ? `
          <span class="badge badge-outstock" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">
            ⚠️ ${data.invalid_count} Invalid / Failed Records
          </span>
        ` : ''}
      </div>
    `;

    let html = '';

    // Render Valid Rows first
    data.valid_rows.forEach(r => {
      html += `
        <tr style="background-color: #f0fdf4;">
          <td><span style="color: #10b981; font-weight: 700;">Row ${r.row_number}</span></td>
          <td><strong>${r.name}</strong></td>
          <td>${r.generic_name}</td>
          <td>${r.category}</td>
          <td>${r.batch_number}</td>
          <td>${r.expiry_date}</td>
          <td>${UI.formatCurrency(r.selling_price)}</td>
          <td>${r.current_stock}</td>
          <td><span class="badge badge-instock">VALID</span></td>
        </tr>
      `;
    });

    // Render Invalid Rows with Error Messages
    data.invalid_rows.forEach(r => {
      html += `
        <tr style="background-color: #fef2f2;">
          <td><span style="color: #ef4444; font-weight: 700;">Row ${r.row_number}</span></td>
          <td><strong>${r.name || '(Empty)'}</strong></td>
          <td>${r.generic_name || '-'}</td>
          <td>${r.category || '-'}</td>
          <td>${r.batch_number || '-'}</td>
          <td>${r.expiry_date || '-'}</td>
          <td>${r.selling_price || '-'}</td>
          <td>${r.current_stock || '-'}</td>
          <td>
            <span class="badge badge-outstock">INVALID</span>
            <br><small style="color: #dc2626;">${r.errors.join(', ')}</small>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;

    if (confirmBtn) {
      confirmBtn.disabled = data.valid_count === 0;
    }
  },

  async confirmImport() {
    if (this.importValidRows.length === 0) return;

    try {
      const res = await API.post('/medicines/import-confirm', { rows: this.importValidRows });
      if (res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-import-excel');
        this.loadMedicines();
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to confirm import.', 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('medicines-table-body')) {
    Medicines.init();
  }
});

window.Medicines = Medicines;
