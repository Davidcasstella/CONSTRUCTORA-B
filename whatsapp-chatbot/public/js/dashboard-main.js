// Dashboard Main JavaScript
// This file contains all dashboard functionality extracted from index.html

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
    'settings': 'Configuración',
    'documents': 'Documentos',
    'quick-replies': 'Respuestas Rápidas',
    'welcome': 'Bienvenida'
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

  var wmView = document.getElementById('welcome-view');
  if (wmView) wmView.style.display = 'none';

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
    // Hide content-card and show quick-replies
    var cc = document.querySelector('.content-card');
    if (cc) cc.style.display = 'none';
    if (typeof showQuickRepliesView === 'function') showQuickRepliesView();
  } else if (view === 'welcome') {
    // Hide content-card and show welcome view
    var cc2 = document.querySelector('.content-card');
    if (cc2) cc2.style.display = 'none';
    var wv = document.getElementById('welcome-view');
    if (wv) wv.style.display = 'block';
    if (typeof showWelcomeView === 'function') showWelcomeView();
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
    updateStatus('waiting', 'Esperando escaneo...');
    qrContainer.innerHTML = `<img src="${qr}" alt="Código QR">`;
    instructions.style.display = 'block';
    testSection.style.display = 'none';
    const newQrBtn = document.getElementById('new-qr-button');
    const sessionBtns = document.getElementById('session-buttons');
    if (newQrBtn) newQrBtn.style.display = 'block';
    if (sessionBtns) sessionBtns.style.display = 'none';
  });

  socket.on('authenticated', () => {
    updateStatus('waiting', 'Autenticando...');
    qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Conectando...</p>`;
    const newQrBtn = document.getElementById('new-qr-button');
    const sessionBtns = document.getElementById('session-buttons');
    if (newQrBtn) newQrBtn.style.display = 'block';
    if (sessionBtns) sessionBtns.style.display = 'none';
  });

  socket.on('ready', () => {
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
  });

  socket.on('disconnected', () => {
    updateStatus('disconnected', 'Desconectado');
    qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Reconectando...</p>`;
    testSection.style.display = 'none';
    // ✅ NUEVO: Redirigir automáticamente a Inicio si no hay conexión
    redirectToHome();
  });

  // ✅ NUEVO: Cuando la sesión expira → redirigir a Inicio y esperar nuevo QR
  socket.on('session-expired', (reason) => {
    updateStatus('disconnected', 'Sesión expirada');
    qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Regenerando QR automáticamente...</p>`;
    testSection.style.display = 'none';
    redirectToHome();
    console.warn('⚠️ Sesión expirada:', reason);
  });

  socket.on('status', (data) => {
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
    } else {
      // ✅ NUEVO: Si no está conectado y no hay QR → redirigir a Inicio
      redirectToHome();
    }
  });

  // Request initial status
  socket.emit('get-status');
  loadSettings();

  // ✅ NUEVO: Polling periódico de estado cada 30 segundos
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('get-status');
    }
  }, 30000);
}

// ===========================================
// NUEVO: Actualización automática de conversaciones
// (FUERA de initializeDashboard para que siempre se conecte)
// ===========================================

/**
 * Inicializa los listeners de tiempo real para conversaciones
 * Se llama después de que Socket.IO se conecta
 */
function initializeRealtimeListeners() {
  // Esperar a que socket esté disponible
  if (!socket) {
    setTimeout(initializeRealtimeListeners, 100);
    return;
  }

  // Eliminar listeners anteriores si existen (para evitar duplicados)
  socket.off('message-received');
  socket.off('bot-response');
  socket.off('escalation-detected');
  socket.off('new-message'); // ✅ FIX: Eliminar listener previo para evitar duplicados
  socket.off('session-expired'); // ✅ NUEVO: Limpiar listener de sesión expirada

  // ===========================================
  // ✅ FIX: Throttle para evitar HTTP flood al recibir mensajes rápidos
  // ===========================================
  let _convReloadTimer = null;
  function throttledLoadConversations() {
    if (_convReloadTimer) clearTimeout(_convReloadTimer);
    _convReloadTimer = setTimeout(() => {
      const conversationsView = document.getElementById('conversations-view');
      if (conversationsView && conversationsView.style.display !== 'none') {
        loadConversations();
      }
    }, 500); // Agrupar actualizaciones en ventanas de 500ms
  }

  // ===========================================
  // ✅ CORREGIDO: UN SOLO listener 'new-message' (se eliminó el duplicado)
  // ===========================================
  // Este se dispara tanto para mensajes de usuario como del bot y del asesor
  socket.on('new-message', (data) => {
    console.log('💬 [SOCKET] Nuevo mensaje recibido:', data);

    const msg = data.message;
    const userId = data.userId;

    // Actualizar tabla de conversaciones con throttle (evita HTTP flood)
    throttledLoadConversations();

    // ✅ NUEVO: Validar que el mensaje no esté ya renderizado para evitar duplicados
    const messageId = msg.id || msg.messageId || null;

    if (messageId && renderedMessageIds.has(messageId)) {
      console.log(`⏭️ Mensaje ${messageId} ya está renderizado, skipping...`);
      return; // No agregar si ya existe
    }

    // Si el modal de chat está abierto y es para este usuario, agregar el mensaje
    if (currentChatUserId === userId) {
      console.log('✅ Chat coincide, agregando mensaje...');
      // Si muestra "Cargando mensajes..." o "No hay mensajes aún", limpiar primero
      const messagesDiv = document.getElementById('chat-messages');
      if (messagesDiv && (messagesDiv.innerHTML.includes('Cargando mensajes...') ||
        messagesDiv.innerHTML.includes('No hay mensajes aún'))) {
        messagesDiv.innerHTML = '';
      }

      // Determinar el tipo de remitente
      const senderClass = (msg.sender === 'admin' || msg.sender === 'advisor') ? 'admin' : (msg.sender === 'bot' ? 'bot' : 'user');
      const senderName = msg.senderName || ((msg.sender === 'admin' || msg.sender === 'advisor') ? 'Asesor' : (msg.sender === 'bot' ? '🤖 Bot' : 'Usuario'));

      // ✅ NUEVO: Generar ID único temporal si el mensaje no tiene ID
      const tempMessageId = messageId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // ✅ NUEVO: Renderizar según tipo (texto, audio, imagen, documento)
      let messageContent = '';

      if (msg.type === 'audio') {
        messageContent = `
              <div class="message-audio">
                <audio controls src="${msg.mediaUrl || ''}" style="max-width: 200px;">
                  <a href="${msg.mediaUrl || ''}">Descargar audio</a>
                </audio>
              </div>
            `;
      } else if (msg.type === 'image') {
        messageContent = `
              <div class="message-image">
                <img src="${msg.mediaUrl || ''}" alt="Imagen" style="max-width: 250px; border-radius: 8px;" onclick="window.open('${msg.mediaUrl || ''}', '_blank')">
              </div>
              ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${msg.message}</div>` : ''}
            `;
      } else if (msg.type === 'document') {
        messageContent = `
              <div class="message-document">
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f0f0f0; border-radius: 8px;">
                  <span style="font-size: 24px;">📄</span>
                  <div>
                    <div style="font-weight: 500;">${msg.fileName || 'Documento'}</div>
                    <a href="${msg.mediaUrl || ''}" download style="font-size: 12px; color: var(--primary-green);">Descargar</a>
                  </div>
                </div>
              </div>
              ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${msg.message}</div>` : ''}
            `;
      } else {
        // Mensaje de texto
        messageContent = `<div class="message-text">${msg.message}</div>`;
      }

      // Crear HTML del mensaje con data attribute para tracking
      const messageHtml = `
            <div class="chat-message ${senderClass}" data-message-id="${tempMessageId}">
              <div class="message-sender">${senderName}</div>
              <div class="message-bubble">
                ${messageContent}
              </div>
              <div class="message-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}</div>
            </div>
          `;

      // Agregar mensaje
      if (messagesDiv) {
        messagesDiv.innerHTML += messageHtml;

        // ✅ NUEVO: Marcar mensaje como renderizado
        renderedMessageIds.add(tempMessageId);

        // Scroll al final automáticamente
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }

      console.log(`✅ Mensaje agregado al chat para ${userId} (ID: ${tempMessageId})`);
    }
  });

  // ✅ ELIMINADO: Listener 'message-received' (reemplazado por 'new-message')
  // socket.on('message-received', (data) => {
  //   if (currentChatUserId === data.from) {
  //     addMessageToChat(data.from, data.body, 'user');
  //   }
  // });

  // ✅ ELIMINADO: Listener 'bot-response' (reemplazado por 'new-message')
  // socket.on('bot-response', (data) => {
  //   if (currentChatUserId === data.to) {
  //     addMessageToChat(data.to, data.response, 'bot');
  //   }
  // });

  // ✅ MEJORADO: Alerta de escalación a asesor con notificación persistente
  socket.on('escalation-detected', (data) => {
    console.log('🚨 Escalación detectada:', data);

    // ✅ NUEVO: Mostrar banner de notificación persistente
    showEscalationBanner(data);

    // ✅ NUEVO: Actualizar badge contador
    updatePendingBadge();

    // Reproducir sonido de alerta
    try {
      const audio = new Audio('/alert.mp3');
      audio.play().catch(e => console.log('No se pudo reproducir sonido:', e));
    } catch (e) {
      console.log('Error reproduciendo sonido:', e);
    }

    // Actualizar lista de conversaciones con throttle
    throttledLoadConversations();
  });

  // ✅ NUEVO: Listener para bloqueo por spam en tiempo real
  socket.on('spam-blocked', (data) => {
    console.log('🚫 Spam bloqueado:', data);

    // Actualizar badge de spam
    loadSpamCount();

    // Si estamos en la vista de control de números, recargar
    const ncView = document.getElementById('number-control-view');
    if (ncView && ncView.style.display !== 'none') {
      loadNumberControlData();
    }

    // Mostrar alerta si IA fue desactivada
    if (data.iaDeactivated) {
      showAlert(`🚫 Spam detectado: IA desactivada para ${normalizePhoneNumber(data.phoneNumber)} (${data.consecutiveCount} repeticiones)`, 'warning');
    }
  });

  // ✅ NUEVO: Listener para actualización de estado de conversación
  socket.on('conversation-status-changed', (data) => {
    console.log('📊 Estado de conversación cambiado:', data);
    updatePendingBadge();

    // Actualizar lista con throttle
    throttledLoadConversations();
  });

  // ✅ FIX: Listener duplicado de 'new-message' ELIMINADO
  // El handler principal arriba (línea ~4872) ya maneja toda la lógica
  // incluyendo multimedia, dedup, y actualización de tabla con throttle

  console.log('✅ Listeners de tiempo real inicializados');
}

/**
 * Agrega un mensaje al chat actual en tiempo real
 */
function addMessageToChat(userId, message, sender) {
  if (currentChatUserId !== userId) return;

  const messagesDiv = document.getElementById('chat-messages');
  if (!messagesDiv) return;

  // Si muestra "No hay mensajes aún", limpiar primero
  if (messagesDiv.innerHTML.includes('No hay mensajes aún')) {
    messagesDiv.innerHTML = '';
  }

  const senderClass = sender === 'bot' ? 'bot' : ((sender === 'admin' || sender === 'advisor') ? 'admin' : 'user');
  const senderName = sender === 'bot' ? '🤖 Bot' : ((sender === 'admin' || sender === 'advisor') ? 'Asesor' : 'Usuario');

  const messageHtml = `
        <div class="chat-message ${senderClass}">
          <div class="message-sender">${senderName}</div>
          <div class="message-bubble">
            <div class="message-text">${message}</div>
          </div>
          <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
      `;

  messagesDiv.innerHTML += messageHtml;

  // Scroll al final
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab:nth-child(${tab === 'whatsapp' ? 1 : 2})`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function toggleTab(tab) {
  const currentTab = document.querySelector('.tab-content.active').id.replace('tab-', '');
  switchTab(currentTab === tab ? 'whatsapp' : tab);
}

// Provider selection
function selectProvider(provider) {
  currentProvider = provider;
  document.querySelectorAll('.provider-option').forEach(p => p.classList.remove('active'));
  document.getElementById(`provider-${provider}`).classList.add('active');

  document.getElementById('groq-settings').style.display = provider === 'groq' ? 'block' : 'none';
  document.getElementById('openai-settings').style.display = provider === 'openai' ? 'block' : 'none';
}

// Save settings
async function saveSettings() {
  const settings = {
    provider: currentProvider,
    groq: {
      apiKey: document.getElementById('groq-key').value,
      model: document.getElementById('groq-model').value,
      enabled: document.getElementById('groq-enabled').checked
    },
    openai: {
      apiKey: document.getElementById('openai-key').value,
      model: document.getElementById('openai-model').value,
      enabled: document.getElementById('openai-enabled').checked
    }
  };

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    const data = await response.json();

    if (data.success) {
      showAlert('Configuración guardada correctamente! ✅', 'success');
      loadSettings();
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error guardando configuración: ' + error.message, 'error');
  }
}

// Load settings
async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    const data = await response.json();

    if (data.provider) {
      selectProvider(data.provider);
    }

    if (data.groq?.apiKey) {
      document.getElementById('groq-key').value = data.groq.apiKey;
    }
    if (data.groq?.model) {
      document.getElementById('groq-model').value = data.groq.model;
    }
    if (data.groq?.enabled !== undefined) {
      document.getElementById('groq-enabled').checked = data.groq.enabled;
    }
    if (data.openai?.apiKey) {
      document.getElementById('openai-key').value = data.openai.apiKey;
    }
    if (data.openai?.model) {
      document.getElementById('openai-model').value = data.openai.model;
    }
    if (data.openai?.enabled !== undefined) {
      document.getElementById('openai-enabled').checked = data.openai.enabled;
    }

    // Update status indicators
    if (data.groqAvailable) {
      document.getElementById('groq-status').innerHTML = '✅ Conectado';
      document.getElementById('groq-status').className = 'provider-status ok';
    } else if (data.groq?.apiKey) {
      document.getElementById('groq-status').innerHTML = '❌ Error';
      document.getElementById('groq-status').className = 'provider-status error';
    }

    if (data.openaiAvailable) {
      document.getElementById('openai-status').innerHTML = '✅ Conectado';
      document.getElementById('openai-status').className = 'provider-status ok';
    } else if (data.openai?.apiKey) {
      document.getElementById('openai-status').innerHTML = '❌ Error';
      document.getElementById('openai-status').className = 'provider-status error';
    }

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Test connection
async function testConnection() {
  showAlert('Probando conexión...', 'success');

  try {
    const response = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: currentProvider })
    });

    const data = await response.json();

    if (data.success) {
      showAlert(`Conexión exitosa con ${currentProvider.toUpperCase()}! ✅`, 'success');
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error probando conexión: ' + error.message, 'error');
  }
}

function showAlert(message, type) {
  const alertDiv = document.getElementById('settings-alert');
  alertDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => alertDiv.innerHTML = '', 5000);
}

