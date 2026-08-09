const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('./auth');

// GET /api/users - List all users (Admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, username, full_name, email, role, is_active, created_at FROM users ORDER BY id ASC');
    const users = stmt.all();
    return res.json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// POST /api/users - Create new worker (Admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Username, password, and full name are required.' });
    }

    const checkUser = db.prepare('SELECT id FROM users WHERE username = ?');
    if (checkUser.get(username.trim())) {
      return res.status(400).json({ success: false, message: `Username "${username}" already exists.` });
    }

    const userRole = role === 'Admin / Billing Manager' ? 'Admin / Billing Manager' : 'Billing Worker';
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password, full_name, email, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    const result = insertStmt.run(
      username.trim(),
      hashedPassword,
      full_name.trim(),
      email ? email.trim() : '',
      userRole
    );

    return res.json({
      success: true,
      message: 'User created successfully.',
      user_id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

// PUT /api/users/:id - Edit worker details (Admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const { full_name, email, role } = req.body;

    const userStmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const existing = userStmt.get(userId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const userRole = role === 'Admin / Billing Manager' ? 'Admin / Billing Manager' : 'Billing Worker';

    const updateStmt = db.prepare(`
      UPDATE users SET full_name = ?, email = ?, role = ? WHERE id = ?
    `);

    updateStmt.run(full_name.trim(), email ? email.trim() : '', userRole, userId);
    return res.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// PATCH /api/users/:id/status - Toggle active/deactive (Admin only)
router.patch('/:id/status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const { is_active } = req.body;

    if (parseInt(userId, 10) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }

    const statusVal = is_active ? 1 : 0;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(statusVal, userId);

    return res.json({ 
      success: true, 
      message: `User status changed to ${statusVal ? 'Active' : 'Inactive'}.` 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update user status.' });
  }
});

// POST /api/users/:id/reset-password - Reset user password (Admin only)
router.post('/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const { new_password } = req.body;

    if (!new_password || new_password.trim() === '') {
      return res.status(400).json({ success: false, message: 'New password is required.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(new_password, salt);

    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

module.exports = router;
