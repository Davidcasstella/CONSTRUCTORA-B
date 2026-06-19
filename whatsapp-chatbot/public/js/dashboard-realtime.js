// Dashboard Realtime — Socket.IO listeners and real-time updates
// Extracted from dashboard-main.js

/**
 * Converts any media URL to a stream URL with auth token,
 * so <img>/<video>/<audio> elements can authenticate via query param.
 * Supports /api/media/download/ID → /api/media/stream/ID?token=...
 */
function buildStreamUrl(mediaUrl, messageId) {
  const token = localStorage.getItem('admin_token') || '';
  // If we have a messageId, prefer the stream endpoint (returns inline)
  const id = messageId || (mediaUrl ? mediaUrl.split('/').pop().split('?')[0] : null);
  if (id && id !== 'undefined' && id !== 'null') {
    return `/api/media/stream/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
  // Fallback: pass the URL as-is (for absolute external URLs)
  return mediaUrl || '';
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
        // ✅ FIX: Use stream endpoint with auth token so <img> can display the image
        const imgSrc = buildStreamUrl(msg.mediaUrl, msg.id || msg.messageId);
        messageContent = `
              <div class="message-image">
                <img src="${imgSrc}" alt="Imagen" style="max-width: 250px; border-radius: 8px;" onclick="window.open('${imgSrc}', '_blank')">
              </div>
              ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${msg.message}</div>` : ''}
            `;
      } else if (msg.type === 'document') {
        const rawDocUrl = msg.mediaUrl || `/api/media/download/${msg.id || msg.messageId || ''}`;
        const docToken = localStorage.getItem('admin_token') || '';
        const docUrl = rawDocUrl ? `${rawDocUrl}${rawDocUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(docToken)}` : '';
        messageContent = `
              <div class="message-document">
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f0f0f0; border-radius: 8px;">
                  <span style="font-size: 24px;">📄</span>
                  <div>
                    <div style="font-weight: 500;">${msg.fileName || 'Documento'}</div>
                    ${docUrl ? `<a href="${docUrl}" download style="font-size: 12px; color: var(--primary-green);">Descargar</a>` : '<span style="font-size: 12px; color: #999;">Archivo no disponible</span>'}
                  </div>
                </div>
              </div>
              ${msg.message && msg.message !== msg.fileName && !msg.message.startsWith('[Documento') ? `<div class="message-text">${msg.message}</div>` : ''}
            `;
      } else if (msg.message && (msg.message === '[Documento recibido]' || msg.message === '[Documento enviado]') && msg.mediaUrl) {
        // ✅ Fallback: message stored as type=text but is actually a document
        const rawDocUrl2 = msg.mediaUrl || `/api/media/download/${msg.id || msg.messageId || ''}`;
        const docToken2 = localStorage.getItem('admin_token') || '';
        const docUrl = rawDocUrl2 ? `${rawDocUrl2}${rawDocUrl2.includes('?') ? '&' : '?'}token=${encodeURIComponent(docToken2)}` : '';
        messageContent = `
              <div class="message-document">
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f0f0f0; border-radius: 8px;">
                  <span style="font-size: 24px;">📄</span>
                  <div>
                    <div style="font-weight: 500;">${msg.fileName || 'Documento'}</div>
                    <a href="${docUrl}" download style="font-size: 12px; color: var(--primary-green);">Descargar</a>
                  </div>
                </div>
              </div>
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

      if (messagesDiv) {
        messagesDiv.innerHTML += messageHtml;

        // ✅ NUEVO: Marcar mensaje como renderizado
        renderedMessageIds.add(tempMessageId);

        // ✅ LAZY LOAD: Only auto-scroll to bottom if user was already near the bottom.
        // This prevents interrupting the user while they browse message history.
        const isNearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 120;
        if (isNearBottom) {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
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

  // ✅ NUEVO: Listener para actualización de estado de conversación (tomar/liberar)
  socket.on('conversation-status-changed', (data) => {
    console.log('📊 Estado de conversación cambiado:', data);
    updatePendingBadge();

    // Actualizar lista con throttle
    throttledLoadConversations();
  });

  // ✅ NUEVO: Listener para sincronización de estado del bot (activo/inactivo)
  socket.on('bot-status-updated', (data) => {
    console.log('🤖 Realtime: Recibido evento bot-status-updated:', data);

    // 1. Actualizar la tabla de conversaciones
    throttledLoadConversations();

    // 2. Si el chat está abierto para este usuario, actualizar interfaz del chat
    if (typeof window.getCurrentChatUserId === 'function') {
      const currentChatId = window.getCurrentChatUserId();
      console.log(`🤖 Realtime: Chat abierto actualmente: ${currentChatId}, Evento para: ${data.userId}`);

      if (currentChatId === data.userId) {
        console.log('🤖 Realtime: Coincidencia de usuario, actualizando UI del chat...');
        if (typeof window.updateBotStatusUI === 'function') {
          window.updateBotStatusUI(data.botActive, data.status);
        } else {
          console.warn('⚠️ Realtime: window.updateBotStatusUI no es una función');
        }
      }
    } else {
      console.warn('⚠️ Realtime: window.getCurrentChatUserId no está definido');
    }
  });

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
