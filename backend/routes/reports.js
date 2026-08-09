const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('./auth');

// GET /api/reports/dashboard - Revenue & Analytics overview
router.get('/dashboard', authenticateToken, (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7); // YYYY-MM
    const yearStr = todayStr.substring(0, 4);  // YYYY

    // 1. Revenue Summaries
    const todayRev = db.prepare("SELECT SUM(grand_total) as total, COUNT(*) as count FROM sales WHERE date(created_at) = date(?)").get(todayStr);
    const monthRev = db.prepare("SELECT SUM(grand_total) as total, COUNT(*) as count FROM sales WHERE strftime('%Y-%m', created_at) = ?").get(monthStr);
    const yearRev = db.prepare("SELECT SUM(grand_total) as total, COUNT(*) as count FROM sales WHERE strftime('%Y', created_at) = ?").get(yearStr);

    // 2. Inventory Cards
    const totalMeds = db.prepare("SELECT COUNT(*) as count FROM medicines").get().count;
    const lowStock = db.prepare("SELECT COUNT(*) as count FROM medicines WHERE current_stock <= minimum_stock AND current_stock > 0").get().count;
    const outStock = db.prepare("SELECT COUNT(*) as count FROM medicines WHERE current_stock = 0").get().count;

    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiringSoon = db.prepare("SELECT COUNT(*) as count FROM medicines WHERE expiry_date >= ? AND expiry_date <= ?").get(todayStr, in90Days).count;

    // 3. Chart Datasets
    // Daily sales past 7 days
    const dailySalesData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const sum = db.prepare("SELECT SUM(grand_total) as total FROM sales WHERE date(created_at) = date(?)").get(dStr).total || 0;
      dailySalesData.push({
        date: dStr,
        label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        sales: sum
      });
    }

    // Monthly sales for current year
    const monthlySalesData = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 1; m <= 12; m++) {
      const mPad = String(m).padStart(2, '0');
      const key = `${yearStr}-${mPad}`;
      const sum = db.prepare("SELECT SUM(grand_total) as total FROM sales WHERE strftime('%Y-%m', created_at) = ?").get(key).total || 0;
      monthlySalesData.push({
        month: monthNames[m - 1],
        sales: sum
      });
    }

    // Top Selling Medicines
    const topSelling = db.prepare(`
      SELECT medicine_name, SUM(quantity) as total_qty, SUM(total_price) as total_revenue
      FROM sale_items
      GROUP BY medicine_name
      ORDER BY total_qty DESC
      LIMIT 5
    `).all();

    // Payment Methods breakdown
    const paymentMethods = db.prepare(`
      SELECT payment_method, COUNT(*) as count, SUM(grand_total) as amount
      FROM sales
      GROUP BY payment_method
    `).all();

    return res.json({
      success: true,
      revenue: {
        today: todayRev.total || 0,
        today_count: todayRev.count || 0,
        month: monthRev.total || 0,
        month_count: monthRev.count || 0,
        year: yearRev.total || 0,
        year_count: yearRev.count || 0
      },
      inventory: {
        total_medicines: totalMeds,
        low_stock: lowStock,
        out_of_stock: outStock,
        expiring_soon: expiringSoon
      },
      charts: {
        daily_sales: dailySalesData,
        monthly_sales: monthlySalesData,
        top_selling: topSelling,
        payment_methods: paymentMethods
      }
    });
  } catch (error) {
    console.error('Dashboard reports error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard reports.' });
  }
});

// GET /api/reports/date-wise - Financial statement by date range
router.get('/date-wise', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (from_date) {
      query += ' AND date(created_at) >= date(?)';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND date(created_at) <= date(?)';
      params.push(to_date);
    }

    query += ' ORDER BY created_at DESC';
    const sales = db.prepare(query).all(...params);

    // Calculate aggregated metrics
    let totalBills = sales.length;
    let grossSales = 0;
    let totalDiscounts = 0;
    let netRevenue = 0;

    for (const s of sales) {
      grossSales += s.subtotal;
      totalDiscounts += s.discount_amount;
      netRevenue += s.grand_total;
    }

    const avgBillValue = totalBills > 0 ? (netRevenue / totalBills) : 0;

    return res.json({
      success: true,
      summary: {
        total_bills: totalBills,
        gross_sales: grossSales,
        total_discounts: totalDiscounts,
        net_revenue: netRevenue,
        avg_bill_value: avgBillValue
      },
      sales
    });
  } catch (error) {
    console.error('Date-wise report error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate date-wise statement.' });
  }
});

// GET /api/reports/yearly - Year-wise monthly statement
router.get('/yearly', authenticateToken, requireAdmin, (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const monthlyReport = [];
    let grandTotalBills = 0;
    let grandGrossSales = 0;
    let grandDiscounts = 0;
    let grandNetRevenue = 0;

    for (let m = 1; m <= 12; m++) {
      const mPad = String(m).padStart(2, '0');
      const key = `${year}-${mPad}`;

      const row = db.prepare(`
        SELECT COUNT(*) as bills, SUM(subtotal) as gross, SUM(discount_amount) as discount, SUM(grand_total) as net
        FROM sales
        WHERE strftime('%Y-%m', created_at) = ?
      `).get(key);

      const bills = row.bills || 0;
      const gross = row.gross || 0;
      const discount = row.discount || 0;
      const net = row.net || 0;

      grandTotalBills += bills;
      grandGrossSales += gross;
      grandDiscounts += discount;
      grandNetRevenue += net;

      monthlyReport.push({
        month_index: m,
        month_name: monthNames[m - 1],
        bills_count: bills,
        gross_sales: gross,
        discount_amount: discount,
        net_revenue: net
      });
    }

    return res.json({
      success: true,
      year: parseInt(year, 10),
      totals: {
        total_bills: grandTotalBills,
        gross_sales: grandGrossSales,
        total_discounts: grandDiscounts,
        net_revenue: grandNetRevenue
      },
      months: monthlyReport
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate yearly statement.' });
  }
});

// GET /api/reports/export-sales-excel - Export Sales data to Excel
router.get('/export-sales-excel', authenticateToken, (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (from_date) {
      query += ' AND date(created_at) >= date(?)';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND date(created_at) <= date(?)';
      params.push(to_date);
    }

    query += ' ORDER BY id DESC';
    const sales = db.prepare(query).all(...params);

    const exportRows = sales.map(s => ({
      'Invoice Number': s.invoice_number,
      'Date & Time': s.created_at,
      'Customer Name': s.customer_name || 'Walk-in',
      'Customer Phone': s.customer_phone || '',
      'Subtotal (₹)': s.subtotal,
      'Discount (₹)': s.discount_amount,
      'Grand Total (₹)': s.grand_total,
      'Payment Method': s.payment_method,
      'Worker / Cashier': s.worker_name
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sales_Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export sales Excel.' });
  }
});

module.exports = router;