// ✅ NUEVO: Mostrar banner de notificación de escalación
function showEscalationBanner(data) {
  // ✅ FIX: Si el iframe de conversaciones está activo, chat-page.js ya muestra el banner.
  // No duplicar aquí para evitar doble render visual.
  const iframeContainer = document.getElementById('conversations-iframe-container');
  if (iframeContainer && iframeContainer.style.display !== 'none') {
    return;
  }

  // Remover banner existente si hay
  const existingBanner = document.querySelector('.notification-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement('div');
  banner.className = 'notification-banner';
  banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">🚨</span>
          <div>
            <strong>¡Requiere atención humana!</strong>
            <div style="font-size: 0.9em; opacity: 0.9;">
              Usuario: ${normalizePhoneNumber(data.phoneNumber)} | Razón: ${data.reason}
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center;">
          <button class="action-btn" onclick="goToConversation('${data.userId}')">Ver Chat</button>
          <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
      `;

  document.body.prepend(banner);

  // Auto-ocultar después de 30 segundos
  setTimeout(() => {
    if (banner.parentNode) {
      banner.remove();
    }
  }, 30000);
}

// ✅ NUEVO: Ir a una conversación específica
function goToConversation(userId) {
  // Cerrar banner
  const banner = document.querySelector('.notification-banner');
  if (banner) banner.remove();

  // Cambiar a vista de conversaciones
  changeView('conversations');

  // Abrir el chat de ese usuario después de cargar
  setTimeout(() => {
    openChat(userId);
  }, 500);
}

// ✅ NUEVO: Actualizar badge de conversaciones pendientes
async function updatePendingBadge() {
  try {
    const response = await authenticatedFetch('/api/conversations');
    const data = await response.json();

    if (data.success && data.conversations) {
      const pendingCount = data.conversations.filter(c =>
        c.status === 'pending_advisor' || c.status === 'out_of_hours'
      ).length;

      const badge = document.getElementById('pending-advisor-badge');
      if (badge) {
        if (pendingCount > 0) {
          badge.textContent = pendingCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      console.log(`📊 Conversaciones pendientes de asesor: ${pendingCount}`);
    }
  } catch (error) {
    console.error('Error actualizando badge:', error);
  }
}

// ✅ NUEVO: Cargar configuración de proveedores de IA
async function loadAIProviderSettings() {
  try {
    const response = await authenticatedFetch('/api/ai-settings');
    const data = await response.json();

    if (data.success) {
      // Actualizar toggles
      document.getElementById('ai-chatgpt-toggle').checked = data.settings.chatgpt.enabled;
      document.getElementById('ai-grok-toggle').checked = data.settings.grok.enabled;

      // Actualizar estado visual
      updateAIProviderStatus(data.settings);
    }
  } catch (error) {
    console.error('Error cargando configuración de IA:', error);
  }
}

// ✅ NUEVO: Actualizar estado visual de proveedores
function updateAIProviderStatus(settings) {
  const statusDiv = document.getElementById('ai-provider-status');
  if (!statusDiv) return;

  const chatgptOn = settings.chatgpt.enabled;
  const grokOn = settings.grok.enabled;

  let statusHtml = '';
  let statusColor = '#4caf50';

  if (chatgptOn && grokOn) {
    statusHtml = '✅ <strong>ChatGPT activo</strong> con Grok como respaldo';
    statusColor = '#4caf50';
  } else if (chatgptOn && !grokOn) {
    statusHtml = '✅ <strong>ChatGPT activo</strong> (sin respaldo)';
    statusColor = '#ff9800';
  } else if (!chatgptOn && grokOn) {
    statusHtml = '⚠️ <strong>Grok activo</strong> (ChatGPT desactivado)';
    statusColor = '#ff9800';
  } else {
    statusHtml = '❌ <strong>¡Advertencia!</strong> Ambos proveedores desactivados';
    statusColor = '#f44336';
  }

  statusDiv.innerHTML = statusHtml;
  statusDiv.style.borderLeft = `4px solid ${statusColor}`;
}

// ✅ NUEVO: Actualizar configuración de proveedores de IA
async function updateAIProviderSettings() {
  const chatgptEnabled = document.getElementById('ai-chatgpt-toggle').checked;
  const grokEnabled = document.getElementById('ai-grok-toggle').checked;

  // Validación: no permitir desactivar ambos
  if (!chatgptEnabled && !grokEnabled) {
    showAIAlert('⚠️ Debe mantener al menos un proveedor activo', 'warning');
    // Reactivar el último toggle que se desactivó
    document.getElementById('ai-grok-toggle').checked = true;
    return;
  }

  try {
    const response = await authenticatedFetch('/api/ai-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatgpt: { enabled: chatgptEnabled },
        grok: { enabled: grokEnabled }
      })
    });

    const data = await response.json();

    if (data.success) {
      showAIAlert('✅ Configuración de IA actualizada', 'success');
      updateAIProviderStatus(data.settings);

      // También sincronizar con los checkboxes del panel de API keys
      const openaiCheckbox = document.getElementById('openai-enabled');
      const groqCheckbox = document.getElementById('groq-enabled');
      if (openaiCheckbox) openaiCheckbox.checked = chatgptEnabled;
      if (groqCheckbox) groqCheckbox.checked = grokEnabled;
    } else {
      showAIAlert('❌ Error: ' + data.error, 'error');
      // Revertir cambios
      loadAIProviderSettings();
    }
  } catch (error) {
    showAIAlert('❌ Error de conexión: ' + error.message, 'error');
    // Revertir cambios
    loadAIProviderSettings();
  }
}

// ✅ NUEVO: Mostrar alerta en sección de IA
function showAIAlert(message, type) {
  const alertDiv = document.getElementById('ai-settings-alert');
  if (alertDiv) {
    const bgColor = type === 'success' ? '#e8f5e9' :
      type === 'warning' ? '#fff3e0' : '#ffebee';
    const textColor = type === 'success' ? '#2e7d32' :
      type === 'warning' ? '#e65100' : '#c62828';

    alertDiv.innerHTML = `<div style="padding: 10px; border-radius: 6px; background: ${bgColor}; color: ${textColor}; font-size: 0.9em;">${message}</div>`;
    setTimeout(() => alertDiv.innerHTML = '', 4000);
  }
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
   FUNCIONES DE SESIÓN (Cerrar/Limpiar)
   ======================================== */

async function cerrarSesion() {
  if (!confirm('¿Cerrar la sesión actual de WhatsApp?')) return;

  try {
    updateStatus('waiting', 'Cerrando sesión...');
    const response = await fetch('/logout', {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showAlert('Sesión cerrada. Reconectando...', 'success');
      // Ocultar botones durante reconexión
      document.getElementById('session-buttons').style.display = 'none';
      // El bot se reconectará automáticamente
      setTimeout(() => socket.emit('get-status'), 3000);
    } else {
      showAlert('Error: ' + data.message, 'error');
    }
  } catch (error) {
    showAlert('Error al cerrar sesión: ' + error.message, 'error');
  }
}

async function limpiarSesion() {
  if (!confirm('¿Generar nuevo QR Code? Esto borrará la sesión actual.')) return;

  try {
    updateStatus('waiting', 'Limpiando sesión...');
    showAlert('Limpiando sesión y generando nuevo QR...', 'success');

    const response = await fetch('/clear-session', {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showAlert(data.message || 'Sesión limpiada. Escanea el nuevo QR.', 'success');
      // Ocultar ambos tipos de botones temporalmente
      document.getElementById('session-buttons').style.display = 'none';
      document.getElementById('new-qr-button').style.display = 'none';
      // Mostrar spinner mientras se genera nuevo QR
      qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Generando nuevo QR...</p>`;
      // Esperar a que aparezca el nuevo QR
      setTimeout(() => {
        socket.emit('get-status');
        // Asegurar que el botón de nuevo QR esté visible después de limpiar
        setTimeout(() => {
          document.getElementById('new-qr-button').style.display = 'block';
        }, 2000);
      }, 3000);
    } else {
      showAlert('Error: ' + data.message, 'error');
    }
  } catch (error) {
    showAlert('Error al limpiar sesión: ' + error.message, 'error');
  }
}

/* ========================================
   DOCUMENT MANAGEMENT FUNCTIONS
   ======================================== */

// Open upload modal
// ✅ CORREGIDO: Siempre asignar el stageId actual antes de abrir el modal
function openUploadModal() {
  // Asegurar que se use la etapa actual si existe
  if (typeof currentStageId !== 'undefined' && currentStageId) {
    window.currentUploadStageId = currentStageId;
    console.log('📤 Modal de subida abierto con stageId:', window.currentUploadStageId);
  } else if (typeof allStages !== 'undefined' && allStages && allStages.length > 0) {
    // Fallback: usar la primera etapa disponible
    window.currentUploadStageId = allStages[0].id;
    console.log('📤 Modal de subida abierto con stageId por defecto:', window.currentUploadStageId);
  } else {
    console.warn('⚠️ No hay etapa seleccionada para subir documentos');
  }

  document.getElementById('upload-modal').classList.add('active');
  setupDragAndDrop();
}

function openUploadModalFromList() {
  closeDocumentsModal();
  openUploadModal();
}

// Close upload modal
function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('file-input').value = '';
}

// Open documents modal
function openDocumentsModal() {
  document.getElementById('documents-modal').classList.add('active');
  loadDocumentsList();
}

// Close documents modal
function closeDocumentsModal() {
  document.getElementById('documents-modal').classList.remove('active');
}

// Setup drag and drop
function setupDragAndDrop() {
  const uploadArea = document.getElementById('upload-area');

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFiles(files);
  });
}

// Handle file selection
function handleFileSelect(event) {
  const files = event.target.files;
  handleFiles(files);
}

// ✅ NOTA: La función handleFiles fue reubicada más adelante con las mejoras del sistema de etapas

// Load documents list
async function loadDocumentsList() {
  const loadingEl = document.getElementById('documents-loading');
  const contentEl = document.getElementById('documents-content');
  const listContainer = document.getElementById('documents-list-container');
  const countEl = document.getElementById('documents-count');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const response = await fetch('/api/knowledge/files');
    const data = await response.json();

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    if (data.success && data.files.length > 0) {
      countEl.textContent = `${data.files.length} documento${data.files.length > 1 ? 's' : ''}`;

      listContainer.innerHTML = data.files.map(file => {
        const icon = file.type === 'pdf' ? '📄' : '📝';
        const size = formatFileSize(file.size);
        const date = new Date(file.uploadDate).toLocaleDateString('es-ES');

        return `
              <div class="document-item">
                <div class="document-icon">${icon}</div>
                <div class="document-info">
                  <div class="document-name">${file.originalName}</div>
                  <div class="document-meta">${size} • ${date} • ${file.chunksCount} fragmentos</div>
                </div>
                <div class="document-actions">
                  <button class="document-action-btn" onclick="downloadDocument('${file.id}', '${file.originalName}')" style="margin-right: 8px;" title="Descargar archivo">
                    📥 Descargar
                  </button>
                  <button class="document-action-btn delete" onclick="deleteDocument('${file.id}', '${file.originalName}')" title="Eliminar archivo">
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            `;
      }).join('');
    } else {
      countEl.textContent = '0 documentos';
      listContainer.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">📁</div>
              <p>No hay documentos cargados</p>
              <p style="font-size: 13px; margin-top: 5px;">Sube PDF o TXT para agregar a la base de conocimiento</p>
            </div>
          `;
    }
  } catch (error) {
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
    listContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <p>Error al cargar documentos: ${error.message}</p>
          </div>
        `;
  }
}

