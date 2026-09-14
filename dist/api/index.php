<?php
// api/index.php - Central REST API Router for Hospital/Pharmacy Management System

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/jwt.php';

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = preg_replace('#^/api/#', '/', $uri); // Strip /api prefix
$uri = rtrim($uri, '/');
if ($uri === '') $uri = '/';

$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents('php://input');
$body = [];
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}
if (empty($body) && !empty($_POST)) {
    $body = $_POST;
    $firstKey = key($_POST);
    if (is_string($firstKey) && substr($firstKey, 0, 1) === '{') {
        $decoded = json_decode($firstKey, true);
        if (is_array($decoded)) {
            $body = $decoded;
        }
    }
}
if (empty($body) && !empty($_REQUEST)) {
    $body = $_REQUEST;
}

header('Content-Type: application/json');



function sendJson($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// -----------------------------------------------------------------------------
// 1. AUTHENTICATION ROUTING
// -----------------------------------------------------------------------------
if ($uri === '/auth/login' && $method === 'POST') {
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (!$username || !$password) {
        sendJson(['success' => false, 'message' => 'Username and password are required.'], 400);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        sendJson(['success' => false, 'message' => 'Invalid username or password.'], 401);
    }

    if (!$user['is_active']) {
        sendJson(['success' => false, 'message' => 'Account is deactivated. Contact Admin.'], 403);
    }

    $token = generateJWT([
        'id' => $user['id'],
        'username' => $user['username'],
        'full_name' => $user['full_name'],
        'role' => $user['role']
    ]);

    sendJson([
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'full_name' => $user['full_name'],
            'role' => $user['role']
        ]
    ]);
}

if ($uri === '/auth/me' && $method === 'GET') {
    $authUser = requireAuth();
    sendJson(['success' => true, 'user' => $authUser]);
}

// -----------------------------------------------------------------------------
// 2. MEDICINES ROUTING
// -----------------------------------------------------------------------------
if ($uri === '/medicines/categories' && $method === 'GET') {
    requireAuth();
    $stmt = $pdo->query("SELECT DISTINCT category FROM medicines WHERE category IS NOT NULL ORDER BY category ASC");
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
    sendJson(['success' => true, 'categories' => array_values(array_filter($rows))]);
}

if ($uri === '/medicines/stock-movements' && $method === 'GET') {
    requireAdminUser();
    $stmt = $pdo->query("SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 100");
    sendJson(['success' => true, 'movements' => $stmt->fetchAll()]);
}

if ($uri === '/medicines' && $method === 'GET') {
    requireAuth();
    $search = trim($_GET['search'] ?? '');
    $category = $_GET['category'] ?? 'All';
    $status = $_GET['status'] ?? '';

    $query = "SELECT * FROM medicines WHERE 1=1";
    $params = [];

    if ($search !== '') {
        $query .= " AND (name LIKE ? OR generic_name LIKE ? OR barcode LIKE ? OR batch_number LIKE ?)";
        $s = "%$search%";
        $params = array_merge($params, [$s, $s, $s, $s]);
    }

    if ($category !== 'All') {
        $query .= " AND category = ?";
        $params[] = $category;
    }

    $todayStr = date('Y-m-d');
    if ($status === 'in_stock') {
        $query .= " AND current_stock > 0 AND expiry_date >= ?";
        $params[] = $todayStr;
    } elseif ($status === 'low_stock') {
        $query .= " AND current_stock <= minimum_stock AND current_stock > 0";
    } elseif ($status === 'out_of_stock') {
        $query .= " AND current_stock = 0";
    } elseif ($status === 'expired') {
        $query .= " AND expiry_date < ?";
        $params[] = $todayStr;
    }

    $query .= " ORDER BY name ASC";
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $medicines = $stmt->fetchAll();

    $now = time();
    $in30Days = $now + (30 * 86400);

    $enriched = array_map(function($m) use ($now, $in30Days) {
        $expTime = strtotime($m['expiry_date']);
        $stockStatus = 'IN STOCK';
        $isExpired = false;

        if ($expTime < $now) {
            $stockStatus = 'EXPIRED';
            $isExpired = true;
        } elseif ($m['current_stock'] == 0) {
            $stockStatus = 'OUT OF STOCK';
        } elseif ($m['current_stock'] <= $m['minimum_stock']) {
            $stockStatus = 'LOW STOCK';
        }

        $m['stock_status'] = $stockStatus;
        $m['is_expired'] = $isExpired;
        $m['is_expiring_soon'] = (!$isExpired && $expTime <= $in30Days);
        return $m;
    }, $medicines);

    sendJson(['success' => true, 'count' => count($enriched), 'medicines' => $enriched]);
}

