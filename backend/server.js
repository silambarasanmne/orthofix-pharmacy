const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');

// Initialize Database connection & seed
require('./database');

const authRoutes = require('./routes/auth').router;
const medicineRoutes = require('./routes/medicines');
const billingRoutes = require('./routes/billing');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

// High-Performance Middleware Pipeline
app.use(compression()); // Gzip response compression for ultra-fast payload delivery
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static assets with browser caching
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: '1d',
  etag: true
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

// SPA Page Fallback Routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/billing', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/billing.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

app.get('/medicines', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/medicines.html'));
});

app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/history.html'));
});

app.get('/reports', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reports.html'));
});

app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/users.html'));
});

// Fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 ORTHOFIX SPECIALITY CLINIC Server running on port ${PORT}`);
  console.log(`=======================================================`);
});
