const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('./auth');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/medicines - Search & List medicines
router.get('/', authenticateToken, (req, res) => {
  try {
    const { search, category, status } = req.query;
    let query = 'SELECT * FROM medicines WHERE 1=1';
    const params = [];

    if (search && search.trim() !== '') {
      query += ' AND (name LIKE ? OR generic_name LIKE ? OR barcode LIKE ? OR batch_number LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    if (status) {
      if (status === 'in_stock') {
        query += ' AND current_stock > 0 AND expiry_date >= ?';
        params.push(todayStr);
      } else if (status === 'low_stock') {
        query += ' AND current_stock <= minimum_stock AND current_stock > 0';
      } else if (status === 'out_of_stock') {
        query += ' AND current_stock = 0';
      } else if (status === 'expired') {
        query += ' AND expiry_date < ?';
        params.push(todayStr);
      } else if (status === 'expiring_30') {
        const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        query += ' AND expiry_date >= ? AND expiry_date <= ?';
        params.push(todayStr, in30);
      } else if (status === 'expiring_90') {
        const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        query += ' AND expiry_date >= ? AND expiry_date <= ?';
        params.push(todayStr, in90);
      }
    }

    query += ' ORDER BY name ASC';
    const stmt = db.prepare(query);
    const medicines = stmt.all(...params);

    // Compute dynamic status flags for each medicine
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const enriched = medicines.map(m => {
      const expDate = new Date(m.expiry_date);
      let stockStatus = 'IN STOCK';
      let isExpired = false;

      if (expDate < now) {
        stockStatus = 'EXPIRED';
        isExpired = true;
      } else if (m.current_stock === 0) {
        stockStatus = 'OUT OF STOCK';
      } else if (m.current_stock <= m.minimum_stock) {
        stockStatus = 'LOW STOCK';
      }

      return {
        ...m,
        stock_status: stockStatus,
        is_expired: isExpired,
        is_expiring_soon: !isExpired && expDate <= in30Days
      };
    });

    return res.json({ success: true, count: enriched.length, medicines: enriched });
  } catch (error) {
    console.error('Fetch medicines error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch medicines.' });
  }
});

// GET /api/medicines/categories - List unique categories
router.get('/categories', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT DISTINCT category FROM medicines ORDER BY category ASC');
    const rows = stmt.all();
    const categories = rows.map(r => r.category).filter(Boolean);
    return res.json({ success: true, categories });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
});

// GET /api/medicines/stock-movements - Admin stock movement history
router.get('/stock-movements', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 100');
    const movements = stmt.all();
    return res.json({ success: true, movements });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch stock movements.' });
  }
});