if ($uri === '/medicines' && $method === 'POST') {
    requireAdminUser();
    $name = trim($body['name'] ?? '');
    $generic_name = trim($body['generic_name'] ?? '');
    $category = trim($body['category'] ?? '');
    $batch_number = trim($body['batch_number'] ?? '');
    $expiry_date = trim($body['expiry_date'] ?? '');
    $purchase_price = floatval($body['purchase_price'] ?? 0);
    $selling_price = floatval($body['selling_price'] ?? 0);
    $current_stock = intval($body['current_stock'] ?? 0);
    $minimum_stock = intval($body['minimum_stock'] ?? 10);
    $gst_percent = floatval($body['gst_percent'] ?? 12.0);
    $barcode = trim($body['barcode'] ?? '');
    $manufacturer = trim($body['manufacturer'] ?? '');
    $description = trim($body['description'] ?? '');

    if (!$name || !$generic_name || !$category || !$batch_number || !$expiry_date) {
        sendJson(['success' => false, 'message' => 'Please fill in all required fields.'], 400);
    }

    $stmt = $pdo->prepare("
        INSERT INTO medicines (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$name, $generic_name, $category, $manufacturer, $batch_number, $expiry_date, $purchase_price, $selling_price, $current_stock, $minimum_stock, $gst_percent, $barcode ?: null, $description]);

    sendJson(['success' => true, 'message' => 'Medicine added successfully.', 'id' => $pdo->lastInsertId()]);
}

