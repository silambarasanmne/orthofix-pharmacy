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
  const salt = bcrypt.genSaltSync(10);
  const adminPassword = bcrypt.hashSync('Admin@123', salt);
  const workerPassword = bcrypt.hashSync('Worker@123', salt);

  // 1. Seed Users (with INSERT OR IGNORE)
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, full_name, email, role, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  insertUser.run('admin', adminPassword, 'System Administrator', 'admin@medicare.com', 'Admin / Billing Manager');
  insertUser.run('worker', workerPassword, 'Rahul Sharma (Billing Staff)', 'worker@medicare.com', 'Billing Worker');
  insertUser.run('anita', workerPassword, 'Anita Roy (Senior Pharmacist)', 'anita@medicare.com', 'Billing Worker');
  insertUser.run('karan', workerPassword, 'Karan Patel (Billing Executive)', 'karan@medicare.com', 'Billing Worker');
  insertUser.run('suresh', adminPassword, 'Suresh Nair (Store Inventory Manager)', 'suresh@medicare.com', 'Admin / Billing Manager');

  // 2. Seed Medicines (with INSERT OR IGNORE)
  const insertMed = db.prepare(`
    INSERT OR IGNORE INTO medicines 
    (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const medicines = [
    ['Paracetamol 500mg', 'Acetaminophen', 'Analgesics', 'Cipla Ltd', 'PCM2026A', '2027-12-31', 6.0, 10.0, 45, 10, 12.0, '8901234567890', 'Common pain reliever and fever reducer'],
    ['Cetirizine 10mg', 'Cetirizine HCl', 'Antihistamines', 'Sun Pharma', 'CET2026B', '2027-08-15', 2.5, 5.0, 60, 15, 12.0, '8901234567891', 'Antiallergic tablet for relief from cold & allergy'],
    ['Azithromycin 500mg', 'Azithromycin', 'Antibiotics', 'Lupin Pharma', 'AZI2026C', '2026-11-20', 30.0, 45.0, 25, 5, 12.0, '8901234567892', 'Broad-spectrum antibiotic tablet'],
    ['Pantoprazole 40mg', 'Pantoprazole Sodium', 'Antacids', 'Torrent Pharma', 'PAN2026D', '2027-04-10', 7.0, 12.0, 50, 10, 12.0, '8901234567893', 'Proton pump inhibitor for acidity and ulcers'],
    ['Amoxicillin 500mg', 'Amoxicillin Trihydrate', 'Antibiotics', 'Dr. Reddys', 'AMX2026E', '2027-01-25', 15.0, 25.0, 4, 10, 12.0, '8901234567894', 'Penicillin antibiotic for bacterial infections (Low Stock!)'],
    ['Ibuprofen 400mg', 'Ibuprofen', 'Analgesics', 'Abbott India', 'IBU2026F', '2027-06-30', 8.0, 15.0, 0, 10, 12.0, '8901234567895', 'Nonsteroidal anti-inflammatory drug (Out of Stock!)'],
    ['ORS Sachet', 'Oral Rehydration Salts', 'Hydration', 'Procter & Gamble', 'ORS2026G', '2028-02-14', 12.0, 20.0, 120, 20, 12.0, '8901234567896', 'Oral electrolytes rehydration formula'],
    ['Vitamin C 500mg', 'Ascorbic Acid', 'Vitamins', 'GlaxoSmithKline', 'VTC2026H', '2027-10-10', 4.0, 8.0, 80, 15, 12.0, '8901234567897', 'Chewable Vitamin C immunity supplement'],
    ['Dextromethorphan Syrup 100ml', 'Dextromethorphan', 'Cough & Cold', 'Dabur India', 'DEX2025X', '2026-08-01', 40.0, 65.0, 15, 5, 12.0, '8901234567898', 'Cough suppressant syrup (Expired!)'],
    ['Metformin 500mg', 'Metformin HCl', 'Antidiabetic', 'USV Private Ltd', 'MET2026S', '2026-08-25', 10.0, 18.0, 8, 15, 12.0, '8901234567899', 'First-line medication for type 2 diabetes (Expiring Soon!)'],
    ['Dolo 650mg', 'Paracetamol 650mg', 'Analgesics', 'Micro Labs', 'DOL2026M', '2027-11-30', 12.0, 20.0, 65, 20, 12.0, '8901234567900', 'High-strength fever & pain relief tablet'],
    ['Omeprazole 20mg', 'Omeprazole', 'Antacids', 'Cipla Ltd', 'OMP2026N', '2027-09-15', 5.0, 9.5, 45, 15, 12.0, '8901234567901', 'Gastric acid reducer for heartburn'],
    ['Atorvastatin 10mg', 'Atorvastatin Calcium', 'Cardiovascular', 'Sun Pharma', 'ATV2026O', '2028-03-20', 18.0, 28.0, 35, 10, 12.0, '8901234567902', 'Cholesterol lowering statin medication'],
    ['Telmisartan 40mg', 'Telmisartan', 'Cardiovascular', 'Glenmark', 'TEL2026P', '2027-07-10', 14.0, 22.0, 50, 15, 12.0, '8901234567903', 'Blood pressure management tablet'],
    ['Montelukast 10mg', 'Montelukast Sodium', 'Respiratory', 'Mankind Pharma', 'MON2026Q', '2027-10-05', 22.0, 36.0, 30, 10, 12.0, '8901234567904', 'Asthma and allergic rhinitis control tablet'],
    ['Multivitamin Gold Capsules', 'Multivitamins & Minerals', 'Supplements', 'HealthKart', 'MVG2026R', '2028-06-30', 45.0, 75.0, 85, 20, 18.0, '8901234567905', 'Daily essential multivitamins & zinc capsules'],
    ['Ciprofloxacin 500mg', 'Ciprofloxacin HCl', 'Antibiotics', 'Ranbaxy Labs', 'CIP2026S', '2027-05-18', 16.0, 26.0, 3, 10, 12.0, '8901234567906', 'Antibiotic tablet for bacterial infections (Low Stock!)'],
    ['Calcium Carbonate + Vit D3', 'Calcium & Vitamin D3', 'Bone Health', 'Shelcal', 'CAL2026T', '2028-01-15', 30.0, 50.0, 55, 15, 12.0, '8901234567907', 'Calcium & D3 supplement for strong bones'],
    ['B-Complex Syrup 200ml', 'B-Complex with L-Lysine', 'Supplements', 'Meyer Organics', 'BCP2026U', '2027-12-01', 50.0, 85.0, 20, 8, 12.0, '8901234567908', 'Appetite booster & B-Complex tonic for adults & children'],
    ['Metoprolol 50mg', 'Metoprolol Succinate', 'Cardiovascular', 'AstraZeneca', 'MET2026V', '2027-08-30', 25.0, 42.0, 28, 10, 12.0, '8901234567909', 'Beta-blocker for hypertension & heart rate']
  ];

  for (const med of medicines) {
    insertMed.run(...med);
  }

  // 3. Pre-seed sample historical sales for realistic analytics
  seedHistoricalSales();
}

function seedHistoricalSales() {
  const insertSale = db.prepare(`
    INSERT OR IGNORE INTO sales 
    (invoice_number, customer_name, customer_phone, customer_address, subtotal, discount_type, discount_value, discount_amount, grand_total, payment_method, amount_received, change_amount, worker_id, worker_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (sale_id, medicine_id, medicine_name, generic_name, batch_number, unit_price, quantity, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getMedByName = db.prepare('SELECT id, generic_name, batch_number, selling_price FROM medicines WHERE name = ? LIMIT 1');

  const todayStr = new Date().toISOString().split('T')[0];

  const salesData = [
    { date: `${todayStr} 09:30:00`, inv: 'INV-20260819-0001', cust: 'Ramesh Patel', phone: '9876543210', items: [['Paracetamol 500mg', 2], ['Cetirizine 10mg', 1]], pay: 'Cash', recv: 30, discount: 0, wName: 'Rahul Sharma (Billing Staff)' },
    { date: `${todayStr} 11:15:00`, inv: 'INV-20260819-0002', cust: 'Priya Sharma', phone: '9812345678', items: [['Azithromycin 500mg', 1], ['Pantoprazole 40mg', 2]], pay: 'UPI', recv: 69, discount: 0, wName: 'Anita Roy (Senior Pharmacist)' },
    { date: `${todayStr} 14:45:00`, inv: 'INV-20260819-0003', cust: 'Amit Kumar', phone: '9765432109', items: [['ORS Sachet', 5], ['Vitamin C 500mg', 2]], pay: 'Card', recv: 116, discount: 0, wName: 'Karan Patel (Billing Executive)' },
    { date: `${todayStr} 16:10:00`, inv: 'INV-20260819-0004', cust: 'Deepak Verma', phone: '9833445566', items: [['Dolo 650mg', 2], ['Multivitamin Gold Capsules', 1]], pay: 'UPI', recv: 115, discount: 0, wName: 'Rahul Sharma (Billing Staff)' },
    { date: `${todayStr} 17:45:00`, inv: 'INV-20260819-0005', cust: 'Kavita Menon', phone: '9711223344', items: [['Telmisartan 40mg', 2], ['Calcium Carbonate + Vit D3', 1]], pay: 'Cash', recv: 100, discount: 4, wName: 'Anita Roy (Senior Pharmacist)' },
    { date: '2026-08-18 10:20:00', inv: 'INV-20260818-0001', cust: 'Sunita Verma', phone: '9654321098', items: [['Paracetamol 500mg', 3], ['Pantoprazole 40mg', 1]], pay: 'Cash', recv: 50, discount: 2, wName: 'Karan Patel (Billing Executive)' },
    { date: '2026-08-17 15:30:00', inv: 'INV-20260817-0001', cust: 'Vikram Singh', phone: '9543210987', items: [['Azithromycin 500mg', 2], ['Multivitamin Gold Capsules', 1]], pay: 'UPI', recv: 165, discount: 0, wName: 'Rahul Sharma (Billing Staff)' },
    { date: '2026-08-15 12:00:00', inv: 'INV-20260815-0001', cust: 'Neha Gupta', phone: '9432109876', items: [['ORS Sachet', 10]], pay: 'Cash', recv: 200, discount: 10, wName: 'Anita Roy (Senior Pharmacist)' },
    { date: '2026-07-25 14:15:00', inv: 'INV-20260725-0001', cust: 'Suresh Raina', phone: '9321098765', items: [['Atorvastatin 10mg', 2], ['Telmisartan 40mg', 2]], pay: 'Card', recv: 100, discount: 0, wName: 'Rahul Sharma (Billing Staff)' }
  ];

  for (const s of salesData) {
    let subtotal = 0;
    const resolvedItems = [];
    for (const [medName, qty] of s.items) {
      const med = getMedByName.get(medName);
      if (med) {
        const unitPrice = med.selling_price;
        const totalPrice = unitPrice * qty;
        subtotal += totalPrice;
        resolvedItems.push({
          id: med.id,
          name: medName,
          genericName: med.generic_name,
          batchNumber: med.batch_number,
          unitPrice,
          qty,
          totalPrice
        });
      }
    }

    if (resolvedItems.length === 0) continue;

    const discountAmt = s.discount;
    const grandTotal = subtotal - discountAmt;
    const change = Math.max(0, s.recv - grandTotal);

    const res = insertSale.run(
      s.inv, s.cust, s.phone, '124 Healthcare Avenue, City',
      subtotal, 'fixed', discountAmt, discountAmt, grandTotal,
      s.pay, s.recv, change, 2, s.wName, s.date
    );

    if (res && res.changes > 0) {
      const saleId = res.lastInsertRowid;
      for (const item of resolvedItems) {
        insertSaleItem.run(
          saleId, item.id, item.name, item.genericName, item.batchNumber,
          item.unitPrice, item.qty, item.totalPrice
        );
      }
    }
  }

  console.log('Seeded enriched sample historical sales records');
}

initDb();

module.exports = db;