// GET /api/medicines/template - Download Excel template (Public/Auth friendly)
router.get('/template', (req, res) => {
  try {
    const templateData = [
      {
        'Medicine Name': 'Paracetamol 500mg',
        'Generic Name': 'Acetaminophen',
        'Category': 'Analgesics',
        'Manufacturer': 'Cipla Ltd',
        'Batch Number': 'PCM2026X',
        'Expiry Date': '2027-12-31',
        'Purchase Price': 6.0,
        'Selling Price': 10.0,
        'Current Stock': 50,
        'Minimum Stock': 10,
        'GST Percentage': 12.0,
        'Barcode': '8901234560001',
        'Description': 'Pain reliever tablet'
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(wb, ws, 'Medicine_Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="medicine_import_template.xlsx"');
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate template.' });
  }
});

// GET /api/medicines/export-excel - Admin export all medicines
router.get('/export-excel', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM medicines ORDER BY name ASC');
    const medicines = stmt.all();

    const exportRows = medicines.map(m => ({
      'Medicine ID': m.id,
      'Medicine Name': m.name,
      'Generic Name': m.generic_name,
      'Category': m.category,
      'Manufacturer': m.manufacturer || '',
      'Batch Number': m.batch_number,
      'Expiry Date': m.expiry_date,
      'Purchase Price (₹)': m.purchase_price,
      'Selling Price (₹)': m.selling_price,
      'Current Stock': m.current_stock,
      'Minimum Stock': m.minimum_stock,
      'GST %': m.gst_percent,
      'Barcode': m.barcode || '',
      'Description': m.description || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Medicines');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Medicines_Export_${new Date().toISOString().split('T')[0]}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export medicines Excel.' });
  }
});

// GET /api/medicines/export-stock-excel - Admin export stock summary
router.get('/export-stock-excel', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM medicines ORDER BY name ASC');
    const medicines = stmt.all();

    const stockRows = medicines.map(m => {
      // Calculate sold quantity from sale_items
      const soldStmt = db.prepare('SELECT SUM(quantity) as total_sold FROM sale_items WHERE medicine_id = ?');
      const sold = soldStmt.get(m.id).total_sold || 0;
      const openingStock = m.current_stock + sold;

      return {
        'Medicine ID': m.id,
        'Medicine Name': m.name,
        'Generic Name': m.generic_name,
        'Category': m.category,
        'Batch Number': m.batch_number,
        'Opening Stock (Est)': openingStock,
        'Stock Sold': sold,
        'Current Stock': m.current_stock,
        'Minimum Stock': m.minimum_stock,
        'Stock Status': m.current_stock === 0 ? 'OUT OF STOCK' : (m.current_stock <= m.minimum_stock ? 'LOW STOCK' : 'IN STOCK')
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(stockRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Stock_Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Stock_Summary_${new Date().toISOString().split('T')[0]}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to export stock Excel.' });
  }
});

// POST /api/medicines/import-preview - Parse & validate uploaded Excel file
router.post('/import-preview', authenticateToken, requireAdmin, upload.single('excel_file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel file (.xlsx or .xls).' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'Excel file contains no sheets.' });
    }

    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (rawRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file is empty.' });
    }

    const validRows = [];
    const invalidRows = [];

    // Existing barcodes for duplicate detection
    const existingBarcodesStmt = db.prepare("SELECT barcode FROM medicines WHERE barcode IS NOT NULL AND barcode != ''");
    const existingBarcodes = new Set(existingBarcodesStmt.all().map(r => r.barcode));
    const sheetBarcodesSeen = new Set();

    // Helper function for flexible column header matching
    const getValue = (row, candidates) => {
      const rowKeys = Object.keys(row);
      for (const candidate of candidates) {
        const match = rowKeys.find(k => {
          const cleanK = k.trim().toLowerCase();
          const cleanC = candidate.trim().toLowerCase();
          return cleanK === cleanC || cleanK.startsWith(cleanC) || cleanK.includes(cleanC);
        });
        if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== '') {
          return String(row[match]).trim();
        }
      }
      return '';
    };

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2; // 1-indexed including header
      const errors = [];

      const name = getValue(row, ['Medicine Name', 'Name', 'Med Name']);
      const genericName = getValue(row, ['Generic Name', 'Generic', 'Salt']);
      const category = getValue(row, ['Category', 'Cat']) || 'General';
      const manufacturer = getValue(row, ['Manufacturer', 'Mfg', 'Company']);
      const batchNumber = getValue(row, ['Batch Number', 'Batch Num', 'Batch #', 'Batch No', 'Batch']) || `BATCH-${Date.now()}`;
      let expiryDate = getValue(row, ['Expiry Date', 'Expiry Dat', 'Expiry', 'Exp Date', 'Exp']);
      const rawPPrice = getValue(row, ['Purchase Price', 'Purchase P', 'Buy Price', 'Purchase']);
      const rawSPrice = getValue(row, ['Selling Price', 'Selling Pric', 'Sell Price', 'MRP', 'Price']);
      const rawStock = getValue(row, ['Current Stock', 'Current St', 'Stock', 'Qty']);
      const rawMinStock = getValue(row, ['Minimum Stock', 'Minimum', 'Min Stock']);
      const rawGst = getValue(row, ['GST Percentage', 'GST Perce', 'GST %', 'GST', 'Tax']);
      let barcode = getValue(row, ['Barcode', 'EAN', 'UPC']);
      const description = getValue(row, ['Description', 'Desc', 'Notes']);

      const purchasePrice = parseFloat(rawPPrice || 0);
      const sellingPrice = parseFloat(rawSPrice || 0);
      const currentStock = parseInt(rawStock || 0, 10);
      const minimumStock = parseInt(rawMinStock || 10, 10);
      const gstPercent = parseFloat(rawGst || 12.0);

      if (!name) errors.push('Medicine Name is required.');
      if (!genericName) errors.push('Generic Name is required.');
      if (isNaN(purchasePrice) || purchasePrice < 0) errors.push('Invalid Purchase Price.');
      if (isNaN(sellingPrice) || sellingPrice < 0) errors.push('Invalid Selling Price.');
      if (isNaN(currentStock) || currentStock < 0) errors.push('Invalid Stock quantity.');
      if (isNaN(minimumStock) || minimumStock < 0) errors.push('Invalid Minimum Stock.');

      // Date parsing & formatting
      if (!expiryDate) {
        errors.push('Expiry Date is required.');
      } else {
        // Convert Excel serial date numbers (e.g. 46387 -> 2027-12-31)
        if (!isNaN(expiryDate) && Number(expiryDate) > 30000) {
          const dateObj = XLSX.SSF.parse_date_code(Number(expiryDate));
          expiryDate = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
        }
        // Normalize DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD if needed
        if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(expiryDate)) {
          const parts = expiryDate.split(/[\/-]/);
          expiryDate = `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
          errors.push('Expiry Date format must be YYYY-MM-DD.');
        }
      }

      // Barcode validation
      if (barcode) {
        if (existingBarcodes.has(barcode) || sheetBarcodesSeen.has(barcode)) {
          barcode = `${barcode}-${idx + 1}`;
        }
        sheetBarcodesSeen.add(barcode);
      }

      const itemPayload = {
        row_number: rowNum,
        name,
        generic_name: genericName,
        category,
        manufacturer,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        purchase_price: purchasePrice,
        selling_price: sellingPrice,
        current_stock: currentStock,
        minimum_stock: minimumStock,
        gst_percent: gstPercent,
        barcode: barcode || null,
        description
      };

      if (errors.length === 0) {
        validRows.push(itemPayload);
      } else {
        invalidRows.push({ ...itemPayload, errors });
      }
    });

    return res.json({
      success: true,
      total_records: rawRows.length,
      valid_count: validRows.length,
      invalid_count: invalidRows.length,
      valid_rows: validRows,
      invalid_rows: invalidRows
    });
  } catch (error) {
    console.error('Import preview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to parse uploaded Excel file.' });
  }
});

// POST /api/medicines/import-confirm - Insert confirmed valid rows
router.post('/import-confirm', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid rows provided for import.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO medicines 
      (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertStockMovement = db.prepare(`
      INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
      VALUES (?, ?, 0, ?, ?, 'Excel Import', ?)
    `);

    let importedCount = 0;
    for (const r of rows) {
      const res = insertStmt.run(
        r.name,
        r.generic_name,
        r.category || 'General',
        r.manufacturer || '',
        r.batch_number || 'BATCH-001',
        r.expiry_date,
        r.purchase_price,
        r.selling_price,
        r.current_stock,
        r.minimum_stock,
        r.gst_percent || 12.0,
        r.barcode || null,
        r.description || ''
      );
      const newMedId = res.lastInsertRowid;

      if (r.current_stock > 0) {
        insertStockMovement.run(newMedId, r.name, r.current_stock, r.current_stock, req.user.full_name);
      }
      importedCount++;
    }

    return res.json({
      success: true,
      message: `Successfully imported ${importedCount} medicines.`,
      imported_count: importedCount
    });
  } catch (error) {
    console.error('Import confirm error:', error);
    return res.status(500).json({ success: false, message: 'Failed to insert imported medicines into database.' });
  }
});

// GET /api/medicines/:id - Single medicine details
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM medicines WHERE id = ?');
    const med = stmt.get(req.params.id);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }
    return res.json({ success: true, medicine: med });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch medicine details.' });
  }
});

// POST /api/medicines - Add new medicine (Admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const {
      name, generic_name, category, manufacturer, batch_number,
      expiry_date, purchase_price, selling_price, current_stock,
      minimum_stock, gst_percent, barcode, description
    } = req.body;

    if (!name || !generic_name || !category || !batch_number || !expiry_date) {
      return res.status(400).json({ success: false, message: 'Name, Generic Name, Category, Batch Number, and Expiry Date are required.' });
    }

    const pPrice = parseFloat(purchase_price || 0);
    const sPrice = parseFloat(selling_price || 0);
    const stock = parseInt(current_stock || 0, 10);
    const minStock = parseInt(minimum_stock || 10, 10);

    if (sPrice < 0 || pPrice < 0 || stock < 0 || minStock < 0) {
      return res.status(400).json({ success: false, message: 'Prices and stock values cannot be negative.' });
    }

    if (barcode && barcode.trim() !== '') {
      const checkBarcode = db.prepare('SELECT id FROM medicines WHERE barcode = ?');
      if (checkBarcode.get(barcode.trim())) {
        return res.status(400).json({ success: false, message: `Barcode "${barcode}" is already assigned to another medicine.` });
      }
    }

    const insertStmt = db.prepare(`
      INSERT INTO medicines 
      (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      name.trim(),
      generic_name.trim(),
      category.trim(),
      manufacturer ? manufacturer.trim() : '',
      batch_number.trim(),
      expiry_date.trim(),
      pPrice,
      sPrice,
      stock,
      minStock,
      parseFloat(gst_percent || 12.0),
      barcode && barcode.trim() !== '' ? barcode.trim() : null,
      description ? description.trim() : ''
    );

    const newId = result.lastInsertRowid;

    if (stock > 0) {
      const stockLog = db.prepare(`
        INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
        VALUES (?, ?, 0, ?, ?, 'Initial Stock', ?)
      `);
      stockLog.run(newId, name.trim(), stock, stock, req.user.full_name);
    }

    return res.json({ success: true, message: 'Medicine added successfully.', medicine_id: newId });
  } catch (error) {
    console.error('Add medicine error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add medicine.' });
  }
});

