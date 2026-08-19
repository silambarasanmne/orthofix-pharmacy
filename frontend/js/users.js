/* ==========================================================================
   WORKER USER MANAGEMENT MODULE (ADMIN ONLY)
   ========================================================================== */

const UserMgmt = {
  users: [],
  editingId: null,
  resetPasswordUserId: null,

  init() {
    this.bindEvents();
    this.loadUsers();
  },

  bindEvents() {
    const userForm = document.getElementById('form-user');
    if (userForm) {
      userForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveUser();
      });
    }

    const resetForm = document.getElementById('form-reset-password');
    if (resetForm) {
      resetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveResetPassword();
      });
    }
  },

  async loadUsers() {
    try {
      const res = await API.get('/users');
      if (res.success) {
        this.users = res.users;
        this.renderTable();
      }
    } catch (error) {
      UI.showToast('Failed to load user list.', 'error');
    }
  },

  renderTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (this.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">No users found.</td></tr>`;
      return;
    }

    const currentUser = API.getUser();

    tbody.innerHTML = this.users.map(u => {
      const isSelf = currentUser && currentUser.id === u.id;
      const statusBadge = u.is_active ? 
        '<span class="badge badge-instock">ACTIVE</span>' : 
        '<span class="badge badge-outstock">INACTIVE</span>';

      return `
        <tr>
          <td><strong>#${u.id}</strong></td>
          <td><strong style="color: #0284c7;">${u.username}</strong></td>
          <td>${u.full_name}</td>
          <td>${u.email || '-'}</td>
          <td><span class="badge" style="background:#e0f2fe; color:#0284c7;">${u.role}</span></td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="UserMgmt.openEditModal(${u.id})"><i class="fa-solid fa-user-pen"></i> Edit</button>
              <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="UserMgmt.openResetPasswordModal(${u.id})"><i class="fa-solid fa-key"></i> Password</button>
              ${!isSelf ? `
                <button class="btn ${u.is_active ? 'btn-danger' : 'btn-success'} btn-sm flex items-center gap-1" onclick="UserMgmt.toggleStatus(${u.id}, ${u.is_active})">
                  <i class="fa-solid ${u.is_active ? 'fa-user-xmark' : 'fa-user-check'}"></i> ${u.is_active ? 'Deactivate' : 'Activate'}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddModal() {
    this.editingId = null;
    document.getElementById('modal-user-title').innerHTML = '<i class="fa-solid fa-user-plus text-sky-600 mr-2"></i>Add New Worker / User';
    document.getElementById('form-user').reset();
    document.getElementById('user-password-group').style.display = 'flex';
    document.getElementById('user-password-input').required = true;
    UI.openModal('modal-user');
  },

  openEditModal(id) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;

    this.editingId = id;
    document.getElementById('modal-user-title').innerHTML = '<i class="fa-solid fa-user-pen text-sky-600 mr-2"></i>Edit User Details';
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-username').disabled = true; // Cannot edit username
    document.getElementById('user-fullname').value = user.full_name;
    document.getElementById('user-email').value = user.email || '';
    document.getElementById('user-role').value = user.role;
    
    // Hide password field on edit (use Reset Password modal instead)
    document.getElementById('user-password-group').style.display = 'none';
    document.getElementById('user-password-input').required = false;

    UI.openModal('modal-user');
  },

  async saveUser() {
    const payload = {
      username: document.getElementById('user-username').value,
      full_name: document.getElementById('user-fullname').value,
      email: document.getElementById('user-email').value,
      role: document.getElementById('user-role').value,
      password: document.getElementById('user-password-input').value
    };

    try {
      if (this.editingId) {
        const res = await API.put(`/users/${this.editingId}`, payload);
        if (res.success) {
          UI.showToast('User updated successfully!', 'success');
          UI.closeModal('modal-user');
          this.loadUsers();
        }
      } else {
        const res = await API.post('/users', payload);
        if (res.success) {
          UI.showToast('User created successfully!', 'success');
          UI.closeModal('modal-user');
          this.loadUsers();
        }
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to save user.', 'error');
    }
  },

  async toggleStatus(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    try {
      const res = await API.patch(`/users/${id}/status`, { is_active: newStatus });
      if (res.success) {
        UI.showToast(res.message, 'success');
        this.loadUsers();
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to update user status.', 'error');
    }
  },

  openResetPasswordModal(id) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;

    this.resetPasswordUserId = id;
    document.getElementById('reset-user-name').textContent = user.full_name;
    document.getElementById('new-password-input').value = '';
    UI.openModal('modal-reset-password');
  },

  async saveResetPassword() {
    const newPassword = document.getElementById('new-password-input').value;
    if (!newPassword) return;

    try {
      const res = await API.post(`/users/${this.resetPasswordUserId}/reset-password`, { new_password: newPassword });
      if (res.success) {
        UI.showToast('Password reset successfully!', 'success');
        UI.closeModal('modal-reset-password');
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to reset password.', 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('users-table-body')) {
    UserMgmt.init();
  }
});

window.UserMgmt = UserMgmt;
