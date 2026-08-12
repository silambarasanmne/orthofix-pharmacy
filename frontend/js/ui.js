/* ==========================================================================
   UI UTILITIES, TOASTS, MODALS, FORMATTERS & SIDEBAR HOVER TOGGLE
   ========================================================================== */

const UI = {
  initSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtns = document.querySelectorAll('.btn-toggle-sidebar');
    if (!sidebar) return;

    // Restore saved state
    const isCollapsed = localStorage.getItem('medicare_sidebar_collapsed') === 'true';
    if (isCollapsed) {
      sidebar.classList.add('collapsed');
    }

    // Toggle Pin/Unpin Click Handler
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const nowCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('medicare_sidebar_collapsed', nowCollapsed ? 'true' : 'false');
        
        if (nowCollapsed) {
          UI.showToast('Sidebar collapsed. Move cursor to left side to reveal menu.', 'info');
        } else {
          UI.showToast('Sidebar pinned expanded.', 'info');
        }
      });
    });

    // Cursor Movement / Hover Reveal Handler
    let hoverTimer = null;

    sidebar.addEventListener('mouseenter', () => {
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('hover-expanded');
      }
    });

    sidebar.addEventListener('mouseleave', () => {
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('hover-expanded');
      }
    });

    // Detect Cursor Moving to the Left MediCare Edge
    document.addEventListener('mousemove', (e) => {
      if (sidebar.classList.contains('collapsed')) {
        if (e.clientX <= 70) {
          sidebar.classList.add('hover-expanded');
        } else if (e.clientX > 260 && !sidebar.matches(':hover')) {
          sidebar.classList.remove('hover-expanded');
        }
      }
    });
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  },

  formatCurrency(amount) {
    const val = parseFloat(amount || 0);
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const d = new Date(dateTimeStr);
    return d.toLocaleString('en-IN', { 
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true 
    });
  },

  renderInvoiceHtml(invoice) {
    const itemsHtml = invoice.items.map((it, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>
          <strong>${it.medicine_name}</strong>
          ${it.generic_name ? `<br><small style="color:#64748b;">${it.generic_name}</small>` : ''}
        </td>
        <td style="text-align: center;">${it.batch_number || '-'}</td>
        <td style="text-align: right;">${UI.formatCurrency(it.unit_price)}</td>
        <td style="text-align: center;">${it.quantity}</td>
        <td style="text-align: right;">${UI.formatCurrency(it.total_price)}</td>
      </tr>
    `).join('');

    return `
      <div class="invoice-preview-container printable-area" id="printable-invoice">
        <div class="invoice-header">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-bottom: 0.4rem;">
            <img src="/images/logo.png" alt="ORTHOFIX" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">
            <h2 style="margin: 0; font-size: 1.35rem; color: #0f172a;">ORTHOFIX SPECIALITY CLINIC</h2>
          </div>
          <p>Speciality Orthopaedic Clinic & Pharmacy Department</p>
          <p>Phone: +91 98765 43210 | GSTIN: 27AABCM1234H1Z5</p>
          <h4 style="margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 1px; color: #0284c7;">RETAIL TAX INVOICE</h4>
        </div>

        <div class="invoice-meta-grid">
          <div>
            <p><strong>Bill No:</strong> ${invoice.invoice_number}</p>
            <p><strong>Date & Time:</strong> ${UI.formatDateTime(invoice.created_at)}</p>
            <p><strong>Cashier / Worker:</strong> ${invoice.worker_name}</p>
          </div>
          <div style="text-align: right;">
            <p><strong>Customer Name:</strong> ${invoice.customer_name || 'Walk-in Customer'}</p>
            <p><strong>Phone:</strong> ${invoice.customer_phone || 'N/A'}</p>
            <p><strong>Payment Method:</strong> <span class="badge badge-instock">${invoice.payment_method}</span></p>
          </div>
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">#</th>
              <th>Medicine Description</th>
              <th style="width: 90px; text-align: center;">Batch</th>
              <th style="width: 80px; text-align: right;">Price</th>
              <th style="width: 50px; text-align: center;">Qty</th>
              <th style="width: 90px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="invoice-totals">
          <div>
            <span>Subtotal:</span>
            <span>${UI.formatCurrency(invoice.subtotal)}</span>
          </div>
          ${invoice.discount_amount > 0 ? `
          <div style="color: #ef4444;">
            <span>Discount (${invoice.discount_type === 'percent' ? invoice.discount_value + '%' : 'Fixed'}):</span>
            <span>-${UI.formatCurrency(invoice.discount_amount)}</span>
          </div>
          ` : ''}
          <div class="grand-row">
            <span>Grand Total:</span>
            <span>${UI.formatCurrency(invoice.grand_total)}</span>
          </div>
          ${invoice.payment_method === 'Cash' ? `
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
            <span>Amount Received:</span>
            <span>${UI.formatCurrency(invoice.amount_received)}</span>
          </div>
          <div style="font-size: 0.8rem; color: #10b981; font-weight: 700;">
            <span>Change Returned:</span>
            <span>${UI.formatCurrency(invoice.change_amount)}</span>
          </div>
          ` : ''}
        </div>

        <div class="invoice-footer">
          <p><strong>Thank you for visiting ORTHOFIX SPECIALITY CLINIC! Wish you good health!</strong></p>
          <p style="margin-top: 0.25rem;">Medicines once sold cannot be returned without original cash receipt & batch info.</p>
        </div>
      </div>
    `;
  }
};

  openAppTestingModal() {
    this.openModal('modal-app-testing');
  },

  setProjectTestingStatus(status) {
    localStorage.setItem('project_testing_status', status);
    const selector = document.getElementById('project-status-selector');
    if (selector) selector.value = status;
    this.showToast(`Projects Workspace Status: ${status}`, status.includes('Passed') ? 'success' : (status.includes('Failed') ? 'error' : 'info'));
    this.closeModal('modal-app-testing');
  },

  initProjectsWorkspace() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('projects-workspace-widget')) return;

    const savedStatus = localStorage.getItem('project_testing_status') || 'Testing In Progress';

    const widget = document.createElement('div');
    widget.id = 'projects-workspace-widget';
    widget.className = 'projects-workspace-bar flex items-center gap-2 border-r border-slate-200/80 pr-3 mr-1';
    widget.innerHTML = `
      <div class="flex items-center gap-1.5">
        <select id="project-status-selector" class="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-extrabold text-slate-700 outline-none cursor-pointer hover:border-sky-400 transition-colors shadow-2xs">
          <option value="Testing In Progress" ${savedStatus === 'Testing In Progress' ? 'selected' : ''}>Testing In Progress</option>
          <option value="✅ Testing Passed (Release Pending)" ${savedStatus === '✅ Testing Passed (Release Pending)' ? 'selected' : ''}>✅ Testing Passed (Release Pending)</option>
          <option value="❌ Testing Failed (Rework)" ${savedStatus === '❌ Testing Failed (Rework)' ? 'selected' : ''}>❌ Testing Failed (Rework)</option>
        </select>
        <button type="button" class="btn btn-xs px-2.5 py-1 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-lg font-bold text-[11px] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap" onclick="UI.openAppTestingModal()" title="Open App for Testing">
          <i class="fa-solid fa-vial-circle-check text-xs"></i> Testing
        </button>
      </div>
    `;

    headerActions.insertBefore(widget, headerActions.firstChild);

    const selector = document.getElementById('project-status-selector');
    if (selector) {
      selector.addEventListener('change', (e) => {
        const val = e.target.value;
        localStorage.setItem('project_testing_status', val);
        UI.showToast(`Projects Workspace Status: ${val}`, val.includes('Passed') ? 'success' : (val.includes('Failed') ? 'error' : 'info'));
      });
    }

    // Modal creation for live app testing
    if (!document.getElementById('modal-app-testing')) {
      const modal = document.createElement('div');
      modal.id = 'modal-app-testing';
      modal.className = 'modal-overlay fixed inset-0 bg-slate-900/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 opacity-0 invisible transition-all duration-200';
      modal.innerHTML = `
        <div class="modal-box bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <div class="modal-header p-4 border-b border-slate-200 flex justify-between items-center bg-slate-900 text-white">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center text-sm"><i class="fa-solid fa-vial-virus"></i></span>
              <div>
                <h3 class="text-sm font-extrabold text-white leading-tight">Projects Workspace — Live App Testing</h3>
                <p class="text-[11px] text-sky-300">Run live verification & update release testing status</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1 rounded-lg text-base cursor-pointer" onclick="UI.closeModal('modal-app-testing')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="modal-body p-5 space-y-4 overflow-y-auto bg-slate-50">
            <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h4 class="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Set Project Testing Status</h4>
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button onclick="UI.setProjectTestingStatus('Testing In Progress')" class="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-1">
                  ⚡ Testing In Progress
                </button>
                <button onclick="UI.setProjectTestingStatus('✅ Testing Passed (Release Pending)')" class="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-1">
                  ✅ Testing Passed (Release Pending)
                </button>
                <button onclick="UI.setProjectTestingStatus('❌ Testing Failed (Rework)')" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-1">
                  ❌ Testing Failed (Rework)
                </button>
              </div>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
              <h4 class="text-xs font-extrabold text-slate-800 uppercase tracking-wider">App Verification Direct Link</h4>
              <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center text-sm">
                    <i class="fa-solid fa-hospital-user"></i>
                  </div>
                  <div>
                    <div class="text-xs font-bold text-slate-800">ORTHOFIX Speciality POS</div>
                    <div class="text-[11px] text-slate-500">http://localhost:5000</div>
                  </div>
                </div>
                <a href="/billing.html" target="_blank" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all">
                  Open App <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                </a>
              </div>
            </div>
          </div>
          <div class="modal-footer p-3.5 border-t border-slate-200 bg-white flex justify-end">
            <button class="btn px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer" onclick="UI.closeModal('modal-app-testing')">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UI.initSidebarToggle();
  UI.initProjectsWorkspace();
});

window.UI = UI;
