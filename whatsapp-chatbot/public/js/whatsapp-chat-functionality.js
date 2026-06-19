/**
 * ===========================================
 * CHAT WHATSAPP - JAVASCRIPT COMPLETO
 * ===========================================
 *
 * Funcionalidad CRÍTICA para:
 * PROBLEMA 1: Scroll automático y desbordamiento
 * PROBLEMA 2: Interactividad completa del chat
 *
 * Fecha: 2026-02-08
 */

(function () {
  'use strict';

  // ===========================================
  // VARIABLES GLOBALES
  // ===========================================
  let currentChatUserId = null;
  let audioRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let recordingTimer = null;
  let recordingStartTime = null;
  let pendingMediaFile = null; // Archivo pendiente para preview antes de enviar

  // ===========================================
  // SCROLL AUTOMÁTICO AL ÚLTIMO MENSAJE
  // ===========================================
  /**
   * Scroll suave hacia el final del chat
   * @param {boolean} immediate - Si true, salta directamente sin animación
   */
  function scrollToBottom(immediate = false) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    if (immediate) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
      messagesDiv.scrollTo({
        top: messagesDiv.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  /**
   * Scroll al último mensaje con un pequeño retraso
   * para permitir que el DOM se actualice
   */
  function scrollToBottomDelayed() {
    setTimeout(() => scrollToBottom(), 100);
  }

  /**
   * Scroll al último mensaje después de renderizar
   */
  function scrollToBottomAfterRender() {
    // Pequeño delay para asegurar que el DOM esté actualizado
    requestAnimationFrame(() => {
      setTimeout(() => scrollToBottom(), 50);
    });
  }

  // ===========================================
  // RENDERIZADO DE MENSAJES CON SCROLL
  // ===========================================
  /**
   * Agrega un nuevo mensaje al chat y hace scroll
   * @param {Object} message - Objeto con los datos del mensaje
   */
  function appendMessageToChat(message) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const senderClass = (message.sender === 'admin' || message.sender === 'advisor') ? 'admin' :
      message.sender === 'bot' ? 'bot' : 'user';
    const senderName = message.senderName || (senderClass === 'admin' ? 'Asesor' :
      senderClass === 'bot' ? '🤖 Bot' : 'Usuario');

    const messageId = message.id || message.messageId ||
      `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generar checks para mensajes enviados
    const checksHTML = senderClass !== 'user' ? `
      <span class="message-checks">
        <svg class="message-check double ${message.read ? 'read' : ''}" viewBox="0 0 16 11" width="16" height="11">
          <path d="M11.5 1.5L5.5 7.5L2.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14.5 1.5L8.5 7.5L5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    ` : '';

    // Formatear hora
    const timeStr = message.timestamp ?
      new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Generar contenido del mensaje según tipo
    let messageContent = '';
    if (message.type === 'audio') {
      const audioSrc = buildStreamUrl(message.mediaUrl, message.id || message.messageId);
      messageContent = `
        <div class="message-audio">
          <audio controls src="${audioSrc}"></audio>
        </div>
      `;
    } else if (message.type === 'image') {
      const imgSrc = buildStreamUrl(message.mediaUrl, message.id || message.messageId);
      messageContent = `
        <div class="message-image">
          <img src="${imgSrc}" alt="Imagen" onclick="window.open('${imgSrc}', '_blank')">
        </div>
        ${message.text && message.text !== message.fileName ? `<div class="message-text">${escapeHtml(message.text)}</div>` : ''}
      `;
    } else if (message.type === 'video') {
      messageContent = `
        <div class="message-video">
          <video controls src="${message.mediaUrl || ''}" style="max-width:100%;border-radius:6px;"></video>
        </div>
        ${message.text && message.text !== message.fileName ? `<div class="message-text">${escapeHtml(message.text)}</div>` : ''}
      `;
    } else if (message.type === 'document') {
      const rawDocUrl = message.mediaUrl || `/api/media/download/${message.id || message.messageId || ''}`;
      const docToken = localStorage.getItem('admin_token') || '';
      const docUrl = rawDocUrl ? `${rawDocUrl}${rawDocUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(docToken)}` : '';
      messageContent = `
        <div class="message-document">
          <span class="message-document-icon">📄</span>
          <div class="message-document-info">
            <div class="message-document-name">${escapeHtml(message.fileName || 'Documento')}</div>
            ${docUrl ? `<a class="message-document-link" href="${docUrl}" download>Descargar</a>` : '<span style="font-size: 12px; color: #999;">Archivo no disponible</span>'}
          </div>
        </div>
        ${message.text && message.text !== message.fileName && !(message.text || '').startsWith('[Documento') ? `<div class="message-text">${escapeHtml(message.text)}</div>` : ''}
      `;
    } else if ((message.text === '[Documento recibido]' || message.text === '[Documento enviado]' || message.message === '[Documento recibido]' || message.message === '[Documento enviado]') && message.mediaUrl) {
      // ✅ Fallback: message stored as type=text but is actually a document
      const docToken3 = localStorage.getItem('admin_token') || '';
      const docUrl = message.mediaUrl ? `${message.mediaUrl}${message.mediaUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(docToken3)}` : '';
      messageContent = `
        <div class="message-document">
          <span class="message-document-icon">📄</span>
          <div class="message-document-info">
            <div class="message-document-name">${escapeHtml(message.fileName || 'Documento')}</div>
            <a class="message-document-link" href="${docUrl}" download>Descargar</a>
          </div>
        </div>
      `;
    } else {
      messageContent = `<div class="message-text">${escapeHtml(message.text || message.message || '')}</div>`;
    }

    // Crear elemento del mensaje
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${senderClass}`;
    messageElement.dataset.messageId = messageId;
    messageElement.innerHTML = `
      ${senderClass === 'user' ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
      <div class="message-bubble">
        ${messageContent}
        <div class="message-meta">
          <span class="message-time">${timeStr}</span>
          ${checksHTML}
        </div>
      </div>
    `;

    messagesDiv.appendChild(messageElement);

    // Scroll automático al nuevo mensaje
    scrollToBottomAfterRender();
  }

  /**
   * Renderiza múltiples mensajes y hace scroll al final
   * @param {Array} messages - Array de mensajes a renderizar
   * @param {boolean} scrollToEnd - Si true, hace scroll al final
   */
  function renderMessages(messages, scrollToEnd = true) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    // Limpiar mensajes existentes si es una carga inicial
    if (!window.renderedMessageIds) {
      window.renderedMessageIds = new Set();
    }

    const renderedMessageIds = window.renderedMessageIds;

    messages.forEach(msg => {
      const messageId = msg.id || msg.messageId ||
        `loaded_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Evitar duplicados
      if (renderedMessageIds.has(messageId)) return;
      renderedMessageIds.add(messageId);

      const senderClass = (msg.sender === 'admin' || msg.sender === 'advisor') ? 'admin' :
        msg.sender === 'bot' ? 'bot' : 'user';
      const senderName = msg.senderName || (senderClass === 'admin' ? 'Asesor' :
        senderClass === 'bot' ? '🤖 Bot' : 'Usuario');

      const checksHTML = senderClass !== 'user' ? `
        <span class="message-checks">
          <svg class="message-check double ${msg.read ? 'read' : ''}" viewBox="0 0 16 11" width="16" height="11">
            <path d="M11.5 1.5L5.5 7.5L2.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14.5 1.5L8.5 7.5L5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      ` : '';

      const timeStr = msg.timestamp ?
        new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      let messageContent = '';
      if (msg.type === 'audio') {
        const audioSrc = buildStreamUrl(msg.mediaUrl, msg.id || msg.messageId);
        messageContent = `<div class="message-audio"><audio controls src="${audioSrc}"></audio></div>`;
      } else if (msg.type === 'image') {
        const imgSrc = buildStreamUrl(msg.mediaUrl, msg.id || msg.messageId);
        messageContent = `
          <div class="message-image">
            <img src="${imgSrc}" alt="Imagen" onclick="window.open('${imgSrc}', '_blank')">
          </div>
          ${msg.message ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}
        `;
      } else if (msg.type === 'video') {
        const vidSrc = buildStreamUrl(msg.mediaUrl, msg.id || msg.messageId);
        messageContent = `
          <div class="message-video">
            <video controls src="${vidSrc}" style="max-width:100%;border-radius:6px;"></video>
          </div>
          ${msg.message ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}
        `;
      } else if (msg.type === 'document') {
        const rawDocUrl4 = msg.mediaUrl || `/api/media/download/${msg.id || msg.messageId || ''}`;
        const docToken4 = localStorage.getItem('admin_token') || '';
        const docUrl = rawDocUrl4 ? `${rawDocUrl4}${rawDocUrl4.includes('?') ? '&' : '?'}token=${encodeURIComponent(docToken4)}` : '';
        messageContent = `
          <div class="message-document">
            <span class="message-document-icon">📄</span>
            <div class="message-document-info">
              <div class="message-document-name">${escapeHtml(msg.fileName || 'Documento')}</div>
              ${docUrl ? `<a class="message-document-link" href="${docUrl}" download>Descargar</a>` : '<span style="font-size: 12px; color: #999;">Archivo no disponible</span>'}
            </div>
          </div>
          ${msg.message && !(msg.message || '').startsWith('[Documento') ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}
        `;
      } else if (msg.message && (msg.message === '[Documento recibido]' || msg.message === '[Documento enviado]') && msg.mediaUrl) {
        // ✅ Fallback: message stored as type=text but is actually a document
        const docToken5 = localStorage.getItem('admin_token') || '';
        const docUrl = msg.mediaUrl ? `${msg.mediaUrl}${msg.mediaUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(docToken5)}` : '';
        messageContent = `
          <div class="message-document">
            <span class="message-document-icon">📄</span>
            <div class="message-document-info">
              <div class="message-document-name">${escapeHtml(msg.fileName || 'Documento')}</div>
              <a class="message-document-link" href="${docUrl}" download>Descargar</a>
            </div>
          </div>
        `;
      } else {
        messageContent = `<div class="message-text">${escapeHtml(msg.message || '')}</div>`;
      }

      const messageElement = document.createElement('div');
      messageElement.className = `chat-message ${senderClass}`;
      messageElement.dataset.messageId = messageId;
      messageElement.innerHTML = `
        ${senderClass === 'user' ? `<div class="message-sender">${escapeHtml(senderName)}</div>` : ''}
        <div class="message-bubble">
          ${messageContent}
          <div class="message-meta">
            <span class="message-time">${timeStr}</span>
            ${checksHTML}
          </div>
        </div>
      `;

      messagesDiv.appendChild(messageElement);
    });

    // Scroll al final si se solicita
    if (scrollToEnd) {
      scrollToBottomAfterRender();
    }
  }

  /**
   * Escape HTML para prevenir XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===========================================
  // ENVIAR MENSAJES
  // ===========================================
  /**
   * Envía un mensaje al chat
   */
  async function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const text = input.value.trim();

    if (!text || !currentChatUserId) return;

    // Deshabilitar input y botón
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      // Mostrar mensaje inmediatamente en el chat (optimistic UI)
      appendMessageToChat({
        sender: 'admin',
        message: text,
        timestamp: new Date().toISOString(),
        read: false
      });

      // Limpiar input
      input.value = '';
      input.style.height = 'auto';

      // Enviar al servidor
      const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!response.ok) {
        throw new Error('Error al enviar mensaje');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Error al enviar mensaje');
      }

      // Actualizar checks a "visto" si la respuesta indica que fue leído
      if (data.read) {
        const lastMessage = document.querySelector('.chat-message.admin:last-of-type .message-check');
        if (lastMessage) {
          lastMessage.classList.add('read');
        }
      }

    } catch (error) {
      console.error('Error enviando mensaje:', error);
      alert('Error al enviar mensaje. Por favor intenta nuevamente.');
    } finally {
      // Rehabilitar input y botón
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ===========================================
  // GRABACIÓN DE AUDIO
  // ===========================================
  /**
   * Inicia la grabación de audio
   */
  async function startAudioRecording() {
    try {
      // Solicitar permiso para usar el micrófono
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioRecorder = new MediaRecorder(stream);
      audioChunks = [];

      audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      audioRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendAudioMessage(audioBlob);
      };

      audioRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();

      // Actualizar UI
      updateRecordingUI();

      // Iniciar timer
      recordingTimer = setInterval(updateRecordingTime, 1000);

    } catch (error) {
      console.error('Error al acceder al micrófono:', error);
      alert('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  }

  /**
   * Detiene la grabación de audio
   */
  function stopAudioRecording() {
    if (audioRecorder && isRecording) {
      audioRecorder.stop();
      audioRecorder.stream.getTracks().forEach(track => track.stop());
      isRecording = false;

      // Limpiar timer
      if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }

      // Restaurar UI
      restoreInputUI();
    }
  }

  /**
   * Cancela la grabación de audio
   */
  function cancelAudioRecording() {
    if (audioRecorder && isRecording) {
      audioRecorder.stop();
      audioRecorder.stream.getTracks().forEach(track => track.stop());
      isRecording = false;

      // Limpiar timer
      if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }

      // Descartar audio grabado
      audioChunks = [];

      // Restaurar UI
      restoreInputUI();
    }
  }

  /**
   * Envía un mensaje de audio
   */
  async function sendAudioMessage(audioBlob) {
    if (!currentChatUserId) return;

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');

      // Mostrar indicador de carga
      appendMessageToChat({
        sender: 'admin',
        type: 'audio',
        message: '[Enviando audio...]',
        timestamp: new Date().toISOString(),
        read: false
      });

      const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-audio`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Error al enviar audio');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Error al enviar audio');
      }

      // Recargar mensajes para mostrar el audio enviado
      await loadChatMessages(currentChatUserId);

    } catch (error) {
      console.error('Error enviando audio:', error);
      alert('Error al enviar audio. Por favor intenta nuevamente.');
    }
  }

  /**
   * Actualiza la UI mientras se graba
   */
  function updateRecordingUI() {
    const inputContainer = document.querySelector('.chat-input-container');
    if (!inputContainer) return;

    // Reemplazar input con indicador de grabación
    const recordingIndicator = document.createElement('div');
    recordingIndicator.className = 'audio-recording-indicator';
    recordingIndicator.id = 'audio-recording-indicator';
    recordingIndicator.innerHTML = `
      <button class="audio-recording-cancel" onclick="window.cancelAudioRecording()" title="Cancelar">
        ✕
      </button>
      <div class="audio-recording-time" id="recording-time">0:00</div>
      <button class="audio-recording-send" onclick="window.stopAudioRecording()" title="Enviar">
        ➤
      </button>
    `;

    // Ocultar input temporalmente
    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (input) input.style.display = 'none';
    if (sendBtn) sendBtn.style.display = 'none';

    inputContainer.appendChild(recordingIndicator);
  }

  /**
   * Actualiza el tiempo de grabación
   */
  function updateRecordingTime() {
    if (!recordingStartTime) return;

    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    const timeDisplay = document.getElementById('recording-time');
    if (timeDisplay) {
      timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Restaura la UI del input
   */
  function restoreInputUI() {
    const recordingIndicator = document.getElementById('audio-recording-indicator');
    if (recordingIndicator) {
      recordingIndicator.remove();
    }

    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (input) input.style.display = '';
    if (sendBtn) sendBtn.style.display = '';
  }

  /**
   * Toggle de grabación de audio
   */
  function toggleAudioRecorder() {
    if (isRecording) {
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  }

  // ===========================================
  // EMOJI PICKER
  // ===========================================
  /**
   * Toggle del emoji picker
   */
  function toggleEmojiPicker() {
    const panel = document.getElementById('emoji-picker-panel');
    const attachMenu = document.getElementById('attach-menu');

    // Cerrar menú de adjuntar si está abierto
    if (attachMenu) attachMenu.classList.remove('show');

    if (panel) {
      panel.classList.toggle('show');
    }
  }

  /**
   * Inserta un emoji en el input
   */
  function insertEmoji(emoji) {
    const input = document.getElementById('chat-message-input');
    if (!input) return;

    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    const text = input.value;

    input.value = text.substring(0, startPos) + emoji + text.substring(endPos);
    input.focus();
    input.selectionStart = input.selectionEnd = startPos + emoji.length;
  }

  // ===========================================
  // MENÚ DE ADJUNTAR
  // ===========================================
  /**
   * Toggle del menú de adjuntar
   */
  function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    const emojiPanel = document.getElementById('emoji-picker-panel');

    // Cerrar emoji picker si está abierto
    if (emojiPanel) emojiPanel.classList.remove('show');

    if (menu) {
      menu.classList.toggle('show');
    }
  }

  /**
   * Maneja la subida de archivos
   * Si es imagen o video, muestra preview. Si es documento, envía directo.
   */
  async function handleFileUpload(input, type) {
    const file = input.files[0];
    if (!file || !currentChatUserId) return;

    // Para imágenes y videos, mostrar preview antes de enviar
    if (type === 'image' || type === 'video') {
      showMediaPreview(file, type);
      input.value = '';
      return;
    }

    // Para documentos, enviar directamente
    await sendFileToServer(file, type);
    input.value = '';
  }

  /**
   * Envía un archivo al servidor (flujo real de upload)
   */
  async function sendFileToServer(file, type) {
    if (!currentChatUserId) return;

    try {
      // UI optimista: mostrar preview inmediatamente
      const localUrl = URL.createObjectURL(file);
      appendMessageToChat({
        sender: 'admin',
        type: type,
        text: `[Enviando ${type === 'image' ? 'imagen' : type === 'video' ? 'video' : 'documento'}...]`,
        mediaUrl: (type === 'image' || type === 'video') ? localUrl : '',
        fileName: file.name,
        timestamp: new Date().toISOString(),
        read: false
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-file`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Error al subir archivo');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Error al subir archivo');
      }

      // Recargar mensajes para obtener URL final del servidor
      await loadChatMessages(currentChatUserId);

      // Cerrar menú de adjuntar
      const menu = document.getElementById('attach-menu');
      if (menu) menu.classList.remove('show');

    } catch (error) {
      console.error('Error subiendo archivo:', error);
      alert('Error al subir archivo. Por favor intenta nuevamente.');
    }
  }

  // ===========================================
  // PREVIEW DE MEDIA ANTES DE ENVIAR
  // ===========================================
  /**
   * Muestra preview de imagen/video antes de enviar
   */
  function showMediaPreview(file, type) {
    pendingMediaFile = { file, type };

    // Remover preview anterior si existe
    const existing = document.getElementById('media-preview-panel');
    if (existing) existing.remove();

    const localUrl = URL.createObjectURL(file);

    const previewPanel = document.createElement('div');
    previewPanel.id = 'media-preview-panel';
    previewPanel.style.cssText = `
      position: absolute; bottom: 60px; left: 0; right: 0;
      background: var(--bg-secondary, #1e1e2e); border-top: 1px solid var(--border-color, #333);
      padding: 12px; display: flex; align-items: center; gap: 12px; z-index: 100;
    `;

    let previewContent = '';
    if (type === 'image') {
      previewContent = `<img src="${localUrl}" alt="Preview" style="max-height:120px;max-width:200px;border-radius:8px;object-fit:cover;">`;
    } else if (type === 'video') {
      previewContent = `<video src="${localUrl}" style="max-height:120px;max-width:200px;border-radius:8px;" muted></video>`;
    }

    previewPanel.innerHTML = `
      ${previewContent}
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:13px;color:var(--text-primary,#eee);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(file.name)}</div>
        <div style="font-size:11px;color:var(--text-secondary,#999);margin-top:2px;">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      <button id="media-preview-cancel" style="background:none;border:none;color:#ff5555;font-size:20px;cursor:pointer;padding:8px;" title="Cancelar">✕</button>
      <button id="media-preview-send" style="background:#25d366;border:none;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;" title="Enviar">➤</button>
    `;

    // Insertar antes del input area
    const inputContainer = document.querySelector('.chat-input-container');
    if (inputContainer && inputContainer.parentNode) {
      inputContainer.parentNode.insertBefore(previewPanel, inputContainer);
    }

    // Event listeners
    document.getElementById('media-preview-cancel').addEventListener('click', cancelMediaPreview);
    document.getElementById('media-preview-send').addEventListener('click', confirmMediaPreview);
  }

  /**
   * Cancela el preview y no envía nada
   */
  function cancelMediaPreview() {
    pendingMediaFile = null;
    const panel = document.getElementById('media-preview-panel');
    if (panel) panel.remove();
  }

  /**
   * Confirma el envío del archivo previewed
   */
  async function confirmMediaPreview() {
    if (!pendingMediaFile) return;

    const { file, type } = pendingMediaFile;
    pendingMediaFile = null;

    // Remover panel
    const panel = document.getElementById('media-preview-panel');
    if (panel) panel.remove();

    // Enviar archivo
    await sendFileToServer(file, type);
  }

  // ===========================================
  // CLIPBOARD PASTE (Ctrl+V)
  // ===========================================
  /**
   * Maneja el pegado de imágenes desde el portapapeles
   */
  function handlePasteMedia(event) {
    // Solo procesar si el chat está abierto
    if (!currentChatUserId) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();

        const blob = item.getAsFile();
        if (!blob) return;

        // Crear un File a partir del Blob con nombre generado
        const ext = item.type.split('/')[1] || 'png';
        const fileName = `clipboard_${Date.now()}.${ext}`;
        const file = new File([blob], fileName, { type: item.type });

        // Mostrar preview antes de enviar
        showMediaPreview(file, 'image');
        return;
      }
    }
  }

  // ===========================================
  // EVENTOS DE TECLADO
  // ===========================================
  /**
   * Maneja la tecla Enter en el input
   */
  function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  }

  /**
   * Ajusta la altura del textarea automáticamente
   */
  function autoResizeTextarea() {
    const input = document.getElementById('chat-message-input');
    if (!input) return;

    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  }

  // ===========================================
  // ABRIR Y CERRAR CHAT
  // ===========================================
  /**
   * Abre el chat con un usuario
   */
  async function openChat(userId) {
    currentChatUserId = userId;

    // Resetear mensajes renderizados
    if (window.renderedMessageIds) {
      window.renderedMessageIds.clear();
    } else {
      window.renderedMessageIds = new Set();
    }

    const modal = document.getElementById('chat-modal');
    const phoneSpan = document.getElementById('chat-phone-number');
    const messagesDiv = document.getElementById('chat-messages');
    const input = document.getElementById('chat-message-input');

    // Mostrar número de teléfono
    phoneSpan.textContent = normalizePhoneNumber(userId.split('@')[0]);

    // Mostrar carga
    messagesDiv.innerHTML = `
      <div class="chat-loading-messages">
        <div class="chat-loading-spinner"></div>
        <div>Cargando mensajes...</div>
      </div>
    `;

    // Mostrar modal
    modal.classList.add('active');

    // Cargar mensajes
    await loadChatMessages(userId);

    // Enfocar input
    input.focus();
  }

  /**
   * Carga los mensajes del chat
   */
  async function loadChatMessages(userId) {
    const messagesDiv = document.getElementById('chat-messages');

    try {
      const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/whatsapp-messages?limit=50`);
      const data = await response.json();

      if (data.success && data.messages) {
        // Limpiar y renderizar mensajes
        messagesDiv.innerHTML = '';
        renderMessages(data.messages, true);
      } else {
        messagesDiv.innerHTML = '<div class="chat-loading-messages">No hay mensajes aún</div>';
      }

    } catch (error) {
      console.error('Error cargando mensajes:', error);
      messagesDiv.innerHTML = '<div class="chat-loading-messages">Error al cargar mensajes</div>';
    }
  }

  /**
   * Normaliza el número de teléfono
   */
  function normalizePhoneNumber(phone) {
    // Eliminar caracteres no numéricos excepto +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Si empieza con 57 (Colombia), formatear
    if (normalized.startsWith('57') && normalized.length > 10) {
      return `+57 ${normalized.substring(2, 4)} ${normalized.substring(4, 8)} ${normalized.substring(8)}`;
    }

    return '+' + normalized;
  }

  /**
   * Cierra el modal del chat
   */
  function closeChatModal() {
    const modal = document.getElementById('chat-modal');
    if (modal) {
      modal.classList.remove('active');
    }

    // Limpiar estado
    currentChatUserId = null;

    // Detener grabación si está activa
    if (isRecording) {
      cancelAudioRecording();
    }

    // Cerrar menús abiertos
    const emojiPanel = document.getElementById('emoji-picker-panel');
    const attachMenu = document.getElementById('attach-menu');
    if (emojiPanel) emojiPanel.classList.remove('show');
    if (attachMenu) attachMenu.classList.remove('show');
  }

  // ===========================================
  // ESCUCHAR NUEVOS MENSAJES VÍA SOCKET
  // ===========================================
  /**
   * Escucha nuevos mensajes y los agrega al chat
   */
  function setupSocketListeners() {
    if (typeof socket === 'undefined') return;

    socket.on('newMessage', (data) => {
      // Si el chat está abierto y es del mismo usuario, agregar mensaje
      if (currentChatUserId && data.from === currentChatUserId) {
        appendMessageToChat({
          sender: 'user',
          message: data.message,
          timestamp: data.timestamp || new Date().toISOString()
        });
      }
    });

    socket.on('messageSent', (data) => {
      // Si el chat está abierto y es del mismo usuario, actualizar mensaje
      if (currentChatUserId && data.to === currentChatUserId) {
        // Actualizar checks a "visto"
        const lastMessage = document.querySelector('.chat-message.admin:last-of-type .message-check');
        if (lastMessage) {
          lastMessage.classList.add('read');
        }
      }
    });
  }

  // ===========================================
  // INICIALIZACIÓN
  // ===========================================
  /**
   * Inicializa la funcionalidad del chat
   */
  function initWhatsAppChat() {
    // Configurar event listeners
    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (input) {
      input.addEventListener('keydown', handleChatKeydown);
      input.addEventListener('input', autoResizeTextarea);
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', sendChatMessage);
    }

    // ✅ NUEVO: Clipboard paste para imágenes (Ctrl+V)
    document.addEventListener('paste', handlePasteMedia);

    // Cerrar modal al hacer click fuera
    const modal = document.getElementById('chat-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeChatModal();
        }
      });
    }

    // Cerrar menús al hacer click fuera
    document.addEventListener('click', (e) => {
      const emojiPanel = document.getElementById('emoji-picker-panel');
      const attachMenu = document.getElementById('attach-menu');
      const emojiBtn = document.getElementById('emoji-picker-btn');
      const attachBtn = document.getElementById('chat-attach-btn');

      if (emojiPanel && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
        emojiPanel.classList.remove('show');
      }

      if (attachMenu && !attachMenu.contains(e.target) && e.target !== attachBtn) {
        attachMenu.classList.remove('show');
      }
    });

    // Configurar socket listeners
    setupSocketListeners();

    console.log('✅ WhatsApp Chat initialized');
  }

  // ===========================================
  // EXPORTAR FUNCIONES GLOBALES
  // ===========================================
  window.WhatsAppChat = {
    scrollToBottom,
    scrollToBottomDelayed,
    appendMessageToChat,
    renderMessages,
    sendChatMessage,
    toggleAudioRecorder,
    startAudioRecording,
    stopAudioRecording,
    cancelAudioRecording,
    toggleEmojiPicker,
    insertEmoji,
    toggleAttachMenu,
    handleFileUpload,
    handleChatKeydown,
    autoResizeTextarea,
    openChat,
    closeChatModal,
    loadChatMessages,
    showMediaPreview,
    cancelMediaPreview,
    confirmMediaPreview,
    handlePasteMedia
  };

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhatsAppChat);
  } else {
    initWhatsAppChat();
  }

})();