// Delete document (función consolidada - se usa tanto en modal como en vista completa)
async function deleteDocument(fileId, fileName) {
  if (!confirm(`¿Eliminar "${fileName}" de la base de conocimiento?`)) return;

  try {
    const response = await fetch(`/api/knowledge/files/${fileId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      showAlert(`Documento "${fileName}" eliminado correctamente`, 'success');
      // Recargar modal si está abierto
      if (document.getElementById('documents-modal').classList.contains('active')) {
        loadDocumentsList();
      }
      // Recargar vista completa si está activa
      if (document.getElementById('documents-view').style.display === 'block') {
        loadDocumentsView();
      }
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error al eliminar documento: ' + error.message, 'error');
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ✅ NOTA: El override de changeView fue eliminado
// Ahora la sección de Documentos se muestra como vista completa
// en lugar de modal

/* ========================================
   CONVERSATIONS FUNCTIONS
   ======================================== */

// ==========================================
// ✅ NUEVO: Variables para paginación de chats
// ==========================================
let conversationsOffset = 0;
const CONVERSATIONS_LIMIT = 10;
let totalConversations = 0;
let hasMoreConversations = false;
let isLoadingConversations = false; // Prevent concurrent loads
let conversationsObserver = null; // IntersectionObserver for lazy loading

// Cargar lista de conversaciones
async function loadConversations(offset = 0, limit = CONVERSATIONS_LIMIT) {
  if (isLoadingConversations) return;
  isLoadingConversations = true;

  const loadingEl = document.getElementById('conversations-loading');
  const contentEl = document.getElementById('conversations-content');
  const emptyEl = document.getElementById('conversations-empty');
  const tableBody = document.getElementById('conversations-table-body');

  // Show main loading only on initial load
  if (offset === 0) {
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    emptyEl.style.display = 'none';
  } else {
    // Show inline loading indicator for "load more"
    const existingLoadMore = document.getElementById('load-more-row');
    if (existingLoadMore) {
      existingLoadMore.innerHTML = `<td colspan="7" style="text-align:center;padding:15px;"><div class="spinner" style="width:24px;height:24px;border-width:3px;margin:0 auto;"></div> Cargando...</td>`;
    }
  }

  try {
    const url = `/api/conversations/whatsapp-chats?limit=${limit}&offset=${offset}`;
    const response = await authenticatedFetch(url);
    const data = await response.json();

    console.log(`📊 Conversaciones recibidas: ${data.returned}/${data.total} (offset: ${offset}, hasMore: ${data.hasMore})`);

    // Update pagination state
    totalConversations = data.total;
    hasMoreConversations = data.hasMore;
    conversationsOffset = offset;

    loadingEl.style.display = 'none';

    if (data.success && data.conversations.length > 0) {
      contentEl.style.display = 'block';

      // Stats info header
      const statsInfo = document.getElementById('conversations-stats-info') || document.createElement('div');
      statsInfo.id = 'conversations-stats-info';
      statsInfo.style.cssText = 'text-align: center; color: var(--medium-gray); font-size: 0.9rem; padding: 10px; margin-bottom: 10px;';
      const endCount = offset + data.conversations.length;
      statsInfo.innerHTML = `💬 Mostrando ${endCount} de ${data.total} conversaciones`;
      if (!statsInfo.parentElement) {
        tableBody.parentElement.parentElement.insertBefore(statsInfo, tableBody.parentElement);
      }

      // Build table rows
      const newRows = data.conversations.map(conv => {
        const statusConfig = {
          'active': { text: 'Activo', class: 'active' },
          'expired': { text: 'Expirado', class: 'expired' },
          'new_cycle': { text: 'Nuevo Ciclo', class: 'new_cycle' },
          'pending_advisor': { text: '⚠️ Pendiente Asesor', class: 'pending_advisor' },
          'out_of_hours': { text: '🌙 Fuera de Horario', class: 'out_of_hours' },
          'advisor_handled': { text: '👨‍💼 Atendido por Asesor', class: 'advisor_handled' }
        };

        const statusInfo = statusConfig[conv.status] || { text: conv.status, class: '' };
        const consentClass = conv.consentStatus;
        const consentText = conv.consentStatus === 'accepted' ? 'Aceptó' :
          conv.consentStatus === 'rejected' ? 'Rechazó' : 'Pendiente';
        const remainingClass = conv.remainingTime > 0 ? '' : 'expired';
        const remainingText = conv.remainingTime > 0 ? conv.remainingTimeFormatted : 'Expirado';
        const shortMessage = conv.lastMessage
          ? (conv.lastMessage.length > 50 ? conv.lastMessage.substring(0, 50) + '...' : conv.lastMessage)
          : 'Sin mensajes';
        const rowClass = conv.status === 'pending_advisor' ? 'row-pending-advisor' : '';
        const actionButtons = getActionButtons(conv);
        const iaBadge = (conv.iaControlled && !conv.iaActive)
          ? '<span class="ia-disabled-badge" title="La IA no responde automáticamente a este número">🔴 IA Desactivada</span>'
          : '';

        return `
              <tr class="${rowClass}">
                <td><strong>${conv.whatsappName || conv.registeredName || 'Sin nombre'}</strong></td>
                <td><span class="phone-number">${normalizePhoneNumber(conv.phoneNumber)}</span>${iaBadge}</td>
                <td><span class="last-message" title="${conv.lastMessage || ''}">${shortMessage}</span></td>
                <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
                <td><span class="consent-badge ${consentClass}">${consentText}</span></td>
                <td><span class="time-remaining ${remainingClass}">${remainingText}</span></td>
                <td>${actionButtons}</td>
              </tr>
            `;
      }).join('');

      // Remove existing load-more row before appending
      const existingLoadMore = document.getElementById('load-more-row');
      if (existingLoadMore) existingLoadMore.remove();

      if (offset === 0) {
        // Initial load: replace entire table body
        tableBody.innerHTML = newRows;
      } else {
        // Pagination: append new rows
        tableBody.insertAdjacentHTML('beforeend', newRows);
      }

      // Add "Load More" row at the bottom if there are more conversations
      if (data.hasMore) {
        const loadMoreRow = document.createElement('tr');
        loadMoreRow.id = 'load-more-row';
        loadMoreRow.innerHTML = `
          <td colspan="7" style="text-align: center; padding: 15px;">
            <button class="btn-small" onclick="loadMoreConversations()" style="padding: 8px 20px; font-size: 0.95em; cursor: pointer;">
              ⬇️ Cargar más conversaciones (${data.total - endCount} restantes)
            </button>
          </td>
        `;
        tableBody.appendChild(loadMoreRow);

        // Setup IntersectionObserver for automatic lazy loading
        setupConversationsLazyLoad(loadMoreRow);
      }

      // Load stats only on initial load
      if (offset === 0) {
        loadConversationsStats();
      }
    } else if (offset === 0) {
      // No conversations at all (only show empty on initial load)
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
              <div style="font-size: 64px; margin-bottom: 15px;">💬</div>
              <h3 style="color: var(--medium-gray);">No hay conversaciones activas</h3>
              <p style="color: var(--medium-gray);">Las conversaciones aparecerán aquí cuando los usuarios envíen mensajes por WhatsApp.</p>
            </div>
          `;
    }
  } catch (error) {
    if (offset === 0) {
      loadingEl.style.display = 'none';
      emptyEl.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: var(--medium-gray);">Error al cargar conversaciones</h3>
            <p style="color: var(--medium-gray);">${error.message}</p>
          </div>
        `;
      emptyEl.style.display = 'block';
    } else {
      console.error('Error loading more conversations:', error);
      // Restore the load-more button
      const existingLoadMore = document.getElementById('load-more-row');
      if (existingLoadMore) {
        existingLoadMore.innerHTML = `<td colspan="7" style="text-align:center;padding:15px;color:#ff5555;">Error al cargar. <a href="#" onclick="loadMoreConversations();return false;" style="color:var(--primary-green);">Reintentar</a></td>`;
      }
    }
  } finally {
    isLoadingConversations = false;
  }
}

// ✅ Setup IntersectionObserver for automatic lazy loading
function setupConversationsLazyLoad(targetElement) {
  // Disconnect previous observer
  if (conversationsObserver) {
    conversationsObserver.disconnect();
  }

  conversationsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && hasMoreConversations && !isLoadingConversations) {
        console.log('🔄 Lazy load: Loading more conversations...');
        loadMoreConversations();
      }
    });
  }, {
    root: null,
    rootMargin: '100px', // Start loading 100px before the element is visible
    threshold: 0.1
  });

  conversationsObserver.observe(targetElement);
}

// ✅ Load more conversations (pagination)
async function loadMoreConversations() {
  const newOffset = conversationsOffset + CONVERSATIONS_LIMIT;
  await loadConversations(newOffset, CONVERSATIONS_LIMIT);
}

// ✅ NUEVO: Variables para paginación de mensajes
let currentChatMessagesPage = 0;
let currentChatHasMore = false;
let currentChatNextCursor = null;
const MESSAGES_PER_PAGE = 20;

// ==========================================
// FUNCIONES DE CONTROL DE HORARIO
// ==========================================

// Cargar estado del control de horario al iniciar
async function loadScheduleCheckStatus() {
  try {
    const response = await authenticatedFetch('/api/conversations/schedule-check-status');
    const data = await response.json();

    if (data.success) {
      updateScheduleCheckUI(data.enabled);
    }
  } catch (error) {
    console.error('Error cargando estado de horario:', error);
  }
}

// Actualizar UI según estado del horario
function updateScheduleCheckUI(enabled) {
  const statusSpan = document.getElementById('schedule-status');
  const btnEnable = document.getElementById('btn-enable-schedule');
  const btnDisable = document.getElementById('btn-disable-schedule');

  if (!statusSpan || !btnEnable || !btnDisable) return;

  if (enabled) {
    statusSpan.innerHTML = '<span style="color: #2e7d32;">✅ ACTIVO (Verificando horario)</span>';
    // Deshabilitar botón Activar (ya está activo)
    btnEnable.disabled = true;
    btnEnable.style.opacity = '0.4';
    btnEnable.style.cursor = 'not-allowed';
    btnEnable.style.pointerEvents = 'none';
    // Habilitar botón Desactivar
    btnDisable.disabled = false;
    btnDisable.style.opacity = '1';
    btnDisable.style.cursor = 'pointer';
    btnDisable.style.pointerEvents = 'auto';
  } else {
    statusSpan.innerHTML = '<span style="color: #c62828;">❌ INACTIVO (Sin verificar)</span>';
    // Habilitar botón Activar
    btnEnable.disabled = false;
    btnEnable.style.opacity = '1';
    btnEnable.style.cursor = 'pointer';
    btnEnable.style.pointerEvents = 'auto';
    // Deshabilitar botón Desactivar (ya está inactivo)
    btnDisable.disabled = true;
    btnDisable.style.opacity = '0.4';
    btnDisable.style.cursor = 'not-allowed';
    btnDisable.style.pointerEvents = 'none';
  }
}

// Activar/Desactivar verificación de horario
async function toggleScheduleCheck(enabled) {
  try {
    const confirmMsg = enabled
      ? '¿Activar la verificación de horario?\n\nEl bot verificará el horario de atención (8:00 AM - 4:30 PM) y no responderá fuera de ese horario.'
      : '¿Desactivar la verificación de horario?\n\nEl bot responderá SIN verificar el horario de atención.';

    if (!confirm(confirmMsg)) {
      return;
    }

    const response = await authenticatedFetch('/api/conversations/toggle-schedule-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled })
    });

    const data = await response.json();

    if (data.success) {
      updateScheduleCheckUI(enabled);
      alert(enabled ? '✅ Verificación de horario ACTIVADA' : '❌ Verificación de horario DESACTIVADA');
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error cambiando verificación de horario:', error);
    alert('Error al cambiar la verificación de horario');
  }
}

// ==========================================
// CONFIGURACIÓN DE HORARIO (EDITAR HORAS)
// ==========================================

// Generar opciones de hora para los selects (cada 30 min)
function populateTimeSelects() {
  const selects = ['sched-wd-start', 'sched-wd-end', 'sched-sat-start', 'sched-sat-end'];

  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const h12 = h % 12 || 12;
        const ampm = h < 12 ? 'AM' : 'PM';
        const label = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
        const value = `${h}:${m}`;
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        el.appendChild(opt);
      }
    }
  });

  // Toggle sábado habilitar/deshabilitar inputs
  const satCheck = document.getElementById('sched-sat-enabled');
  if (satCheck) {
    satCheck.addEventListener('change', () => {
      const timesDiv = document.getElementById('sched-sat-times');
      if (timesDiv) {
        timesDiv.style.opacity = satCheck.checked ? '1' : '0.4';
        timesDiv.style.pointerEvents = satCheck.checked ? 'auto' : 'none';
      }
    });
  }
}

// Cargar configuración de horario desde el backend
async function loadScheduleConfig() {
  try {
    const response = await authenticatedFetch('/api/settings/schedule');
    const data = await response.json();

    if (data.success && data.schedule) {
      const s = data.schedule;

      // Poblar selects de L-V
      const wdStart = document.getElementById('sched-wd-start');
      const wdEnd = document.getElementById('sched-wd-end');
      if (wdStart) wdStart.value = `${s.weekdays.start}:0`;
      if (wdEnd) wdEnd.value = `${s.weekdays.endHour}:${s.weekdays.endMinute}`;

      // Poblar selects de Sábado
      const satStart = document.getElementById('sched-sat-start');
      const satEnd = document.getElementById('sched-sat-end');
      const satEnabled = document.getElementById('sched-sat-enabled');
      if (satStart) satStart.value = `${s.saturday.start}:0`;
      if (satEnd) satEnd.value = `${s.saturday.endHour}:${s.saturday.endMinute}`;
      if (satEnabled) {
        satEnabled.checked = s.saturday.enabled;
        const timesDiv = document.getElementById('sched-sat-times');
        if (timesDiv) {
          timesDiv.style.opacity = s.saturday.enabled ? '1' : '0.4';
          timesDiv.style.pointerEvents = s.saturday.enabled ? 'auto' : 'none';
        }
      }

      // Actualizar label de horario
      const label = document.getElementById('schedule-hours-label');
      if (label && s.formatted) {
        label.textContent = `L-V: ${s.formatted.weekdaysLabel} | Sáb: ${s.formatted.saturdayLabel}`;
      }
    }
  } catch (error) {
    console.error('Error cargando configuración de horario:', error);
  }
}

// Guardar cambios de horario
async function saveScheduleConfig() {
  try {
    const parseTime = (selectId) => {
      const val = document.getElementById(selectId)?.value;
      if (!val) return null;
      const [h, m] = val.split(':').map(Number);
      return { hour: h, minute: m };
    };

    const wdStart = parseTime('sched-wd-start');
    const wdEnd = parseTime('sched-wd-end');
    const satStart = parseTime('sched-sat-start');
    const satEnd = parseTime('sched-sat-end');
    const satEnabled = document.getElementById('sched-sat-enabled')?.checked ?? true;

    const body = {
      weekdays: {
        start: wdStart?.hour ?? 8,
        endHour: wdEnd?.hour ?? 16,
        endMinute: wdEnd?.minute ?? 30
      },
      saturday: {
        start: satStart?.hour ?? 9,
        endHour: satEnd?.hour ?? 12,
        endMinute: satEnd?.minute ?? 0,
        enabled: satEnabled
      }
    };

    const response = await authenticatedFetch('/api/settings/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Horario actualizado correctamente');
      loadScheduleConfig();
    } else {
      alert('Error: ' + (data.error || 'Error desconocido'));
    }
  } catch (error) {
    console.error('Error guardando horario:', error);
    alert('Error al guardar la configuración de horario');
  }
}

// Inicializar selects al cargar
populateTimeSelects();

// ==========================================
// CONTROL DE DÍAS FESTIVOS
// ==========================================

// Cargar estado del control de festivos al iniciar
async function loadHolidayCheckStatus() {
  try {
    const response = await authenticatedFetch('/api/conversations/holiday-check-status');
    const data = await response.json();

    if (data.success) {
      updateHolidayCheckUI(data.enabled);
    }
  } catch (error) {
    console.error('Error cargando estado de festivos:', error);
  }
}

// Actualizar UI según estado de festivos
function updateHolidayCheckUI(enabled) {
  const statusSpan = document.getElementById('holiday-status');
  const btnEnable = document.getElementById('btn-enable-holiday');
  const btnDisable = document.getElementById('btn-disable-holiday');

  if (!statusSpan || !btnEnable || !btnDisable) return;

  if (enabled) {
    statusSpan.innerHTML = '<span style="color: #e65100;">✅ ACTIVO (Verificando festivos)</span>';
    // Deshabilitar botón Activar (ya está activo)
    btnEnable.disabled = true;
    btnEnable.style.opacity = '0.4';
    btnEnable.style.cursor = 'not-allowed';
    btnEnable.style.pointerEvents = 'none';
    // Habilitar botón Desactivar
    btnDisable.disabled = false;
    btnDisable.style.opacity = '1';
    btnDisable.style.cursor = 'pointer';
    btnDisable.style.pointerEvents = 'auto';
  } else {
    statusSpan.innerHTML = '<span style="color: #757575;">❌ INACTIVO (Sin verificar)</span>';
    // Habilitar botón Activar
    btnEnable.disabled = false;
    btnEnable.style.opacity = '1';
    btnEnable.style.cursor = 'pointer';
    btnEnable.style.pointerEvents = 'auto';
    // Deshabilitar botón Desactivar (ya está inactivo)
    btnDisable.disabled = true;
    btnDisable.style.opacity = '0.4';
    btnDisable.style.cursor = 'not-allowed';
    btnDisable.style.pointerEvents = 'none';
  }
}

// Activar/Desactivar verificación de días festivos
async function toggleHolidayCheck(enabled) {
  try {
    const confirmMsg = enabled
      ? '¿Activar la verificación de días festivos?\n\nEl bot verificará si hoy es festivo y no responderá automáticamente en esos días.'
      : '¿Desactivar la verificación de días festivos?\n\nEl bot responderá SIN verificar si es día festivo.';

    if (!confirm(confirmMsg)) {
      return;
    }

    const response = await authenticatedFetch('/api/conversations/toggle-holiday-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled })
    });

    const data = await response.json();

    if (data.success) {
      updateHolidayCheckUI(enabled);
      alert(enabled ? '✅ Verificación de festivos ACTIVADA' : '❌ Verificación de festivos DESACTIVADA');
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error cambiando verificación de festivos:', error);
    alert('Error al cambiar la verificación de festivos');
  }
}

// Cargar estadísticas de conversaciones
async function loadConversationsStats() {
  try {
    const response = await authenticatedFetch('/api/conversations/stats');
    const data = await response.json();

    // Cargar estado del control de horario Y festivos
    loadScheduleCheckStatus();
    loadHolidayCheckStatus();

    if (data.success) {
      // Estadísticas existentes
      document.getElementById('stat-total').textContent = data.stats.total;
      document.getElementById('stat-active').textContent = data.stats.active;
      document.getElementById('stat-expired').textContent = data.stats.expired;
      document.getElementById('stat-consent-accepted').textContent = data.stats.consent.accepted;

      // NUEVAS estadísticas de escalación
      document.getElementById('stat-pending').textContent = data.stats.escalation?.pendingAdvisor || 0;
      document.getElementById('stat-with-advisor').textContent = data.stats.escalation?.advisorHandled || 0;

      // ✅ Iniciar polling en tiempo real (si no está ya iniciado)
      startSchedulePolling();
    }
  } catch (error) {
    console.error('Error cargando estadísticas:', error);
  }
}

// ==========================================
// POLLING EN TIEMPO REAL — Horario y Festivos
// ==========================================
// Actualiza el estado de los botones cada 10 segundos
// sin necesidad de recargar la página
let _schedulePollingInterval = null;

function startSchedulePolling() {
  // Evitar duplicados
  if (_schedulePollingInterval) return;
  _schedulePollingInterval = setInterval(async () => {
    // Solo actualizar si los elementos existen en el DOM
    if (document.getElementById('schedule-status')) {
      await loadScheduleCheckStatus();
    }
    if (document.getElementById('holiday-status')) {
      await loadHolidayCheckStatus();
    }
  }, 10000); // cada 10 segundos
  console.log('🔄 Polling de horario/festivos iniciado (cada 10s)');
}

function stopSchedulePolling() {
  if (_schedulePollingInterval) {
    clearInterval(_schedulePollingInterval);
    _schedulePollingInterval = null;
    console.log('⏹️ Polling de horario/festivos detenido');
  }
}

// Resetear una conversación manualmente
async function resetConversation(userId, phoneNumber) {
  if (!confirm(`¿Resetear conversación para ${phoneNumber}?\n\nEsto reiniciará el ciclo de 60 minutos y el usuario volverá a recibir los mensajes de bienvenida y consentimiento.`)) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/reset`, {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showAlert(`Conversación reseteada para ${phoneNumber}`, 'success');
      loadConversations(); // Recargar lista
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error al resetear conversación: ' + error.message, 'error');
  }
}

// Mostrar vista de conversaciones
function showConversationsView() {
  // Ocultar contenido original
  document.querySelector('.container').style.display = 'none';

  // Mostrar vista de conversaciones
  document.getElementById('conversations-view').style.display = 'block';

  // Cargar datos
  loadConversations();
  loadScheduleCheckStatus();
  loadScheduleConfig();
}

// ✅ FIX: Mostrar vista de conversaciones en iframe (mantiene sidebar del dashboard)
function showConversationsView() {
  // Ocultar TODO el contenido del dashboard (breadcrumb + content-card + container)
  const dashContent = document.querySelector('.dashboard-content');
  if (dashContent) dashContent.style.display = 'none';

  // Ocultar header del dashboard (chat.html tiene su propia header)
  const dashHeader = document.querySelector('.dashboard-header');
  if (dashHeader) dashHeader.style.display = 'none';

  // Hacer que main-content use flex para que el iframe llene todo
  // overflow:hidden evita scrollbars visibles al costado del iframe
  const mainContent = document.querySelector('.main-content');
  mainContent.style.display = 'flex';
  mainContent.style.flexDirection = 'column';
  mainContent.style.overflow = 'hidden';
  mainContent.style.height = '100vh';
  mainContent.style.minHeight = 'unset';

  // Crear o mostrar el contenedor de conversaciones con iframe
  let convView = document.getElementById('conversations-iframe-container');
  if (!convView) {
    // Detectar tema actual para fondo
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDark ? '#0b141a' : '#f0f2f5';

    convView = document.createElement('div');
    convView.id = 'conversations-iframe-container';
    convView.style.cssText = 'flex:1;display:flex;width:100%;height:100%;overflow:hidden;background:' + bgColor + ';';

    const iframe = document.createElement('iframe');
    iframe.id = 'conversations-iframe';
    iframe.src = '/chat.html?embed=1';
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    convView.appendChild(iframe);

    mainContent.appendChild(convView);
  } else {
    convView.style.display = 'flex';
  }
}


// Ocultar vista de conversaciones
function hideConversationsView() {
  // Mostrar contenido original del dashboard
  const dashContent = document.querySelector('.dashboard-content');
  if (dashContent) {
    dashContent.style.display = '';
    // Forzar repintado del navegador para evitar pantalla en negro
    void dashContent.offsetHeight;
  }

  // Mostrar header del dashboard
  const dashHeader = document.querySelector('.dashboard-header');
  if (dashHeader) {
    dashHeader.style.display = '';
    void dashHeader.offsetHeight;
  }

  // Restaurar main-content
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.style.display = '';
    mainContent.style.flexDirection = '';
    mainContent.style.overflow = '';
    mainContent.style.height = '';
    mainContent.style.minHeight = '';
  }


  // Ocultar iframe de conversaciones
  const convView = document.getElementById('conversations-iframe-container');
  if (convView) {
    convView.style.display = 'none';
  }
}

/* ========================================
   FUNCIONES DE CONTROL DE NÚMEROS
   ======================================== */

// Tab activo actual en Control de Números
let currentNCTab = 'all';
// Número seleccionado para desactivar IA
let selectedPhoneToDisable = null;

// Mostrar vista de control de números
function showNumberControlView() {
  // Ocultar contenido original
  document.querySelector('.container').style.display = 'none';

  // Mostrar vista de control de números
  document.getElementById('number-control-view').style.display = 'block';

  // Cargar datos según tab activo
  loadNumberControlData();
}

// Ocultar vista de control de números
function hideNumberControlView() {
  const ncView = document.getElementById('number-control-view');
  if (ncView) {
    ncView.style.display = 'none';
  }
}

/* ========================================
   ✅ NUEVO: FUNCIONES DE VISTA DE DÍAS FESTIVOS
   ======================================== */

// Mostrar vista de días festivos
function showHolidaysView() {
  // Ocultar content-card completo (evita cuadro vacío)
  const contentCard = document.querySelector('.content-card');
  if (contentCard) contentCard.style.display = 'none';

  const hView = document.getElementById('holidays-view');
  if (hView) {
    hView.style.display = 'block';
  }
  // Cargar datos de días festivos y estado de los toggles
  loadHolidaysData();
  loadHolidayCheckStatus();
  loadScheduleStatusForHolidays();
  // ✅ Iniciar polling en tiempo real al abrir la vista
  startSchedulePolling();
}

// Ocultar vista de días festivos
function hideHolidaysView() {
  const hView = document.getElementById('holidays-view');
  if (hView) {
    hView.style.display = 'none';
  }
  // Restaurar content-card
  const contentCard = document.querySelector('.content-card');
  if (contentCard) contentCard.style.display = '';
  // ✅ Detener polling al salir de la vista
  stopSchedulePolling();
}

// Cargar estado del horario para la vista de festivos
async function loadScheduleStatusForHolidays() {
  try {
    // Formato de hora AM/PM
    function fmtTime(hour, minute) {
      const h = hour % 12 || 12;
      const m = (minute || 0).toString().padStart(2, '0');
      const ampm = hour < 12 ? 'AM' : 'PM';
      return h + ':' + m + ' ' + ampm;
    }

    const response = await authenticatedFetch('/api/conversations/schedule-check-status');
    const data = await response.json();
    const statusEl = document.getElementById('holiday-schedule-status');
    if (data.success && statusEl) {
      const enabled = data.enabled;
      statusEl.textContent = enabled ? '✅ ACTIVO' : '❌ INACTIVO';
      statusEl.style.color = enabled ? '#2e7d32' : '#c62828';
    }

    // Cargar horas configuradas
    const schedResp = await authenticatedFetch('/api/conversations/schedule-config');
    const schedData = await schedResp.json();
    if (schedData.success && schedData.config) {
      const c = schedData.config;
      const wdEl = document.getElementById('hol-sched-weekdays');
      const satEl = document.getElementById('hol-sched-saturday');
      const sunEl = document.getElementById('hol-sched-sunday');
      if (wdEl && c.weekdays) {
        wdEl.textContent = fmtTime(c.weekdays.start, 0) + ' - ' + fmtTime(c.weekdays.endHour, c.weekdays.endMinute);
      }
      if (satEl && c.saturday) {
        satEl.textContent = c.saturday.enabled
          ? fmtTime(c.saturday.start, 0) + ' - ' + fmtTime(c.saturday.endHour, c.saturday.endMinute)
          : 'Cerrado';
      }
      if (sunEl) {
        sunEl.textContent = (c.sunday && c.sunday.enabled) ? 'Abierto' : 'Cerrado';
      }
    }
  } catch (error) {
    console.error('Error cargando estado de horario para festivos:', error);
  }
}

/* ========================================
   FUNCIONES DE DÍAS FESTIVOS (CALENDARIO MEJORADO)
   ======================================== */

// Estado del calendario
let currentCalendarDate = new Date();
let holidaysCache = [];

// Cargar TODOS los festivos del año
async function loadHolidaysData() {
  try {
    const year = currentCalendarDate.getFullYear();
    const response = await authenticatedFetch(`/api/holidays/by-year/${year}`);
    const data = await response.json();

    if (data.success) {
      holidaysCache = data.holidays || [];
      renderYearCalendar();
      populateYearSelect();
    }
  } catch (error) {
    console.error('Error cargando festivos:', error);
    // Si falla, usar cache vacío
    holidaysCache = [];
    renderYearCalendar();
    populateYearSelect();
  }
}

// Llenar selector de años (año actual -5 a +10)
function populateYearSelect() {
  const select = document.getElementById('year-select');
  if (!select) return;

  const currentYear = currentCalendarDate.getFullYear();
  select.innerHTML = '';

  for (let y = currentYear - 5; y <= currentYear + 10; y++) {
    const option = document.createElement('option');
    option.value = y;
    option.textContent = y;
    if (y === currentYear) option.selected = true;
    select.appendChild(option);
  }
}

// Renderizar calendario de año completo (12 meses)
function renderYearCalendar() {
  const grid = document.getElementById('year-calendar-grid');
  const year = currentCalendarDate.getFullYear();

  // Actualizar título
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  document.getElementById('current-month-year').textContent = monthNames[currentCalendarDate.getMonth()] + ' ' + year;

  grid.innerHTML = '';

  // Generar 12 meses
  for (let month = 0; month < 12; month++) {
    const monthCard = document.createElement('div');
    monthCard.style.cssText = 'background: #f9f9f9; border-radius: 8px; padding: 10px;';

    // Título del mes
    const monthTitle = document.createElement('div');
    monthTitle.style.cssText = 'text-align: center; font-weight: 600; margin-bottom: 8px; font-size: 13px;';
    monthTitle.textContent = monthNames[month];
    monthCard.appendChild(monthTitle);

    // Grid de días del mes
    const daysGrid = document.createElement('div');
    daysGrid.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; font-size: 11px;';

    // Días de la semana (abreviados)
    const daysAbbr = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    daysAbbr.forEach(d => {
      const dh = document.createElement('div');
      dh.style.cssText = 'text-align: center; color: #999; font-size: 9px;';
      dh.textContent = d;
      daysGrid.appendChild(dh);
    });

    // Obtener datos del mes
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Celdas vacías antes del primer día
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 2px;';
      daysGrid.appendChild(empty);
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('div');
      const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;

      // Verificar si es festivo
      const holiday = holidaysCache.find(h => {
        if (h.recurring) {
          return h.date.substring(5) === dateStr.substring(5);
        }
        return h.date === dateStr;
      });

      let bgColor = 'white';
      let color = '#333';
      if (holiday && holiday.active) {
        bgColor = '#ff6b6b';
        color = 'white';
      } else if (isToday) {
        bgColor = '#e3f2fd';
      }

      cell.style.cssText = `
            padding: 4px 2px;
            text-align: center;
            background: ${bgColor};
            color: ${color};
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            ${holiday && holiday.active ? 'font-weight: bold;' : ''}
          `;
      cell.textContent = day;

      // Click para toggle festivo
      cell.onclick = () => toggleDayHoliday(dateStr);

      cell.onmouseover = () => cell.style.opacity = '0.8';
      cell.onmouseout = () => cell.style.opacity = '1';

      daysGrid.appendChild(cell);
    }

    monthCard.appendChild(daysGrid);
    grid.appendChild(monthCard);
  }
}