if (preg_match('#^/medicines/(\d+)$#', $uri, $m) && $method === 'PUT') {
    requireAdminUser();
    $id = $m[1];
    $stmt = $pdo->prepare("
        UPDATE medicines SET name=?, generic_name=?, category=?, manufacturer=?, batch_number=?, expiry_date=?, purchase_price=?, selling_price=?, current_stock=?, minimum_stock=?, gst_percent=?, barcode=?, description=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    ");
    $stmt->execute([
        trim($body['name']), trim($body['generic_name']), trim($body['category']),
        trim($body['manufacturer'] ?? ''), trim($body['batch_number']), trim($body['expiry_date']),
        floatval($body['purchase_price']), floatval($body['selling_price']), intval($body['current_stock']),
        intval($body['minimum_stock']), floatval($body['gst_percent'] ?? 12.0),
        trim($body['barcode'] ?? '') ?: null, trim($body['description'] ?? ''), $id
    ]);
    sendJson(['success' => true, 'message' => 'Medicine updated successfully.']);
}

if (preg_match('#^/medicines/(\d+)$#', $uri, $m) && $method === 'DELETE') {
    requireAdminUser();
    $id = $m[1];
    $stmt = $pdo->prepare("DELETE FROM medicines WHERE id = ?");
    $stmt->execute([$id]);
    sendJson(['success' => true, 'message' => 'Medicine deleted successfully.']);
}

// -----------------------------------------------------------------------------
// MEDICINES FILE UPLOAD & IMPORT / EXPORT ROUTING
// -----------------------------------------------------------------------------
if ($uri === '/medicines/template' && $method === 'GET') {
    requireAuth();
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="medicine_import_template.csv"');
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Medicine Name', 'Generic Name', 'Category', 'Manufacturer', 'Batch Number', 'Expiry Date (YYYY-MM-DD)', 'Purchase Price', 'Selling Price', 'Current Stock', 'Minimum Stock', 'GST %', 'Barcode', 'Description']);
    fputcsv($output, ['Amoxicillin 500mg', 'Amoxicillin Trihydrate', 'Antibiotics', 'GlaxoSmithKline', 'AMX2026A', '2027-12-31', '15.00', '25.00', '100', '15', '12.0', '8901234567899', 'Broad spectrum antibiotic capsule']);
    fclose($output);
    exit;
}

if ($uri === '/medicines/export-excel' && $method === 'GET') {
    requireAuth();
    $stmt = $pdo->query("SELECT * FROM medicines ORDER BY name ASC");
    $medicines = $stmt->fetchAll();

    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="medicines_inventory_export.csv"');

    $output = fopen('php://output', 'w');
    fputcsv($output, ['ID', 'Medicine Name', 'Generic Name', 'Category', 'Manufacturer', 'Batch Number', 'Expiry Date', 'Purchase Price', 'Selling Price', 'Current Stock', 'Minimum Stock', 'GST %', 'Barcode', 'Description']);
    foreach ($medicines as $m) {
        fputcsv($output, [
            $m['id'], $m['name'], $m['generic_name'], $m['category'], $m['manufacturer'],
            $m['batch_number'], $m['expiry_date'], $m['purchase_price'], $m['selling_price'],
            $m['current_stock'], $m['minimum_stock'], $m['gst_percent'], $m['barcode'], $m['description']
        ]);
    }
    fclose($output);
    exit;
}

if ($uri === '/medicines/import-preview' && $method === 'POST') {
    requireAdminUser();

    $uploadedFile = $_FILES['excel_file'] ?? null;
    if (!$uploadedFile || $uploadedFile['error'] !== UPLOAD_ERR_OK) {
        sendJson(['success' => false, 'message' => 'Please select a valid CSV or Excel file to upload.'], 400);
    }

    $tmpPath = $uploadedFile['tmp_name'];
    $handle = fopen($tmpPath, 'r');
    if (!$handle) {
        sendJson(['success' => false, 'message' => 'Failed to read uploaded file.'], 400);
    }

    // Read header row
    $header = fgetcsv($handle, 2000, ",");
    if (!$header) {
        rewind($handle);
        $header = fgetcsv($handle, 2000, ";");
    }

    if (!$header) {
        fclose($handle);
        sendJson(['success' => false, 'message' => 'Uploaded file is empty or formatted incorrectly.'], 400);
    }

    $headerMap = [];
    foreach ($header as $idx => $colName) {
        $clean = strtolower(trim(preg_replace('/[\x00-\x1F\x7F-\xFF]/', '', $colName)));
        $headerMap[$clean] = $idx;
    }

    $findCol = function($row, $candidates) use ($headerMap) {
        foreach ($candidates as $cand) {
            $candClean = strtolower(trim($cand));
            foreach ($headerMap as $hName => $colIdx) {
                if ($hName === $candClean || strpos($hName, $candClean) !== false) {
                    if (isset($row[$colIdx])) {
                        $val = trim($row[$colIdx]);
                        if ($val !== '') return $val;
                    }
                }
            }
        }
        return '';
    };

    $stmtB = $pdo->query("SELECT barcode FROM medicines WHERE barcode IS NOT NULL AND barcode != ''");
    $existingBarcodes = array_flip($stmtB->fetchAll(PDO::FETCH_COLUMN));
    $sheetBarcodesSeen = [];

    $rawCount = 0;
    $validRows = [];
    $invalidRows = [];

    while (($row = fgetcsv($handle, 2000, ",")) !== false) {
        if (count($row) === 1 && trim($row[0]) === '') continue;
        $rawCount++;
        $rowNum = $rawCount + 1;
        $errors = [];

        $name = $findCol($row, ['Medicine Name', 'Name', 'Med Name']);
        $genericName = $findCol($row, ['Generic Name', 'Generic', 'Salt']);
        $category = $findCol($row, ['Category', 'Cat']) ?: 'General';
        $manufacturer = $findCol($row, ['Manufacturer', 'Mfg', 'Company']);
        $batchNumber = $findCol($row, ['Batch Number', 'Batch Num', 'Batch #', 'Batch No', 'Batch']) ?: ('BATCH-' . time() . '-' . $rawCount);
        $expiryDate = $findCol($row, ['Expiry Date', 'Expiry Dat', 'Expiry', 'Exp Date', 'Exp']);
        $rawPPrice = $findCol($row, ['Purchase Price', 'Purchase P', 'Buy Price', 'Purchase']);
        $rawSPrice = $findCol($row, ['Selling Price', 'Selling Pric', 'Sell Price', 'MRP', 'Price']);
        $rawStock = $findCol($row, ['Current Stock', 'Current St', 'Stock', 'Qty']);
        $rawMinStock = $findCol($row, ['Minimum Stock', 'Minimum', 'Min Stock']);
        $rawGst = $findCol($row, ['GST Percentage', 'GST Perce', 'GST %', 'GST', 'Tax']);
        $barcode = $findCol($row, ['Barcode', 'EAN', 'UPC']);
        $description = $findCol($row, ['Description', 'Desc', 'Notes']);

        $purchasePrice = floatval($rawPPrice ?: 0);
        $sellingPrice = floatval($rawSPrice ?: 0);
        $currentStock = intval($rawStock ?: 0);
        $minimumStock = intval($rawMinStock ?: 10);
        $gstPercent = floatval($rawGst ?: 12.0);

        if (!$name) $errors[] = 'Medicine Name is required.';
        if (!$genericName) $errors[] = 'Generic Name is required.';
        if ($purchasePrice < 0) $errors[] = 'Invalid Purchase Price.';
        if ($sellingPrice < 0) $errors[] = 'Invalid Selling Price.';
        if ($currentStock < 0) $errors[] = 'Invalid Stock quantity.';
        if ($minimumStock < 0) $errors[] = 'Invalid Minimum Stock.';

        if (!$expiryDate) {
            $errors[] = 'Expiry Date is required.';
        } else {
            if (preg_match('#^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$#', $expiryDate, $mDate)) {
                $expiryDate = sprintf('%04d-%02d-%02d', $mDate[3], $mDate[2], $mDate[1]);
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $expiryDate)) {
                $errors[] = 'Expiry Date format must be YYYY-MM-DD.';
            }
        }

        if ($barcode) {
            if (isset($existingBarcodes[$barcode]) || isset($sheetBarcodesSeen[$barcode])) {
                $barcode = $barcode . '-' . $rawCount;
            }
            $sheetBarcodesSeen[$barcode] = true;
        }

        $itemPayload = [
            'row_number' => $rowNum,
            'name' => $name,
            'generic_name' => $genericName,
            'category' => $category,
            'manufacturer' => $manufacturer,
            'batch_number' => $batchNumber,
            'expiry_date' => $expiryDate,
            'purchase_price' => $purchasePrice,
            'selling_price' => $sellingPrice,
            'current_stock' => $currentStock,
            'minimum_stock' => $minimumStock,
            'gst_percent' => $gstPercent,
            'barcode' => $barcode ?: null,
            'description' => $description
        ];

        if (empty($errors)) {
            $validRows[] = $itemPayload;
        } else {
            $invalidRows[] = array_merge($itemPayload, ['errors' => $errors]);
        }
    }
    fclose($handle);

    sendJson([
        'success' => true,
        'total_records' => $rawCount,
        'valid_count' => count($validRows),
        'invalid_count' => count($invalidRows),
        'valid_rows' => $validRows,
        'invalid_rows' => $invalidRows
    ]);
}

