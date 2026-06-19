// Dashboard Core — Navigation, initialization, utilities
// Extracted from dashboard-main.js

// === SIDEBAR LOGOUT (DOMContentLoaded) ===
// Add logout button to sidebar footer
document.addEventListener('DOMContentLoaded', () => {
  const sidebarFooter = document.querySelector('.sidebar-footer');
  if (sidebarFooter) {
    sidebarFooter.innerHTML = `
          <button onclick="handleLogout()" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
            transition: all 0.3s;
          " onmouseover="this.style.background='rgba(255,255,255,0.2)'"
             onmouseout="this.style.background='rgba(255,255,255,0.1)'">
            🔓 Cerrar Sesión
          </button>
          <div style="margin-top: 10px;">v1.0.0 - Dashboard</div>
        `;
  }
});

// === MAIN DASHBOARD FUNCTIONS ===

/* ========================================
   FUNCIONES DEL DASHBOARD (NUEVO)
   ======================================== */

/**
 * ✅ CORRECCIÓN PROBLEMA 2 & 3: Normalizar número de teléfono
 *
 * Convierte cualquier formato de número de WhatsApp a formato limpio (solo dígitos).
 * Maneja tanto números normales como wa_id internos de Meta.
 *
 * @param {string} phoneNumber - Número en cualquier formato
 * @returns {string} Número limpio (solo dígitos)
 *
 * Ejemplos:
 * - "whatsapp:+573001234567" → "3001234567"
 * - "+573001234567" → "3001234567"
 * - "573001234567" → "3001234567"
 * - "3001234567" → "3001234567"
 * - "573001234567@lid" → "3001234567"
 * - "151771427143897@lid" → "151771427143897" (wa_id interno)
 * - "151771427143897@s.whatsapp.net" → "151771427143897"
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';

  // Convertir a string
  let normalized = String(phoneNumber).trim();

  // PASO 1: Eliminar prefijo "whatsapp:" si existe
  normalized = normalized.replace(/^whatsapp:/i, '');

  // PASO 2: Eliminar sufijo @s.whatsapp.net, @lid, etc.
  if (normalized.includes('@')) {
    normalized = normalized.split('@')[0];
  }

  // PASO 3: Limpiar caracteres no numéricos (excepto el + inicial si existe)
  normalized = normalized.replace(/[^\d]/g, '');

  // PASO 4: Formatear número colombiano (+57 3XX XXX XXXX)
  // Los números colombianos: código país 57 + 10 dígitos que empiezan con 3
  if (normalized.startsWith('57') && normalized.length === 12) {
    const local = normalized.substring(2); // Ej: "3001234567"
    return `+57 ${local.substring(0, 3)} ${local.substring(3, 6)} ${local.substring(6)}`;
  }

  // Para otros países: mostrar con + si hay código de país
  if (normalized.length > 10) {
    return '+' + normalized;
  }

  return normalized;
}

// ✅ NUEVO: Redirigir programáticamente a Inicio (sin depender de evento click)
function redirectToHome() {
  // Resetear todos los nav items
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  // Activar nav item de Inicio
  const homeNav = document.querySelector('.nav-item[onclick*="home"]');
  if (homeNav) homeNav.classList.add('active');

  // Actualizar breadcrumb
  const viewName = document.getElementById('current-view-name');
  const breadcrumb = document.getElementById('breadcrumb-active');
  if (viewName) viewName.textContent = 'Inicio';
  if (breadcrumb) breadcrumb.textContent = 'Inicio';

  // Ocultar todas las vistas especiales
  try { hideConversationsView(); } catch (e) { }
  try { hideNumberControlView(); } catch (e) { }
  try { hideHolidaysView(); } catch (e) { }
  try { hideDocumentsView(); } catch (e) { }
  try { hideQuickRepliesView(); } catch (e) { }

  // Ocultar botón de subir
  const uploadBtn = document.getElementById('header-upload-btn');
  if (uploadBtn) uploadBtn.style.display = 'none';

  console.log('🏠 Redirigido automáticamente a Inicio');
}

// Cambiar vista del sidebar
function changeView(view) {
  // Actualizar items activos del sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  // Mark the correct nav item as active (handle both click events and programmatic calls)
  if (typeof event !== 'undefined' && event && event.target) {
    var navEl = event.target.closest('.nav-item');
    if (navEl) navEl.classList.add('active');
  } else {
    // Programmatic call: find nav item by view name
    var navItem = document.querySelector('.nav-item[onclick*="changeView(\'' + view + '\')"]');
    if (navItem) navItem.classList.add('active');
  }

  // Actualizar breadcrumb y título
  const viewNames = {
    'home': 'Inicio',
    'conversations': 'Conversaciones',
    'number-control': 'Control de Números',
    'holidays': 'Días Festivos',
    'quick-replies': 'Respuestas Rápidas',
    'settings': 'Configuración',
    'documents': 'Documentos'
  };

  document.getElementById('current-view-name').textContent = viewNames[view] || 'Inicio';
  document.getElementById('breadcrumb-active').textContent = viewNames[view] || 'Inicio';

  // ============================================
  // RESET CENTRAL: Restaurar TODOS los elementos a su estado por defecto
  // Esto evita conflictos entre las vistas
  // ============================================

  // 1. Restaurar header del dashboard
  const dashHeader = document.querySelector('.dashboard-header');
  if (dashHeader) dashHeader.style.display = '';

  // 2. Restaurar dashboard-content (breadcrumb + content-card)
  const dashContent = document.querySelector('.dashboard-content');
  if (dashContent) {
    dashContent.style.display = '';
    void dashContent.offsetHeight; // Forzar repintado
  }

  // 3. Restaurar content-card
  const contentCard = document.querySelector('.content-card');
  if (contentCard) contentCard.style.display = '';

  // 4. Restaurar .container (contenido original del chatbot)
  const container = document.querySelector('.container');
  if (container) container.style.display = '';

  // 5. Restaurar main-content
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.style.display = '';
    mainContent.style.flexDirection = '';
  }

  // 6. Ocultar TODAS las vistas especiales
  var iframeContainer = document.getElementById('conversations-iframe-container');
  if (iframeContainer) iframeContainer.style.display = 'none';

  var ncView = document.getElementById('number-control-view');
  if (ncView) ncView.style.display = 'none';

  var hView = document.getElementById('holidays-view');
  if (hView) hView.style.display = 'none';

  var dView = document.getElementById('documents-view');
  if (dView) dView.style.display = 'none';

  var qrView = document.getElementById('quick-replies-view');
  if (qrView) qrView.style.display = 'none';

  // ============================================
  // Mostrar la vista solicitada
  // ============================================

  // Mostrar/ocultar botón de subir según la vista
  const uploadBtn = document.getElementById('header-upload-btn');
  uploadBtn.style.display = (view === 'documents') ? 'flex' : 'none';

  if (view === 'conversations') {
    showConversationsView();
  } else if (view === 'documents') {
    showDocumentsView();
  } else if (view === 'number-control') {
    showNumberControlView();
  } else if (view === 'holidays') {
    showHolidaysView();
  } else if (view === 'quick-replies') {
    showQuickRepliesView();
  }
  // 'home' y 'settings' usan el contenido original (.container) que ya fue restaurado
}

// Sincronizar estado del header con el estado del chatbot
function syncHeaderStatus(status, text) {
  const headerStatus = document.getElementById('header-status');
  const headerStatusText = document.getElementById('header-status-text');

  headerStatus.className = 'header-status-badge ' + status;
  headerStatusText.textContent = text;
}

/* ========================================
   FUNCIONES ORIGINALES DEL CHATBOT
   (Preservadas sin modificar)
   ======================================== */