// Cambiar mes (navegación)
async function changeMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  await loadHolidaysData();
}

// Cambiar año
async function changeYear(delta) {
  currentCalendarDate.setFullYear(currentCalendarDate.getFullYear() + delta);
  await loadHolidaysData();
  populateYearSelect();
}

// Seleccionar año del dropdown
async function selectYear(year) {
  currentCalendarDate.setFullYear(parseInt(year));
  await loadHolidaysData();
}

// Toggle festivo en un día específico
async function toggleDayHoliday(dateStr) {
  // Buscar si ya existe festivo para esta fecha
  const holiday = holidaysCache.find(h => {
    if (h.recurring) {
      return h.date.substring(5) === dateStr.substring(5);
    }
    return h.date === dateStr;
  });

  if (holiday && holiday.active) {
    // Desactivar o eliminar
    if (confirm(`¿Quitar "${holiday.name}" (${formatDateShort(holiday.date)})?`)) {
      await deleteHoliday(holiday.id, holiday.name);
    }
  } else if (holiday && !holiday.active) {
    // Reactivar
    await toggleHoliday(holiday.id, true);
  } else {
    // Crear nuevo festivo
    const name = prompt(`Festivo para ${formatDateShort(dateStr)}:`);
    if (name && name.trim()) {
      await addHoliday(dateStr, name.trim());
    }
  }
}

// Formato corto de fecha
function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Agregar festivo
async function addHoliday(date, name) {
  try {
    const response = await authenticatedFetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name, recurring: true })
    });

    const data = await response.json();
    if (data.success) {
      await loadHolidaysData();
    } else {
      alert('Error: ' + (data.error || 'No se pudo agregar'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al agregar festivo');
  }
}

// Toggle festivo (activar/desactivar)
async function toggleHoliday(id, active) {
  try {
    const response = await authenticatedFetch(`/api/holidays/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });

    const data = await response.json();
    if (data.success) {
      await loadHolidaysData();
    } else {
      alert('Error: ' + (data.error || 'No se pudo actualizar'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al actualizar');
  }
}

// Eliminar festivo
async function deleteHoliday(id, name) {
  try {
    const response = await authenticatedFetch(`/api/holidays/${id}`, {
      method: 'DELETE'
    });

    const data = await response.json();
    if (data.success) {
      await loadHolidaysData();
    } else {
      alert('Error: ' + (data.error || 'No se pudo eliminar'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al eliminar');
  }
}

/* ========================================
   ✅ NUEVO: FUNCIONES DE VISTA DE DOCUMENTOS
   ======================================== */

// ✅ NOTA: Las funciones showDocumentsView, hideDocumentsView, openUploadModalFromView
// fueron reubicadas más adelante con las mejoras del sistema de etapas

// Abrir modal de subida desde el modal de lista (compatibilidad)
function openUploadModalFromList() {
  openUploadModal();
}

// ✅ NOTA: La función loadDocumentsView fue reubicada más adelante con las mejoras del sistema de etapas

// ✅ NUEVO: Descargar documento con autenticación
async function downloadDocument(fileId, fileName) {
  try {
    // Hacer fetch con autenticación para obtener el archivo
    const response = await authenticatedFetch(`/api/knowledge/download/${fileId}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errorData.error || 'Error al descargar el archivo');
    }

    // Obtener el blob del archivo
    const blob = await response.blob();

    // Crear URL temporal para el blob
    const url = window.URL.createObjectURL(blob);

    // Crear enlace temporal y hacer clic
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'documento';
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // Limpiar: remover enlace y liberar URL
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);

    console.log(`Archivo descargado: ${fileName}`);
  } catch (error) {
    console.error('Error al descargar el archivo:', error);
    alert('Error al descargar el archivo: ' + error.message);
  }
}

// Eliminar documento
async function deleteDocument(fileId, fileName) {
  if (!confirm(`¿Estás seguro de eliminar el documento "${fileName}"?`)) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/knowledge/files/${fileId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      // Recargar la lista
      loadDocumentsView();
      // También recargar el modal si está abierto
      if (document.getElementById('documents-modal').classList.contains('active')) {
        loadDocumentsList();
      }
    } else {
      alert('Error al eliminar el documento: ' + data.error);
    }
  } catch (error) {
    alert('Error al eliminar el documento: ' + error.message);
  }
}

/* ========================================
   ✅ NUEVO: FUNCIONES DE GESTIÓN DE ETAPAS
   ======================================== */

// Variables para gestionar etapas
let allStages = [];
let currentStageId = null;

// Ocultar vista de documentos
function hideDocumentsView() {
  const docView = document.getElementById('documents-view');
  if (docView) {
    docView.style.display = 'none';
  }
}

// Cargar etapas y renderizar pestañas
async function loadStages() {
  try {
    const response = await authenticatedFetch('/api/stages');
    const data = await response.json();

    if (data.success) {
      allStages = data.stages;

      // Si no hay etapa seleccionada, seleccionar la primera
      if (!currentStageId && allStages.length > 0) {
        currentStageId = allStages[0].id;
      }

      renderStagesTabs();
    }
  } catch (error) {
    console.error('Error cargando etapas:', error);
  }
}

