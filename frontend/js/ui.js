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

document.addEventListener('DOMContentLoaded', () => {
  UI.initSidebarToggle();
});

window.UI = UI;
