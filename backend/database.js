const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'pharmacy.db');
const db = new DatabaseSync(dbPath);

// SQLite Ultra Performance Engine Tuning
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA cache_size = -64000;');   // 64MB In-Memory Cache
db.exec('PRAGMA temp_store = MEMORY;');   // In-Memory Temp Storage
db.exec('PRAGMA mmap_size = 268435456;'); // 256MB Memory Mapped I/O

function initDb() {
  // Advanced Speed Optimization Indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_search ON medicines(name, generic_name, category);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_stock ON medicines(current_stock, minimum_stock);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_med ON sale_items(medicine_id, sale_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_movements_med ON stock_movements(medicine_id);');
  // Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL, -- 'Admin / Billing Manager' or 'Billing Worker'
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Medicines Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic_name TEXT NOT NULL,
      category TEXT NOT NULL,
      manufacturer TEXT,
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL, -- YYYY-MM-DD
      purchase_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      current_stock INTEGER NOT NULL DEFAULT 0,
      minimum_stock INTEGER NOT NULL DEFAULT 10,
      gst_percent REAL DEFAULT 12.0,
      barcode TEXT UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sales Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      subtotal REAL NOT NULL,
      discount_type TEXT DEFAULT 'fixed', -- 'percent' or 'fixed'
      discount_value REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      grand_total REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'Cash', 'UPI', 'Card'
      amount_received REAL,
      change_amount REAL DEFAULT 0,
      worker_id INTEGER,
      worker_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sale Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      generic_name TEXT,
      batch_number TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);

  // Stock Movements Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      previous_quantity INTEGER NOT NULL,
      change_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reason TEXT NOT NULL, -- 'Customer Sale', 'Restock', 'Stock Audit', 'Excel Import'
      user_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);

  seedData();
}