// Renderizar pestañas de etapas
function renderStagesTabs() {
  const tabsHeader = document.getElementById('stages-tabs-header');

  if (!tabsHeader) return;

  tabsHeader.innerHTML = allStages.map(stage => {
    const isActive = stage.id === currentStageId;
    const activeClass = isActive ? 'active' : '';
    const stageEnabled = stage.is_active !== false;

    return `
          <div class="stage-tab ${activeClass}" data-stage-id="${stage.id}" onclick="selectStage('${stage.id}')" style="
            padding: 10px 20px;
            border-radius: 8px 8px 0 0;
            background: ${isActive ? 'var(--primary-green)' : '#f5f5f5'};
            color: ${isActive ? 'white' : 'var(--medium-gray)'};
            cursor: pointer;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
            transition: all 0.3s;
            border: 2px solid ${isActive ? 'var(--primary-green)' : '#e0e0e0'};
            border-bottom: none;
            position: relative;
            opacity: ${stageEnabled ? '1' : '0.5'};
          " onmouseover="this.style.background='${isActive ? 'var(--primary-green)' : '#e0e0e0'}'"
             onmouseout="this.style.background='${isActive ? 'var(--primary-green)' : '#f5f5f5'}'">
            <span>${stage.name}</span>
            <label onclick="event.stopPropagation()" style="
              position: relative;
              display: inline-block;
              width: 30px;
              height: 16px;
              flex-shrink: 0;
              margin-left: 4px;
            " title="${stageEnabled ? 'Etapa activa - Click para desactivar' : 'Etapa inactiva - Click para activar'}">
              <input type="checkbox" ${stageEnabled ? 'checked' : ''} onchange="toggleStageActive('${stage.id}', this.checked)" style="opacity:0;width:0;height:0;">
              <span style="
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background: ${stageEnabled ? '#43a047' : '#ef5350'};
                border-radius: 16px;
                transition: background 0.3s;
              "></span>
              <span style="
                position: absolute; content: '';
                height: 12px; width: 12px;
                left: ${stageEnabled ? '16px' : '2px'};
                bottom: 2px;
                background: white;
                border-radius: 50%;
                transition: left 0.3s;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
              "></span>
            </label>
            <button onclick="event.stopPropagation(); openEditStageModal('${stage.id}', '${stage.name.replace(/'/g, "\\'")}')" style="
              background: none;
              border: none;
              cursor: pointer;
              font-size: 14px;
              padding: 2px 6px;
              border-radius: 4px;
              opacity: 0.7;
            " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Editar etapa">✏️</button>
            ${allStages.length > 1 ? `
            <button onclick="event.stopPropagation(); confirmDeleteStage('${stage.id}', '${stage.name.replace(/'/g, "\\'")}')" style="
              background: none;
              border: none;
              cursor: pointer;
              font-size: 14px;
              padding: 2px 6px;
              border-radius: 4px;
              opacity: 0.7;
            " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Eliminar etapa">🗑️</button>
            ` : ''}
          </div>
        `;
  }).join('');
}

// ✅ NUEVO: Activar/desactivar etapa
async function toggleStageActive(stageId, isActive) {
  try {
    const res = await authenticatedFetch(`/api/stages/${stageId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive })
    });
    const data = await res.json();
    if (data.success) {
      // Actualizar etapa en memoria
      const stage = allStages.find(s => s.id === stageId);
      if (stage) stage.is_active = isActive;
      renderStagesTabs();
      showToast(`${isActive ? '🟢 Etapa activada' : '🔴 Etapa desactivada'} - ${data.stage?.name || 'Etapa'}`);
    } else {
      showToast('Error: ' + (data.error || 'Error desconocido'), 'error');
    }
  } catch (error) {
    console.error('Error toggling stage:', error);
    showToast('Error al cambiar estado de etapa', 'error');
  }
}

// Seleccionar una etapa
function selectStage(stageId) {
  currentStageId = stageId;
  renderStagesTabs();
  loadDocumentsView();
}

// Abrir modal para crear etapa
function openCreateStageModal() {
  document.getElementById('stage-modal-title').textContent = '➕ Nueva Etapa';
  document.getElementById('stage-name-input').value = '';
  document.getElementById('stage-id-input').value = '';
  document.getElementById('stage-modal').classList.add('active');
  document.getElementById('stage-name-input').focus();
}

// Abrir modal para editar etapa
function openEditStageModal(stageId, stageName) {
  document.getElementById('stage-modal-title').textContent = '✏️ Editar Etapa';
  document.getElementById('stage-name-input').value = stageName;
  document.getElementById('stage-id-input').value = stageId;
  document.getElementById('stage-modal').classList.add('active');
  document.getElementById('stage-name-input').focus();
}

// Cerrar modal de etapa
function closeStageModal() {
  document.getElementById('stage-modal').classList.remove('active');
}

// Guardar etapa (crear o editar)
async function saveStage() {
  const stageId = document.getElementById('stage-id-input').value;
  const stageName = document.getElementById('stage-name-input').value.trim();

  if (!stageName) {
    alert('Por favor ingresa un nombre para la etapa');
    return;
  }

  try {
    let response;
    if (stageId) {
      // Editar etapa existente
      response = await authenticatedFetch(`/api/stages/${stageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stageName })
      });
    } else {
      // Crear nueva etapa
      response = await authenticatedFetch('/api/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stageName })
      });
    }

    const data = await response.json();

    if (data.success) {
      closeStageModal();
      await loadStages();
      if (!stageId && data.stage) {
        // Si creó nueva etapa, seleccionarla
        selectStage(data.stage.id);
      }
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error al guardar etapa: ' + error.message);
  }
}

// Confirmar eliminación de etapa
function confirmDeleteStage(stageId, stageName) {
  if (confirm(`¿Estás seguro de eliminar la etapa "${stageName}"?\n\nLos documentos asociados a esta etapa se quedarán sin asignar.`)) {
    deleteStage(stageId);
  }
}

// Eliminar etapa
async function deleteStage(stageId) {
  try {
    const response = await authenticatedFetch(`/api/stages/${stageId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      // Si eliminamos la etapa actual, seleccionar otra
      if (currentStageId === stageId) {
        currentStageId = allStages.length > 1 ? allStages.find(s => s.id !== stageId)?.id : null;
      }
      await loadStages();
      await loadDocumentsView();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error al eliminar etapa: ' + error.message);
  }
}

// Modificar loadDocumentsView para cargar solo documentos de la etapa actual
async function loadDocumentsView() {
  const loadingEl = document.getElementById('documents-view-loading');
  const contentEl = document.getElementById('documents-view-content');
  const emptyEl = document.getElementById('documents-view-empty');
  const tableBody = document.getElementById('documents-view-table-body');

  // Mostrar loading
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  emptyEl.style.display = 'none';

  try {
    // ✅ NUEVO: Cargar documentos de la etapa actual
    const endpoint = currentStageId ? `/api/knowledge/files/stage/${currentStageId}` : '/api/knowledge/files';
    const response = await authenticatedFetch(endpoint);
    const data = await response.json();

    // Ocultar loading
    loadingEl.style.display = 'none';

    if (data.success && data.files.length > 0) {
      contentEl.style.display = 'block';

      // Calcular estadísticas SOLO de la etapa actual
      const totalDocs = data.files.length;
      const pdfCount = data.files.filter(f => f.type === 'pdf').length;
      const txtCount = data.files.filter(f => f.type === 'txt').length;
      const totalChunks = data.files.reduce((sum, f) => sum + (f.chunksCount || 0), 0);

      // Actualizar estadísticas
      document.getElementById('doc-stat-total').textContent = totalDocs;
      document.getElementById('doc-stat-pdf').textContent = pdfCount;
      document.getElementById('doc-stat-txt').textContent = txtCount;
      document.getElementById('doc-stat-chunks').textContent = totalChunks;

      // Llenar tabla con mejoras visuales
      tableBody.innerHTML = data.files.map(file => {
        const fileIcon = file.type === 'pdf' ? '📄' : '📝';

        const uploadDate = new Date(file.uploadDate).toLocaleDateString('es-CO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        // Formatear tamaño
        const sizeKB = Math.round(file.size / 1024);
        const sizeText = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

        return `
              <tr>
                <td style="text-align: center; font-size: 1.5em;">${fileIcon}</td>
                <td><strong>${file.originalName}</strong></td>
                <td><span style="font-size: 0.9em; color: var(--medium-gray);">${uploadDate}</span></td>
                <td><span style="font-size: 0.9em;">${sizeText}</span></td>
                <td><span style="font-size: 0.9em;">${file.chunksCount || 0}</span></td>
                <td>
                  <div style="display: flex; gap: 8px; justify-content: flex-start;">
                    <button class="take-btn" onclick="downloadDocument('${file.id}', '${file.originalName}')" style="font-size: 11px; padding: 6px 12px;" title="Descargar archivo">
                      📥 Descargar
                    </button>
                    <button class="reset-btn" onclick="deleteDocument('${file.id}', '${file.originalName}')" style="font-size: 11px; padding: 6px 12px;" title="Eliminar archivo">
                      🗑️ Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            `;
      }).join('');
    } else {
      emptyEl.style.display = 'block';

      // Resetear estadísticas
      document.getElementById('doc-stat-total').textContent = '0';
      document.getElementById('doc-stat-pdf').textContent = '0';
      document.getElementById('doc-stat-txt').textContent = '0';
      document.getElementById('doc-stat-chunks').textContent = '0';
    }
  } catch (error) {
    loadingEl.style.display = 'none';
    emptyEl.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: var(--medium-gray);">Error al cargar documentos</h3>
            <p style="color: var(--medium-gray);">${error.message}</p>
          </div>
        `;
    emptyEl.style.display = 'block';
  }
}

// Modificar openUploadModalFromView para pasar stageId
async function openUploadModalFromView() {
  // ✅ MEJORADO: Asegurar que siempre hay un stageId válido
  if (!currentStageId && allStages.length > 0) {
    currentStageId = allStages[0].id;
  }

  // Guardar el stageId actual para usarlo al subir
  window.currentUploadStageId = currentStageId;

  console.log('📤 Abriendo modal de subida con stageId:', window.currentUploadStageId);

  openUploadModal();
}

// Modificar handleFiles para incluir stageId
async function handleFiles(files) {
  if (files.length === 0) return;

  const progressContainer = document.getElementById('upload-progress');
  progressContainer.style.display = 'block';
  progressContainer.innerHTML = '';

  for (const file of files) {
    // Validate file type
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.pdf', '.txt'].includes(ext)) {
      progressContainer.innerHTML += `
            <div class="upload-progress-item">
              <span style="flex: 1;">${file.name}</span>
              <span class="upload-status error">❌ Tipo no soportado</span>
            </div>
          `;
      continue;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      progressContainer.innerHTML += `
            <div class="upload-progress-item">
              <span style="flex: 1;">${file.name}</span>
              <span class="upload-status error">❌ Muy grande (>10MB)</span>
            </div>
          `;
      continue;
    }

    // Upload file
    try {
      const formData = new FormData();
      formData.append('file', file);

      // ✅ CORREGIDO: Siempre incluir stageId - OBLIGATORIO
      // Si no hay etapa seleccionada, mostrar error y no subir
      const uploadStageId = window.currentUploadStageId || currentStageId;
      if (!uploadStageId) {
        console.error('❌ No hay etapa seleccionada para subir el documento');
        progressContainer.innerHTML += `
              <div class="upload-progress-item">
                <span style="flex: 1;">${file.name}</span>
                <span class="upload-status error">❌ Seleccione una etapa primero</span>
              </div>
            `;
        continue;
      }

      formData.append('stageId', uploadStageId);
      console.log('📤 Subiendo archivo a etapa:', uploadStageId);

      progressContainer.innerHTML += `
            <div class="upload-progress-item" id="upload-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}">
              <span style="flex: 1;">${file.name}</span>
              <div class="upload-progress-bar">
                <div class="upload-progress-fill" style="width: 0%"></div>
              </div>
              <span class="upload-status">Subiendo...</span>
            </div>
          `;

      const response = await authenticatedFetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      const itemEl = document.getElementById(`upload-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`);

      if (data.success) {
        itemEl.querySelector('.upload-progress-fill').style.width = '100%';
        itemEl.querySelector('.upload-status').textContent = '✅ Completado';
        itemEl.querySelector('.upload-status').classList.add('success');
      } else {
        itemEl.querySelector('.upload-status').textContent = '❌ Error: ' + data.error;
        itemEl.querySelector('.upload-status').classList.add('error');
      }
    } catch (error) {
      const itemEl = document.getElementById(`upload-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`);
      itemEl.querySelector('.upload-status').textContent = '❌ Error: ' + error.message;
      itemEl.querySelector('.upload-status').classList.add('error');
    }
  }

  // ✅ CORREGIDO: Cerrar modal y refrescar lista automáticamente
  // Esperar 1.5 segundos para que el usuario vea el estado "Completado"
  setTimeout(async () => {
    // Cerrar modal de subida
    closeUploadModal();

    // Limpiar input file
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';

    // Limpiar stageId temporal
    window.currentUploadStageId = null;

    // Recargar modal de documentos si está abierto
    if (document.getElementById('documents-modal').classList.contains('active')) {
      await loadDocumentsList();
    }

    // Recargar vista completa si está activa
    if (document.getElementById('documents-view').style.display === 'block') {
      await loadDocumentsView();
    }

    // Mostrar mensaje de éxito
    showAlert('✅ Documento(s) subido(s) correctamente', 'success');
  }, 1500);
}

// Modificar showDocumentsView para cargar etapas
function showDocumentsView() {
  // Ocultar contenido original
  document.querySelector('.container').style.display = 'none';

  // Mostrar vista de documentos
  document.getElementById('documents-view').style.display = 'block';

  // ✅ NUEVO: Cargar etapas primero
  loadStages().then(() => {
    // Luego cargar documentos de la etapa actual
    loadDocumentsView();
  });
}

