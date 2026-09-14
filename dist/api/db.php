<?php
// api/db.php - SQLite PDO Database Connection & Auto-Seeding Engine

$dbDir = __DIR__ . '/../database';
if (!file_exists($dbDir)) {
    mkdir($dbDir, 0755, true);
}

$dbPath = $dbDir . '/pharmacy.db';

try {
    $pdo = new PDO("sqlite:" . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // SQLite Performance Optimizations
    $pdo->exec("PRAGMA journal_mode = WAL;");
    $pdo->exec("PRAGMA synchronous = NORMAL;");
    $pdo->exec("PRAGMA foreign_keys = ON;");
} catch (PDOException $e) {
    header('Content-Type: application/json', true, 500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

function initDb($pdo) {
    // 1. Users Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 2. Medicines Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            generic_name TEXT NOT NULL,
            category TEXT NOT NULL,
            manufacturer TEXT,
            batch_number TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
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
    ");

    // 3. Sales Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            customer_address TEXT,
            subtotal REAL NOT NULL,
            discount_type TEXT DEFAULT 'fixed',
            discount_value REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            grand_total REAL NOT NULL,
            payment_method TEXT NOT NULL,
            amount_received REAL,
            change_amount REAL DEFAULT 0,
            worker_id INTEGER,
            worker_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 4. Sale Items Table
    $pdo->exec("
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
    ");

    // 5. Stock Movements Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            medicine_name TEXT NOT NULL,
            previous_quantity INTEGER NOT NULL,
            change_quantity INTEGER NOT NULL,
            new_quantity INTEGER NOT NULL,
            reason TEXT NOT NULL,
            user_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (medicine_id) REFERENCES medicines(id)
        );
    ");

    // Seed Default Users if empty
    $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM users");
    $row = $stmt->fetch();
    if ($row['cnt'] == 0) {
        $adminPass = password_hash('Admin@123', PASSWORD_BCRYPT);
        $workerPass = password_hash('Worker@123', PASSWORD_BCRYPT);

        $insert = $pdo->prepare("INSERT INTO users (username, password, full_name, email, role, is_active) VALUES (?, ?, ?, ?, ?, 1)");
        $insert->execute(['admin', $adminPass, 'System Administrator', 'admin@medicare.com', 'Admin / Billing Manager']);
        $insert->execute(['worker', $workerPass, 'Rahul Sharma (Billing Staff)', 'worker@medicare.com', 'Billing Worker']);
        $insert->execute(['anita', $workerPass, 'Anita Roy (Senior Pharmacist)', 'anita@medicare.com', 'Billing Worker']);
    }

    // Seed Default Medicines if empty
    $stmtM = $pdo->query("SELECT COUNT(*) as cnt FROM medicines");
    $rowM = $stmtM->fetch();
    if ($rowM['cnt'] == 0) {
        $insertM = $pdo->prepare("
            INSERT INTO medicines (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $meds = [
            ['Paracetamol 500mg', 'Acetaminophen', 'Analgesics', 'Cipla Ltd', 'PCM2026A', '2027-12-31', 6.0, 10.0, 45, 10, 12.0, '8901234567890', 'Common pain reliever and fever reducer'],
            ['Cetirizine 10mg', 'Cetirizine HCl', 'Antihistamines', 'Sun Pharma', 'CET2026B', '2027-08-15', 2.5, 5.0, 60, 15, 12.0, '8901234567891', 'Antiallergic tablet for relief from cold & allergy'],
            ['Azithromycin 500mg', 'Azithromycin', 'Antibiotics', 'Lupin Pharma', 'AZI2026C', '2026-11-20', 30.0, 45.0, 25, 5, 12.0, '8901234567892', 'Broad-spectrum antibiotic tablet'],
            ['Pantoprazole 40mg', 'Pantoprazole Sodium', 'Antacids', 'Torrent Pharma', 'PAN2026D', '2027-04-10', 7.0, 12.0, 50, 10, 12.0, '8901234567893', 'Proton pump inhibitor for acidity and ulcers'],
            ['Dolo 650mg', 'Paracetamol 650mg', 'Analgesics', 'Micro Labs', 'DOL2026M', '2027-11-30', 12.0, 20.0, 65, 20, 12.0, '8901234567900', 'High-strength fever & pain relief tablet']
        ];
        foreach ($meds as $m) {
            $insertM->execute($m);
        }
    }
}

initDb($pdo);
