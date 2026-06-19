/**
 * ===========================================
 * DASHBOARD WELCOME CONFIG
 * ===========================================
 *
 * Manages the Welcome configuration UI:
 * - Welcome messages CRUD with drag-and-drop
 * - Consent message editing
 * - Closure messages CRUD
 * - Advanced settings
 */

// ===========================================
// STATE
// ===========================================
let welcomeConfig = null;
let welcomeDirty = false;
let welcomeActiveTab = 'welcome';
let dragSrcEl = null;

// ===========================================
// INITIALIZATION
// ===========================================

/**
 * Called when the welcome view is shown
 */
function showWelcomeView() {
  loadWelcomeConfig();
}

/**
 * Called when the welcome view is hidden
 */
function hideWelcomeView() {
  // Auto-save if dirty on view change
  if (welcomeDirty) {
    saveWelcomeConfig(true); // silent save
  }
}

/**
 * Loads welcome config from API
 */
async function loadWelcomeConfig() {
  const loading = document.getElementById('wm-loading');
  const content = document.getElementById('wm-content');

  if (loading) loading.style.display = 'block';
  if (content) content.style.display = 'none';

  try {
    const token = localStorage.getItem('dashboard_token') || sessionStorage.getItem('dashboard_token');
    const res = await fetch('/api/welcome-config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.success) {
      welcomeConfig = data.config;
      renderWelcomeConfig();
      welcomeDirty = false;
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    console.error('Error loading welcome config:', err);
    showWelcomeToast('Error cargando configuración', 'error');
  } finally {
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
  }
}

// ===========================================
// RENDERING
// ===========================================

/**
 * Renders the full welcome config UI
 */
function renderWelcomeConfig() {
  if (!welcomeConfig) return;

  // Global toggle
  const globalToggle = document.getElementById('wm-global-enabled');
  if (globalToggle) {
    globalToggle.checked = welcomeConfig.welcome?.enabled !== false;
    updateGlobalToggleUI();
  }

  // Render active tab
  renderWelcomeTab(welcomeActiveTab);
}

/**
 * Switches between welcome tabs
 */
function switchWelcomeTab(tab) {
  welcomeActiveTab = tab;

  // Update tab buttons
  document.querySelectorAll('.welcome-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  // Update tab content
  document.querySelectorAll('.welcome-tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `wm-tab-${tab}`);
  });

  renderWelcomeTab(tab);
}

/**
 * Renders content for a specific tab
 */
function renderWelcomeTab(tab) {
  switch (tab) {
    case 'welcome':
      renderWelcomeMessages();
      break;
    case 'consent':
      renderConsentConfig();
      break;
    case 'closure':
      renderClosureMessages();
      break;
    case 'advanced':
      renderAdvancedConfig();
      break;
  }
}

// ===========================================
// WELCOME MESSAGES TAB
// ===========================================

function renderWelcomeMessages() {
  const container = document.getElementById('wm-messages-list');
  if (!container) return;

  const messages = welcomeConfig.welcome?.messages || [];
  messages.sort((a, b) => (a.order || 0) - (b.order || 0));

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="wm-empty-state">
        <div class="wm-empty-icon">👋</div>
        <h3>No hay mensajes de bienvenida</h3>
        <p>Agrega tu primer mensaje para dar la bienvenida a tus clientes</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map((msg, idx) => `
    <div class="welcome-msg-card ${msg.enabled === false ? 'disabled-card' : ''}"
         id="wm-card-${msg.id}"
         draggable="true"
         data-msg-id="${msg.id}"
         ondragstart="wmDragStart(event)"
         ondragend="wmDragEnd(event)"
         ondragover="wmDragOver(event)"
         ondragleave="wmDragLeave(event)"
         ondrop="wmDrop(event)">
      <div class="wm-card-header">
        <span class="wm-drag-handle" title="Arrastrar para reordenar">⠿</span>
        <span class="wm-order-badge">${idx + 1}</span>
        <span class="wm-card-title">Mensaje #${idx + 1}</span>
        <span class="wm-type-badge type-${msg.type || 'text'}">${getTypeBadgeLabel(msg.type)}</span>
        <label class="wm-toggle" title="${msg.enabled !== false ? 'Activo' : 'Inactivo'}">
          <input type="checkbox" ${msg.enabled !== false ? 'checked' : ''}
                 onchange="toggleWelcomeMsg('${msg.id}', this.checked)">
          <span class="wm-toggle-slider"></span>
        </label>
      </div>
      <div class="wm-card-body">
        <textarea class="wm-textarea"
                  id="wm-content-${msg.id}"
                  placeholder="Escribe el contenido del mensaje..."
                  oninput="updateWelcomeMsgContent('${msg.id}', this.value)">${escapeHtml(msg.content || '')}</textarea>
        <div class="wm-delay-row">
          <span class="wm-delay-label">⏱ Retardo:</span>
          <input type="range" class="wm-delay-slider"
                 min="0" max="120" value="${msg.delay || 0}"
                 oninput="updateWelcomeMsgDelay('${msg.id}', this.value)">
          <span class="wm-delay-value" id="wm-delay-val-${msg.id}">${msg.delay || 0}s</span>
        </div>
        <div class="wm-options-row">
          <label class="wm-option-check">
            <input type="checkbox" ${msg.includeUserName ? 'checked' : ''}
                   onchange="updateWelcomeMsgOption('${msg.id}', 'includeUserName', this.checked)">
            Incluir nombre del usuario
          </label>
          <label class="wm-option-check">
            <input type="checkbox" ${msg.useGreeting ? 'checked' : ''}
                   onchange="updateWelcomeMsgOption('${msg.id}', 'useGreeting', this.checked)">
            Saludo según hora del día
          </label>
        </div>
      </div>
      <div class="wm-card-actions">
        <div class="wm-card-actions-left">
          <select class="wm-type-select" onchange="updateWelcomeMsgType('${msg.id}', this.value)">
            <option value="text" ${msg.type === 'text' || !msg.type ? 'selected' : ''}>📝 Texto</option>
            <option value="image" ${msg.type === 'image' ? 'selected' : ''}>🖼️ Imagen</option>
            <option value="video" ${msg.type === 'video' ? 'selected' : ''}>🎬 Video</option>
            <option value="audio" ${msg.type === 'audio' ? 'selected' : ''}>🔊 Audio</option>
          </select>
        </div>
        <div class="wm-card-actions-right">
          <button class="wm-action-btn btn-delete" onclick="deleteWelcomeMsg('${msg.id}')"
                  title="Eliminar mensaje">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function getTypeBadgeLabel(type) {
  const labels = { text: '📝 Texto', image: '🖼️ Imagen', video: '🎬 Video', audio: '🔊 Audio' };
  return labels[type] || labels.text;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===========================================
// WELCOME MESSAGE CRUD
// ===========================================

function addWelcomeMessage() {
  if (!welcomeConfig.welcome.messages) welcomeConfig.welcome.messages = [];

  const id = `w_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const maxOrder = welcomeConfig.welcome.messages.reduce((max, m) => Math.max(max, m.order || 0), 0);

  welcomeConfig.welcome.messages.push({
    id,
    order: maxOrder + 1,
    type: 'text',
    content: '',
    delay: 2,
    mediaUrl: null,
    mediaType: null,
    useGreeting: false,
    includeUserName: false,
    enabled: true
  });

  welcomeDirty = true;
  renderWelcomeMessages();

  // Scroll to and focus new message
  setTimeout(() => {
    const card = document.getElementById(`wm-card-${id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const textarea = document.getElementById(`wm-content-${id}`);
      if (textarea) textarea.focus();
    }
  }, 100);
}

function updateWelcomeMsgContent(msgId, value) {
  const msg = welcomeConfig.welcome.messages.find(m => m.id === msgId);
  if (msg) {
    msg.content = value;
    welcomeDirty = true;
  }
}

function updateWelcomeMsgDelay(msgId, value) {
  const msg = welcomeConfig.welcome.messages.find(m => m.id === msgId);
  if (msg) {
    msg.delay = parseInt(value);
    const valEl = document.getElementById(`wm-delay-val-${msgId}`);
    if (valEl) valEl.textContent = `${value}s`;
    welcomeDirty = true;
  }
}

function updateWelcomeMsgType(msgId, type) {
  const msg = welcomeConfig.welcome.messages.find(m => m.id === msgId);
  if (msg) {
    msg.type = type;
    welcomeDirty = true;
    renderWelcomeMessages();
  }
}

function updateWelcomeMsgOption(msgId, option, value) {
  const msg = welcomeConfig.welcome.messages.find(m => m.id === msgId);
  if (msg) {
    msg[option] = value;
    welcomeDirty = true;
  }
}

function toggleWelcomeMsg(msgId, enabled) {
  const msg = welcomeConfig.welcome.messages.find(m => m.id === msgId);
  if (msg) {
    msg.enabled = enabled;
    welcomeDirty = true;
    renderWelcomeMessages();
  }
}

async function deleteWelcomeMsg(msgId) {
  if (!confirm('¿Eliminar este mensaje de bienvenida?')) return;

  const idx = welcomeConfig.welcome.messages.findIndex(m => m.id === msgId);
  if (idx !== -1) {
    welcomeConfig.welcome.messages.splice(idx, 1);
    // Reorder
    welcomeConfig.welcome.messages
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .forEach((m, i) => { m.order = i + 1; });
    welcomeDirty = true;
    renderWelcomeMessages();
  }
}

// ===========================================
// DRAG AND DROP
// ===========================================

function wmDragStart(e) {
  dragSrcEl = e.currentTarget;
  dragSrcEl.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.msgId);
}

function wmDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.welcome-msg-card').forEach(c => {
    c.classList.remove('drag-over');
  });
  dragSrcEl = null;
}

function wmDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const card = e.currentTarget;
  if (card !== dragSrcEl) {
    card.classList.add('drag-over');
  }
}

function wmDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function wmDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const fromId = e.dataTransfer.getData('text/plain');
  const toId = e.currentTarget.dataset.msgId;

  if (fromId === toId) return;

  const msgs = welcomeConfig.welcome.messages;
  const fromIdx = msgs.findIndex(m => m.id === fromId);
  const toIdx = msgs.findIndex(m => m.id === toId);

  if (fromIdx === -1 || toIdx === -1) return;

  // Move the element
  const [moved] = msgs.splice(fromIdx, 1);
  msgs.splice(toIdx, 0, moved);

  // Reorder
  msgs.forEach((m, i) => { m.order = i + 1; });

  welcomeDirty = true;
  renderWelcomeMessages();
}

// ===========================================
// CONSENT TAB (Multiple Messages)
// ===========================================

function renderConsentConfig() {
  renderConsentMessages();

  // Set global enabled toggle
  const enabledToggle = document.getElementById('wm-consent-enabled');
  if (enabledToggle && welcomeConfig?.consent) {
    enabledToggle.checked = welcomeConfig.consent.enabled !== false;
  }
}

function renderConsentMessages() {
  const container = document.getElementById('wm-consent-list');
  if (!container) return;

  // Ensure messages array exists (migrate if needed)
  if (!welcomeConfig.consent) welcomeConfig.consent = { enabled: true, messages: [] };
  if (!Array.isArray(welcomeConfig.consent.messages)) {
    // Migrate from legacy single string
    const oldMsg = welcomeConfig.consent.message || '';
    const oldDelay = welcomeConfig.consent.delay || 2;
    if (oldMsg) {
      welcomeConfig.consent.messages = [{
        id: 'cn_migrated',
        order: 1,
        content: oldMsg,
        delay: oldDelay,
        enabled: true
      }];
    } else {
      welcomeConfig.consent.messages = [];
    }
    welcomeDirty = true;
  }

  const messages = welcomeConfig.consent.messages;
  messages.sort((a, b) => (a.order || 0) - (b.order || 0));

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="wm-empty-state">
        <div class="wm-empty-icon">📄</div>
        <h3>No hay mensajes de consentimiento</h3>
        <p>Agrega tu primer mensaje de políticas de datos</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map((msg, idx) => `
    <div class="consent-msg-card ${msg.enabled === false ? 'disabled-card' : ''}"
         id="wm-consent-card-${msg.id}">
      <div class="wm-card-header">
        <span class="wm-order-badge consent-badge-color">${idx + 1}</span>
        <span class="wm-card-title">Mensaje #${idx + 1}</span>
        <label class="wm-toggle" title="${msg.enabled !== false ? 'Activo' : 'Inactivo'}">
          <input type="checkbox" ${msg.enabled !== false ? 'checked' : ''}
                 onchange="toggleConsentMsg('${msg.id}', this.checked)">
          <span class="wm-toggle-slider"></span>
        </label>
      </div>
      <div class="wm-card-body">
        <textarea class="wm-textarea"
                  id="wm-consent-content-${msg.id}"
                  placeholder="Escribe el contenido del mensaje de consentimiento..."
                  oninput="updateConsentMsgContent('${msg.id}', this.value)">${escapeHtml(msg.content || '')}</textarea>
        <div class="wm-delay-row">
          <span class="wm-delay-label">⏱ Retardo:</span>
          <input type="range" class="wm-delay-slider consent-slider"
                 min="0" max="120" value="${msg.delay || 0}"
                 oninput="updateConsentMsgDelay('${msg.id}', this.value)">
          <span class="wm-delay-value" id="wm-consent-delay-val-${msg.id}">${msg.delay || 0}s</span>
        </div>
      </div>
      <div class="wm-card-actions">
        <div class="wm-card-actions-left"></div>
        <div class="wm-card-actions-right">
          <button class="wm-action-btn btn-delete" onclick="deleteConsentMsg('${msg.id}')"
                  title="Eliminar mensaje">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function addConsentMessage() {
  if (!welcomeConfig.consent) welcomeConfig.consent = { enabled: true, messages: [] };
  if (!Array.isArray(welcomeConfig.consent.messages)) welcomeConfig.consent.messages = [];

  const id = `cn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const maxOrder = welcomeConfig.consent.messages.reduce((max, m) => Math.max(max, m.order || 0), 0);

  welcomeConfig.consent.messages.push({
    id,
    order: maxOrder + 1,
    content: '',
    delay: 2,
    enabled: true
  });

  welcomeDirty = true;
  renderConsentMessages();

  // Scroll to and focus new message
  setTimeout(() => {
    const card = document.getElementById(`wm-consent-card-${id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const textarea = document.getElementById(`wm-consent-content-${id}`);
      if (textarea) textarea.focus();
    }
  }, 100);
}

function updateConsentMsgContent(msgId, value) {
  const msg = welcomeConfig.consent?.messages?.find(m => m.id === msgId);
  if (msg) {
    msg.content = value;
    welcomeDirty = true;
  }
}

function updateConsentMsgDelay(msgId, value) {
  const msg = welcomeConfig.consent?.messages?.find(m => m.id === msgId);
  if (msg) {
    msg.delay = parseInt(value);
    const valEl = document.getElementById(`wm-consent-delay-val-${msgId}`);
    if (valEl) valEl.textContent = `${value}s`;
    welcomeDirty = true;
  }
}

function toggleConsentMsg(msgId, enabled) {
  const msg = welcomeConfig.consent?.messages?.find(m => m.id === msgId);
  if (msg) {
    msg.enabled = enabled;
    welcomeDirty = true;
    renderConsentMessages();
  }
}

function deleteConsentMsg(msgId) {
  if (!confirm('¿Eliminar este mensaje de consentimiento?')) return;

  const idx = welcomeConfig.consent.messages.findIndex(m => m.id === msgId);
  if (idx !== -1) {
    welcomeConfig.consent.messages.splice(idx, 1);
    // Reorder
    welcomeConfig.consent.messages
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .forEach((m, i) => { m.order = i + 1; });
    welcomeDirty = true;
    renderConsentMessages();
  }
}

function updateConsentEnabled(enabled) {
  if (!welcomeConfig.consent) welcomeConfig.consent = { enabled: true, messages: [] };
  welcomeConfig.consent.enabled = enabled;
  welcomeDirty = true;
}

// ===========================================
// CLOSURE TAB
// ===========================================

function renderClosureMessages() {
  const container = document.getElementById('wm-closure-list');
  if (!container) return;

  const messages = welcomeConfig.closure?.messages || [];

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="wm-empty-state">
        <div class="wm-empty-icon">📋</div>
        <h3>No hay mensajes de cierre</h3>
        <p>Agrega mensajes para cuando se cierre una conversación</p>
      </div>
    `;
    return;
  }

  const typeIcons = {
    auto_close: '🔒',
    transfer_human: '👩‍💼',
    followup: '🔄'
  };

  const typeLabels = {
    auto_close: 'Cierre automático',
    transfer_human: 'Transferencia a asesor',
    followup: 'Seguimiento'
  };

  container.innerHTML = messages.map(msg => `
    <div class="wm-closure-card" id="wm-closure-${msg.id}">
      <div class="wm-closure-type">
        <span class="wm-closure-type-icon">${typeIcons[msg.type] || '📝'}</span>
        <span class="wm-closure-type-label">${msg.label || typeLabels[msg.type] || 'Mensaje'}</span>
        <label class="wm-toggle" style="margin-left: auto;">
          <input type="checkbox" ${msg.enabled !== false ? 'checked' : ''}
                 onchange="updateClosureMsg('${msg.id}', 'enabled', this.checked)">
          <span class="wm-toggle-slider"></span>
        </label>
      </div>
      <textarea class="wm-textarea"
                placeholder="Contenido del mensaje de cierre..."
                oninput="updateClosureMsg('${msg.id}', 'content', this.value)">${escapeHtml(msg.content || '')}</textarea>
      <div class="wm-card-actions" style="margin-top: 10px;">
        <div class="wm-card-actions-left">
          <input type="text" value="${escapeHtml(msg.label || '')}"
                 placeholder="Etiqueta..."
                 onchange="updateClosureMsg('${msg.id}', 'label', this.value)"
                 style="padding: 4px 8px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 12px; width: 160px;">
          <select class="wm-type-select" onchange="updateClosureMsg('${msg.id}', 'type', this.value)">
            <option value="auto_close" ${msg.type === 'auto_close' ? 'selected' : ''}>🔒 Cierre auto</option>
            <option value="transfer_human" ${msg.type === 'transfer_human' ? 'selected' : ''}>👩‍💼 Transferencia</option>
            <option value="followup" ${msg.type === 'followup' ? 'selected' : ''}>🔄 Seguimiento</option>
          </select>
        </div>
        <div class="wm-card-actions-right">
          <button class="wm-action-btn btn-delete" onclick="deleteClosureMsg('${msg.id}')">
            🗑️
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function updateClosureMsg(msgId, field, value) {
  const msg = welcomeConfig.closure?.messages?.find(m => m.id === msgId);
  if (msg) {
    msg[field] = value;
    welcomeDirty = true;
    if (field === 'enabled' || field === 'type') {
      renderClosureMessages();
    }
  }
}

function addClosureMessage() {
  if (!welcomeConfig.closure) welcomeConfig.closure = { enabled: true, messages: [] };
  if (!welcomeConfig.closure.messages) welcomeConfig.closure.messages = [];

  const id = `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  welcomeConfig.closure.messages.push({
    id,
    type: 'auto_close',
    label: 'Nuevo mensaje de cierre',
    content: '',
    delay: 0,
    enabled: true
  });

  welcomeDirty = true;
  renderClosureMessages();
}

function deleteClosureMsg(msgId) {
  if (!confirm('¿Eliminar este mensaje de cierre?')) return;

  const idx = welcomeConfig.closure.messages.findIndex(m => m.id === msgId);
  if (idx !== -1) {
    welcomeConfig.closure.messages.splice(idx, 1);
    welcomeDirty = true;
    renderClosureMessages();
  }
}

// ===========================================
// ADVANCED TAB
// ===========================================

function renderAdvancedConfig() {
  if (!welcomeConfig?.advanced) return;

  const speedSlider = document.getElementById('wm-speed-slider');
  const speedVal = document.getElementById('wm-speed-val');
  const sendOnce = document.getElementById('wm-send-once');
  const respectSched = document.getElementById('wm-respect-schedule');

  if (speedSlider) speedSlider.value = (welcomeConfig.advanced.globalSpeedMultiplier || 1.0) * 10;
  if (speedVal) speedVal.textContent = `${welcomeConfig.advanced.globalSpeedMultiplier || 1.0}x`;
  if (sendOnce) sendOnce.checked = welcomeConfig.advanced.sendOnlyOnce !== false;
  if (respectSched) respectSched.checked = welcomeConfig.advanced.respectSchedule !== false;
}

function updateAdvancedField(field, value) {
  if (!welcomeConfig.advanced) welcomeConfig.advanced = {};
  welcomeConfig.advanced[field] = value;
  welcomeDirty = true;
}

function updateSpeedMultiplier(value) {
  const mult = (parseInt(value) / 10).toFixed(1);
  const speedVal = document.getElementById('wm-speed-val');
  if (speedVal) speedVal.textContent = `${mult}x`;
  updateAdvancedField('globalSpeedMultiplier', parseFloat(mult));
}

// ===========================================
// GLOBAL TOGGLE
// ===========================================

function toggleWelcomeEnabled(enabled) {
  if (!welcomeConfig.welcome) welcomeConfig.welcome = {};
  welcomeConfig.welcome.enabled = enabled;
  welcomeDirty = true;
  updateGlobalToggleUI();
}

function updateGlobalToggleUI() {
  const banner = document.getElementById('wm-global-banner');
  const enabled = welcomeConfig?.welcome?.enabled !== false;
  if (banner) {
    banner.classList.toggle('disabled-state', !enabled);
  }
}

// ===========================================
// SAVE
// ===========================================

async function saveWelcomeConfig(silent = false) {
  if (!welcomeConfig) return;

  try {
    const token = localStorage.getItem('dashboard_token') || sessionStorage.getItem('dashboard_token');
    const res = await fetch('/api/welcome-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(welcomeConfig)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.success) {
      welcomeDirty = false;
      if (data.config) welcomeConfig = data.config;
      if (!silent) showWelcomeToast('✅ Configuración guardada exitosamente', 'success');
    } else {
      throw new Error(data.error || 'Error saving');
    }
  } catch (err) {
    console.error('Error saving welcome config:', err);
    if (!silent) showWelcomeToast('❌ Error guardando configuración', 'error');
  }
}

function resetWelcomeConfig() {
  if (!confirm('¿Descartar todos los cambios y recargar desde el servidor?')) return;
  welcomeDirty = false;
  loadWelcomeConfig();
}

// ===========================================
// TOAST NOTIFICATIONS
// ===========================================

function showWelcomeToast(message, type = 'success') {
  // Remove existing toasts
  document.querySelectorAll('.wm-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `wm-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}