// Cambiar entre tabs
function switchNCTab(tab) {
  currentNCTab = tab;

  // Actualizar botones de tab
  document.querySelectorAll('#nc-tabs .tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`nc-tab-${tab}`).classList.add('active');

  // Ocultar todos los contenidos
  document.querySelectorAll('#number-control-view .tab-content').forEach(c => c.style.display = 'none');

  // Mostrar contenido del tab seleccionado
  document.getElementById(`nc-tab-content-${tab}`).style.display = 'block';

  // Recargar datos del tab
  loadNumberControlData();
}

// Cargar datos según el tab activo
async function loadNumberControlData() {
  const loadingEl = document.getElementById('number-control-loading');
  loadingEl.style.display = 'block';

  try {
    // Siempre cargar el conteo de spam para el badge del tab
    loadSpamCount();

    if (currentNCTab === 'all') {
      await loadAllNumbers();
    } else if (currentNCTab === 'disabled') {
      await loadDisabledNumbers();
    } else if (currentNCTab === 'spam') {
      await loadSpamData();
    }
  } catch (error) {
    console.error('Error cargando datos:', error);
  } finally {
    loadingEl.style.display = 'none';
  }
}

// Cargar conteo rápido de spam para el badge
async function loadSpamCount() {
  try {
    const response = await authenticatedFetch('/api/conversations/spam-control/active');
    const data = await response.json();
    if (data.success) {
      document.getElementById('nc-spam-count').textContent = data.total;
    }
  } catch (e) {
    // Silencioso
  }
}

// TAB 1: Cargar TODOS los números desde conversaciones
async function loadAllNumbers() {
  const contentEl = document.getElementById('nc-all-content');
  const emptyEl = document.getElementById('nc-all-empty');
  const tableBody = document.getElementById('nc-all-table-body');

  contentEl.style.display = 'none';
  emptyEl.style.display = 'none';

  try {
    // Obtener todas las conversaciones (ya incluye info de control de IA)
    const response = await authenticatedFetch('/api/conversations');
    const data = await response.json();

    if (data.success && data.conversations.length > 0) {
      contentEl.style.display = 'block';

      // Contar estadísticas
      let iaActiveCount = 0;
      let iaInactiveCount = 0;

      data.conversations.forEach(conv => {
        if (conv.iaControlled && !conv.iaActive) {
          iaInactiveCount++;
        } else {
          iaActiveCount++;
        }
      });

      // Actualizar estadísticas
      document.getElementById('nc-stat-total-conversations').textContent = data.conversations.length;
      document.getElementById('nc-stat-ia-inactive').textContent = iaInactiveCount;
      document.getElementById('nc-stat-ia-active').textContent = iaActiveCount;

      // Llenar tabla
      tableBody.innerHTML = data.conversations.map(conv => {
        const isIADisabled = conv.iaControlled && !conv.iaActive;
        const isSpamBlocked = conv.iaControlReason && conv.iaControlReason.includes('Spam');
        let statusClass, statusText;

        if (isSpamBlocked) {
          statusClass = 'expired';
          statusText = '🚫 Spam';
        } else if (isIADisabled) {
          statusClass = 'expired';
          statusText = '🔴 IA Desactivada';
        } else {
          statusClass = 'active';
          statusText = '🟢 IA Activa';
        }

        const lastInteraction = new Date(conv.lastInteraction).toLocaleDateString('es-CO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        let actionBtn;
        if (isSpamBlocked) {
          actionBtn = `<button class="take-btn" onclick="reactivateFromSpam('${conv.phoneNumber}')" style="font-size: 11px; padding: 6px 12px; background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);">🟢 Reactivar IA</button>`;
        } else if (isIADisabled) {
          actionBtn = `<button class="take-btn" onclick="activateIAForNumber('${conv.phoneNumber}')" style="font-size: 11px; padding: 6px 12px;">🟢 Activar IA</button>`;
        } else {
          actionBtn = `<button class="reset-btn" onclick="openDisableIAModal('${conv.phoneNumber}', '${conv.whatsappName || conv.registeredName || ''}')" style="font-size: 11px; padding: 6px 12px;">🔴 Desactivar IA</button>`;
        }

        return `
              <tr>
                <td><strong>${conv.whatsappName || conv.registeredName || 'Sin nombre'}</strong></td>
                <td><span class="phone-number">${normalizePhoneNumber(conv.phoneNumber)}</span></td>
                <td><span style="font-size: 0.9em; color: var(--medium-gray);">${lastInteraction}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${actionBtn}</td>
              </tr>
            `;
      }).join('');
    } else {
      emptyEl.style.display = 'block';
      // Actualizar estadísticas a 0
      document.getElementById('nc-stat-total-conversations').textContent = '0';
      document.getElementById('nc-stat-ia-inactive').textContent = '0';
      document.getElementById('nc-stat-ia-active').textContent = '0';
    }
  } catch (error) {
    emptyEl.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: var(--medium-gray);">Error al cargar números</h3>
            <p style="color: var(--medium-gray);">${error.message}</p>
          </div>
        `;
    emptyEl.style.display = 'block';
  }
}

// TAB 2: Cargar solo números con IA desactivada
async function loadDisabledNumbers() {
  const contentEl = document.getElementById('nc-disabled-content');
  const emptyEl = document.getElementById('nc-disabled-empty');
  const tableBody = document.getElementById('nc-disabled-table-body');

  contentEl.style.display = 'none';
  emptyEl.style.display = 'none';

  try {
    const response = await authenticatedFetch('/api/conversations/number-control');
    const data = await response.json();

    if (data.success) {
      // Filtrar solo los que tienen IA desactivada
      const disabledNumbers = data.numbers.filter(n => !n.iaActive);

      if (disabledNumbers.length > 0) {
        contentEl.style.display = 'block';

        tableBody.innerHTML = disabledNumbers.map(record => {
          const disabledDate = record.updatedAt
            ? new Date(record.updatedAt).toLocaleDateString('es-CO', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
            : new Date(record.registeredAt).toLocaleDateString('es-CO', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

          return `
                <tr>
                  <td><strong>${record.name || 'Sin nombre'}</strong></td>
                  <td><span class="phone-number">${normalizePhoneNumber(record.phoneNumber)}</span></td>
                  <td><span style="font-size: 0.9em;">${disabledDate}</span></td>
                  <td><span style="color: var(--medium-gray);">${record.reason || '-'}</span></td>
                  <td>
                    <button class="take-btn" onclick="activateIAForNumber('${record.phoneNumber}')" style="font-size: 11px; padding: 6px 12px;">
                      🟢 Activar IA
                    </button>
                  </td>
                </tr>
              `;
        }).join('');
      } else {
        emptyEl.style.display = 'block';
      }
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    emptyEl.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: var(--medium-gray);">Error al cargar números</h3>
            <p style="color: var(--medium-gray);">${error.message}</p>
          </div>
        `;
    emptyEl.style.display = 'block';
  }
}

// Abrir modal para desactivar IA con motivo
function openDisableIAModal(phoneNumber, name) {
  selectedPhoneToDisable = phoneNumber;
  document.getElementById('disable-ia-phone').textContent = normalizePhoneNumber(phoneNumber) + (name ? ` (${name})` : '');
  document.getElementById('disable-ia-reason').value = '';
  document.getElementById('disable-ia-modal').classList.add('active');
}

// Cerrar modal de desactivar IA
function closeDisableIAModal() {
  document.getElementById('disable-ia-modal').classList.remove('active');
  selectedPhoneToDisable = null;
}

// Confirmar desactivación de IA
async function confirmDisableIA() {
  if (!selectedPhoneToDisable) return;

  const reason = document.getElementById('disable-ia-reason').value.trim();

  try {
    // Primero registrar el número si no existe
    const response = await authenticatedFetch('/api/conversations/number-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: selectedPhoneToDisable,
        reason: reason,
        name: ''
      })
    });

    const data = await response.json();

    if (data.success || data.error?.includes('ya existe')) {
      // Si ya existe, actualizar estado
      if (data.error?.includes('ya existe')) {
        await authenticatedFetch(`/api/conversations/number-control/${encodeURIComponent(selectedPhoneToDisable)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iaActive: false, reason: reason })
        });
      }

      closeDisableIAModal();
      showAlert('🔴 IA desactivada para este número', 'success');
      loadNumberControlData();
    } else {
      alert('Error: ' + (data.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ✅ NUEVO: Abrir modal para agregar número manualmente
function openAddNumberModal() {
  // Limpiar campos
  document.getElementById('add-number-phone').value = '';
  document.getElementById('add-number-name').value = '';
  document.getElementById('add-number-reason').value = '';
  document.getElementById('add-number-error').style.display = 'none';

  // Mostrar modal
  document.getElementById('add-number-modal').classList.add('active');

  // Enfocar campo de teléfono
  setTimeout(() => {
    document.getElementById('add-number-phone').focus();
  }, 100);
}

// ✅ NUEVO: Cerrar modal de agregar número
function closeAddNumberModal() {
  document.getElementById('add-number-modal').classList.remove('active');
}

// ✅ NUEVO: Confirmar agregar número manualmente
async function confirmAddNumber() {
  const phoneInput = document.getElementById('add-number-phone');
  const nameInput = document.getElementById('add-number-name');
  const reasonInput = document.getElementById('add-number-reason');
  const errorEl = document.getElementById('add-number-error');
  const submitBtn = document.getElementById('add-number-btn');

  // Obtener valores
  let phoneNumber = phoneInput.value.trim();
  const name = nameInput.value.trim();
  const reason = reasonInput.value.trim();

  // Validar teléfono
  if (!phoneNumber) {
    errorEl.textContent = '❌ El número de teléfono es obligatorio';
    errorEl.style.display = 'block';
    phoneInput.focus();
    return;
  }

  // Limpiar número (solo dígitos)
  phoneNumber = phoneNumber.replace(/\D/g, '');

  // Validar que sea un número válido (mínimo 7 dígitos)
  if (phoneNumber.length < 7) {
    errorEl.textContent = '❌ El número debe tener al menos 7 dígitos';
    errorEl.style.display = 'block';
    phoneInput.focus();
    return;
  }

  // Validar que no sea muy largo (máximo 15 dígitos)
  if (phoneNumber.length > 15) {
    errorEl.textContent = '❌ El número no puede tener más de 15 dígitos';
    errorEl.style.display = 'block';
    phoneInput.focus();
    return;
  }

  // Ocultar error y deshabilitar botón
  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Agregando...';

  try {
    // Enviar al servidor
    const response = await authenticatedFetch('/api/conversations/number-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phoneNumber,
        name: name || null,
        reason: reason || 'Agregado manualmente',
        registeredBy: 'Asesor'
      })
    });

    const data = await response.json();

    if (data.success) {
      closeAddNumberModal();
      showAlert('✅ Número agregado con IA desactivada', 'success');
      // Cambiar al tab de "IA Desactivada" para ver el número agregado
      switchNCTab('disabled');
    } else if (data.error?.includes('ya existe')) {
      errorEl.textContent = '⚠️ Este número ya está registrado en el sistema';
      errorEl.style.display = 'block';
    } else {
      errorEl.textContent = '❌ Error: ' + (data.error || 'Error desconocido');
      errorEl.style.display = 'block';
    }
  } catch (error) {
    errorEl.textContent = '❌ Error de conexión: ' + error.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '➕ Agregar y Desactivar IA';
  }
}

// Activar IA para un número
async function activateIAForNumber(phoneNumber) {
  if (!confirm(`¿Activar la IA para el número ${normalizePhoneNumber(phoneNumber)}?\n\nEl bot volverá a responder automáticamente.`)) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/conversations/number-control/${encodeURIComponent(phoneNumber)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iaActive: true })
    });

    const data = await response.json();

    if (data.success) {
      showAlert('🟢 IA activada para este número', 'success');
      loadNumberControlData();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Mantener compatibilidad con funciones antiguas (por si acaso)
async function toggleIAStatus(phoneNumber, iaActive) {
  if (iaActive) {
    await activateIAForNumber(phoneNumber);
  } else {
    openDisableIAModal(phoneNumber, '');
  }
}

async function deleteControlledNumber(phoneNumber) {
  if (!confirm(`¿Eliminar el número ${normalizePhoneNumber(phoneNumber)} del control?\n\nLa IA volverá a responder automáticamente a este número.`)) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/conversations/number-control/${encodeURIComponent(phoneNumber)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      showAlert('🗑️ Número eliminado. La IA volverá a responder normalmente.', 'success');
      loadNumberControlData();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/* ========================================
   FUNCIONES DE CONTROL ANTI-SPAM
   ======================================== */

// Cargar datos de spam (TAB 3)
async function loadSpamData() {
  const contentEl = document.getElementById('nc-spam-content');
  const emptyEl = document.getElementById('nc-spam-empty');
  const tableBody = document.getElementById('nc-spam-table-body');

  contentEl.style.display = 'none';
  emptyEl.style.display = 'none';

  try {
    const response = await authenticatedFetch('/api/conversations/spam-control');
    const data = await response.json();

    if (data.success) {
      // Actualizar estadísticas
      document.getElementById('nc-spam-active-blocks').textContent = data.stats.activeSpamBlocks || 0;
      document.getElementById('nc-spam-total-blocked-msgs').textContent = data.stats.totalBlockedMessages || 0;
      document.getElementById('nc-spam-historical').textContent = data.stats.historicalSpamBlocks || 0;
      document.getElementById('nc-spam-count').textContent = data.stats.activeSpamBlocks || 0;

      if (data.blocks && data.blocks.length > 0) {
        contentEl.style.display = 'block';

        tableBody.innerHTML = data.blocks.map(block => {
          const isActive = block.active;
          const statusClass = isActive ? 'expired' : 'active';
          const statusText = isActive ? '🚫 Bloqueado' : '🟢 Reactivado';

          const blockedDate = block.blockedAtFormatted || new Date(block.blockedAt).toLocaleDateString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
          });

          const reactivatedInfo = block.reactivatedBy
            ? `<br><small style="color: #2e7d32;">Reactivado por: ${block.reactivatedBy}<br>${block.reactivatedAtFormatted || ''}</small>`
            : '';

          const actionBtn = isActive
            ? `<button class="take-btn" onclick="reactivateFromSpam('${block.phoneNumber}')" style="font-size: 11px; padding: 6px 12px; background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);">
                    🟢 Reactivar IA
                  </button>`
            : `<span style="color: var(--medium-gray); font-size: 12px;">Ya reactivado</span>`;

          return `
                <tr style="${!isActive ? 'opacity: 0.6;' : ''}">
                  <td><strong>${block.name || 'Sin nombre'}</strong></td>
                  <td><span class="phone-number">${normalizePhoneNumber(block.phoneNumber)}</span></td>
                  <td><span style="font-size: 0.85em;">${blockedDate}</span></td>
                  <td>
                    <span style="color: #c62828; font-size: 0.85em;">${block.reason || 'Spam repetitivo'}</span>
                    <br><small style="color: var(--medium-gray);">Último msg: "${(block.lastMessage || '').substring(0, 40)}..."</small>
                    ${reactivatedInfo}
                  </td>
                  <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                  <td>${actionBtn}</td>
                </tr>
              `;
        }).join('');
      } else {
        emptyEl.style.display = 'block';
      }
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    emptyEl.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: var(--medium-gray);">Error al cargar datos de spam</h3>
            <p style="color: var(--medium-gray);">${error.message}</p>
          </div>
        `;
    emptyEl.style.display = 'block';
  }
}

// Reactivar IA para un número bloqueado por spam
async function reactivateFromSpam(phoneNumber) {
  if (!confirm(`¿Reactivar la IA para ${normalizePhoneNumber(phoneNumber)}?\n\nEl número fue bloqueado por enviar mensajes repetitivos (spam).\nAl reactivar, el bot volverá a responder automáticamente.\nEl contador de spam se reiniciará.`)) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/conversations/spam-control/${encodeURIComponent(phoneNumber)}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reactivatedBy: 'Admin Dashboard'
      })
    });

    const data = await response.json();

    if (data.success) {
      showAlert('🟢 IA reactivada - Contador de spam reiniciado', 'success');
      loadNumberControlData();
    } else {
      alert('Error: ' + (data.error || 'Error desconocido'));
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

/* ========================================
   NUEVAS FUNCIONES DE INTERACCIÓN - ESCALACIÓN
   ======================================== */

/**
 * Genera los botones de acción según el estado de la conversación
 */
function getActionButtons(conv) {
  // ✅ CAMBIADO: Botones base que SIEMPRE estarán disponibles
  // Preparar datos del contacto para pasar a openChat
  const contactData = {
    registeredName: conv.registeredName || conv.whatsappName || null,
    whatsappName: conv.whatsappName || null,
    phoneNumber: conv.phoneNumber || null
  };
  const contactDataStr = encodeURIComponent(JSON.stringify(contactData));

  const baseButtons = `
        <button class="view-chat-btn" onclick="window.ChatFunctions.openChat('${conv.userId}', '${contactDataStr}')">
          💬 Ver Chat
        </button>
        <button class="reset-btn" onclick="resetConversation('${conv.userId}', '${normalizePhoneNumber(conv.phoneNumber)}')">
          🔄 Reset
        </button>
      `;

  // ✅ CAMBIADO: Botones adicionales según el estado
  let additionalButtons = '';

  if (conv.status === 'pending_advisor') {
    // Pendiente de asesor → Agregar botón "Tomar"
    additionalButtons = `
          <button class="take-btn" onclick="takeConversation('${conv.userId}')">
            👥 Tomar
          </button>
        `;
  }

  if (conv.status === 'advisor_handled') {
    // Atendido por asesor → Agregar botones de control de asesor
    additionalButtons = `
          <button class="reactivate-btn" onclick="quickReactivateBot('${conv.userId}')">
            🟢 Reactivar
          </button>
          <button class="release-btn" onclick="releaseConversation('${conv.userId}')">
            ↩️ Liberar
          </button>
        `;
  }

  // ✅ NOTA: 'out_of_hours' no necesita botones adicionales, solo los base

  // ✅ CAMBIADO: Siempre retornar botones base + adicionales
  return baseButtons + additionalButtons;
}

/**
 * Un asesor toma una conversación pendiente
 */
async function takeConversation(userId) {
  try {
    const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/take`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advisor: {
          id: 'current_advisor',
          name: 'Asesor',
          email: 'advisor@norboy.coop'
        }
      })
    });

    const data = await response.json();

    if (data.success) {
      showAlert('✅ Conversación tomada. Ahora puedes responder al usuario.', 'success');
      loadConversations(); // Recargar
      // Opcional: abrir chat automáticamente
      // openChat(userId);
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error tomando conversación: ' + error.message, 'error');
  }
}

/**
 * Libera una conversación de vuelta al bot
 */
async function releaseConversation(userId) {
  if (!confirm('¿Liberar esta conversación de vuelta al bot?\n\nEl bot volverá a responder automáticamente.')) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/release`, {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showAlert('✅ Conversación liberada al bot', 'success');
      loadConversations();
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error: ' + error.message, 'error');
  }
}

/**
 * Reactiva el bot rápidamente desde la tabla
 */
async function quickReactivateBot(userId) {
  if (!confirm('¿Reactivar el bot para esta conversación?\n\nEl bot volverá a responder automáticamente y el asesor dejará de atenderla.')) {
    return;
  }

  try {
    const advisorData = getCurrentAdvisor();

    const result = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/reactivate-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisor: advisorData })
    }).then(r => r.json());

    if (result.success) {
      showAlert('🟢 Bot reactivado. Ahora responderá automáticamente.', 'success');
      loadConversations();
    } else {
      showAlert('Error reactivando bot: ' + result.error, 'error');
    }
  } catch (error) {
    showAlert('Error reactivando bot: ' + error.message, 'error');
  }
}

