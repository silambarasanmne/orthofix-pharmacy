/* ==========================================================================
   API HTTP CLIENT UTILITY — CENTRALIZED TOKEN & FILE DOWNLOAD HANDLER
   ========================================================================== */

const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('medicare_token') || localStorage.getItem('token');
  },

  setToken(token) {
    localStorage.setItem('medicare_token', token);
    localStorage.setItem('token', token);
  },

  removeToken() {
    localStorage.removeItem('medicare_token');
    localStorage.removeItem('medicare_user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getUser() {
    const raw = localStorage.getItem('medicare_user');
    return raw ? JSON.parse(raw) : null;
  },

  setUser(user) {
    localStorage.setItem('medicare_user', JSON.stringify(user));
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Token expired or invalid
          if (!endpoint.includes('/auth/login')) {
            this.removeToken();
            window.location.href = '/login.html';
          }
        }
        throw new Error(data.message || 'API request failed.');
      }

      return data;
    } catch (error) {
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'PUT',
      body: isFormData ? body : JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // AUTHENTICATED FILE DOWNLOAD UTILITY
  async downloadFile(endpoint, fallbackFilename) {
    try {
      if (typeof UI !== 'undefined') UI.showToast('Preparing download...', 'info');
      const token = this.getToken();

      if (!token) {
        if (typeof UI !== 'undefined') UI.showToast('Session expired. Redirecting to login...', 'warning');
        setTimeout(() => window.location.href = '/login.html', 1000);
        return;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          if (typeof UI !== 'undefined') UI.showToast('Session expired. Please log in again.', 'error');
          this.removeToken();
          setTimeout(() => window.location.href = '/login.html', 1200);
          return;
        }
        throw new Error(errJson.message || 'Download failed.');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fallbackFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      if (typeof UI !== 'undefined') UI.showToast('Download completed successfully!', 'success');
    } catch (error) {
      if (typeof UI !== 'undefined') UI.showToast(error.message || 'Failed to download file.', 'error');
    }
  }
};

window.API = API;