// PUT /api/medicines/:id - Edit medicine (Admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const medId = req.params.id;
    const stmt = db.prepare('SELECT * FROM medicines WHERE id = ?');
    const existing = stmt.get(medId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }

    const {
      name, generic_name, category, manufacturer, batch_number,
      expiry_date, purchase_price, selling_price, current_stock,
      minimum_stock, gst_percent, barcode, description
    } = req.body;

    const pPrice = parseFloat(purchase_price || 0);
    const sPrice = parseFloat(selling_price || 0);
    const stock = parseInt(current_stock, 10);
    const minStock = parseInt(minimum_stock, 10);

    if (sPrice < 0 || pPrice < 0 || stock < 0 || minStock < 0) {
      return res.status(400).json({ success: false, message: 'Prices and stock values cannot be negative.' });
    }

    if (barcode && barcode.trim() !== '') {
      const checkBarcode = db.prepare('SELECT id FROM medicines WHERE barcode = ? AND id != ?');
      if (checkBarcode.get(barcode.trim(), medId)) {
        return res.status(400).json({ success: false, message: `Barcode "${barcode}" is assigned to another medicine.` });
      }
    }

    // Check if stock changed directly during edit
    if (stock !== existing.current_stock) {
      const change = stock - existing.current_stock;
      const logStmt = db.prepare(`
        INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
        VALUES (?, ?, ?, ?, ?, 'Direct Manual Edit', ?)
      `);
      logStmt.run(medId, name.trim(), existing.current_stock, change, stock, req.user.full_name);
    }

    const updateStmt = db.prepare(`
      UPDATE medicines SET
        name = ?, generic_name = ?, category = ?, manufacturer = ?, batch_number = ?,
        expiry_date = ?, purchase_price = ?, selling_price = ?, current_stock = ?,
        minimum_stock = ?, gst_percent = ?, barcode = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    updateStmt.run(
      name.trim(),
      generic_name.trim(),
      category.trim(),
      manufacturer ? manufacturer.trim() : '',
      batch_number.trim(),
      expiry_date.trim(),
      pPrice,
      sPrice,
      stock,
      minStock,
      parseFloat(gst_percent || 12.0),
      barcode && barcode.trim() !== '' ? barcode.trim() : null,
      description ? description.trim() : '',
      medId
    );

    return res.json({ success: true, message: 'Medicine updated successfully.' });
  } catch (error) {
    console.error('Update medicine error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update medicine.' });
  }
});

// POST /api/medicines/:id/stock - Adjust stock quantity (Admin only)
router.post('/:id/stock', authenticateToken, requireAdmin, (req, res) => {
  try {
    const medId = req.params.id;
    const { change_quantity, reason } = req.body;

    const changeQty = parseInt(change_quantity, 10);
    if (isNaN(changeQty) || changeQty === 0) {
      return res.status(400).json({ success: false, message: 'Valid non-zero quantity change is required.' });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Reason for stock update is required.' });
    }

    const medStmt = db.prepare('SELECT * FROM medicines WHERE id = ?');
    const med = medStmt.get(medId);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }

    const newStock = med.current_stock + changeQty;
    if (newStock < 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot reduce stock by ${Math.abs(changeQty)}. Current stock is only ${med.current_stock}.` 
      });
    }

    // Update stock
    db.prepare('UPDATE medicines SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStock, medId);

    // Record Movement Audit
    db.prepare(`
      INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(medId, med.name, med.current_stock, changeQty, newStock, reason.trim(), req.user.full_name);

    return res.json({
      success: true,
      message: `Stock updated successfully for ${med.name}.`,
      previous_stock: med.current_stock,
      added_quantity: changeQty,
      new_stock: newStock
    });
  } catch (error) {
    console.error('Stock adjustment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to adjust stock.' });
  }
});

// DELETE /api/medicines/:id - Delete medicine (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const medId = req.params.id;
    const stmt = db.prepare('SELECT name FROM medicines WHERE id = ?');
    const med = stmt.get(medId);
    if (!med) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }

    // Clean up dependent audit/sales references to avoid Foreign Key constraint failures
    db.prepare('DELETE FROM stock_movements WHERE medicine_id = ?').run(medId);
    db.prepare('DELETE FROM sale_items WHERE medicine_id = ?').run(medId);

    // Delete medicine from medicines table
    db.prepare('DELETE FROM medicines WHERE id = ?').run(medId);

    return res.json({ success: true, message: `Medicine "${med.name}" deleted successfully.` });
  } catch (error) {
    console.error('Delete medicine error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete medicine.' });
  }
});

module.exports = router;