/**
 * Abre el chat de una conversación
 * PUNTO DE CONTROL 2: Interfaz para que el asesor responda
 * ✅ NUEVO: Con paginación de mensajes
 */
let currentChatUserId = null;

// ✅ NUEVO: Set para rastrear mensajes ya renderizados y evitar duplicados
let renderedMessageIds = new Set();

async function openChat(userId) {
  currentChatUserId = userId;

  // ✅ NUEVO: Resetear variables de paginación
  currentChatMessagesPage = 0;
  currentChatHasMore = false;
  currentChatNextCursor = null;
  currentChatOldestTimestamp = null;

  // ✅ NUEVO: Limpiar Set de mensajes renderizados al abrir chat
  renderedMessageIds.clear();

  // Mostrar modal
  const modal = document.getElementById('chat-modal');
  const phoneSpan = document.getElementById('chat-phone-number');
  const messagesDiv = document.getElementById('chat-messages');
  const input = document.getElementById('chat-message-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const reactivateBtn = document.getElementById('chat-reactivate-btn');
  const botStatusIndicator = document.getElementById('chat-bot-status');
  const botStatusText = document.getElementById('chat-bot-status-text');

  // Mostrar estado de carga
  // ✅ CORRECCIÓN PROBLEMA 3: Normalizar número de teléfono
  phoneSpan.textContent = normalizePhoneNumber(userId.split('@')[0]);
  messagesDiv.innerHTML = '<div style="text-align: center; color: var(--medium-gray); padding: 40px;">Cargando mensajes...</div>';

  // ✅ NUEVO: Agregar listener para scroll hacia arriba (cargar más mensajes)
  messagesDiv.onscroll = null; // Limpiar listener anterior
  messagesDiv.onscroll = handleChatScroll;

  // Cargar historial de mensajes
  await loadChatMessages(userId);

  // Verificar estado del bot
  try {
    const statusResponse = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/bot-status`);
    const statusData = await statusResponse.json();

    if (statusData.success) {
      if (statusData.botActive) {
        botStatusIndicator.className = 'bot-status-indicator active';
        botStatusText.textContent = 'Bot Activo';
        reactivateBtn.style.display = 'none';
      } else {
        botStatusIndicator.className = 'bot-status-indicator inactive';
        botStatusText.textContent = 'Bot Inactivo';
        reactivateBtn.style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('Error obteniendo estado del bot:', error);
  }

  // Configurar botón de enviar
  sendBtn.onclick = sendChatMessage;

  // Mostrar modal
  modal.classList.add('active');
}

/**
 * ✅ NUEVO: Cargar mensajes del chat con paginación
 */
async function loadChatMessages(userId, loadMore = false) {
  const messagesDiv = document.getElementById('chat-messages');

  try {
    // ✅ NUEVO: Obtener mensajes directamente desde WhatsApp
    let url = `/api/conversations/${encodeURIComponent(userId)}/whatsapp-messages?limit=${MESSAGES_PER_PAGE}`;

    // Si es carga de más mensajes, usar el cursor
    if (loadMore && currentChatNextCursor) {
      url += `&cursor=${encodeURIComponent(currentChatNextCursor)}`;
    }

    const response = await authenticatedFetch(url);
    const data = await response.json();

    if (data.success) {
      // ✅ NUEVO: Actualizar variables de paginación
      currentChatHasMore = data.hasMore;
      currentChatNextCursor = data.nextCursor;

      // Renderizar mensajes
      if (data.messages && data.messages.length > 0) {
        const messagesHTML = data.messages.map(msg => {
          const senderClass = (msg.sender === 'admin' || msg.sender === 'advisor') ? 'admin' : (msg.sender === 'bot' ? 'bot' : 'user');
          const senderName = msg.senderName || ((msg.sender === 'admin' || msg.sender === 'advisor') ? 'Asesor' : (msg.sender === 'bot' ? '🤖 Bot' : 'Usuario'));

          // Generar ID único
          const messageId = msg.id || msg.messageId || `loaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          renderedMessageIds.add(messageId);

          // ✅ NUEVO: Renderizar según tipo (texto, audio, imagen, documento)
          let messageContent = '';

          if (msg.type === 'audio') {
            messageContent = `
                  <div class="message-audio">
                    <audio controls src="${msg.mediaUrl || ''}" style="max-width: 200px;">
                      <a href="${msg.mediaUrl || ''}">Descargar audio</a>
                    </audio>
                  </div>
                `;
          } else if (msg.type === 'image') {
            messageContent = `
                  <div class="message-image">
                    <img src="${msg.mediaUrl || ''}" alt="Imagen" style="max-width: 250px; border-radius: 8px;" onclick="window.open('${msg.mediaUrl || ''}', '_blank')">
                  </div>
                  ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${msg.message}</div>` : ''}
                `;
          } else if (msg.type === 'document') {
            messageContent = `
                  <div class="message-document">
                    <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f0f0f0; border-radius: 8px;">
                      <span style="font-size: 24px;">📄</span>
                      <div>
                        <div style="font-weight: 500;">${msg.fileName || 'Documento'}</div>
                        <a href="${msg.mediaUrl || ''}" download style="font-size: 12px; color: var(--primary-green);">Descargar</a>
                      </div>
                    </div>
                  </div>
                  ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${msg.message}</div>` : ''}
                `;
          } else {
            // Mensaje de texto
            messageContent = `<div class="message-text">${msg.message}</div>`;
          }

          return `
                <div class="chat-message ${senderClass}" data-message-id="${messageId}">
                  <div class="message-sender">${senderName}</div>
                  <div class="message-bubble">
                    ${messageContent}
                  </div>
                  <div class="message-time">${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</div>
                </div>
              `;
        }).join('');

        // Actualizar timestamp más antiguo para siguiente página
        if (data.messages.length > 0) {
          currentChatOldestTimestamp = data.messages[0].timestamp; // El primero es el más antiguo (están ordenados cronológicamente)
        }

        if (loadMore) {
          // Insertar mensajes al principio
          const scrollPos = messagesDiv.scrollHeight;
          messagesDiv.insertAdjacentHTML('afterbegin', messagesHTML);
          // Restaurar posición del scroll
          messagesDiv.scrollTop = messagesDiv.scrollHeight - scrollPos;
        } else {
          // Primera carga
          messagesDiv.innerHTML = messagesHTML;

          // ✅ NUEVO: Mensaje informativo sobre la carga
          if (data.total > 0) {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'chat-info-message';
            infoDiv.style.cssText = 'text-align: center; color: var(--medium-gray); font-size: 0.85rem; padding: 10px; opacity: 0.7;';
            infoDiv.innerHTML = `
                  💬 ${data.returned} de ${data.total} mensajes
                  ${data.hasMore ? '<br><span style="cursor: pointer; color: var(--primary-green);" onclick="loadMoreChatMessages()">⬆️ Cargar más antiguos</span>' : ''}
                `;
            messagesDiv.insertBefore(infoDiv, messagesDiv.firstChild);

            // Remover el mensaje después de 5 segundos (pero mantener el botón de cargar más)
            setTimeout(() => {
              if (infoDiv.parentNode === messagesDiv) {
                infoDiv.style.opacity = '0.5';
              }
            }, 5000);
          }

          // ✅ Scroll al final después de que el DOM se actualice
          setTimeout(() => {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }, 100);
        }

        console.log(`✅ ${data.returned} mensajes cargados (hasMore: ${data.hasMore})`);
      } else if (!loadMore) {
        // Solo mostrar "no hay mensajes" si no es carga de más
        messagesDiv.innerHTML = '<div style="text-align: center; color: var(--medium-gray); padding: 40px;">No hay mensajes aún</div>';
      }
    } else {
      messagesDiv.innerHTML = '<div style="text-align: center; color: #c62828; padding: 40px;">Error cargando mensajes</div>';
    }
  } catch (error) {
    messagesDiv.innerHTML = '<div style="text-align: center; color: #c62828; padding: 40px;">Error de conexión</div>';
  }
}

/**
 * ✅ NUEVO: Cargar más mensajes antiguos
 */
async function loadMoreChatMessages() {
  if (!currentChatUserId || !currentChatHasMore) return;

  const messagesDiv = document.getElementById('chat-messages');

  // Mostrar indicador de carga
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'chat-loading-more';
  loadingDiv.style.cssText = 'text-align: center; padding: 10px; color: var(--medium-gray);';
  loadingDiv.textContent = '⏳ Cargando mensajes más antiguos...';
  messagesDiv.insertBefore(loadingDiv, messagesDiv.firstChild);

  await loadChatMessages(currentChatUserId, true);

  // Remover indicador
  const loading = document.getElementById('chat-loading-more');
  if (loading) loading.remove();
}

/**
 * ✅ NUEVO: Manejar scroll en el chat para cargar más mensajes
 */
function handleChatScroll(event) {
  const messagesDiv = event.target;

  // Si el scroll está cerca del tope (50px o menos), cargar más mensajes
  if (messagesDiv.scrollTop < 50 && currentChatHasMore) {
    // Evitar múltiples cargas simultáneas
    messagesDiv.onscroll = null;
    loadMoreChatMessages().then(() => {
      // Restaurar listener después de cargar
      messagesDiv.onscroll = handleChatScroll;
    });
  }
}

/**
 * Cierra el modal de chat
 */
function closeChatModal() {
  const modal = document.getElementById('chat-modal');
  modal.classList.remove('active');
  currentChatUserId = null;

  // ✅ NUEVO: Cerrar emoji picker si está abierto
  if (isEmojiPickerOpen) {
    closeEmojiPicker();
  }

  // ✅ NUEVO: Cerrar menú de adjuntar si está abierto
  closeAttachMenu();

  // ✅ NUEVO: Detener grabación si está activa
  if (isRecording) {
    stopAudioRecording();
  }

  // ✅ NUEVO: Limpiar Set de mensajes renderizados al cerrar chat
  renderedMessageIds.clear();
  console.log('🧹 Set de mensajes renderizados limpiado');
}

/**
 * Maneja la tecla Enter en el input de chat
 */
function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

/**
 * ========================================
 * EMOJI PICKER FUNCTIONS
 * ========================================
 */

// Variable para rastrear si el picker está abierto
let isEmojiPickerOpen = false;

/**
 * Abre/cierra el panel de emojis
 */
function toggleEmojiPicker() {
  const panel = document.getElementById('emoji-picker-panel');
  const btn = document.getElementById('emoji-picker-btn');

  if (isEmojiPickerOpen) {
    panel.classList.remove('show');
    btn.classList.remove('active');
    isEmojiPickerOpen = false;
  } else {
    panel.classList.add('show');
    btn.classList.add('active');
    isEmojiPickerOpen = true;
  }
}

/**
 * Inserta un emoji en la posición actual del cursor
 */
function insertEmoji(emoji) {
  const input = document.getElementById('chat-message-input');

  if (!input) return;

  // Obtener la posición actual del cursor
  const startPos = input.selectionStart;
  const endPos = input.selectionEnd;
  const textBefore = input.value.substring(0, startPos);
  const textAfter = input.value.substring(endPos, input.value.length);

  // Insertar el emoji
  input.value = textBefore + emoji + textAfter;

  // Reposicionar el cursor después del emoji insertado
  const newPos = startPos + emoji.length;
  input.setSelectionRange(newPos, newPos);

  // Mantener el foco en el input
  input.focus();

  // Cerrar el picker después de seleccionar
  closeEmojiPicker();
}

/**
 * Cierra el panel de emojis
 */
function closeEmojiPicker() {
  const panel = document.getElementById('emoji-picker-panel');
  const btn = document.getElementById('emoji-picker-btn');

  panel.classList.remove('show');
  btn.classList.remove('active');
  isEmojiPickerOpen = false;
}

/**
 * Event listener para cerrar el picker al hacer clic fuera
 */
document.addEventListener('click', function (event) {
  const panel = document.getElementById('emoji-picker-panel');
  const btn = document.getElementById('emoji-picker-btn');

  // Si el picker está abierto y el clic no fue en el picker ni en el botón
  if (isEmojiPickerOpen &&
    !panel.contains(event.target) &&
    !btn.contains(event.target)) {
    closeEmojiPicker();
  }
});

/**
 * ========================================
 * END EMOJI PICKER FUNCTIONS
 * ========================================
 */

/**
 * ========================================
 * FUNCIONES MULTIMEDIA REMOVIDAS
 * ========================================
 * Las funciones toggleAttachMenu, handleFileUpload,
 * toggleAudioRecorder, stopAudioRecording y sendAudioMessage
 * están implementadas en js/chat-complete.js.
 * Se eliminaron de aquí para evitar duplicación y conflictos
 * (causaban múltiples "Choose File" y comportamiento errático).
 * ========================================
 */

/**
 * Envía un mensaje desde el dashboard
 * PUNTO DE CONTROL 2: Al enviar, el bot se DESACTIVA
 *
 * ✅ CORRECCIÓN PROBLEMA 1: Eliminar optimistic update duplicado
 * - ANTES: Hacía optimistic update después del fetch → duplicaba con Socket.IO
 * - AHORA: Solo envía al backend, Socket.IO agrega el mensaje automáticamente
 */
async function sendChatMessage() {
  if (!currentChatUserId) return;

  const input = document.getElementById('chat-message-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const message = input.value.trim();

  if (!message) return;

  // Deshabilitar botón e indicar estado de envío
  sendBtn.disabled = true;
  sendBtn.textContent = 'Enviando...';

  try {
    const advisorData = getCurrentAdvisor();

    // ===========================================
    // ✅ CORRECCIÓN: NO hacer optimistic update
    // ===========================================
    // El mensaje se agregará automáticamente cuando llegue el evento Socket.IO
    // Esto evita la duplicación por condición de carrera

    const result = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        advisor: advisorData
      })
    }).then(r => r.json());

    if (result.success) {
      // ✅ NO agregar mensaje aquí - Socket.IO lo hará automáticamente
      // Solo limpiar input y mostrar confirmación
      input.value = '';

      // Actualizar estado del bot
      const botStatusIndicator = document.getElementById('chat-bot-status');
      const botStatusText = document.getElementById('chat-bot-status-text');
      const reactivateBtn = document.getElementById('chat-reactivate-btn');

      botStatusIndicator.className = 'bot-status-indicator inactive';
      botStatusText.textContent = 'Bot Inactivo';
      reactivateBtn.style.display = 'inline-block';

      // ✅ Cambiar notificación para ser más claro
      console.log('✅ Mensaje enviado. Socket.IO agregará el mensaje automáticamente.');

      // Actualizar lista de conversaciones en segundo plano
      loadConversations();
    } else {
      showAlert('Error enviando mensaje: ' + result.error, 'error');
    }
  } catch (error) {
    showAlert('Error enviando mensaje: ' + error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Enviar';
  }
}

/**
 * Reactiva el bot desde el chat
 */
async function reactivateBotFromChat() {
  if (!currentChatUserId) return;

  if (!confirm('¿Reactivar el bot para esta conversación? El bot volverá a responder automáticamente.')) {
    return;
  }

  try {
    const advisorData = getCurrentAdvisor();

    const result = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/reactivate-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisor: advisorData })
    }).then(r => r.json());

    if (result.success) {
      showAlert('🟢 Bot reactivado. Ahora responderá automáticamente.', 'success');

      // Actualizar estado visual
      const botStatusIndicator = document.getElementById('chat-bot-status');
      const botStatusText = document.getElementById('chat-bot-status-text');
      const reactivateBtn = document.getElementById('chat-reactivate-btn');

      botStatusIndicator.className = 'bot-status-indicator active';
      botStatusText.textContent = 'Bot Activo';
      reactivateBtn.style.display = 'none';

      // Actualizar lista de conversaciones
      loadConversations();
    } else {
      showAlert('Error reactivando bot: ' + result.error, 'error');
    }
  } catch (error) {
    showAlert('Error reactivando bot: ' + error.message, 'error');
  }
}

