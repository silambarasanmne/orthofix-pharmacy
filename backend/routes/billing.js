const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('./auth');

// Helper to generate unique sequential Invoice Number: INV-YYYYMMDD-XXXX
function generateInvoiceNumber() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
  const prefix = `INV-${dateStr}-`;

  const stmt = db.prepare("SELECT invoice_number FROM sales WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1");
  const lastSale = stmt.get(`${prefix}%`);

  let nextSeq = 1;
  if (lastSale && lastSale.invoice_number) {
    const parts = lastSale.invoice_number.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  const seqStr = String(nextSeq).padStart(4, '0');
  return `${prefix}${seqStr}`;
}

// POST /api/billing/sale - Process & Complete Sale
router.post('/sale', authenticateToken, (req, res) => {
  try {
    const {
      items, customer_name, customer_phone, customer_address,
      discount_type, discount_value, payment_method, amount_received
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart cannot be empty.' });
    }

    if (!['Cash', 'UPI', 'Card'].includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method selected.' });
    }

    // 1. Validate items & stock levels
    const now = new Date();
    const validatedItems = [];
    let calculatedSubtotal = 0;

    for (const item of items) {
      const medStmt = db.prepare('SELECT * FROM medicines WHERE id = ?');
      const med = medStmt.get(item.medicine_id);

      if (!med) {
        return res.status(400).json({ success: false, message: `Medicine ID ${item.medicine_id} not found.` });
      }

      // Expiry Check
      const expDate = new Date(med.expiry_date);
      if (expDate < now) {
        return res.status(400).json({ 
          success: false, 
          message: `Medicine "${med.name}" is expired (${med.expiry_date}) and cannot be billed.` 
        });
      }

      // Stock Check
      const requestedQty = parseInt(item.quantity, 10);
      if (isNaN(requestedQty) || requestedQty <= 0) {
        return res.status(400).json({ success: false, message: `Invalid quantity for ${med.name}.` });
      }

      if (med.current_stock === 0) {
        return res.status(400).json({ 
          success: false, 
          message: `This medicine (${med.name}) is currently out of stock.` 
        });
      }

      if (requestedQty > med.current_stock) {
        return res.status(400).json({ 
          success: false, 
          message: `Only ${med.current_stock} units available for ${med.name}.` 
        });
      }

      const itemTotal = med.selling_price * requestedQty;
      calculatedSubtotal += itemTotal;

      validatedItems.push({
        medicine: med,
        quantity: requestedQty,
        unit_price: med.selling_price,
        item_total: itemTotal
      });
    }

    // 2. Discount Calculation
    let discountAmt = 0;
    const discVal = parseFloat(discount_value || 0);

    if (discount_type === 'percent') {
      if (discVal < 0 || discVal > 100) {
        return res.status(400).json({ success: false, message: 'Discount percentage must be between 0% and 100%.' });
      }
      discountAmt = (calculatedSubtotal * discVal) / 100;
    } else { // 'fixed'
      if (discVal < 0) {
        return res.status(400).json({ success: false, message: 'Discount amount cannot be negative.' });
      }
      discountAmt = discVal;
    }

    if (discountAmt > calculatedSubtotal) {
      return res.status(400).json({ success: false, message: 'Discount cannot exceed subtotal amount.' });
    }

    const grandTotal = calculatedSubtotal - discountAmt;

    // 3. Payment Validation
    let amtReceived = parseFloat(amount_received || grandTotal);
    let changeAmt = 0;

    if (payment_method === 'Cash') {
      if (isNaN(amtReceived) || amtReceived < grandTotal) {
        return res.status(400).json({ 
          success: false, 
          message: `Amount received (₹${amtReceived.toFixed(2)}) is less than Grand Total (₹${grandTotal.toFixed(2)}).` 
        });
      }
      changeAmt = amtReceived - grandTotal;
    } else {
      amtReceived = grandTotal;
      changeAmt = 0;
    }

    const invoiceNumber = generateInvoiceNumber();

    // 4. Perform Transactional Save
    const insertSale = db.prepare(`
      INSERT INTO sales 
      (invoice_number, customer_name, customer_phone, customer_address, subtotal, discount_type, discount_value, discount_amount, grand_total, payment_method, amount_received, change_amount, worker_id, worker_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const saleResult = insertSale.run(
      invoiceNumber,
      customer_name ? customer_name.trim() : 'Walk-in Customer',
      customer_phone ? customer_phone.trim() : '',
      customer_address ? customer_address.trim() : '',
      calculatedSubtotal,
      discount_type || 'fixed',
      discVal,
      discountAmt,
      grandTotal,
      payment_method,
      amtReceived,
      changeAmt,
      req.user.id,
      req.user.full_name
    );

    const saleId = saleResult.lastInsertRowid;

    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (sale_id, medicine_id, medicine_name, generic_name, batch_number, unit_price, quantity, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE medicines SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    const insertStockMovement = db.prepare(`
      INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
      VALUES (?, ?, ?, ?, ?, 'Customer Sale', ?)
    `);

    for (const vi of validatedItems) {
      insertSaleItem.run(
        saleId,
        vi.medicine.id,
        vi.medicine.name,
        vi.medicine.generic_name,
        vi.medicine.batch_number,
        vi.unit_price,
        vi.quantity,
        vi.item_total
      );

      const prevStock = vi.medicine.current_stock;
      const newStock = prevStock - vi.quantity;

      updateStock.run(vi.quantity, vi.medicine.id);
      insertStockMovement.run(vi.medicine.id, vi.medicine.name, prevStock, -vi.quantity, newStock, req.user.full_name);
    }

    // Fetch saved complete sale detail
    const createdSale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

    return res.json({
      success: true,
      message: 'Sale completed successfully.',
      invoice: {
        ...createdSale,
        items: saleItems
      }
    });
  } catch (error) {
    console.error('Complete sale error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process sale.' });
  }
});

// GET /api/billing/history - Billing history list with filters
router.get('/history', authenticateToken, (req, res) => {
  try {
    const { invoice_number, customer, start_date, end_date, worker_id, payment_method } = req.query;
    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (invoice_number && invoice_number.trim() !== '') {
      query += ' AND invoice_number LIKE ?';
      params.push(`%${invoice_number.trim()}%`);
    }

    if (customer && customer.trim() !== '') {
      query += ' AND (customer_name LIKE ? OR customer_phone LIKE ?)';
      params.push(`%${customer.trim()}%`, `%${customer.trim()}%`);
    }

    if (start_date) {
      query += ' AND date(created_at) >= date(?)';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND date(created_at) <= date(?)';
      params.push(end_date);
    }

    if (worker_id) {
      query += ' AND worker_id = ?';
      params.push(worker_id);
    }

    if (payment_method && payment_method !== 'All') {
      query += ' AND payment_method = ?';
      params.push(payment_method);
    }

    query += ' ORDER BY id DESC LIMIT 200';
    const stmt = db.prepare(query);
    const sales = stmt.all(...params);

    return res.json({ success: true, count: sales.length, sales });
  } catch (error) {
    console.error('Fetch billing history error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch billing history.' });
  }
});

// GET /api/billing/invoice/:id - Invoice details
router.get('/invoice/:id', authenticateToken, (req, res) => {
  try {
    const idParam = req.params.id;
    let sale;
    if (isNaN(idParam)) {
      sale = db.prepare('SELECT * FROM sales WHERE invoice_number = ?').get(idParam);
    } else {
      sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(idParam);
    }

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);

    return res.json({
      success: true,
      invoice: {
        ...sale,
        items
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch invoice.' });
  }
});

module.exports = router;
