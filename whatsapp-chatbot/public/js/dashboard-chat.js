// Dashboard Chat — Chat modal, messages, emoji picker
// Extracted from dashboard-main.js


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
      updateBotStatusUI(statusData.botActive, statusData.status);
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
      updateBotStatusUI(true, 'active');

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

/**
 * ✅ NUEVO: Actualiza el estado visual del bot en el modal de chat
 * 
 * @param {boolean} botActive - Si el bot está activo
 * @param {string} status - Estado de la conversación
 */
function updateBotStatusUI(botActive, status) {
  const botStatusIndicator = document.getElementById('chat-bot-status');
  const botStatusText = document.getElementById('chat-bot-status-text');
  const reactivateBtn = document.getElementById('chat-reactivate-btn');

  if (!botStatusIndicator || !botStatusText || !reactivateBtn) return;

  if (botActive) {
    botStatusIndicator.className = 'bot-status-indicator active';
    botStatusText.textContent = 'Bot Activo';
    reactivateBtn.style.display = 'none';
  } else {
    botStatusIndicator.className = 'bot-status-indicator inactive';
    botStatusText.textContent = 'Bot Inactivo';
    reactivateBtn.style.display = 'inline-block';
  }

  // Sincronizar también el estado en la lista lateral si es la conversación actual
  if (currentChatUserId) {
    updateConversationStatus(currentChatUserId, status);
  }
}

// Exponer al objeto global
window.openChat = openChat;
window.loadChatMessages = loadChatMessages;
window.sendChatMessage = sendChatMessage;
window.reactivateBotFromChat = reactivateBotFromChat;
window.updateConversationStatus = updateConversationStatus;
window.updateBotStatusUI = updateBotStatusUI;
window.getCurrentChatUserId = () => currentChatUserId;
