# 🌐 BigRock Domain & cPanel Hosting Guide
## ORTHOFIX SPECIALITY CLINIC — POS & Pharmacy Management System (PHP Edition)

This guide walks you step-by-step through hosting your application on **BigRock cPanel Shared Hosting** using native **PHP** and **SQLite** (No Node.js daemon required!).

---

## 📋 Requirements & Pre-Checks

1. **BigRock Domain Name** (e.g., `orthofixpharmacy.com` or `yourdomain.com`)
2. **BigRock Linux Shared Hosting** with **cPanel** access
3. **PHP Version**: **7.4+** or **8.x** (with `pdo_sqlite` enabled, standard on BigRock cPanel)

---

## 🚀 Step-by-Step PHP Deployment Walkthrough (100% BigRock Compatible)

### Step 1: Connect your BigRock Domain (DNS Setup)

1. Log into your **[BigRock Control Panel](https://www.bigrock.in)**.
2. Go to **Domains** and select your domain name.
3. Verify **Name Servers** point to your BigRock hosting (e.g., `dns1.linuxhosting.bigrock.in`, `dns2.linuxhosting.bigrock.in`).

---

### Step 2: Upload Pre-Built PHP Project Zip to cPanel

1. Log in to your **cPanel** (`https://yourdomain.com:2083` or via BigRock Panel).
2. Open **File Manager** (under *Files*).
3. Navigate to `public_html` (or your domain folder).
4. Upload `orthofix-pharmacy-working-project.zip` directly into `public_html`.
5. Right-click the `.zip` file and click **Extract**.
6. Ensure the following structure exists in `public_html`:
   - `login.html`, `billing.html`, `dashboard.html`, `medicines.html`, `history.html`, `reports.html`, `users.html`
   - `index.php`
   - `.htaccess`
   - `api/` (`db.php`, `index.php`, `jwt.php`)
   - `css/`, `js/`, `images/`, `database/`

---

### Step 3: Verify File Permissions in cPanel

1. In cPanel File Manager, ensure the `database/` folder has **0755** permissions (read, write, execute by owner/server).
2. The SQLite database `database/pharmacy.db` will automatically seed initial default data when the first API request is received!

---

### Step 4: Activate Free SSL Certificate (HTTPS)

1. In cPanel, navigate to **Security** ➔ **SSL/TLS Status**.
2. Select your domain and click **Run AutoSSL**.
3. Green SSL lock icons will activate within 1-2 minutes.

---

### Step 5: Test & Verify your Live PHP Website

1. Visit `https://yourdomain.com` in your browser.
2. You will see the **ORTHOFIX SPECIALITY CLINIC** login screen!
3. Log in with the pre-configured system accounts:
   - **Admin / Billing Manager**: Username `admin` | Password `Admin@123`
   - **Billing Worker**: Username `worker` | Password `Worker@123`

---

## ⚡ Key Features of PHP Hosting Bundle
- **Native PHP Router**: `api/index.php` routes all requests dynamically using `.htaccess`.
- **Pure PHP JWT Auth**: `api/jwt.php` handles HS256 JWT tokens without external composer packages.
- **Embedded SQLite DB**: `api/db.php` automatically creates and seeds SQLite tables in `database/pharmacy.db`.
- **Zero Server Setup**: Works out of the box on any standard Apache/LiteSpeed PHP web server!

---

## 🎯 Summary Checklist

- [x] Pre-built ZIP uploaded & extracted to `public_html`
- [x] `.htaccess` active with rewrite rules and authorization headers
- [x] PHP `pdo_sqlite` extension enabled
- [x] AutoSSL activated for HTTPS

