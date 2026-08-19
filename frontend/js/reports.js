/* ==========================================================================
   FINANCIAL REPORTS, STATEMENTS & HISTORY MODULE
   ========================================================================== */

const Reports = {
  historySales: [],

  initHistory() {
    this.bindHistoryEvents();
    this.loadHistory();
  },

  bindHistoryEvents() {
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.loadHistory());
    }

    const paySelect = document.getElementById('history-filter-pay');
    if (paySelect) {
      paySelect.addEventListener('change', () => this.loadHistory());
    }

    const startDateInput = document.getElementById('history-start-date');
    const endDateInput = document.getElementById('history-end-date');

    if (startDateInput) startDateInput.addEventListener('change', () => this.loadHistory());
    if (endDateInput) endDateInput.addEventListener('change', () => this.loadHistory());
  },

  async loadHistory() {
    try {
      const search = document.getElementById('history-search-input')?.value || '';
      const pay = document.getElementById('history-filter-pay')?.value || 'All';
      const startDate = document.getElementById('history-start-date')?.value || '';
      const endDate = document.getElementById('history-end-date')?.value || '';

      const queryParams = new URLSearchParams();
      if (search) queryParams.append('invoice_number', search);
      if (pay && pay !== 'All') queryParams.append('payment_method', pay);
      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);

      const res = await API.get(`/billing/history?${queryParams.toString()}`);
      if (res.success) {
        this.historySales = res.sales;
        this.renderHistoryTable();
      }
    } catch (error) {
      UI.showToast('Failed to load billing history.', 'error');
    }
  },

  renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    if (this.historySales.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2rem; color: #64748b;">
            No bills match the selected filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.historySales.map(s => `
      <tr>
        <td><strong style="color: #0284c7;">${s.invoice_number}</strong></td>
        <td>${UI.formatDateTime(s.created_at)}</td>
        <td>
          <strong>${s.customer_name || 'Walk-in Customer'}</strong>
          ${s.customer_phone ? `<br><small style="color: #64748b;"><i class="fa-solid fa-phone text-xs mr-1 text-slate-400"></i>${s.customer_phone}</small>` : ''}
        </td>
        <td>${UI.formatCurrency(s.subtotal)}</td>
        <td style="color: #ef4444;">-${UI.formatCurrency(s.discount_amount)}</td>
        <td style="font-weight: 800; color: #0f172a;">${UI.formatCurrency(s.grand_total)}</td>
        <td><span class="badge badge-instock">${s.payment_method}</span></td>
        <td><small style="color: #64748b;">${s.worker_name}</small></td>
        <td style="text-align: center;">
          <button class="btn btn-primary btn-sm px-3 py-1.5 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all mx-auto" onclick="Reports.downloadInvoicePDF('${s.invoice_number}')">
            <i class="fa-solid fa-file-pdf text-red-300"></i> Download PDF
          </button>
        </td>
      </tr>
    `).join('');
  },

  async downloadInvoicePDF(invoiceNumber) {
    try {
      UI.showToast('Preparing PDF download...', 'info');
      const res = await API.get(`/billing/invoice/${invoiceNumber}`);
      if (res.success && res.invoice) {
        await UI.downloadInvoiceAsPDF(res.invoice);
      } else {
        UI.showToast('Failed to fetch invoice details.', 'error');
      }
    } catch (error) {
      console.error('Failed to download invoice PDF:', error);
      UI.showToast('Failed to download invoice PDF.', 'error');
    }
  },

  async viewInvoice(invoiceNumber) {
    try {
      const res = await API.get(`/billing/invoice/${invoiceNumber}`);
      if (res.success) {
        const modalContainer = document.getElementById('invoice-modal-content');
        if (modalContainer) {
          modalContainer.innerHTML = UI.renderInvoiceHtml(res.invoice);
          UI.openModal('modal-invoice');
        }
      }
    } catch (error) {
      UI.showToast('Failed to load invoice details.', 'error');
    }
  },

  // DATE-WISE STATEMENT WORKFLOW
  async loadDateWiseStatement() {
    const fromDate = document.getElementById('statement-from-date')?.value || '';
    const toDate = document.getElementById('statement-to-date')?.value || '';

    try {
      const queryParams = new URLSearchParams();
      if (fromDate) queryParams.append('from_date', fromDate);
      if (toDate) queryParams.append('to_date', toDate);

      const res = await API.get(`/reports/date-wise?${queryParams.toString()}`);
      if (res.success) {
        this.renderDateWiseStatement(res);
      }
    } catch (error) {
      UI.showToast('Failed to load date-wise statement.', 'error');
    }
  },

  renderDateWiseStatement(data) {
    const summary = data.summary;
    const sales = data.sales;

    // Render Cards
    const totalBillsEl = document.getElementById('stmt-total-bills');
    const grossSalesEl = document.getElementById('stmt-gross-sales');
    const totalDiscountsEl = document.getElementById('stmt-total-discounts');
    const netRevenueEl = document.getElementById('stmt-net-revenue');
    const avgBillEl = document.getElementById('stmt-avg-bill');

    if (totalBillsEl) totalBillsEl.textContent = summary.total_bills;
    if (grossSalesEl) grossSalesEl.textContent = UI.formatCurrency(summary.gross_sales);
    if (totalDiscountsEl) totalDiscountsEl.textContent = UI.formatCurrency(summary.total_discounts);
    if (netRevenueEl) netRevenueEl.textContent = UI.formatCurrency(summary.net_revenue);
    if (avgBillEl) avgBillEl.textContent = UI.formatCurrency(summary.avg_bill_value);

    // Render Table
    const tbody = document.getElementById('date-wise-table-body');
    if (!tbody) return;

    if (sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem;">No sales records found for selected date range.</td></tr>`;
      return;
    }

    tbody.innerHTML = sales.map(s => `
      <tr>
        <td><strong>${s.invoice_number}</strong></td>
        <td>${UI.formatDateTime(s.created_at)}</td>
        <td>${s.customer_name || 'Walk-in'}</td>
        <td>${UI.formatCurrency(s.subtotal)}</td>
        <td style="color:#ef4444;">-${UI.formatCurrency(s.discount_amount)}</td>
        <td style="font-weight:800; color:#0284c7;">${UI.formatCurrency(s.grand_total)}</td>
        <td><span class="badge badge-instock">${s.payment_method}</span></td>
        <td>${s.worker_name}</td>
        <td style="text-align: center;">
          <button class="btn btn-primary btn-sm px-3 py-1.5 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all mx-auto" onclick="Reports.downloadInvoicePDF('${s.invoice_number}')">
            <i class="fa-solid fa-file-pdf text-red-300"></i> Download PDF
          </button>
        </td>
      </tr>
    `).join('');
  },

  // YEAR-WISE STATEMENT WORKFLOW
  async loadYearlyStatement() {
    const year = document.getElementById('statement-year')?.value || new Date().getFullYear();

    try {
      const res = await API.get(`/reports/yearly?year=${year}`);
      if (res.success) {
        this.renderYearlyStatement(res);
      }
    } catch (error) {
      UI.showToast('Failed to load yearly statement.', 'error');
    }
  },

  renderYearlyStatement(data) {
    const tbody = document.getElementById('yearly-table-body');
    const tfoot = document.getElementById('yearly-table-foot');
    if (!tbody) return;

    tbody.innerHTML = data.months.map(m => `
      <tr>
        <td><strong>${m.month_name}</strong></td>
        <td style="text-align: center;">${m.bills_count}</td>
        <td style="text-align: right;">${UI.formatCurrency(m.gross_sales)}</td>
        <td style="text-align: right; color: #ef4444;">-${UI.formatCurrency(m.discount_amount)}</td>
        <td style="text-align: right; font-weight: 800; color: #0284c7;">${UI.formatCurrency(m.net_revenue)}</td>
      </tr>
    `).join('');

    if (tfoot) {
      tfoot.innerHTML = `
        <tr style="background-color: #f1f5f9; font-weight: 800; font-size: 0.95rem;">
          <td>TOTAL (${data.year})</td>
          <td style="text-align: center;">${data.totals.total_bills}</td>
          <td style="text-align: right;">${UI.formatCurrency(data.totals.gross_sales)}</td>
          <td style="text-align: right; color: #ef4444;">-${UI.formatCurrency(data.totals.total_discounts)}</td>
          <td style="text-align: right; color: #0284c7;">${UI.formatCurrency(data.totals.net_revenue)}</td>
        </tr>
      `;
    }
  },

  async exportSalesExcel() {
    const fromDate = document.getElementById('statement-from-date')?.value || '';
    const toDate = document.getElementById('statement-to-date')?.value || '';
    const endpoint = `/reports/export-sales-excel?from_date=${fromDate}&to_date=${toDate}`;
    await API.downloadFile(endpoint, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('history-table-body')) {
    Reports.initHistory();
  }
  if (document.getElementById('date-wise-table-body')) {
    Reports.loadDateWiseStatement();
    Reports.loadYearlyStatement();
  }
});

window.Reports = Reports;
