/**
 * ===========================================
 * CHAT WHATSAPP - JAVASCRIPT COMPLETO Y FUNCIONAL
 * ===========================================
 *
 * Corrige TODOS los problemas críticos:
 * 1. Envío de mensajes con Enter y botón
 * 2. Emoji picker funcional
 * 3. Adjuntar archivos
 * 4. Grabación de audio
 * 5. Scroll automático
 * 6. Alineación correcta de mensajes
 *
 * Fecha: 2026-02-08
 */

(function () {
  'use strict';

  // ===========================================
  // VARIABLES GLOBALES
  // ===========================================
  window.currentChatUserId = null;
  let isEmojiPickerOpen = false;
  let isAttachMenuOpen = false;
  let audioRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let recordingStartTime = null;
  let recordingTimer = null;

  // ===========================================
  // FUNCIÓN getCurrentAdvisor (Local)
  // ===========================================
  /**
   * Obtiene los datos del asesor actual
   * Usa localStorage o genera datos por defecto
   */
  function getCurrentAdvisor() {
    try {
      const userStr = localStorage.getItem('authUser');
      if (userStr) {
        const user = JSON.parse(userStr);
        return {
          id: user.id || user.email || 'advisor_1',
          name: user.name || user.email || 'Asesor',
          email: user.email || 'advisor@norboy.coop'
        };
      }
    } catch (e) {
      console.warn('Error al obtener authUser:', e);
    }

    // Datos por defecto si no hay usuario
    return {
      id: 'advisor_' + Date.now(),
      name: 'Asesor',
      email: 'advisor@norboy.coop'
    };
  }

  // ===========================================
  // FUNCIÓN authenticatedFetch (Local)
  // ===========================================
  /**
   * Wrapper para fetch con autenticación
   * Genera un token temporal si no existe uno en localStorage
   */
  async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('authToken');

    const headers = {
      ...options.headers,
    };

    // Solo agregar Authorization si hay token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.warn('⚠️ Sin token de autenticación');
    }

    return fetch(url, { ...options, headers });
  }

  // ===========================================
  // FUNCIÓN showAlert (Local)
  // ===========================================
  /**
   * Muestra una alerta al usuario
   */
  function showAlert(message, type = 'info') {
    // Crear elemento de alerta
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : '#17a2b8'};
      color: ${type === 'warning' ? '#000' : '#fff'};
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10001;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(alertDiv);

    // Remover después de 4 segundos
    setTimeout(() => {
      alertDiv.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => alertDiv.remove(), 250);
    }, 4000);
  }

  // ===========================================
  // 1. ENVÍO DE MENSAJES - FUNCIONAL
  // ===========================================

  /**
   * Envía un mensaje de texto
   */
  async function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const message = input.value.trim();

    // Validaciones
    if (!message) {
      console.warn('⚠️ Mensaje vacío, no se envía');
      return;
    }

    if (!window.currentChatUserId) {
      console.warn('⚠️ No hay chat activo');
      showAlert('No hay un chat activo. Selecciona una conversación primero.', 'warning');
      return;
    }

    // Deshabilitar botón y mostrar estado
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" class="spinning"><circle cx="12" cy="12" r="10"/></svg>`;

    try {
      // Obtener datos del asesor
      const advisorData = getCurrentAdvisor();
      console.log('📨 Enviando mensaje con advisor:', advisorData);

      // Enviar al backend
      const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(window.currentChatUserId)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          advisor: advisorData
        })
      });

      const result = await response.json();

      if (result.success) {
        // Limpiar input
        input.value = '';
        input.style.height = 'auto';

        // ✅ FIX Bug#1: NO renderizar aquí de forma optimista.
        // El servidor emite el evento 'new-message' vía Socket.IO casi
        // de inmediato (mismo servidor), que se encarga de agregar el
        // mensaje al chat. Renderizar aquí también causaba duplicados
        // porque el temp-ID local nunca coincidía con el ID real de Baileys.

        console.log('✅ Mensaje enviado correctamente');
        showAlert('Mensaje enviado', 'success');
      } else {
        throw new Error(result.error || 'Error al enviar mensaje');
      }
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
      showAlert('Error al enviar mensaje: ' + error.message, 'error');
    } finally {
      // Restaurar botón
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>`;
    }
  }

  /**
   * Maneja la tecla Enter en el input
   */
  function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  }

  // ===========================================
  // 2. EMOJI PICKER - FUNCIONAL
  // ===========================================

  /**
   * Abre/cierra el panel de emojis
   */
  function toggleEmojiPicker() {
    const panel = document.getElementById('emoji-picker-panel');
    const btn = document.getElementById('emoji-picker-btn');

    if (!panel || !btn) return;

    // Cerrar menú de adjuntar si está abierto
    if (isAttachMenuOpen) {
      toggleAttachMenu();
    }

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

    // Mover cursor después del emoji
    const newPos = startPos + emoji.length;
    input.setSelectionRange(newPos, newPos);

    // Cerrar picker
    if (isEmojiPickerOpen) {
      toggleEmojiPicker();
    }
  }

  // ===========================================
  // 3. ADJUNTAR ARCHIVOS - FUNCIONAL
  // ===========================================

  /**
   * Abre/cierra el menú de adjuntar
   */
  function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    const btn = document.getElementById('chat-attach-btn');

    if (!menu || !btn) return;

    // Cerrar emoji picker si está abierto
    if (isEmojiPickerOpen) {
      toggleEmojiPicker();
    }

    if (isAttachMenuOpen) {
      menu.classList.remove('show');
      btn.classList.remove('active');
      isAttachMenuOpen = false;
    } else {
      menu.classList.add('show');
      btn.classList.add('active');
      isAttachMenuOpen = true;
    }
  }

  /**
   * Maneja la subida de archivos
   * Para imágenes y videos: muestra preview primero
   * Para documentos y audio: sube directamente
   */
  async function handleFileUpload(input, type) {
    const file = input.files[0];
    if (!file) return;

    if (!window.currentChatUserId) {
      showAlert('No hay un chat activo', 'warning');
      return;
    }

    // Para imágenes y videos, mostrar preview antes de enviar
    if (type === 'image' || type === 'video') {
      console.log('📸 [PREVIEW] Mostrando preview para:', type, file.name);
      showMediaPreview(file, type);
      if (input.value) input.value = '';
      return;
    }

    // Para documentos y audio, enviar directamente
    await sendFileToServer(file, type);
    if (input.value) input.value = '';
  }

  // ===========================================
  // MEDIA PREVIEW PANEL
  // ===========================================
  let pendingMediaFile = null;
  let pendingMediaType = null;

  /**
   * Muestra panel de preview para imagen/video antes de enviar
   */
  function showMediaPreview(file, type) {
    // Remover preview anterior si existe
    cancelMediaPreview();
    console.log('📸 [PREVIEW] showMediaPreview inmersivo para:', file.name, type);

    pendingMediaFile = file;
    pendingMediaType = type;

    const localUrl = URL.createObjectURL(file);
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);

    // Crear el overlay de preview
    const previewOverlay = document.createElement('div');
    previewOverlay.id = 'media-preview-overlay';
    // Estilos para el overlay inmersivo (estilo WhatsApp Web)
    previewOverlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(11, 20, 26, 0.95);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      animation: fadeIn 0.2s ease-out;
    `;

    // Contenido del medio (imagen o video)
    let mediaHTML = '';
    if (type === 'image') {
      mediaHTML = `<img src="${localUrl}" style="max-width: 90%; max-height: 70%; object-fit: contain; margin: auto; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);">`;
    } else if (type === 'video') {
      mediaHTML = `<video src="${localUrl}" controls style="max-width: 90%; max-height: 70%; margin: auto; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);"></video>`;
    }

    previewOverlay.innerHTML = `
      <div style="position: absolute; top: 20px; left: 20px; z-index: 10001;">
        <button id="media-preview-close" style="background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; padding: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);" title="Cerrar">✕</button>
      </div>
      
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 20px;">
        ${mediaHTML}
      </div>

      <div style="background: rgba(11, 20, 26, 0.8); padding: 20px 30px; display: flex; flex-direction: column; gap: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
        <!-- Fila de input de subtítulo -->
        <div style="display: flex; align-items: center; background: #2a3942; border-radius: 8px; padding: 5px 15px; gap: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <span style="font-size: 20px; color: #8696a0;">😊</span>
          <input type="text" id="media-preview-caption" placeholder="Escribe un mensaje" style="flex: 1; background: transparent; border: none; color: #e9edef; font-size: 15px; padding: 10px 0; outline: none;">
        </div>
        
        <!-- Fila inferior: info y botón enviar -->
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 45px; height: 45px; border: 2px solid #25d366; border-radius: 4px; overflow: hidden; position: relative;">
               ${type === 'image' ? `<img src="${localUrl}" style="width:100%;height:100%;object-fit:cover;">` : `<video src="${localUrl}" style="width:100%;height:100%;object-fit:cover;"></video>`}
            </div>
            <div style="color: #e9edef;">
              <div style="font-size: 14px; font-weight: 500;">${file.name.replace(/</g, '&lt;')}</div>
              <div style="font-size: 12px; color: #8696a0;">${sizeMB} MB</div>
            </div>
          </div>
          
          <button id="media-preview-send-fab" style="background: #25d366; border: none; color: #fff; border-radius: 50%; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: transform 0.2s;" title="Enviar">
            <span style="transform: translateX(2px);">➤</span>
          </button>
        </div>
      </div>
    `;

    // Insertar el overlay en el modal del chat
    const chatModalContent = document.querySelector('.chat-modal-content');
    if (chatModalContent) {
      chatModalContent.style.position = 'relative'; // Asegurar que sea relativo
      chatModalContent.appendChild(previewOverlay);

      // Enfocar el input de subtítulo después de un breve delay
      setTimeout(() => {
        document.getElementById('media-preview-caption')?.focus();
      }, 300);
    } else {
      console.error('❌ [PREVIEW] No se encontró .chat-modal-content para insertar el overlay');
    }

    // Conectar botones
    document.getElementById('media-preview-close')?.addEventListener('click', cancelMediaPreview);
    document.getElementById('media-preview-send-fab')?.addEventListener('click', confirmMediaPreview);

    // Enviar con Enter
    document.getElementById('media-preview-caption')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        confirmMediaPreview();
      }
    });

    // Inyectar animaciones si no existen
    if (!document.getElementById('media-preview-styles-v2')) {
      const style = document.createElement('style');
      style.id = 'media-preview-styles-v2';
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        #media-preview-send-fab:hover { transform: scale(1.05); background: #00a884; }
        #media-preview-send-fab:active { transform: scale(0.95); }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Cancela el preview y limpia
   */
  function cancelMediaPreview() {
    console.log('📸 [PREVIEW] Cancelando preview');
    const overlay = document.getElementById('media-preview-overlay');
    if (overlay) {
      // Revocar URL de preview para liberar memoria
      const img = overlay.querySelector('img');
      const vid = overlay.querySelector('video');
      if (img) URL.revokeObjectURL(img.src);
      if (vid) URL.revokeObjectURL(vid.src);
      overlay.remove();
    }
    pendingMediaFile = null;
    pendingMediaType = null;
  }

  /**
   * Confirma y envía el archivo previsualizado con subtítulo
   */
  async function confirmMediaPreview() {
    if (!pendingMediaFile || !pendingMediaType) return;

    const file = pendingMediaFile;
    const type = pendingMediaType;
    const caption = document.getElementById('media-preview-caption')?.value || '';

    cancelMediaPreview();
    await sendFileToServer(file, type, caption);
  }

  /**
   * Sube un archivo al servidor y lo envía al chat
   */
  async function sendFileToServer(file, type, caption = '') {
    // Mostrar indicador de carga
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '⏳';
    }

    try {
      // PASO 1: Subir el archivo
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      if (caption) formData.append('caption', caption);

      const uploadResponse = await authenticatedFetch('/api/conversations/upload-media', {
        method: 'POST',
        body: formData
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Error al subir archivo');
      }

      // PASO 2: Enviar el media al chat
      const mediaData = {
        type: type,
        url: uploadResult.file.url,
        filepath: uploadResult.file.filepath,
        filename: uploadResult.file.filename,
        size: uploadResult.file.size
      };

      const sendResponse = await authenticatedFetch(`/api/conversations/${encodeURIComponent(window.currentChatUserId)}/send-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media: mediaData,
          caption: caption || '',
          timestamp: new Date().toISOString()
        })
      });

      const sendResult = await sendResponse.json();
      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Error al enviar mensaje');
      }

      // Actualizar chat
      await loadChatMessages(window.currentChatUserId);
      showAlert(`✅ Enviado correctamente`, 'success');

    } catch (error) {
      console.error('❌ Error enviando archivo:', error);
      showAlert('Error al enviar archivo: ' + error.message, 'error');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>`;
      }
    }
  }

  // ===========================================
  // 4. GRABACIÓN DE AUDIO - FUNCIONAL
  // ===========================================

  /**
   * Inicia la grabación de audio
   */
  async function startAudioRecording() {
    try {
      // Verificar soporte de MediaRecorder
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showAlert('Tu navegador no soporta grabación de audio', 'error');
        return;
      }

      // Solicitar permiso
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // ✅ Usar WebM como formato preferido (más compatible en navegadores)
      let options = { mimeType: 'audio/webm' };

      // Si no soporta webm, intentar ogg (algunos navegadores viejos)
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/ogg')) {
          options = { mimeType: 'audio/ogg' };
        } else {
          // Último recurso: default del navegador
          options = {};
        }
      }

      console.log('🎤 Iniciando grabación con format:', options.mimeType || 'default');

      audioRecorder = new MediaRecorder(stream, options);
      audioChunks = [];

      audioRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      audioRecorder.onstop = async () => {
        // Determinar el mimetype según el formato usado
        const blobType = options.mimeType; // 'audio/ogg' o 'audio/webm'
        const audioBlob = new Blob(audioChunks, { type: blobType });
        await sendAudioMessage(audioBlob, blobType);
      };

      audioRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();

      // Actualizar UI
      updateRecordingUI();

      // Iniciar timer
      recordingTimer = setInterval(updateRecordingTime, 1000);

      console.log('🎤 Grabando audio...');

    } catch (error) {
      console.error('❌ Error al acceder al micrófono:', error);
      showAlert('No se pudo acceder al micrófono. Verifica los permisos.', 'error');
    }
  }

  /**
   * Detiene la grabación y envía el audio
   */
  function stopAudioRecording() {
    if (!audioRecorder || !isRecording) return;

    audioRecorder.stop();
    audioRecorder.stream.getTracks().forEach(track => track.stop());

    isRecording = false;

    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    restoreInputUI();
    console.log('✅ Grabación detenida, enviando audio...');
  }

  /**
   * Cancela la grabación
   */
  function cancelAudioRecording() {
    if (!audioRecorder || !isRecording) return;

    audioRecorder.stop();
    audioRecorder.stream.getTracks().forEach(track => track.stop());

    isRecording = false;
    audioChunks = [];

    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    restoreInputUI();
    console.log('❌ Grabación cancelada');
  }

  /**
   * Envía el mensaje de audio
   * Flujo: 1) Subir a /upload-media, 2) Enviar con /send-media
   * @param {Blob} audioBlob - El Blob de audio grabado
   * @param {string} mimeType - El tipo MIME (audio/ogg o audio/webm)
   */
  async function sendAudioMessage(audioBlob, mimeType = 'audio/ogg') {
    if (!window.currentChatUserId) return;

    const sendBtn = document.getElementById('chat-send-btn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '⏳';

    try {
      // Debug: Verificar info del Blob
      console.log('🎤 Audio Blob:', {
        type: audioBlob.type,
        size: audioBlob.size
      });

      // Determinar extensión según el mimetype
      const fileExtension = mimeType === 'audio/webm' ? 'webm' : 'ogg';
      const fileName = `audio.${fileExtension}`;

      // PASO 1: Subir el archivo de audio
      const formData = new FormData();
      formData.append('file', audioBlob, fileName);
      formData.append('type', 'audio');

      const uploadResponse = await authenticatedFetch('/api/conversations/upload-media', {
        method: 'POST',
        body: formData
      });

      // Verificar si la respuesta es exitosa antes de parsear JSON
      if (!uploadResponse.ok) {
        let errorMsg = `Error ${uploadResponse.status}`;
        try {
          const errorData = await uploadResponse.json();
          console.error('❌ Error upload:', errorData);
          // Manejar diferentes estructuras de error
          if (typeof errorData === 'string') {
            errorMsg = errorData;
          } else if (errorData.error) {
            errorMsg = errorData.error;
          } else if (errorData.message) {
            errorMsg = errorData.message;
          } else if (errorData.errors) {
            errorMsg = errorData.errors.join(', ');
          } else {
            errorMsg = JSON.stringify(errorData);
          }
        } catch (e) {
          // Si no es JSON, usar el texto
          const text = await uploadResponse.text();
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const uploadResult = await uploadResponse.json();

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Error al subir audio');
      }

      // PASO 2: Enviar el audio al chat
      const advisor = getCurrentAdvisor();
      const mediaData = {
        type: 'audio',
        url: uploadResult.file.url,
        filepath: uploadResult.file.filepath,
        filename: uploadResult.file.filename,
        size: uploadResult.file.size
      };

      const sendResponse = await authenticatedFetch(`/api/conversations/${encodeURIComponent(window.currentChatUserId)}/send-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media: mediaData,
          caption: '',
          advisor: advisor
        })
      });

      if (!sendResponse.ok) {
        let errorMsg = `Error ${sendResponse.status}`;
        try {
          const errorData = await sendResponse.json();
          console.error('❌ Error send:', errorData);
          // Manejar diferentes estructuras de error
          if (typeof errorData === 'string') {
            errorMsg = errorData;
          } else if (errorData.error) {
            errorMsg = errorData.error;
          } else if (errorData.message) {
            errorMsg = errorData.message;
          } else if (errorData.errors) {
            errorMsg = errorData.errors.join(', ');
          } else {
            errorMsg = JSON.stringify(errorData);
          }
        } catch (e) {
          errorMsg = await sendResponse.text() || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const sendResult = await sendResponse.json();

      if (sendResult.success) {
        // PROBLEMA 1: Asegurar que la URL del audio sea completa
        // La URL puede venir como relativa (/uploads/audio/...) o ya absoluta
        let audioUrl = uploadResult.file.url;
        if (audioUrl.startsWith('/uploads/')) {
          // Convertir URL relativa a absoluta
          audioUrl = window.location.origin + audioUrl;
        }

        // Mostrar mensaje de audio en el chat con URL completa
        appendMessageToChat({
          id: 'msg_' + Date.now(),
          sender: 'bot',
          senderName: advisor.name,
          message: '🎤 Audio',
          type: 'audio',
          mediaUrl: audioUrl,
          timestamp: Date.now()
        });

        scrollToBottom();
        showAlert('✅ Audio enviado', 'success');
      } else {
        throw new Error(sendResult.error || 'Error al enviar audio');
      }
    } catch (error) {
      console.error('❌ Error enviando audio:', error);
      showAlert('Error al enviar audio: ' + error.message, 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>`;
    }
  }

  /**
   * Actualiza la UI mientras se graba
   */
  function updateRecordingUI() {
    const inputContainer = document.querySelector('.chat-input-container');
    if (!inputContainer) return;

    // Ocultar input temporalmente
    const input = document.getElementById('chat-message-input');
    const attachBtn = document.getElementById('chat-attach-btn');
    const audioBtn = document.getElementById('chat-audio-btn');
    const emojiBtn = document.getElementById('emoji-picker-btn');

    if (input) input.style.display = 'none';
    if (attachBtn) attachBtn.style.display = 'none';
    if (emojiBtn) emojiBtn.style.display = 'none';
    if (audioBtn) audioBtn.style.display = 'none';

    // Crear indicador de grabación
    const recordingIndicator = document.createElement('div');
    recordingIndicator.className = 'audio-recording-indicator';
    recordingIndicator.id = 'audio-recording-indicator';
    recordingIndicator.innerHTML = `
      <button class="audio-recording-cancel" id="audio-cancel-btn" title="Cancelar">✕</button>
      <div class="audio-recording-time" id="recording-time">0:00</div>
      <button class="audio-recording-send" id="audio-send-btn" title="Enviar">➤</button>
    `;

    inputContainer.appendChild(recordingIndicator);

    // Conectar botones
    document.getElementById('audio-cancel-btn').addEventListener('click', cancelAudioRecording);
    document.getElementById('audio-send-btn').addEventListener('click', stopAudioRecording);
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
    const attachBtn = document.getElementById('chat-attach-btn');
    const audioBtn = document.getElementById('chat-audio-btn');
    const emojiBtn = document.getElementById('emoji-picker-btn');

    if (input) input.style.display = '';
    if (attachBtn) attachBtn.style.display = '';
    if (audioBtn) audioBtn.style.display = '';
    if (emojiBtn) emojiBtn.style.display = '';

    // ✅ FIX: Asegurar que los inputs de archivo estén ocultos
    // Esto evita que aparezcan botones "Choose File" fantasma
    ['file-image-input', 'file-document-input', 'file-audio-input', 'file-video-input', 'file-camera-input']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
  }

  /**
   * Toggle de grabación de audio
   */
  function toggleAudioRecorder() {
    if (isRecording) {
      // Si está grabando, mostrar menú de opciones
      // Por ahora, detener grabación
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  }

  // ===========================================
  // 5. SCROLL AUTOMÁTICO
  // ===========================================

  /**
   * Scroll al final del chat
   */
  function scrollToBottom(smooth = true) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    if (smooth) {
      messagesDiv.scrollTo({
        top: messagesDiv.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  // ===========================================
  // 6. RENDERIZADO DE MENSAJES
  // ===========================================

  /**
   * Normaliza URL de media (relativa a absoluta)
   */
  function normalizeMediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url; // Ya es absoluta
    }
    if (url.startsWith('/uploads/')) {
      return window.location.origin + url;
    }
    // Para rutas protegidas de API, adjuntar token si existe
    if (url.startsWith('/api/media/')) {
      const token = localStorage.getItem('authToken');
      const absoluteUrl = window.location.origin + url;
      return token ? `${absoluteUrl}?token=${token}` : absoluteUrl;
    }
    return url;
  }

  /**
   * Agrega un mensaje al chat
   */
  function appendMessageToChat(msg) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    // Determinar tipo de mensaje
    const senderClass = (msg.sender === 'admin' || msg.sender === 'advisor') ? 'admin' :
      msg.sender === 'bot' ? 'bot' : 'user';

    const senderName = msg.senderName || (senderClass === 'admin' ? 'Asesor' :
      senderClass === 'bot' ? '🤖 Bot' : 'Tú');

    // Checks de visto para mensajes enviados
    const checksHTML = senderClass !== 'user' ? `
      <span class="message-checks">
        <svg class="message-check double ${msg.read ? 'read' : ''}" viewBox="0 0 16 11" width="16" height="11">
          <path d="M11.5 1.5L5.5 7.5L2.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14.5 1.5L8.5 7.5L5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>
    ` : '';

    // Formatear hora
    const timeStr = msg.timestamp ?
      new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Normalizar URL de media para asegurar que sea absoluta
    let mediaUrl = normalizeMediaUrl(msg.mediaUrl);

    // ✅ NUEVO: Si no hay mediaUrl explícita pero es mensaje multimedia de usuario,
    // construir URL de descarga usando el messageId y la API de media
    if (!mediaUrl && msg.id && ['audio', 'image', 'document', 'video'].includes(msg.type)) {
      mediaUrl = normalizeMediaUrl(`/api/media/download/${msg.id}`);
    }

    // URL de streaming para audio (mejor para reproducción en línea)
    const streamUrl = msg.id && (msg.type === 'audio') ?
      normalizeMediaUrl(`/api/media/stream/${msg.id}`) : mediaUrl;

    // Generar contenido según tipo
    let messageContent = '';
    if (msg.type === 'audio' && (mediaUrl || streamUrl)) {
      messageContent = `
        <div class="message-audio">
          <div class="audio-player">
            <svg class="audio-icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
            <audio controls src="${streamUrl || mediaUrl}" class="audio-control">
              Tu navegador no soporta audio.
            </audio>
          </div>
          <a class="media-download-btn" href="${mediaUrl}" download title="Descargar audio">
            ⬇️
          </a>
        </div>
      `;
    } else if (msg.type === 'audio') {
      // Audio sin URL disponible
      messageContent = `<div class="message-text">🎤 ${escapeHtml(msg.message || 'Audio')}</div>`;
    } else if (msg.type === 'image' && mediaUrl) {
      messageContent = `
        <div class="message-image">
          <img src="${mediaUrl}" alt="Imagen" onclick="window.open('${mediaUrl}', '_blank')">
          <a class="media-download-btn" href="${mediaUrl}" download title="Descargar imagen">
            ⬇️ Descargar
          </a>
        </div>
        ${msg.message && msg.message !== '[Imagen recibida]' ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}
      `;
    } else if (msg.type === 'image') {
      messageContent = `<div class="message-text">🖼️ ${escapeHtml(msg.message || 'Imagen')}</div>`;
    } else if (msg.type === 'document' && mediaUrl) {
      const displayName = msg.fileName || 'Documento';
      const fileSizeStr = msg.fileSize ? ` (${(msg.fileSize / 1024).toFixed(1)} KB)` : '';
      messageContent = `
        <div class="message-document">
          <span class="message-document-icon">📄</span>
          <div class="message-document-info">
            <div class="message-document-name">${escapeHtml(displayName)}${fileSizeStr}</div>
            <a class="message-document-link" href="${mediaUrl}" download>Descargar</a>
          </div>
        </div>
        ${msg.message && msg.message !== '[Documento recibido]' ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}
      `;
    } else if (msg.type === 'document') {
      messageContent = `<div class="message-text">📄 ${escapeHtml(msg.message || 'Documento')}</div>`;
    } else if (msg.type === 'video' && mediaUrl) {
      messageContent = `
        <div class="message-video">
          <video controls src="${mediaUrl}" style="max-width:280px;border-radius:6px" preload="metadata">Video</video>
          <a class="media-download-btn" href="${mediaUrl}" download title="Descargar video">
            ⬇️ Descargar
          </a>
        </div>
        ${msg.message && msg.message !== '[Video recibido]' ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}
      `;
    } else if (msg.type === 'video') {
      messageContent = `<div class="message-text">🎬 ${escapeHtml(msg.message || 'Video')}</div>`;
    } else {
      messageContent = `<div class="message-text">${escapeHtml(msg.message || '')}</div>`;
    }

    // Crear elemento del mensaje
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${senderClass}`;
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
    scrollToBottom();
  }

  /**
   * Escape HTML para prevenir XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // ===========================================
  // 7. ABRIR Y CERRAR CHAT
  // ===========================================

  /**
   * Abre el chat con un usuario
   */
  async function openChat(userId, contactDataStr = null) {
    window.currentChatUserId = userId;

    const modal = document.getElementById('chat-modal');
    const phoneSpan = document.getElementById('chat-phone-number');
    const contactNameSpan = document.getElementById('chat-contact-name');
    const messagesDiv = document.getElementById('chat-messages');
    const input = document.getElementById('chat-message-input');

    // Parsear contactData si viene como string (desde HTML onclick)
    let contactData = null;
    if (contactDataStr) {
      try {
        contactData = JSON.parse(decodeURIComponent(contactDataStr));
      } catch (e) {
        console.warn('Error parseando contactData:', e);
      }
    }

    // Normalizar número
    const phoneNumber = normalizePhoneNumber(userId.split('@')[0]);
    phoneSpan.textContent = phoneNumber;

    // Obtener nombre del contacto con prioridades:
    // 1. Datos proporcionados (desde lista de chats)
    // 2. localStorage
    // 3. Backend (en la respuesta de mensajes)
    let contactName = null;

    if (contactData && contactData.registeredName) {
      contactName = contactData.registeredName;
    } else if (contactData && contactData.whatsappName) {
      contactName = contactData.whatsappName;
    } else if (contactData && contactData.name) {
      contactName = contactData.name;
    } else {
      contactName = getContactName(userId);
    }

    contactNameSpan.textContent = contactName || phoneNumber;

    // Actualizar iniciales del avatar
    const avatarInitials = document.getElementById('chat-avatar-initials');
    if (avatarInitials && contactName) {
      // Obtener iniciales del nombre
      const words = contactName.split(' ');
      if (words.length >= 2) {
        avatarInitials.textContent = (words[0][0] + words[1][0]).toUpperCase();
      } else {
        avatarInitials.textContent = contactName.substring(0, 2).toUpperCase();
      }
    } else if (avatarInitials && !contactName) {
      // Si no hay nombre, usar las primeras 2 letras del número
      avatarInitials.textContent = phoneNumber.replace(/\D/g, '').substring(0, 2);
    }

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
    try {
      const response = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/whatsapp-messages?limit=50`);
      const data = await response.json();

      if (data.success && data.messages && data.messages.length > 0) {
        messagesDiv.innerHTML = '';
        data.messages.forEach(msg => appendMessageToChat(msg));
        scrollToBottom(false);
      } else {
        messagesDiv.innerHTML = '<div class="chat-loading-messages">No hay mensajes aún. ¡Inicia la conversación!</div>';
      }
    } catch (error) {
      console.error('Error cargando mensajes:', error);
      messagesDiv.innerHTML = '<div class="chat-loading-messages">Error al cargar mensajes</div>';
    }

    // Enfocar input
    setTimeout(() => input?.focus(), 100);
  }

  /**
   * Normaliza el número de teléfono
   */
  function normalizePhoneNumber(phone) {
    let normalized = phone.replace(/[^\d+]/g, '');
    if (normalized.startsWith('57') && normalized.length > 10) {
      return `+57 ${normalized.substring(2, 4)} ${normalized.substring(4, 8)} ${normalized.substring(8)}`;
    }
    return '+' + normalized;
  }

  /**
   * Obtiene el nombre del contacto
   */
  function getContactName(userId) {
    // Intentar desde localStorage
    const contacts = JSON.parse(localStorage.getItem('chatContacts') || '{}');
    return contacts[userId] || null;
  }

  /**
   * Guarda el nombre del contacto
   */
  function saveContactName(userId, name) {
    const contacts = JSON.parse(localStorage.getItem('chatContacts') || '{}');
    contacts[userId] = name;
    localStorage.setItem('chatContacts', JSON.stringify(contacts));
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
    window.currentChatUserId = null;

    // Detener grabación si está activa
    if (isRecording) {
      cancelAudioRecording();
    }

    // Cerrar menús abiertos
    if (isEmojiPickerOpen) toggleEmojiPicker();
    if (isAttachMenuOpen) toggleAttachMenu();
  }

  // ===========================================
  // 6. GHOST BUSTER - ELIMINADOR DE INPUTS FANTASMA
  // ===========================================
  function initGhostBuster() {
    console.log('👻 Iniciando Ghost Buster para eliminar inputs fantasma...');

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          // Caso 1: El nodo agregado es un input file
          if (node.nodeType === 1 && node.tagName === 'INPUT' && node.type === 'file') {
            // Si el input no tiene ID conocido (nuestros inputs ocultos tienen ID)
            // O si está visible, lo eliminamos
            if (!node.id || !node.id.startsWith('file-')) {
              console.warn('👻 Ghost file input detectado y eliminado:', node);
              node.remove();
            } else if (node.style.display !== 'none') {
              // Si es uno de los nuestros pero se hizo visible sin querer
              node.style.display = 'none';
              node.style.visibility = 'hidden';
            }
          }

          // Caso 2: El nodo agregado CONTIENE un input file
          if (node.nodeType === 1 && node.querySelectorAll) {
            const inputs = node.querySelectorAll('input[type="file"]');
            inputs.forEach(input => {
              if (!input.id || !input.id.startsWith('file-')) {
                console.warn('👻 Ghost file input (anidado) detectado y eliminado:', input);
                input.remove();
              } else if (input.style.display !== 'none') {
                input.style.display = 'none';
                input.style.visibility = 'hidden';
              }
            });
          }
        });
      });
    });

    // Observar todo el body por si acaso los agregan al final
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('👻 Ghost Buster activo y vigilando.');
  }

  /**
   * Inicializa todos los event listeners
   */
  function initChat() {
    console.log('🚀 Inicializando chat funcional...');

    // Inyectar CSS para drag-and-drop si no existe
    if (!document.getElementById('drag-over-style')) {
      const style = document.createElement('style');
      style.id = 'drag-over-style';
      style.textContent = `.drag-over { outline: 2px dashed #25d366 !important; outline-offset: -4px; background: rgba(37,211,102,0.08) !important; }`;
      document.head.appendChild(style);
    }

    // Input de mensaje
    const input = document.getElementById('chat-message-input');
    if (input) {
      input.addEventListener('keydown', handleChatKeydown);
      input.addEventListener('input', function () {
        // Auto-resize
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
    }

    // Botón enviar
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', sendChatMessage);
    }

    // Botón emoji
    const emojiBtn = document.getElementById('emoji-picker-btn');
    if (emojiBtn) {
      emojiBtn.addEventListener('click', toggleEmojiPicker);
    }

    // Botón adjuntar
    const attachBtn = document.getElementById('chat-attach-btn');
    if (attachBtn) {
      attachBtn.addEventListener('click', toggleAttachMenu);
    }

    // Botón audio
    const audioBtn = document.getElementById('chat-audio-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', toggleAudioRecorder);
    }

    // Emojis en el picker
    document.querySelectorAll('.emoji-picker-item').forEach(item => {
      item.addEventListener('click', function () {
        insertEmoji(this.textContent);
      });
    });

    // Items del menú de adjuntar - PROBLEMA 2: Conectar clicks a los inputs
    document.querySelectorAll('.attach-menu-item').forEach(item => {
      item.addEventListener('click', function () {
        const action = this.getAttribute('data-action');
        let inputId = '';

        switch (action) {
          case 'image':
            inputId = 'file-image-input';
            break;
          case 'document':
            inputId = 'file-document-input';
            break;
          case 'audio':
            inputId = 'file-audio-input';
            break;
          case 'video':
            inputId = 'file-video-input';
            break;
          case 'camera':
            inputId = 'file-camera-input';
            break;
        }

        if (inputId) {
          const input = document.getElementById(inputId);
          if (input) {
            input.click();  // Abrir explorador de archivos
          }
        }

        // Cerrar menú después de seleccionar
        if (isAttachMenuOpen) {
          toggleAttachMenu();
        }
      });
    });

    // Inputs de archivo
    const fileImageInput = document.getElementById('file-image-input');
    const fileDocumentInput = document.getElementById('file-document-input');
    const fileAudioInput = document.getElementById('file-audio-input');
    const fileVideoInput = document.getElementById('file-video-input');
    const fileCameraInput = document.getElementById('file-camera-input');

    if (fileImageInput) fileImageInput.addEventListener('change', (e) => handleFileUpload(e.target, 'image'));
    if (fileDocumentInput) fileDocumentInput.addEventListener('change', (e) => handleFileUpload(e.target, 'document'));
    if (fileAudioInput) fileAudioInput.addEventListener('change', (e) => handleFileUpload(e.target, 'audio'));
    if (fileVideoInput) fileVideoInput.addEventListener('change', (e) => handleFileUpload(e.target, 'video'));
    if (fileCameraInput) fileCameraInput.addEventListener('change', (e) => handleFileUpload(e.target, 'image'));

    // Cerrar modal al hacer click fuera
    const modal = document.getElementById('chat-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeChatModal();
      });
    }

    // Cerrar menús al hacer click fuera
    document.addEventListener('click', (e) => {
      const emojiPanel = document.getElementById('emoji-picker-panel');
      const attachMenu = document.getElementById('attach-menu');

      if (isEmojiPickerOpen && emojiPanel && !emojiPanel.contains(e.target) && e.target.id !== 'emoji-picker-btn') {
        toggleEmojiPicker();
      }

      if (isAttachMenuOpen && attachMenu && !attachMenu.contains(e.target) && e.target.id !== 'chat-attach-btn') {
        toggleAttachMenu();
      }
    });

    // ✅ NUEVO: Clipboard paste para imágenes (Ctrl+V)
    document.addEventListener('paste', handlePasteMedia);

    // ✅ NUEVO: Drag-and-drop para archivos
    const chatBody = document.getElementById('chat-messages');
    const chatModal = document.getElementById('chat-modal');
    const dropTarget = chatModal || chatBody;
    if (dropTarget) {
      ['dragenter', 'dragover'].forEach(evt => {
        dropTarget.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropTarget.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(evt => {
        dropTarget.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropTarget.classList.remove('drag-over');
        });
      });
      dropTarget.addEventListener('drop', handleDropMedia);
    }

    console.log('✅ Chat funcional inicializado');
  }

  // ===========================================
  // CLIPBOARD PASTE & DRAG-DROP
  // ===========================================

  /**
   * Maneja pegado de imágenes desde el portapapeles (Ctrl+V)
   */
  function handlePasteMedia(event) {
    if (!window.currentChatUserId) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;

        const ext = item.type.split('/')[1] || 'png';
        const fileName = `clipboard_${Date.now()}.${ext}`;
        const file = new File([blob], fileName, { type: item.type });

        // Crear DataTransfer para simular un input.files
        const dt = new DataTransfer();
        dt.items.add(file);
        const fakeInput = { files: dt.files, value: '' };

        handleFileUpload(fakeInput, 'image');
        return;
      }
    }
  }

  /**
   * Maneja archivos arrastrados (drag-and-drop)
   */
  function handleDropMedia(event) {
    if (!window.currentChatUserId) return;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const mime = file.type || '';

    let type = 'document';
    if (mime.startsWith('image/')) type = 'image';
    else if (mime.startsWith('video/')) type = 'video';
    else if (mime.startsWith('audio/')) type = 'audio';

    // Crear DataTransfer para simular un input.files
    const dt = new DataTransfer();
    dt.items.add(file);
    const fakeInput = { files: dt.files, value: '' };

    handleFileUpload(fakeInput, type);
  }

  // ===========================================
  // EXPORTAR FUNCIONES GLOBALES
  // ===========================================
  window.ChatFunctions = {
    sendChatMessage,
    toggleEmojiPicker,
    insertEmoji,
    toggleAttachMenu,
    handleFileUpload,
    toggleAudioRecorder,
    startAudioRecording,
    stopAudioRecording,
    cancelAudioRecording,
    scrollToBottom,
    appendMessageToChat,
    openChat,
    closeChatModal,
    saveContactName,
    getContactName,
    handlePasteMedia,
    handleDropMedia,
    showMediaPreview,
    cancelMediaPreview,
    confirmMediaPreview,
    sendFileToServer
  };

  // Exportar funciones críticas también directamente a window para compatibilidad
  window.openChat = openChat;
  window.closeChatModal = closeChatModal;
  window.sendChatMessage = sendChatMessage;

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
    // Iniciar Ghost Buster para mantener la UI limpia
    initGhostBuster();
  } else {
    initChat();
    // Iniciar Ghost Buster inmediatamente si ya cargó
    initGhostBuster();
  }

})();
