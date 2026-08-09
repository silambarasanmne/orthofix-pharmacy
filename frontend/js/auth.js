/* ==========================================================================
   AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC) WITH AUTO-LOGOUT
   ========================================================================== */

const Auth = {
  // Inactivity Auto-Logout Settings (15 Minutes Inactivity Limit)
  idleTimer: null,
  warningTimer: null,
  inactivityLimitMs: 15 * 60 * 1000,   // 15 Minutes
  warningThresholdMs: 14 * 60 * 1000,  // Warning at 14 Minutes

  initPageGuard() {
    const currentPath = window.location.pathname;
    const isLoginPage = currentPath.includes('login') || currentPath === '/';
    const user = API.getUser();
    const token = API.getToken();

    if (!token || !user) {
      if (!isLoginPage) {
        window.location.href = '/login.html';
      }
      return;
    }

    // User is logged in
    if (isLoginPage) {
      window.location.href = '/billing.html';
      return;
    }

    // Role Enforcement Guard
    const isAdminOnlyPage = currentPath.includes('dashboard') ||
                            currentPath.includes('medicines') || 
                            currentPath.includes('reports') || 
                            currentPath.includes('users');

    if (isAdminOnlyPage && user.role !== 'Admin / Billing Manager') {
      UI.showToast('Admin password required to access Management Portal.', 'warning');
      setTimeout(() => {
        window.location.href = '/billing.html';
      }, 600);
      return;
    }

    this.renderSidebarAndHeader(user);
    this.initAutoLogout();
  },

  initAutoLogout() {
    const currentPath = window.location.pathname;
    const isLoginPage = currentPath.includes('login') || currentPath === '/';
    if (isLoginPage) return;

    // Reset timer on any user interaction
    const resetTimer = () => this.resetIdleTimer();

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    this.resetIdleTimer();
  },

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.warningTimer) clearTimeout(this.warningTimer);

    // Warning notification at 14 minutes of inactivity
    this.warningTimer = setTimeout(() => {
      if (typeof UI !== 'undefined') {
        UI.showToast('⚠️ Session expiring in 60 seconds due to inactivity. Move cursor or click to remain logged in.', 'warning');
      }
    }, this.warningThresholdMs);

    // Hard Auto-Logout execution at 15 minutes of inactivity
    this.idleTimer = setTimeout(() => {
      this.autoLogout();
    }, this.inactivityLimitMs);
  },

  autoLogout() {
    API.removeToken();
    if (typeof UI !== 'undefined') {
      UI.showToast('🔒 Auto Logged Out: Session expired due to inactivity.', 'info');
    }
    setTimeout(() => {
      window.location.href = '/login.html?reason=inactivity';
    }, 500);
  },

  renderSidebarAndHeader(user) {
    const userFullNameEl = document.getElementById('user-full-name');
    const userRoleEl = document.getElementById('user-role-badge');
    const userAvatarEl = document.getElementById('user-avatar');

    if (userFullNameEl) userFullNameEl.textContent = user.full_name;
    if (userRoleEl) userRoleEl.textContent = user.role;
    if (userAvatarEl) userAvatarEl.textContent = user.full_name.charAt(0).toUpperCase();

    // Hide Admin-only menu items for Worker
    if (user.role !== 'Admin / Billing Manager') {
      const adminNavItems = document.querySelectorAll('.admin-only');
      adminNavItems.forEach(el => el.style.display = 'none');
    }
  },

  async login(username, password) {
    try {
      const res = await API.post('/auth/login', { username, password });
      if (res.success) {
        API.setToken(res.token);
        API.setUser(res.user);
        UI.showToast(`Welcome back, ${res.user.full_name}!`, 'success');
        
        setTimeout(() => {
          if (res.user.role === 'Admin / Billing Manager') {
            window.location.href = '/dashboard.html';
          } else {
            window.location.href = '/billing.html';
          }
        }, 500);
      }
    } catch (error) {
      UI.showToast(error.message || 'Login failed. Invalid username or password.', 'error');
    }
  },

  promptAdminAuth() {
    const user = API.getUser();
    if (user && user.role === 'Admin / Billing Manager') {
      window.location.href = '/dashboard.html';
      return;
    }
    const modal = document.getElementById('modal-admin-auth');
    if (modal) {
      modal.classList.add('active');
      const input = document.getElementById('admin-password-input');
      if (input) {
        input.value = '';
        input.focus();
      }
    } else {
      const password = prompt('🔐 Enter Admin Password to access Management Dashboard:');
      if (password) {
        this.verifyAdminPassword(password);
      }
    }
  },

  async verifyAdminPassword(password) {
    try {
      if (!password) {
        UI.showToast('Please enter the Admin password.', 'warning');
        return;
      }
      const res = await API.post('/auth/login', { username: 'admin', password });
      if (res.success && res.user.role === 'Admin / Billing Manager') {
        API.setToken(res.token);
        API.setUser(res.user);
        UI.showToast('Admin Password Verified! Unlocking Admin Portal...', 'success');
        const modal = document.getElementById('modal-admin-auth');
        if (modal) modal.classList.remove('active');
        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 500);
      } else {
        UI.showToast('Incorrect Admin password. Access denied.', 'error');
      }
    } catch (error) {
      UI.showToast('Incorrect Admin password. Access denied.', 'error');
    }
  },

  logout() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.warningTimer) clearTimeout(this.warningTimer);
    API.removeToken();
    UI.showToast('Logged out successfully.', 'info');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 400);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.initPageGuard();
});

window.Auth = Auth;