let socket = null;
let currentProvider = 'groq';
let _lastKnownStatus = null; // Track last WhatsApp status to prevent redundant UI updates

// Elements
let qrContainer, statusEl, statusText, instructions, testSection, chatTest;

// Initialize Socket.IO and dashboard elements
function initializeDashboard() {
  if (socket) return; // Already initialized

  // Initialize Socket.IO
  socket = io();

  // Get elements
  qrContainer = document.getElementById('qr-container');
  statusEl = document.getElementById('status');
  statusText = document.getElementById('status-text');
  instructions = document.getElementById('instructions');
  testSection = document.getElementById('test-section');
  chatTest = document.getElementById('chat-test');

  // WhatsApp status updates
  function updateStatus(status, text) {
    statusEl.className = 'status ' + status;
    statusText.textContent = text;
    // Sincronizar con el header
    syncHeaderStatus(status, text);
  }

  socket.on('qr', (qr) => {
    _lastKnownStatus = 'qr';
    updateStatus('waiting', 'Esperando escaneo...');
    qrContainer.innerHTML = `<img src="${qr}" alt="Código QR">`;
    instructions.style.display = 'block';
    testSection.style.display = 'none';
    const newQrBtn = document.getElementById('new-qr-button');
    const sessionBtns = document.getElementById('session-buttons');
    if (newQrBtn) newQrBtn.style.display = 'block';
    if (sessionBtns) sessionBtns.style.display = 'none';
    console.log('[WhatsApp] QR received');
  });

  socket.on('authenticated', () => {
    _lastKnownStatus = 'authenticating';
    updateStatus('waiting', 'Autenticando...');
    qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Conectando...</p>`;
    const newQrBtn = document.getElementById('new-qr-button');
    const sessionBtns = document.getElementById('session-buttons');
    if (newQrBtn) newQrBtn.style.display = 'block';
    if (sessionBtns) sessionBtns.style.display = 'none';
    console.log('[WhatsApp] Authenticated');
  });

  socket.on('ready', () => {
    _lastKnownStatus = 'ready';
    updateStatus('connected', 'Conectado');
    qrContainer.innerHTML = `
          <div class="connected-info">
            <div class="icon">✅</div>
            <h3>WhatsApp Conectado!</h3>
            <p>El chatbot está activo.</p>
          </div>
        `;
    instructions.style.display = 'none';
    testSection.style.display = 'block';
    const newQrBtn = document.getElementById('new-qr-button');
    const sessionBtns = document.getElementById('session-buttons');
    if (newQrBtn) newQrBtn.style.display = 'none';
    if (sessionBtns) sessionBtns.style.display = 'block';
    console.log('[WhatsApp] Ready — bot is active');
  });

  socket.on('disconnected', () => {
    _lastKnownStatus = 'disconnected';
    updateStatus('disconnected', 'Desconectado');
    qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Reconectando...</p>`;
    testSection.style.display = 'none';
    console.log('[WhatsApp] Disconnected');
  });

  // ✅ NUEVO: Cuando la sesión expira → redirigir a Inicio y esperar nuevo QR
  socket.on('session-expired', (reason) => {
    _lastKnownStatus = 'expired';
    updateStatus('disconnected', 'Sesión expirada');
    qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Regenerando QR automáticamente...</p>`;
    testSection.style.display = 'none';
    console.warn('[WhatsApp] Session expired:', reason);
  });

  socket.on('status', (data) => {
    // ✅ FIX: Skip if status hasn't changed (prevents UI jitter from polling)
    const statusKey = data.isReady ? 'ready' : (data.hasQR ? 'qr' : 'idle');
    if (statusKey === _lastKnownStatus) return;
    _lastKnownStatus = statusKey;

    console.log('[WhatsApp] Status update:', statusKey);

    if (data.isReady) {
      updateStatus('connected', 'Conectado');
      qrContainer.innerHTML = `
            <div class="connected-info">
              <div class="icon">✅</div>
              <h3>WhatsApp Conectado!</h3>
              <p>El chatbot está activo.</p>
            </div>
          `;
      instructions.style.display = 'none';
      testSection.style.display = 'block';
      const newQrBtn = document.getElementById('new-qr-button');
      const sessionBtns = document.getElementById('session-buttons');
      if (newQrBtn) newQrBtn.style.display = 'none';
      if (sessionBtns) sessionBtns.style.display = 'block';
    } else if (data.hasQR) {
      socket.emit('get-qr');
      const newQrBtn = document.getElementById('new-qr-button');
      const sessionBtns = document.getElementById('session-buttons');
      if (newQrBtn) newQrBtn.style.display = 'block';
      if (sessionBtns) sessionBtns.style.display = 'none';
    }
    // ✅ FIX: Removed redirectToHome() on idle status — let the user stay on their current view
  });

  // Request initial status
  socket.emit('get-status');
  loadSettings();

  // ✅ FIX: Polling interval increased from 30s to 60s (reduces unnecessary checks)
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('get-status');
    }
  }, 60000);
}

function showAlert(message, type) {
  const alertDiv = document.getElementById('settings-alert');
  alertDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => alertDiv.innerHTML = '', 5000);
}

// WhatsApp status updates (global function)
function updateStatus(status, text) {
  if (!statusEl || !statusText) return;
  statusEl.className = 'status ' + status;
  statusText.textContent = text;
  // Sincronizar con el header
  syncHeaderStatus(status, text);
}

// Chat test
async function testChat() {
  const input = document.getElementById('test-message');
  const message = input.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  input.value = '';

  try {
    const response = await fetch('/api/test-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await response.json();
    addMessage(data.response, 'bot');
  } catch (error) {
    addMessage('Error: ' + error.message, 'bot');
  }
}

function addMessage(text, type) {
  if (!chatTest) return;
  chatTest.classList.add('active');
  const div = document.createElement('div');
  div.className = 'message ' + type;
  div.textContent = text;
  chatTest.appendChild(div);
  chatTest.scrollTop = chatTest.scrollHeight;
}

// Add event listener for test message input
document.addEventListener('DOMContentLoaded', () => {
  const testInput = document.getElementById('test-message');
  if (testInput) {
    testInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') testChat();
    });
  }
});

/* ========================================
   RELOJ DEL DASHBOARD
   ======================================== */

/**
 * Inicializa el reloj del dashboard
 * Se actualiza cada segundo
 */
function initializeClock() {
  const clockTime = document.getElementById('clock-time');
  const clockSeconds = document.getElementById('clock-seconds');

  function updateClock() {
    const now = new Date();

    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    if (clockTime) clockTime.textContent = `${hours}:${minutes}`;
    if (clockSeconds) clockSeconds.textContent = `:${seconds}`;
  }

  // Actualizar inmediatamente
  updateClock();

  // Actualizar cada segundo
  setInterval(updateClock, 1000);
}