if ($uri === '/medicines/import-confirm' && $method === 'POST') {
    requireAdminUser();
    $rows = $body['rows'] ?? [];
    if (!is_array($rows) || empty($rows)) {
        sendJson(['success' => false, 'message' => 'No valid rows provided for import.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO medicines (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, gst_percent, barcode, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $count = 0;
        foreach ($rows as $r) {
            $stmt->execute([
                $r['name'], $r['generic_name'], $r['category'], $r['manufacturer'] ?? '',
                $r['batch_number'], $r['expiry_date'], floatval($r['purchase_price']),
                floatval($r['selling_price']), intval($r['current_stock']), intval($r['minimum_stock'] ?? 10),
                floatval($r['gst_percent'] ?? 12.0), $r['barcode'] ?: null, $r['description'] ?? ''
            ]);
            $count++;
        }
        $pdo->commit();
        sendJson(['success' => true, 'message' => "Successfully imported $count medicines into inventory."]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendJson(['success' => false, 'message' => 'Failed to import medicines: ' . $e->getMessage()], 500);
    }
}

if ($uri === '/reports/export-sales-excel' && $method === 'GET') {
    requireAuth();
    $fromDate = $_GET['from_date'] ?? date('Y-m-01');
    $toDate = $_GET['to_date'] ?? date('Y-m-d');
    
    $stmt = $pdo->prepare("SELECT * FROM sales WHERE date(created_at) BETWEEN ? AND ? ORDER BY id DESC");
    $stmt->execute([$fromDate, $toDate]);
    $sales = $stmt->fetchAll();
    
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="sales_report_' . $fromDate . '_to_' . $toDate . '.csv"');
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Invoice Number', 'Date', 'Customer Name', 'Customer Phone', 'Payment Method', 'Subtotal', 'Discount', 'Grand Total', 'Billed By']);
    foreach ($sales as $s) {
        fputcsv($output, [
            $s['invoice_number'],
            $s['created_at'],
            $s['customer_name'],
            $s['customer_phone'],
            $s['payment_method'],
            $s['subtotal'],
            $s['discount_amount'],
            $s['grand_total'],
            $s['worker_name']
        ]);
    }
    fclose($output);
    exit;
}


// -----------------------------------------------------------------------------
// 3. BILLING ROUTING
// -----------------------------------------------------------------------------
if ($uri === '/billing/sale' && $method === 'POST') {
    $authUser = requireAuth();
    $items = $body['items'] ?? [];
    $customer_name = trim($body['customer_name'] ?? 'Walk-in Customer');
    $customer_phone = trim($body['customer_phone'] ?? '');
    $customer_address = trim($body['customer_address'] ?? '');
    $discount_type = $body['discount_type'] ?? 'fixed';
    $discount_value = floatval($body['discount_value'] ?? 0);
    $payment_method = $body['payment_method'] ?? 'Cash';
    $amount_received = floatval($body['amount_received'] ?? 0);

    if (!is_array($items) || empty($items)) {
        sendJson(['success' => false, 'message' => 'Cart cannot be empty.'], 400);
    }

    $validatedItems = [];
    $calculatedSubtotal = 0;

    foreach ($items as $item) {
        $stmtM = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
        $stmtM->execute([$item['medicine_id']]);
        $med = $stmtM->fetch();

        if (!$med) {
            sendJson(['success' => false, 'message' => 'Medicine not found.'], 400);
        }

        $qty = intval($item['quantity']);
        if ($qty <= 0 || $qty > $med['current_stock']) {
            sendJson(['success' => false, 'message' => "Insufficient stock for {$med['name']}."], 400);
        }

        $itemTotal = $med['selling_price'] * $qty;
        $calculatedSubtotal += $itemTotal;
        $validatedItems[] = ['med' => $med, 'qty' => $qty, 'item_total' => $itemTotal];
    }

    $discountAmt = ($discount_type === 'percent') ? ($calculatedSubtotal * $discount_value) / 100 : $discount_value;
    $grandTotal = max(0, $calculatedSubtotal - $discountAmt);
    $changeAmt = max(0, $amount_received - $grandTotal);

    $dateStr = date('Ymd');
    $prefix = "INV-{$dateStr}-";
    $seqStmt = $pdo->query("SELECT invoice_number FROM sales WHERE invoice_number LIKE '{$prefix}%' ORDER BY id DESC LIMIT 1");
    $lastInv = $seqStmt->fetchColumn();
    $nextSeq = 1;
    if ($lastInv) {
        $parts = explode('-', $lastInv);
        $nextSeq = intval(end($parts)) + 1;
    }
    $invNumber = $prefix . str_pad($nextSeq, 4, '0', STR_PAD_LEFT);

    $pdo->beginTransaction();
    try {
        $insertSale = $pdo->prepare("
            INSERT INTO sales (invoice_number, customer_name, customer_phone, customer_address, subtotal, discount_type, discount_value, discount_amount, grand_total, payment_method, amount_received, change_amount, worker_id, worker_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $insertSale->execute([$invNumber, $customer_name, $customer_phone, $customer_address, $calculatedSubtotal, $discount_type, $discount_value, $discountAmt, $grandTotal, $payment_method, $amount_received, $changeAmt, $authUser['id'], $authUser['full_name']]);
        $saleId = $pdo->lastInsertId();

        $insertItem = $pdo->prepare("
            INSERT INTO sale_items (sale_id, medicine_id, medicine_name, generic_name, batch_number, unit_price, quantity, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $updateStock = $pdo->prepare("UPDATE medicines SET current_stock = current_stock - ? WHERE id = ?");
        $insertMove = $pdo->prepare("INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name) VALUES (?, ?, ?, ?, ?, 'Customer Sale', ?)");

        foreach ($validatedItems as $vi) {
            $m = $vi['med'];
            $insertItem->execute([$saleId, $m['id'], $m['name'], $m['generic_name'], $m['batch_number'], $m['selling_price'], $vi['qty'], $vi['item_total']]);
            $updateStock->execute([$vi['qty'], $m['id']]);
            $insertMove->execute([$m['id'], $m['name'], $m['current_stock'], -$vi['qty'], $m['current_stock'] - $vi['qty'], $authUser['full_name']]);
        }

        $pdo->commit();

        $createdSale = $pdo->query("SELECT * FROM sales WHERE id = $saleId")->fetch();
        $saleItems = $pdo->query("SELECT * FROM sale_items WHERE sale_id = $saleId")->fetchAll();
        $createdSale['items'] = $saleItems;

        sendJson(['success' => true, 'message' => 'Sale completed successfully.', 'invoice' => $createdSale]);
    } catch (Exception $e) {
        $pdo->rollBack();
        sendJson(['success' => false, 'message' => 'Failed to process sale: ' . $e->getMessage()], 500);
    }
}

if ($uri === '/billing/history' && $method === 'GET') {
    requireAuth();
    $stmt = $pdo->query("SELECT * FROM sales ORDER BY id DESC LIMIT 200");
    sendJson(['success' => true, 'sales' => $stmt->fetchAll()]);
}

if (preg_match('#^/billing/invoice/(.+)$#', $uri, $m) && $method === 'GET') {
    requireAuth();
    $invKey = $m[1];
    $stmt = $pdo->prepare(is_numeric($invKey) ? "SELECT * FROM sales WHERE id = ?" : "SELECT * FROM sales WHERE invoice_number = ?");
    $stmt->execute([$invKey]);
    $sale = $stmt->fetch();

    if (!$sale) {
        sendJson(['success' => false, 'message' => 'Invoice not found.'], 404);
    }

    $itemsStmt = $pdo->prepare("SELECT * FROM sale_items WHERE sale_id = ?");
    $itemsStmt->execute([$sale['id']]);
    $sale['items'] = $itemsStmt->fetchAll();

    sendJson(['success' => true, 'invoice' => $sale]);
}

// -----------------------------------------------------------------------------
// 4. REPORTS ROUTING
// -----------------------------------------------------------------------------
if ($uri === '/reports/summary' && $method === 'GET') {
    requireAuth();
    $todayStr = date('Y-m-d');
    
    $todaySales = $pdo->query("SELECT SUM(grand_total) as total, COUNT(*) as cnt FROM sales WHERE date(created_at) = '$todayStr'")->fetch();
    $totalMeds = $pdo->query("SELECT COUNT(*) as cnt FROM medicines")->fetchColumn();
    $lowStock = $pdo->query("SELECT COUNT(*) as cnt FROM medicines WHERE current_stock <= minimum_stock AND current_stock > 0")->fetchColumn();
    $outOfStock = $pdo->query("SELECT COUNT(*) as cnt FROM medicines WHERE current_stock = 0")->fetchColumn();

    sendJson([
        'success' => true,
        'metrics' => [
            'today_revenue' => floatval($todaySales['total'] ?: 0),
            'today_orders' => intval($todaySales['cnt'] ?: 0),
            'total_medicines' => intval($totalMeds),
            'low_stock_count' => intval($lowStock),
            'out_of_stock_count' => intval($outOfStock)
        ]
    ]);
}

// -----------------------------------------------------------------------------
// 5. USERS ROUTING
// -----------------------------------------------------------------------------
if ($uri === '/users' && $method === 'GET') {
    requireAdminUser();
    $stmt = $pdo->query("SELECT id, username, full_name, email, role, is_active, created_at FROM users ORDER BY id ASC");
    sendJson(['success' => true, 'users' => $stmt->fetchAll()]);
}

if ($uri === '/users' && $method === 'POST') {
    requireAdminUser();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $full_name = trim($body['full_name'] ?? '');
    $email = trim($body['email'] ?? '');
    $role = ($body['role'] ?? '') === 'Admin / Billing Manager' ? 'Admin / Billing Manager' : 'Billing Worker';

    if (!$username || !$password || !$full_name) {
        sendJson(['success' => false, 'message' => 'Username, password, and full name are required.'], 400);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO users (username, password, full_name, email, role, is_active) VALUES (?, ?, ?, ?, ?, 1)");
    $stmt->execute([$username, $hash, $full_name, $email, $role]);

    sendJson(['success' => true, 'message' => 'User created successfully.', 'user_id' => $pdo->lastInsertId()]);
}

// Fallback 404
sendJson(['success' => false, 'message' => 'Endpoint not found.'], 404);