/**
 * Obtiene los datos del asesor actual
 */
function getCurrentAdvisor() {
  const userStr = localStorage.getItem('authUser');
  if (userStr) {
    const user = JSON.parse(userStr);
    return {
      id: user.id || user.email || 'advisor_1',
      name: user.name || user.email || 'Asesor',
      email: user.email || 'advisor@norboy.coop'
    };
  }

  return {
    id: 'advisor_' + Date.now(),
    name: 'Asesor',
    email: 'advisor@norboy.coop'
  };
}

/**
 * Actualiza el estado visual de una conversación en la tabla
 */
function updateConversationStatus(userId, newStatus) {
  // Buscar la fila en la tabla y actualizarla
  const table = document.querySelector('.conversations-table');
  if (table) {
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const phoneCell = row.querySelector('.phone-number');
      if (phoneCell && phoneCell.textContent === userId.split('@')[0]) {
        const statusCell = row.querySelector('.status-badge');
        if (statusCell) {
          const statusConfig = {
            'active': { text: '🟢 Activo', class: 'active' },
            'pending_advisor': { text: '⚠️ Pendiente Asesor', class: 'pending_advisor' },
            'advisor_handled': { text: '👨‍💼 Atendido por Asesor', class: 'advisor_handled' },
            'out_of_hours': { text: '🌙 Fuera de Horario', class: 'out_of_hours' }
          };

          const statusInfo = statusConfig[newStatus] || { text: newStatus, class: '' };
          statusCell.className = `status-badge ${statusInfo.class}`;
          statusCell.textContent = statusInfo.text;
        }

        // Actualizar botones de acción
        const actionCell = row.querySelector('td:last-child');
        if (actionCell) {
          // Recargar conversaciones para actualizar botones
          loadConversations();
        }
      }
    });
  }
}

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
}

// Override fetch calls to use authenticatedFetch
// Save Settings
async function saveSettings() {
  // ✅ MEJORADO: Solo enviar keys que el usuario realmente escribió (no placeholders)
  const groqKeyInput = document.getElementById('groq-key');
  const openaiKeyInput = document.getElementById('openai-key');
  const awsAccessKeyInput = document.getElementById('aws-access-key');
  const awsSecretKeyInput = document.getElementById('aws-secret-key');
  const awsRegionInput = document.getElementById('aws-region');

  const settings = {
    provider: currentProvider,
    groq: {
      // Solo enviar si el campo tiene un valor real (no ●●●●●●●●)
      apiKey: groqKeyInput.value.includes('●') ? undefined : groqKeyInput.value,
      model: document.getElementById('groq-model').value,
      enabled: document.getElementById('groq-enabled').checked
    },
    openai: {
      apiKey: openaiKeyInput.value.includes('●') ? undefined : openaiKeyInput.value,
      model: document.getElementById('openai-model').value,
      enabled: document.getElementById('openai-enabled').checked
    },
    aws: {
      accessKeyId: awsAccessKeyInput.value.includes('●') ? undefined : awsAccessKeyInput.value,
      secretAccessKey: awsSecretKeyInput.value.includes('●') ? undefined : awsSecretKeyInput.value,
      region: awsRegionInput.value
    }
  };

  // Limpiar undefined para no sobreescribir keys existentes
  if (settings.groq.apiKey === undefined) delete settings.groq.apiKey;
  if (settings.openai.apiKey === undefined) delete settings.openai.apiKey;
  if (settings.aws.accessKeyId === undefined) delete settings.aws.accessKeyId;
  if (settings.aws.secretAccessKey === undefined) delete settings.aws.secretAccessKey;

  try {
    const response = await authenticatedFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    const data = await response.json();

    if (data.success) {
      showAlert('✅ Configuración guardada en settings.json y .env', 'success');
      loadSettings();
      loadKeysStatus();
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error guardando configuración: ' + error.message, 'error');
  }
}

// Load Settings
async function loadSettings() {
  try {
    const response = await authenticatedFetch('/api/settings');
    const data = await response.json();

    if (data.provider) {
      selectProvider(data.provider);
    }

    // ✅ MEJORADO: Mostrar máscara segura en los campos (●●●●●●●●)
    if (data.groq?.apiKey) {
      document.getElementById('groq-key').value = data.groq.apiKey;
      document.getElementById('groq-key').placeholder = 'Key configurada - escribe nueva para cambiar';
    } else {
      document.getElementById('groq-key').value = '';
      document.getElementById('groq-key').placeholder = 'gsk_...';
    }
    if (data.groq?.model) {
      document.getElementById('groq-model').value = data.groq.model;
    }
    if (data.groq?.enabled !== undefined) {
      document.getElementById('groq-enabled').checked = data.groq.enabled;
    }

    if (data.openai?.apiKey) {
      document.getElementById('openai-key').value = data.openai.apiKey;
      document.getElementById('openai-key').placeholder = 'Key configurada - escribe nueva para cambiar';
    } else {
      document.getElementById('openai-key').value = '';
      document.getElementById('openai-key').placeholder = 'sk-...';
    }
    if (data.openai?.model) {
      document.getElementById('openai-model').value = data.openai.model;
    }
    if (data.openai?.enabled !== undefined) {
      document.getElementById('openai-enabled').checked = data.openai.enabled;
    }

    // Update status indicators
    if (data.groqAvailable) {
      document.getElementById('groq-status').innerHTML = '✅ Conectado';
      document.getElementById('groq-status').className = 'provider-status ok';
    } else if (data.groq?.apiKey) {
      document.getElementById('groq-status').innerHTML = '⚠️ Desactivado';
      document.getElementById('groq-status').className = 'provider-status pending';
    } else {
      document.getElementById('groq-status').innerHTML = '⏳ No configurado';
      document.getElementById('groq-status').className = 'provider-status pending';
    }

    if (data.openaiAvailable) {
      document.getElementById('openai-status').innerHTML = '✅ Conectado';
      document.getElementById('openai-status').className = 'provider-status ok';
    } else if (data.openai?.apiKey) {
      document.getElementById('openai-status').innerHTML = '⚠️ Desactivado';
      document.getElementById('openai-status').className = 'provider-status pending';
    } else {
      document.getElementById('openai-status').innerHTML = '⏳ No configurado';
      document.getElementById('openai-status').className = 'provider-status pending';
    }

    // ✅ NUEVO: Mostrar datos de AWS
    if (data.aws?.accessKeyId) {
      document.getElementById('aws-access-key').value = data.aws.accessKeyId;
      document.getElementById('aws-access-key').placeholder = 'Key configurada - escribe nueva para cambiar';
    } else {
      document.getElementById('aws-access-key').value = '';
      document.getElementById('aws-access-key').placeholder = 'AKIA...';
    }
    if (data.aws?.secretAccessKey) {
      document.getElementById('aws-secret-key').value = data.aws.secretAccessKey;
      document.getElementById('aws-secret-key').placeholder = 'Key configurada - escribe nueva para cambiar';
    } else {
      document.getElementById('aws-secret-key').value = '';
      document.getElementById('aws-secret-key').placeholder = 'wJalr...';
    }
    if (data.aws?.region) {
      document.getElementById('aws-region').value = data.aws.region;
    }

    // ✅ NUEVO: Cargar estado detallado de keys
    loadKeysStatus();

  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// ✅ NUEVO: Cargar estado de API keys (muestra indicadores debajo de cada input)
async function loadKeysStatus() {
  try {
    const response = await authenticatedFetch('/api/keys/status');
    const data = await response.json();

    if (data.success) {
      // Groq key status
      const groqStatusEl = document.getElementById('groq-key-status');
      if (groqStatusEl) {
        if (data.keys.groq.configured) {
          groqStatusEl.innerHTML = '<span style="color: #2e7d32;">✅ Key configurada</span>';
        } else {
          groqStatusEl.innerHTML = '<span style="color: #ef6c00;">⚠️ Sin key configurada</span>';
        }
      }

      // OpenAI key status
      const openaiStatusEl = document.getElementById('openai-key-status');
      if (openaiStatusEl) {
        if (data.keys.openai.configured) {
          openaiStatusEl.innerHTML = '<span style="color: #2e7d32;">✅ Key configurada</span>';
        } else {
          openaiStatusEl.innerHTML = '<span style="color: #ef6c00;">⚠️ Sin key configurada</span>';
        }
      }

      // ✅ NUEVO: AWS key status
      const awsStatusEl = document.getElementById('aws-key-status');
      if (awsStatusEl) {
        if (data.keys.aws.configured) {
          awsStatusEl.innerHTML = '<span style="color: #2e7d32;">✅ Credenciales configuradas · Región: ' + (data.keys.aws.region || 'us-east-1') + '</span>';
        } else {
          awsStatusEl.innerHTML = '<span style="color: #ef6c00;">⚠️ Sin credenciales AWS configuradas</span>';
        }
      }
    }
  } catch (error) {
    console.error('Error cargando estado de keys:', error);
  }
}

// ✅ NUEVO: Eliminar API key de un proveedor específico
async function deleteApiKey(provider) {
  const providerNames = { groq: 'Groq', openai: 'OpenAI', aws: 'AWS/DynamoDB' };
  const providerName = providerNames[provider] || provider;

  if (!confirm(`¿Eliminar la API key de ${providerName}?\n\nSe eliminará de:\n• .env\n• settings.json\n• Memoria del servidor`)) {
    return;
  }

  try {
    const response = await authenticatedFetch(`/api/keys/${provider}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      showAlert(`🗑️ API key de ${providerName} eliminada correctamente`, 'success');

      // Limpiar el campo del input
      if (provider === 'groq') {
        document.getElementById('groq-key').value = '';
        document.getElementById('groq-key').placeholder = 'gsk_...';
      } else if (provider === 'openai') {
        document.getElementById('openai-key').value = '';
        document.getElementById('openai-key').placeholder = 'sk-...';
      } else if (provider === 'aws') {
        document.getElementById('aws-access-key').value = '';
        document.getElementById('aws-access-key').placeholder = 'AKIA...';
        document.getElementById('aws-secret-key').value = '';
        document.getElementById('aws-secret-key').placeholder = 'wJalr...';
      }

      // Recargar estado
      loadSettings();
    } else {
      showAlert('Error eliminando key: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error eliminando key: ' + error.message, 'error');
  }
}

// ✅ NUEVO: Eliminar TODAS las API keys (preparar para GitHub)
async function deleteAllApiKeys() {
  if (!confirm('⚠️ ¿Eliminar TODAS las API keys?\n\nEsto limpiará:\n• GROQ_API_KEY de .env y settings.json\n• OPENAI_API_KEY de .env y settings.json\n• AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY de .env\n\nPerfecto para hacer git push seguro.')) {
    return;
  }

  try {
    // Eliminar Groq
    await authenticatedFetch('/api/keys/groq', { method: 'DELETE' });
    // Eliminar OpenAI
    await authenticatedFetch('/api/keys/openai', { method: 'DELETE' });
    // ✅ NUEVO: Eliminar AWS
    await authenticatedFetch('/api/keys/aws', { method: 'DELETE' });

    showAlert('🗑️ Todas las API keys eliminadas (Groq, OpenAI, AWS). Listo para git push! 🚀', 'success');

    // Limpiar campos
    document.getElementById('groq-key').value = '';
    document.getElementById('groq-key').placeholder = 'gsk_...';
    document.getElementById('openai-key').value = '';
    document.getElementById('openai-key').placeholder = 'sk-...';
    document.getElementById('aws-access-key').value = '';
    document.getElementById('aws-access-key').placeholder = 'AKIA...';
    document.getElementById('aws-secret-key').value = '';
    document.getElementById('aws-secret-key').placeholder = 'wJalr...';

    // Recargar estado
    loadSettings();
  } catch (error) {
    showAlert('Error eliminando keys: ' + error.message, 'error');
  }
}

// Test Connection
async function testConnection() {
  showAlert('Probando conexión...', 'success');

  try {
    const response = await authenticatedFetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: currentProvider })
    });

    const data = await response.json();

    if (data.success) {
      showAlert(`Conexión exitosa con ${currentProvider.toUpperCase()}! ✅`, 'success');
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error probando conexión: ' + error.message, 'error');
  }
}

// Cerrar Sesión (WhatsApp)
async function cerrarSesion() {
  if (!confirm('¿Cerrar la sesión actual de WhatsApp?')) return;

  try {
    updateStatus('waiting', 'Cerrando sesión...');
    const response = await authenticatedFetch('/logout', {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showAlert('Sesión cerrada. Reconectando...', 'success');
      document.getElementById('session-buttons').style.display = 'none';
      setTimeout(() => socket.emit('get-status'), 3000);
    } else {
      showAlert('Error: ' + data.message, 'error');
    }
  } catch (error) {
    showAlert('Error al cerrar sesión: ' + error.message, 'error');
  }
}

// Limpiar Sesión (WhatsApp)
async function limpiarSesion() {
  if (!confirm('¿Generar nuevo QR Code? Esto borrará la sesión actual.')) return;

  try {
    updateStatus('waiting', 'Limpiando sesión...');
    showAlert('Limpiando sesión y generando nuevo QR...', 'success');

    const response = await authenticatedFetch('/clear-session', {
      method: 'POST'
    });
    const data = await response.json();

    if (data.success) {
      showAlert(data.message || 'Sesión limpiada. Escanea el nuevo QR.', 'success');
      document.getElementById('session-buttons').style.display = 'none';
      document.getElementById('new-qr-button').style.display = 'none';
      qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Generando nuevo QR...</p>`;
      setTimeout(() => {
        socket.emit('get-status');
        setTimeout(() => {
          document.getElementById('new-qr-button').style.display = 'block';
        }, 2000);
      }, 3000);
    } else {
      showAlert('Error: ' + data.message, 'error');
    }
  } catch (error) {
    showAlert('Error al limpiar sesión: ' + error.message, 'error');
  }
}

// ✅ ELIMINADA: Definición duplicada de handleFiles
// La función correcta está definida más arriba (línea ~4473) con soporte para stageId

// Load documents list
async function loadDocumentsList() {
  const loadingEl = document.getElementById('documents-loading');
  const contentEl = document.getElementById('documents-content');
  const listContainer = document.getElementById('documents-list-container');
  const countEl = document.getElementById('documents-count');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const response = await authenticatedFetch('/api/knowledge/files');
    const data = await response.json();

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    if (data.success && data.files.length > 0) {
      countEl.textContent = `${data.files.length} documento${data.files.length > 1 ? 's' : ''}`;

      listContainer.innerHTML = data.files.map(file => {
        const icon = file.type === 'pdf' ? '📄' : '📝';
        const size = formatFileSize(file.size);
        const date = new Date(file.uploadDate).toLocaleDateString('es-ES');

        return `
              <div class="document-item">
                <div class="document-icon">${icon}</div>
                <div class="document-info">
                  <div class="document-name">${file.originalName}</div>
                  <div class="document-meta">${size} • ${date} • ${file.chunksCount} fragmentos</div>
                </div>
                <div class="document-actions">
                  <button class="document-action-btn delete" onclick="deleteDocument('${file.id}', '${file.originalName}')">
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            `;
      }).join('');
    } else {
      countEl.textContent = '0 documentos';
      listContainer.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">📁</div>
              <p>No hay documentos cargados</p>
              <p style="font-size: 13px; margin-top: 5px;">Sube PDF o TXT para agregar a la base de conocimiento</p>
            </div>
          `;
    }
  } catch (error) {
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
    listContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <p>Error al cargar documentos: ${error.message}</p>
          </div>
        `;
  }
}

// Delete document
async function deleteDocument(fileId, fileName) {
  if (!confirm(`¿Eliminar "${fileName}" de la base de conocimiento?`)) return;

  try {
    const response = await authenticatedFetch(`/api/knowledge/files/${fileId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      showAlert(`Documento "${fileName}" eliminado correctamente`, 'success');
      loadDocumentsList();
    } else {
      showAlert('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showAlert('Error al eliminar documento: ' + error.message, 'error');
  }
}

// Check authentication on page load
checkAuthentication();
