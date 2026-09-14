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

    const editSvg = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`;
    const keySvg = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>`;
    const blockSvg = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>`;
    const checkSvg = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;

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
              <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="UserMgmt.openEditModal(${u.id})">${editSvg} Edit</button>
              <button class="btn btn-secondary btn-sm flex items-center gap-1" onclick="UserMgmt.openResetPasswordModal(${u.id})">${keySvg} Password</button>
              ${!isSelf ? `
                <button class="btn ${u.is_active ? 'btn-danger' : 'btn-success'} btn-sm flex items-center gap-1" onclick="UserMgmt.toggleStatus(${u.id}, ${u.is_active})">
                  ${u.is_active ? blockSvg : checkSvg} ${u.is_active ? 'Deactivate' : 'Activate'}
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
    const addSvg = `<svg class="w-5 h-5 text-sky-600 inline-block align-middle mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>`;
    document.getElementById('modal-user-title').innerHTML = `${addSvg}Add New Worker / User`;
    document.getElementById('form-user').reset();
    document.getElementById('user-password-group').style.display = 'flex';
    document.getElementById('user-password-input').required = true;
    UI.openModal('modal-user');
  },

  openEditModal(id) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;

    this.editingId = id;
    const editUserSvg = `<svg class="w-5 h-5 text-sky-600 inline-block align-middle mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`;
    document.getElementById('modal-user-title').innerHTML = `${editUserSvg}Edit User Details`;
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
