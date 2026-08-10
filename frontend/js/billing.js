/* ==========================================================================
   POS BILLING SYSTEM MODULE — TEXT BOX & DROPDOWN QUANTITY SELECTOR
   ========================================================================== */

const Billing = {
  cart: [], // Array of { medicine, quantity, unit_price, total_price }
  medicines: [],
  discountType: 'fixed',
  discountValue: 0,
  paymentMethod: 'Cash',
  amountReceived: 0,
  searchDebounceTimer: null,

  allMedicines: [],

  init() {
    this.bindEvents();
    this.loadMedicines();
    this.loadCategories();
    this.renderCart();
  },

  bindEvents() {
    // Medicine Search Input — Ultra Fast Local Filter + Debounced Server Query
    const searchInput = document.getElementById('search-medicine-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (this.allMedicines && this.allMedicines.length > 0) {
          // Instant Local Sub-Millisecond Filter
          this.medicines = this.allMedicines.filter(m => 
            m.name.toLowerCase().includes(val) ||
            m.generic_name.toLowerCase().includes(val) ||
            m.batch_number.toLowerCase().includes(val) ||
            (m.barcode && m.barcode.toLowerCase().includes(val))
          );
          this.renderMedicineGrid();
        }

        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.loadMedicines();
        }, 150);
      });
    }

    // Category Filter Select
    const categorySelect = document.getElementById('filter-category');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.loadMedicines());
    }

    // Status Filter Select
    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => this.loadMedicines());
    }

    // Discount Type & Value Inputs
    const discountTypeSelect = document.getElementById('discount-type');
    const discountValInput = document.getElementById('discount-value');

    if (discountTypeSelect) {
      discountTypeSelect.addEventListener('change', (e) => {
        this.discountType = e.target.value;
        this.calculateTotals();
      });
    }

    if (discountValInput) {
      discountValInput.addEventListener('input', (e) => {
        this.discountValue = parseFloat(e.target.value) || 0;
        this.calculateTotals();
      });
    }

    // Payment Method Buttons
    const payBtns = document.querySelectorAll('.pay-btn');
    payBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        payBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.paymentMethod = btn.dataset.method;
        
        const cashBox = document.getElementById('cash-payment-box');
        if (cashBox) {
          cashBox.style.display = this.paymentMethod === 'Cash' ? 'flex' : 'none';
        }
        this.calculateTotals();
      });
    });

    // Cash Amount Received Input
    const amountRecInput = document.getElementById('amount-received');
    if (amountRecInput) {
      amountRecInput.addEventListener('input', (e) => {
        this.amountReceived = parseFloat(e.target.value) || 0;
        this.calculateTotals();
      });
    }

    // Clear Cart Button
    const btnClearCart = document.getElementById('btn-clear-cart');
    if (btnClearCart) {
      btnClearCart.addEventListener('click', () => this.clearCart());
    }

    // Single Submit Bill Button
    const btnCompleteSale = document.getElementById('btn-complete-sale');
    if (btnCompleteSale) {
      btnCompleteSale.addEventListener('click', () => this.openSubmitPanel());
    }
  },

  async loadMedicines() {
    try {
      const search = document.getElementById('search-medicine-input')?.value || '';
      const category = document.getElementById('filter-category')?.value || 'All';
      const status = document.getElementById('filter-status')?.value || '';

      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (category && category !== 'All') queryParams.append('category', category);
      if (status) queryParams.append('status', status);

      const res = await API.get(`/medicines?${queryParams.toString()}`);
      if (res.success) {
        this.medicines = res.medicines;
        if (!search && category === 'All' && !status) {
          this.allMedicines = res.medicines;
        }
        this.renderMedicineGrid();
      }
    } catch (error) {
      UI.showToast('Failed to load medicines list.', 'error');
    }
  },

  async loadCategories() {
    try {
      const res = await API.get('/medicines/categories');
      if (res.success) {
        const select = document.getElementById('filter-category');
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

  renderMedicineGrid() {
    const grid = document.getElementById('medicine-grid');
    if (!grid) return;

    if (this.medicines.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <h3>No medicines found</h3>
          <p style="font-size: 0.85rem;">Try adjusting your search criteria or category filter.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.medicines.map(m => {
      let badgeClass = 'badge-instock';
      if (m.stock_status === 'LOW STOCK') badgeClass = 'badge-lowstock';
      if (m.stock_status === 'OUT OF STOCK') badgeClass = 'badge-outstock';
      if (m.stock_status === 'EXPIRED') badgeClass = 'badge-expired';

      const isDisabled = m.current_stock === 0 || m.is_expired;

      return `
        <div class="med-card ${isDisabled ? 'disabled' : ''}" onclick="Billing.addToCart(${m.id})">
          <div>
            <div class="med-header">
              <span class="med-name">${m.name}</span>
              <span class="badge ${badgeClass}">${m.stock_status}</span>
            </div>
            <div class="med-generic">${m.generic_name}</div>
          </div>
          <div>
            <div class="med-meta">
              <span>Batch: <strong>${m.batch_number}</strong></span>
              <span>Exp: <strong>${m.expiry_date}</strong></span>
            </div>
            <div class="med-meta" style="margin-top: 0.5rem;">
              <span class="med-price">${UI.formatCurrency(m.selling_price)}</span>
              <span style="font-size: 0.8rem; color: #64748b;">Stock: <strong>${m.current_stock}</strong></span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // ADD MEDICINE TO CURRENT BILL CART
  addToCart(medicineId) {
    const med = this.medicines.find(m => m.id === medicineId);
    if (!med) return;

    if (med.is_expired) {
      UI.showToast(`"${med.name}" is expired (${med.expiry_date}) and cannot be billed.`, 'error');
      return;
    }

    if (med.current_stock === 0) {
      UI.showToast(`This medicine (${med.name}) is currently out of stock.`, 'error');
      return;
    }

    const existingIndex = this.cart.findIndex(item => item.medicine.id === medicineId);

    if (existingIndex > -1) {
      const currentQty = this.cart[existingIndex].quantity;
      if (currentQty + 1 > med.current_stock) {
        UI.showToast(`Only ${med.current_stock} units available for ${med.name}.`, 'warning');
        return;
      }
      this.cart[existingIndex].quantity += 1;
      this.cart[existingIndex].total_price = this.cart[existingIndex].quantity * med.selling_price;
    } else {
      this.cart.push({
        medicine: med,
        quantity: 1,
        unit_price: med.selling_price,
        total_price: med.selling_price
      });
    }

    this.renderCart(medicineId);
  },

  // UPDATE QUANTITY FROM TEXT BOX OR DROPDOWN SELECT
  setQuantity(index, value) {
    const item = this.cart[index];
    if (!item) return;

    let parsedVal = parseInt(value, 10);
    if (isNaN(parsedVal) || parsedVal <= 0) {
      this.removeFromCart(index);
      return;
    }

    if (parsedVal > item.medicine.current_stock) {
      UI.showToast(`Only ${item.medicine.current_stock} units available for ${item.medicine.name}.`, 'warning');
      item.quantity = item.medicine.current_stock;
    } else {
      item.quantity = parsedVal;
    }

    item.total_price = item.quantity * item.unit_price;
    this.renderCart();
  },

  removeFromCart(index) {
    const removedItem = this.cart[index];
    this.cart.splice(index, 1);
    if (removedItem) {
      UI.showToast(`Removed "${removedItem.medicine.name}" from cart.`, 'info');
    }
    this.renderCart();
  },

  clearCart() {
    this.cart = [];
    this.discountValue = 0;
    const discInput = document.getElementById('discount-value');
    if (discInput) discInput.value = '';
    this.renderCart();
  },

  // GENERATE QUANTITY DROPDOWN SELECT OPTIONS
  generateQtySelectOptions(currentQty, maxStock) {
    const defaultOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100];
    const availableOptions = defaultOptions.filter(opt => opt <= maxStock);
    
    if (!availableOptions.includes(currentQty) && currentQty <= maxStock) {
      availableOptions.push(currentQty);
      availableOptions.sort((a, b) => a - b);
    }

    return availableOptions.map(opt => `
      <option value="${opt}" ${opt === currentQty ? 'selected' : ''}>Qty: ${opt}</option>
    `).join('');
  },

  // RENDER CURRENT BILL TABLE WITH MEDICINE NAME, TEXT BOX & DROPDOWN SELECT OPTION
  renderCart(highlightMedId = null) {
    const cartBody = document.getElementById('cart-table-body');
    const cartCountBadge = document.getElementById('cart-count-badge');
    if (cartCountBadge) cartCountBadge.textContent = `${this.cart.length} items`;

    if (!cartBody) return;

    if (this.cart.length === 0) {
      cartBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛒</div>
            <h4 style="font-size: 1rem; font-weight: 700; color: #64748b;">Current Bill is Empty</h4>
            <p style="font-size: 0.8rem; margin-top: 0.25rem;">Click any medicine on the left panel to add it to the bill.</p>
          </td>
        </tr>
      `;
      this.calculateTotals();
      return;
    }

    cartBody.innerHTML = this.cart.map((item, idx) => {
      const isHighlighted = highlightMedId && item.medicine.id === highlightMedId;
      const highlightStyle = isHighlighted ? 'background-color: #e0f2fe; transition: background-color 1s ease;' : '';

      return `
        <tr style="${highlightStyle}" id="cart-item-row-${item.medicine.id}" class="hover:bg-slate-50/80 transition-colors">
          <td class="p-2 align-middle">
            <strong class="cart-item-name font-bold text-xs text-sky-700 block leading-tight">
              ${item.medicine.name}
            </strong>
            <small class="text-slate-500 italic text-[11px] block leading-tight">${item.medicine.generic_name}</small>
            <div class="text-[10px] text-slate-500 mt-0.5 flex gap-2">
              <span>Batch: <strong class="text-slate-700">${item.medicine.batch_number}</strong></span>
              <span>Stock: <strong class="text-emerald-600">${item.medicine.current_stock}</strong></span>
            </div>
          </td>

          <td class="p-2 text-right align-middle font-bold text-xs text-slate-800">
            ${UI.formatCurrency(item.unit_price)}
          </td>

          <!-- TEXT BOX + DROPDOWN SELECTION OPTION FOR NUMBER OF MEDICINES -->
          <td class="p-2 text-center align-middle">
            <div class="flex items-center justify-center gap-1">
              <input type="number" 
                     class="qty-text-box w-11 p-1 border border-sky-500 rounded-md font-extrabold text-xs text-center outline-none bg-white focus:ring-2 focus:ring-sky-500/20" 
                     min="1" 
                     max="${item.medicine.current_stock}" 
                     value="${item.quantity}" 
                     onchange="Billing.setQuantity(${idx}, this.value)" 
                     title="Type custom quantity">
              
              <select class="qty-select-dropdown p-1 border border-slate-300 rounded-md text-[11px] font-bold bg-slate-50 cursor-pointer text-slate-800 outline-none" 
                      onchange="Billing.setQuantity(${idx}, this.value)" 
                      title="Select quantity from dropdown">
                ${this.generateQtySelectOptions(item.quantity, item.medicine.current_stock)}
              </select>
            </div>
          </td>

          <td class="p-2 text-right align-middle font-extrabold text-xs text-slate-900">
            ${UI.formatCurrency(item.total_price)}
          </td>

          <td class="p-2 text-center align-middle">
            <button class="btn-remove-item text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer" type="button" onclick="Billing.removeFromCart(${idx})" title="Remove ${item.medicine.name} from Bill">
              <i class="fa-solid fa-trash-can text-sm"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.calculateTotals();
  },

  calculateTotals() {
    let subtotal = 0;
    let totalUnits = 0;
    this.cart.forEach(item => {
      subtotal += item.total_price;
      totalUnits += item.quantity;
    });

    const grandTotal = Math.max(0, subtotal);
    this.amountReceived = grandTotal;

    // Render summary UI
    const subtotalEl = document.getElementById('summary-subtotal');
    const grandTotalEl = document.getElementById('summary-grand-total');
    const completeBtn = document.getElementById('btn-complete-sale');
    const footQtyEl = document.getElementById('foot-total-qty');
    const footAmountEl = document.getElementById('foot-total-amount');

    if (subtotalEl) subtotalEl.textContent = UI.formatCurrency(subtotal);
    if (grandTotalEl) grandTotalEl.textContent = UI.formatCurrency(grandTotal);
    if (footQtyEl) footQtyEl.textContent = `${totalUnits} Unit${totalUnits === 1 ? '' : 's'}`;
    if (footAmountEl) footAmountEl.textContent = UI.formatCurrency(subtotal);

    // Ensure Submit button is always active and enabled
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      completeBtn.removeAttribute('disabled');
    }
  },

  openSubmitPanel() {
    if (this.cart.length === 0) {
      UI.showToast('Cannot submit bill: Current Bill Cart is empty.', 'error');
      return;
    }

    const customerName = document.getElementById('customer-name')?.value.trim() || 'Walk-in Customer';
    let subtotal = 0;
    this.cart.forEach(item => { subtotal += item.total_price; });

    const grandTotal = Math.max(0, subtotal);

    const nameEl = document.getElementById('panel-bill-name');
    const totalEl = document.getElementById('panel-total-amount');
    const finalEl = document.getElementById('panel-final-total');

    if (nameEl) nameEl.textContent = customerName;
    if (totalEl) totalEl.textContent = UI.formatCurrency(subtotal);
    if (finalEl) finalEl.textContent = UI.formatCurrency(grandTotal);

    UI.openModal('modal-submit-summary');
  },

  async confirmAndSaveBill() {
    if (this.cart.length === 0) return;

    const customerName = document.getElementById('customer-name')?.value || '';
    const customerPhone = document.getElementById('customer-phone')?.value || '';

    let subtotal = 0;
    this.cart.forEach(item => { subtotal += item.total_price; });
    const grandTotal = Math.max(0, subtotal);

    const payload = {
      items: this.cart.map(item => ({
        medicine_id: item.medicine.id,
        quantity: item.quantity
      })),
      customer_name: customerName,
      customer_phone: customerPhone,
      discount_type: 'fixed',
      discount_value: 0,
      payment_method: 'Cash',
      amount_received: grandTotal
    };

    try {
      const btn = document.getElementById('btn-confirm-save-bill');
      if (btn) btn.disabled = true;

      const res = await API.post('/billing/sale', payload);
      if (res.success) {
        UI.closeModal('modal-submit-summary');
        UI.showToast(`✅ Bill INV-${res.invoice.invoice_number} saved successfully! Database updated.`, 'success');
        
        // Reset Cart & Return to Clean Billing Screen
        this.clearCart();
        this.loadMedicines(); // Refresh live database stock
        
        const searchInput = document.getElementById('search-medicine-input');
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to save bill.', 'error');
    } finally {
      const btn = document.getElementById('btn-confirm-save-bill');
      if (btn) btn.disabled = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('medicine-grid')) {
    Billing.init();
  }
});

window.Billing = Billing;
