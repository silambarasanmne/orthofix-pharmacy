/* ==========================================================================
   ANALYTICS & DASHBOARD LOADER WITH CHART.JS INTEGRATION
   ========================================================================== */

const Dashboard = {
  dailyChartInstance: null,
  monthlyChartInstance: null,
  topSellingChartInstance: null,
  paymentChartInstance: null,

  async init() {
    try {
      const res = await API.get('/reports/dashboard');
      if (res.success) {
        this.renderMetrics(res);
        this.renderCharts(res.charts);
      }
    } catch (error) {
      UI.showToast('Failed to load dashboard metrics.', 'error');
    }
  },

  renderMetrics(data) {
    const rev = data.revenue;
    const inv = data.inventory;

    // Revenue Cards
    const todayRev = document.getElementById('stat-today-revenue');
    const monthRev = document.getElementById('stat-month-revenue');
    const yearRev = document.getElementById('stat-year-revenue');

    if (todayRev) todayRev.textContent = UI.formatCurrency(rev.today);
    if (monthRev) monthRev.textContent = UI.formatCurrency(rev.month);
    if (yearRev) yearRev.textContent = UI.formatCurrency(rev.year);

    // Inventory Cards
    const totalMeds = document.getElementById('stat-total-medicines');
    const lowStock = document.getElementById('stat-low-stock');
    const outStock = document.getElementById('stat-out-stock');
    const expiringSoon = document.getElementById('stat-expiring-soon');

    if (totalMeds) totalMeds.textContent = inv.total_medicines;
    if (lowStock) lowStock.textContent = inv.low_stock;
    if (outStock) outStock.textContent = inv.out_of_stock;
    if (expiringSoon) expiringSoon.textContent = inv.expiring_soon;
  },

  renderCharts(chartsData) {
    if (typeof Chart === 'undefined') return;

    // 1. Daily Sales Line Chart
    const dailyCtx = document.getElementById('chart-daily-sales')?.getContext('2d');
    if (dailyCtx) {
      if (this.dailyChartInstance) this.dailyChartInstance.destroy();
      this.dailyChartInstance = new Chart(dailyCtx, {
        type: 'line',
        data: {
          labels: chartsData.daily_sales.map(d => d.label),
          datasets: [{
            label: 'Daily Revenue (₹)',
            data: chartsData.daily_sales.map(d => d.sales),
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 3,
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // 2. Monthly Sales Bar Chart
    const monthlyCtx = document.getElementById('chart-monthly-sales')?.getContext('2d');
    if (monthlyCtx) {
      if (this.monthlyChartInstance) this.monthlyChartInstance.destroy();
      this.monthlyChartInstance = new Chart(monthlyCtx, {
        type: 'bar',
        data: {
          labels: chartsData.monthly_sales.map(m => m.month),
          datasets: [{
            label: 'Monthly Revenue (₹)',
            data: chartsData.monthly_sales.map(m => m.sales),
            backgroundColor: '#0d9488',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // 3. Top Selling Medicines Horizontal Bar
    const topCtx = document.getElementById('chart-top-selling')?.getContext('2d');
    if (topCtx) {
      if (this.topSellingChartInstance) this.topSellingChartInstance.destroy();
      this.topSellingChartInstance = new Chart(topCtx, {
        type: 'bar',
        indexAxis: 'y',
        data: {
          labels: chartsData.top_selling.map(t => t.medicine_name),
          datasets: [{
            label: 'Units Sold',
            data: chartsData.top_selling.map(t => t.total_qty),
            backgroundColor: '#38bdf8',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true }
          }
        }
      });
    }

    // 4. Payment Method Distribution Doughnut Chart
    const payCtx = document.getElementById('chart-payment-methods')?.getContext('2d');
    if (payCtx) {
      if (this.paymentChartInstance) this.paymentChartInstance.destroy();
      this.paymentChartInstance = new Chart(payCtx, {
        type: 'doughnut',
        data: {
          labels: chartsData.payment_methods.map(p => p.payment_method),
          datasets: [{
            data: chartsData.payment_methods.map(p => p.amount),
            backgroundColor: ['#10b981', '#0284c7', '#f59e0b']
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('stat-today-revenue')) {
    Dashboard.init();
  }
});

window.Dashboard = Dashboard;
