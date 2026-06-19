// Dashboard Auth — Authentication functions
// Extracted from dashboard-main.js


    /* ========================================
       AUTHENTICATION FUNCTIONS
       ======================================== */

    // Check authentication on page load
    function checkAuthentication() {
      const token = localStorage.getItem('authToken');
      if (token) {
        // Token exists, show dashboard and initialize
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('dashboard-wrapper').style.display = 'flex';
        // Initialize Socket.IO and dashboard
        initializeDashboard();
        // Initialize realtime listeners for conversations
        initializeRealtimeListeners();
        // Initialize clock
        initializeClock();
        // ✅ NUEVO: Actualizar badge de pendientes al iniciar
        updatePendingBadge();
        // ✅ NUEVO: Cargar configuración de proveedores de IA
        loadAIProviderSettings();

        // ✅ FIX: Check for pendingView from chat.html navigation
        const pendingView = localStorage.getItem('pendingView');
        if (pendingView) {
          localStorage.removeItem('pendingView');
          // Wait for DOM to be ready, then navigate to the pending view
          setTimeout(() => {
            const navItem = document.querySelector('.nav-item[onclick*="changeView(\'' + pendingView + '\')"]');
            if (navItem) {
              navItem.click();
            }
          }, 200);
        }
      } else {
        // No token, show login
        document.getElementById('login-overlay').classList.remove('hidden');
        document.getElementById('dashboard-wrapper').style.display = 'none';
      }
    }

    // Handle login form submission
    async function handleLogin(event) {
      event.preventDefault();

      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const loginBtn = document.getElementById('login-btn');
      const loginError = document.getElementById('login-error');

      // Disable button and show loading
      loginBtn.disabled = true;
      loginBtn.textContent = 'Iniciando sesión...';
      loginError.classList.remove('show');

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
          // Save token to localStorage
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('authUser', JSON.stringify(data.user));

          // Show dashboard
          document.getElementById('login-overlay').classList.add('hidden');
          document.getElementById('dashboard-wrapper').style.display = 'flex';

          // Initialize dashboard (Socket.IO)
          initializeDashboard();
          // Initialize realtime listeners for conversations
          initializeRealtimeListeners();
          // ✅ NUEVO: Actualizar badge de pendientes
          updatePendingBadge();
          // ✅ NUEVO: Cargar configuración de IA
          loadAIProviderSettings();

          // Reset form
          document.getElementById('login-form').reset();
        } else {
          // Show error
          loginError.textContent = data.error || 'Error al iniciar sesión';
          loginError.classList.add('show');
        }
      } catch (error) {
        loginError.textContent = 'Error de conexión. Intenta nuevamente.';
        loginError.classList.add('show');
      } finally {
        // Re-enable button
        loginBtn.disabled = false;
        loginBtn.textContent = 'Iniciar Sesión';
      }
    }

    // Handle logout
    function handleLogout() {
      if (confirm('¿Cerrar sesión?')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        location.reload();
      }
    }

    // Wrapper for fetch with authentication
    async function authenticatedFetch(url, options = {}) {
      const token = localStorage.getItem('authToken');

      // Add Authorization header if token exists
      if (token) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`
        };
      }

      const response = await fetch(url, options);

      // Handle 401 Unauthorized (token expired or invalid)
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        location.reload();
        return;
      }

      return response;
    }    // Check authentication on page load (deferred until all modules are loaded)
    document.addEventListener("DOMContentLoaded", () => {
      checkAuthentication();
    });