function seedData() {
  // 1. Seed Users if table is empty
  const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = userCountStmt.get().count;

  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const adminPassword = bcrypt.hashSync('Admin@123', salt);
    const workerPassword = bcrypt.hashSync('Worker@123', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password, full_name, email, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    insertUser.run('admin', adminPassword, 'System Administrator', 'admin@medicare.com', 'Admin / Billing Manager');
    insertUser.run('worker', workerPassword, 'Rahul Sharma (Billing Staff)', 'worker@medicare.com', 'Billing Worker');
    console.log('Seeded demo users: admin & worker');
  }

  // 2. Seed Medicines if table is empty
  const medCountStmt = db.prepare('SELECT COUNT(*) as count FROM medicines');
  const medCount = medCountStmt.get().count;

  if (medCount === 0) {
    const insertMed = db.prepare(`
      INSERT INTO medicines 
      (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const medicines = [
      ['Paracetamol 500mg', 'Acetaminophen', 'Analgesics', 'Cipla Ltd', 'PCM2026A', '2027-12-31', 6.0, 10.0, 25, 10, 12.0, '8901234567890', 'Common pain reliever and fever reducer'],
      ['Cetirizine 10mg', 'Cetirizine HCl', 'Antihistamines', 'Sun Pharma', 'CET2026B', '2027-08-15', 2.5, 5.0, 40, 15, 12.0, '8901234567891', 'Antiallergic tablet for relief from cold & allergy'],
      ['Azithromycin 500mg', 'Azithromycin', 'Antibiotics', 'Lupin Pharma', 'AZI2026C', '2026-11-20', 30.0, 45.0, 18, 5, 12.0, '8901234567892', 'Broad-spectrum antibiotic tablet'],
      ['Pantoprazole 40mg', 'Pantoprazole Sodium', 'Antacids', 'Torrent Pharma', 'PAN2026D', '2027-04-10', 7.0, 12.0, 30, 10, 12.0, '8901234567893', 'Proton pump inhibitor for acidity and ulcers'],
      ['Amoxicillin 500mg', 'Amoxicillin Trihydrate', 'Antibiotics', 'Dr. Reddys', 'AMX2026E', '2027-01-25', 15.0, 25.0, 4, 10, 12.0, '8901234567894', 'Penicillin antibiotic for bacterial infections (Low Stock!)'],
      ['Ibuprofen 400mg', 'Ibuprofen', 'Analgesics', 'Abbott India', 'IBU2026F', '2027-06-30', 8.0, 15.0, 0, 10, 12.0, '8901234567895', 'Nonsteroidal anti-inflammatory drug (Out of Stock!)'],
      ['ORS Sachet', 'Oral Rehydration Salts', 'Hydration', 'Procter & Gamble', 'ORS2026G', '2028-02-14', 12.0, 20.0, 100, 20, 12.0, '8901234567896', 'Oral electrolytes rehydration formula'],
      ['Vitamin C 500mg', 'Ascorbic Acid', 'Vitamins', 'GlaxoSmithKline', 'VTC2026H', '2027-10-10', 4.0, 8.0, 50, 15, 12.0, '8901234567897', 'Chewable Vitamin C immunity supplement'],
      ['Dextromethorphan Syrup 100ml', 'Dextromethorphan', 'Cough & Cold', 'Dabur India', 'DEX2025X', '2026-08-01', 40.0, 65.0, 15, 5, 12.0, '8901234567898', 'Cough suppressant syrup (Expired!)'],
      ['Metformin 500mg', 'Metformin HCl', 'Antidiabetic', 'USV Private Ltd', 'MET2026S', '2026-08-25', 10.0, 18.0, 8, 15, 12.0, '8901234567899', 'First-line medication for type 2 diabetes (Expiring Soon!)']
    ];

    for (const med of medicines) {
      insertMed.run(...med);
    }
    console.log('Seeded sample medicines');

    // 3. Pre-seed sample sales for realistic analytics
    seedHistoricalSales();
  }
}

function seedHistoricalSales() {
  const insertSale = db.prepare(`
    INSERT INTO sales 
    (invoice_number, customer_name, customer_phone, customer_address, subtotal, discount_type, discount_value, discount_amount, grand_total, payment_method, amount_received, change_amount, worker_id, worker_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (sale_id, medicine_id, medicine_name, generic_name, batch_number, unit_price, quantity, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const todayStr = new Date().toISOString().split('T')[0];
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // Sample historical dates
  const dates = [
    { date: `${todayStr} 09:30:00`, inv: 'INV-20260809-0001', cust: 'Ramesh Patel', phone: '9876543210', items: [[1, 'Paracetamol 500mg', 'Acetaminophen', 'PCM2026A', 10.0, 2], [2, 'Cetirizine 10mg', 'Cetirizine HCl', 'CET2026B', 5.0, 1]], pay: 'Cash', recv: 30, discount: 0 },
    { date: `${todayStr} 11:15:00`, inv: 'INV-20260809-0002', cust: 'Priya Sharma', phone: '9812345678', items: [[3, 'Azithromycin 500mg', 'Azithromycin', 'AZI2026C', 45.0, 1], [4, 'Pantoprazole 40mg', 'Pantoprazole Sodium', 'PAN2026D', 12.0, 2]], pay: 'UPI', recv: 69, discount: 0 },
    { date: `${todayStr} 14:45:00`, inv: 'INV-20260809-0003', cust: 'Amit Kumar', phone: '9765432109', items: [[7, 'ORS Sachet', 'Oral Rehydration Salts', 'ORS2026G', 20.0, 5], [8, 'Vitamin C 500mg', 'Ascorbic Acid', 'VTC2026H', 8.0, 2]], pay: 'Card', recv: 116, discount: 0 },
    { date: '2026-08-08 10:20:00', inv: 'INV-20260808-0001', cust: 'Sunita Verma', phone: '9654321098', items: [[1, 'Paracetamol 500mg', 'Acetaminophen', 'PCM2026A', 10.0, 3], [4, 'Pantoprazole 40mg', 'Pantoprazole Sodium', 'PAN2026D', 12.0, 1]], pay: 'Cash', recv: 50, discount: 2 },
    { date: '2026-07-15 16:30:00', inv: 'INV-20260715-0001', cust: 'Vikram Singh', phone: '9543210987', items: [[3, 'Azithromycin 500mg', 'Azithromycin', 'AZI2026C', 45.0, 2]], pay: 'UPI', recv: 90, discount: 0 },
    { date: '2026-06-20 12:00:00', inv: 'INV-20260620-0001', cust: 'Neha Gupta', phone: '9432109876', items: [[7, 'ORS Sachet', 'Oral Rehydration Salts', 'ORS2026G', 20.0, 10]], pay: 'Cash', recv: 200, discount: 10 }
  ];

  for (const s of dates) {
    let subtotal = 0;
    for (const it of s.items) {
      subtotal += it[4] * it[5];
    }
    const discountAmt = s.discount;
    const grandTotal = subtotal - discountAmt;
    const change = Math.max(0, s.recv - grandTotal);

    const res = insertSale.run(
      s.inv, s.cust, s.phone, 'Main Street, City',
      subtotal, 'fixed', discountAmt, discountAmt, grandTotal,
      s.pay, s.recv, change, 2, 'Rahul Sharma (Billing Staff)', s.date
    );

    const saleId = res.lastInsertRowid;
    for (const it of s.items) {
      insertSaleItem.run(saleId, it[0], it[1], it[2], it[3], it[4], it[5], it[4] * it[5]);
    }
  }

  console.log('Seeded sample historical sales records');
}

initDb();

module.exports = db;
