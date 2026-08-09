# 🚀 Hosting & Deployment Guide — ORTHOFIX SPECIALITY CLINIC

This guide provides instructions to host and deploy the **ORTHOFIX SPECIALITY CLINIC POS & Pharmacy Management System** on any cloud provider, Docker container, or VPS server.

---

## 📁 Included Hosting Files

| File Basename | Purpose / Description |
|---|---|
| [`Dockerfile`](file:///d:/simbu/hospital-management/Dockerfile) | Production Docker image container configuration with Node 22 Alpine & healthchecks. |
| [`docker-compose.yml`](file:///d:/simbu/hospital-management/docker-compose.yml) | One-command deployment config with volume persistence for SQLite database. |
| [`ecosystem.config.js`](file:///d:/simbu/hospital-management/ecosystem.config.js) | PM2 Process Manager configuration for Linux / Windows VPS servers. |
| [`.env.example`](file:///d:/simbu/hospital-management/.env.example) | Production environment variable template. |

---

## ☁️ Option 1: Free / One-Click Cloud Hosting (Render.com / Railway.app / Render)

### Hosting on Render.com (Free Tier):
1. Sign up on **[Render.com](https://render.com)**.
2. Click **New +** ➔ **Web Service**.
3. Connect your Git repository.
4. Set the following settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node backend/server.js`
   - **Port**: `5000`
5. Click **Create Web Service**! Render will deploy your application and provide a live `https://your-app.onrender.com` URL.

---

## 🐳 Option 2: Hosting via Docker Compose (Recommended for Any VPS / Cloud)

Run the container using single command:

```bash
# 1. Clone repository or copy project files to your server
cd hospital-management

# 2. Build and launch Docker container in background
docker compose up -d

# 3. View running container logs
docker compose logs -f
```

Your live system will be running at `http://your-server-ip:5000`!

---

## 💻 Option 3: Hosting on Ubuntu / Windows VPS using PM2 & Node.js

```bash
# 1. Install PM2 process manager globally
npm install -g pm2

# 2. Navigate to project root folder
cd hospital-management

# 3. Install production dependencies
npm install --production

# 4. Start app using PM2 ecosystem config
pm2 start ecosystem.config.js

# 5. Save PM2 process list to auto-start on server reboot
pm2 save
pm2 startup
```

---

## 🔐 Credentials & Default Admin

- **Sign In Portal**: `http://localhost:5000` (or `http://your-server-ip:5000`)
- **Billing Worker**: Username `worker` \| Password `Worker@123`
- **Admin / Manager**: Username `admin` \| Password `Admin@123`
