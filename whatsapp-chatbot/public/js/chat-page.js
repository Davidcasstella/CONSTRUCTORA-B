/**
 * CHAT PAGE - WhatsApp Web Style
 * Standalone JS for the 2-column chat layout
 */
(function () {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    let socket = null;
    let conversations = [];
    let currentChatUserId = null;
    let currentConvData = null;
    let conversationsOffset = 0;
    const CONVERSATIONS_LIMIT = 30;
    let totalConversations = 0;
    let hasMoreConversations = false;
    let renderedMessageIds = new Set();
    let activeFilter = 'all';
    let searchQuery = '';

    // ✅ LAZY LOAD: Pagination state for message history
    let messageCursor = null;     // Timestamp of the oldest visible message (used as cursor)
    let hasMoreMessages = false;  // True if there are earlier messages to load

    // Audio recording state
    let audioRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let recordingStartTime = null;
    let recordingTimer = null;

    // UI state
    let isEmojiPickerOpen = false;
    let isAttachMenuOpen = false;

    // ✅ NUEVO: Reply-to state
    let pendingReplyTo = null;

    // ✅ NUEVO: Media preview state
    let pendingMediaFile = null;
    let pendingMediaType = null;

    // ==========================================
    // AUTH
    // ==========================================
    async function authenticatedFetch(url, options = {}) {
        const token = localStorage.getItem('authToken');
        if (!options.headers) options.headers = {};
        if (!(options.body instanceof FormData)) {
            options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
        }
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(url, options);
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            window.location.reload();
        }
        return response;
    }
    window.authenticatedFetch = authenticatedFetch;



    function getCurrentAdvisor() {
        try {
            const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
            return {
                id: authUser.id || 'advisor_' + Date.now(),
                name: authUser.name || authUser.username || 'Asesor',
                email: authUser.email || 'advisor@norboy.coop'
            };
        } catch (e) {
            return { id: 'advisor_' + Date.now(), name: 'Asesor', email: 'advisor@norboy.coop' };
        }
    }

    // ==========================================
    // UTILITY
    // ==========================================
    // ==========================================
    // UTILITY
    // ==========================================

    // ✅ GHOST BUSTER: Elimina inputs de archivo que aparecen dinámicamente
    function initGhostBuster() {
        console.log('👻 Iniciando Ghost Buster para eliminar inputs fantasma...');

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    // Caso 1: El nodo agregado es un input file
                    if (node.nodeType === 1 && node.tagName === 'INPUT' && node.type === 'file') {
                        if (!node.id || !node.id.startsWith('file-')) {
                            console.warn('👻 Ghost file input detectado y eliminado:', node);
                            node.remove();
                        } else if (node.parentElement && node.parentElement.style.display !== 'none') {
                            // Si es uno de los nuestros pero se hizo visible sin querer
                            node.style.display = 'none';
                        }
                    }

                    // Caso 2: El nodo agregado CONTIENE un input file
                    if (node.nodeType === 1 && node.querySelectorAll) {
                        const inputs = node.querySelectorAll('input[type="file"]');
                        inputs.forEach(input => {
                            if (!input.id || !input.id.startsWith('file-')) {
                                console.warn('👻 Ghost file input (anidado) detectado y eliminado:', input);
                                input.remove();
                            } else {
                                input.style.display = 'none';
                            }
                        });
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log('👻 Ghost Buster activo y vigilando.');
    }

    function normalizePhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        let normalized = String(phoneNumber).trim();
        normalized = normalized.replace(/^whatsapp:/i, '');
        if (normalized.includes('@')) normalized = normalized.split('@')[0];
        normalized = normalized.replace(/[^\d]/g, '');
        return normalized;
    }

    function formatPhoneDisplay(phone) {
        let n = normalizePhoneNumber(phone);
        if (n.startsWith('57') && n.length > 10) {
            return `+57 ${n.substring(2, 5)} ${n.substring(5, 8)} ${n.substring(8)}`;
        }
        return '+' + n;
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }

    function normalizeMediaUrl(url, forceStream = false) {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/uploads/')) return window.location.origin + url;
        // ✅ FIX: Use 'admin_token' key (not 'authToken') and prefer /stream/ for inline display
        if (url.startsWith('/api/media/')) {
            const token = localStorage.getItem('admin_token') || localStorage.getItem('authToken') || '';
            // Always convert /download/ to /stream/ so browsers can render inline
            const streamUrl = url.replace('/api/media/download/', '/api/media/stream/');
            return streamUrl + (token ? '?token=' + encodeURIComponent(token) : '');
        }
        return url;
    }

    function getInitials(name) {
        if (!name) return '??';
        const words = name.trim().split(/\s+/);
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function timeAgo(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'ahora';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
        if (diff < 86400000) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (diff < 172800000) return 'ayer';
        return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }

    /**
     * Merge new conversations into existing array by userId.
     * Updates existing entries in-place, appends truly new ones.
     * Preserves conversations that the server didn't return.
     */
    function mergeConversations(existing, incoming) {
        const map = new Map();
        // Index existing by userId
        existing.forEach(c => map.set(c.userId, c));
        // Update or insert from incoming
        incoming.forEach(c => {
            const prev = map.get(c.userId);
            if (prev) {
                // Update all fields from server, keeping the same reference slot
                Object.assign(prev, c);
            } else {
                map.set(c.userId, c);
            }
        });
        return Array.from(map.values());
    }

    function showToast(message, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Expose showAlert as alias for compatibility with chat-complete.js
    window.showAlert = function (msg, type) { showToast(msg, type); };

    // ==========================================
    // LOGIN
    // ==========================================
    function initLogin() {
        const overlay = document.getElementById('login-overlay');
        const token = localStorage.getItem('authToken');
        if (token) {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.style.display = 'none', 500);
            return;
        }
        overlay.style.display = 'flex';
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorEl = document.getElementById('login-error');
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.token) {
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('authUser', JSON.stringify(data.user || { id: username, username, name: username }));
                    overlay.classList.add('hidden');
                    setTimeout(() => {
                        overlay.style.display = 'none';
                        initApp();
                    }, 500);
                } else {
                    errorEl.textContent = data.error || 'Credenciales incorrectas';
                }
            } catch (err) {
                errorEl.textContent = 'Error de conexión: ' + err.message;
            }
        });
    }

    // ==========================================
    // DARK MODE
    // ==========================================
    function initDarkMode() {
        const btn = document.getElementById('theme-toggle');
        const saved = localStorage.getItem('theme');
        if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

        if (btn) {
            btn.addEventListener('click', () => {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                if (isDark) {
                    document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('theme', 'light');
                    btn.textContent = '🌙';
                } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                    btn.textContent = '☀️';
                }
            });
            btn.textContent = localStorage.getItem('theme') === 'dark' ? '☀️' : '🌙';
        }

        // ✅ Escuchar cambios de tema desde la ventana padre (Dashboard)
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'set-theme') {
                const theme = event.data.theme;
                console.log('🔄 Sincronizando tema desde dashboard:', theme);

                // Aplicar tema
                if (theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                }

                // Guardar preferencia localmente también
                localStorage.setItem('theme', theme);

                // Actualizar botón si es visible
                if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
            }
        });
    }

    // ==========================================
    // CLOCK
    // ==========================================
    function initClock() {
        function update() {
            const now = new Date();
            const el = document.getElementById('clock-time');
            if (el) el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        update();
        setInterval(update, 1000);
    }

    // ==========================================
    // STATS
    // ==========================================
    async function loadStats() {
        try {
            const res = await authenticatedFetch('/api/conversations/stats');
            const data = await res.json();
            if (data.success) {
                const s = data.stats;
                setStatValue('stat-total', s.total);
                setStatValue('stat-active', s.active);
                setStatValue('stat-pending', s.escalation?.pendingAdvisor || 0);
                setStatValue('stat-advisor', s.escalation?.advisorHandled || 0);
                setStatValue('stat-expired', s.expired);
                setStatValue('stat-consent', s.consent?.accepted || 0);
            }
        } catch (e) {
            console.error('Error loading stats:', e);
        }
    }

    function setStatValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ==========================================
    // CONVERSATION LIST
    // ==========================================
    async function loadConversationList(offset = 0) {
        const scrollEl = document.getElementById('conv-list-scroll');
        const loadMoreEl = document.getElementById('conv-load-more');

        if (offset === 0) {
            scrollEl.innerHTML = `
        <div class="conv-list-loading">
          <div class="spinner"></div>
          <div>Cargando conversaciones...</div>
        </div>`;
        }

        try {
            const res = await authenticatedFetch(`/api/conversations/whatsapp-chats?limit=${CONVERSATIONS_LIMIT}&offset=${offset}`);
            const data = await res.json();

            if (data.success) {
                totalConversations = data.total;
                hasMoreConversations = data.hasMore;
                conversationsOffset = offset;

                if (offset === 0) {
                    // ✅ FIX: Merge instead of replace to preserve conversations
                    // the server didn't return (e.g. Baileys returning partial data)
                    conversations = mergeConversations(conversations, data.conversations);
                } else {
                    conversations = mergeConversations(conversations, data.conversations);
                }

                renderConversationList();

                // Show/hide load more
                if (loadMoreEl) {
                    loadMoreEl.style.display = hasMoreConversations ? 'block' : 'none';
                }
            }
        } catch (e) {
            console.error('Error loading conversations:', e);
            if (offset === 0) {
                scrollEl.innerHTML = `
          <div class="conv-list-empty">
            <div style="font-size:40px;margin-bottom:12px">⚠️</div>
            <div>Error al cargar conversaciones</div>
            <div style="font-size:12px;margin-top:4px">${e.message}</div>
          </div>`;
            }
        }
    }

    function renderConversationList() {
        const scrollEl = document.getElementById('conv-list-scroll');

        // Apply filters
        let filtered = conversations;

        if (activeFilter !== 'all') {
            filtered = filtered.filter(c => {
                switch (activeFilter) {
                    case 'pending': return c.status === 'pending_advisor' || c.status === 'out_of_hours';
                    case 'advisor': return c.status === 'advisor_handled';
                    case 'active': return c.status === 'active';
                    case 'expired': return c.status === 'expired';
                    default: return true;
                }
            });
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(c =>
                (c.whatsappName || '').toLowerCase().includes(q) ||
                (c.registeredName || '').toLowerCase().includes(q) ||
                normalizePhoneNumber(c.phoneNumber).includes(q)
            );
        }

        if (filtered.length === 0) {
            scrollEl.innerHTML = `
        <div class="conv-list-empty">
          <div style="font-size:40px;margin-bottom:12px">💬</div>
          <div>${searchQuery || activeFilter !== 'all' ? 'Sin resultados' : 'No hay conversaciones'}</div>
        </div>`;
            return;
        }

        // ✅ MEJORADO: Siempre ordenar por más reciente primero
        filtered.sort((a, b) => {
            const timeA = a.lastMessageTime || a.lastInteraction || a.timestamp || 0;
            const timeB = b.lastMessageTime || b.lastInteraction || b.timestamp || 0;
            return timeB - timeA;
        });

        scrollEl.innerHTML = filtered.map(conv => {
            // ✅ Fix: Prioritize customName
            const name = conv.customName || conv.whatsappName || conv.registeredName || 'Sin nombre';
            const phone = formatPhoneDisplay(conv.phoneNumber);
            const initials = getInitials(name !== 'Sin nombre' ? name : normalizePhoneNumber(conv.phoneNumber));
            const lastMsg = conv.lastMessage
                ? (conv.lastMessage.length > 40 ? conv.lastMessage.substring(0, 40) + '...' : conv.lastMessage)
                : 'Sin mensajes';
            const time = timeAgo(conv.lastMessageTime || conv.timestamp);

            const statusConfig = {
                'active': { text: 'Activa', cls: 'active' },
                'expired': { text: 'Expirada', cls: 'expired' },
                'pending_advisor': { text: '⚠️ Pendiente', cls: 'pending_advisor' },
                'out_of_hours': { text: '🌙 Fuera horario', cls: 'out_of_hours' },
                'advisor_handled': { text: '👨‍💼 Con Asesor', cls: 'advisor_handled' },
                'new_cycle': { text: 'Nuevo Ciclo', cls: 'new_cycle' }
            };
            const status = statusConfig[conv.status] || { text: conv.status || '', cls: '' };

            const isActive = currentChatUserId === conv.userId ? 'active' : '';
            const isPending = conv.status === 'pending_advisor' ? 'pending' : '';

            return `
        <div class="conv-item ${isActive} ${isPending}" data-userid="${conv.userId}" onclick="ChatPage.selectConversation('${conv.userId}')">
          <div class="conv-avatar">${initials}</div>
          <div class="conv-info">
            <div class="conv-info-top">
              <span class="conv-name">${escapeHtml(name)}</span>
              <span class="conv-time">${time}</span>
            </div>
            <div class="conv-info-bottom">
              <span class="conv-last-msg">${escapeHtml(lastMsg)}</span>
              ${status.text ? `<span class="conv-status-badge ${status.cls}">${status.text}</span>` : ''}
              
              <div class="conv-actions">
                <button class="conv-action-btn edit" title="Editar Nombre" onclick="event.stopPropagation(); ChatPage.editContactName('${conv.userId}')">
                  ✏️
                </button>
                <button class="conv-action-btn delete" title="Eliminar Chat" onclick="event.stopPropagation(); ChatPage.deleteChat('${conv.userId}')">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>`;
        }).join('');
    }

    // ==========================================
    // SELECT CONVERSATION (open chat)
    // ==========================================
    async function selectConversation(userId) {
        currentChatUserId = userId;
        window.currentChatUserId = userId;
        renderedMessageIds = new Set();
        // ✅ LAZY LOAD: Reset pagination state when switching conversations
        messageCursor = null;
        hasMoreMessages = false;

        // Find conversation data
        currentConvData = conversations.find(c => c.userId === userId) || null;
        // ✅ Fix: Prioritize customName
        const name = currentConvData?.customName || currentConvData?.whatsappName || currentConvData?.registeredName || 'Sin nombre';
        const phone = formatPhoneDisplay(currentConvData?.phoneNumber || userId);
        const initials = getInitials(name !== 'Sin nombre' ? name : normalizePhoneNumber(currentConvData?.phoneNumber || userId));

        // Update conversation list highlight
        renderConversationList();

        // Show chat panel, hide empty state
        document.getElementById('chat-empty').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';

        // Mobile: hide list, show chat
        const listPanel = document.querySelector('.conv-list-panel');
        const chatPanel = document.querySelector('.chat-panel');
        if (window.innerWidth <= 900) {
            listPanel.classList.add('hidden-mobile');
            chatPanel.classList.remove('hidden-mobile');
        }

        // Update chat header
        document.getElementById('chat-header-initials').textContent = initials;
        document.getElementById('chat-header-name').textContent = name;
        document.getElementById('chat-header-phone').textContent = phone;
        updateChatHeaderStatus();
        updateChatHeaderActions();

        // Show loading
        const messagesEl = document.getElementById('chat-messages');
        messagesEl.innerHTML = `
      <div class="chat-loading-messages">
        <div class="chat-loading-spinner"></div>
        <div>Cargando mensajes...</div>
      </div>`;

        // Load messages (first page: latest 20)
        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/whatsapp-messages?limit=20`);
            const data = await res.json();

            if (data.success && data.messages && data.messages.length > 0) {
                messagesEl.innerHTML = '';
                let lastDate = '';
                data.messages.forEach(msg => {
                    // Date separator
                    const msgDate = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString() : '';
                    if (msgDate && msgDate !== lastDate) {
                        addDateSeparator(messagesEl, msgDate);
                        lastDate = msgDate;
                    }
                    appendMessage(msg);
                });

                // ✅ LAZY LOAD: Store cursor from server response
                messageCursor = data.nextCursor || null;
                hasMoreMessages = data.hasMore || false;
                updateLoadMoreButton();

                scrollToBottom(false);
            } else {
                messagesEl.innerHTML = '<div class="chat-loading-messages">No hay mensajes aún. ¡Inicia la conversación!</div>';
            }
        } catch (e) {
            console.error('Error loading messages:', e);
            messagesEl.innerHTML = '<div class="chat-loading-messages">Error al cargar mensajes</div>';
        }

        // Focus input
        const input = document.getElementById('chat-message-input');
        setTimeout(() => input?.focus(), 150);
    }

    function updateChatHeaderStatus() {
        const statusEl = document.getElementById('chat-header-status-badge');
        if (!statusEl || !currentConvData) return;

        const statusConfig = {
            'active': { text: 'Activa', bg: '#e8f5e9', color: '#2e7d32' },
            'pending_advisor': { text: '⚠️ Pendiente Asesor', bg: '#fff3e0', color: '#e65100' },
            'advisor_handled': { text: '👨‍💼 Con Asesor', bg: '#ede7f6', color: '#6a1b9a' },
            'expired': { text: 'Expirada', bg: '#fce4ec', color: '#c62828' },
            'out_of_hours': { text: '🌙 Fuera de Horario', bg: '#e3f2fd', color: '#1565c0' },
            'new_cycle': { text: 'Nuevo Ciclo', bg: '#e0f7fa', color: '#00838f' }
        };

        const s = statusConfig[currentConvData.status] || { text: currentConvData.status, bg: '#f5f5f5', color: '#666' };
        statusEl.textContent = s.text;
        statusEl.style.background = s.bg;
        statusEl.style.color = s.color;
    }

    function updateChatHeaderActions() {
        const actionsEl = document.getElementById('chat-header-actions');
        if (!actionsEl || !currentConvData) return;

        let html = '';

        if (currentConvData.status === 'pending_advisor') {
            html += `<button class="chat-action-btn take" onclick="ChatPage.takeConversation()">👥 Tomar</button>`;
        }

        // ✅ Switch visual de IA - siempre visible en TODOS los chats
        const botIsActive = currentConvData.bot_active !== false;
        html += `
        <div class="ia-toggle-wrapper" title="${botIsActive ? 'IA activa - Click para desactivar' : 'IA inactiva - Click para activar'}">
            <span class="ia-toggle-label">${botIsActive ? '🤖 IA' : '🔴 IA'}</span>
            <label class="ia-switch">
                <input type="checkbox" id="ia-toggle-switch" ${botIsActive ? 'checked' : ''}
                    onchange="ChatPage.toggleIA(this.checked)">
                <span class="ia-slider"></span>
            </label>
        </div>`;

        if (currentConvData.status === 'advisor_handled') {
            html += `<button class="chat-action-btn release" onclick="ChatPage.releaseConversation()">↩️ Liberar</button>`;
        }

        html += `<button class="chat-action-btn reset" onclick="ChatPage.resetConversation()">🔄 Reset</button>`;

        actionsEl.innerHTML = html;
    }

    // ==========================================
    // CONVERSATION ACTIONS
    // ==========================================
    async function takeConversation() {
        if (!currentChatUserId) return;
        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/take`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ advisor: getCurrentAdvisor() })
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ Conversación tomada');
                if (currentConvData) currentConvData.status = 'advisor_handled';
                updateChatHeaderStatus();
                updateChatHeaderActions();
                loadConversationList();
                loadStats();
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    async function releaseConversation() {
        if (!currentChatUserId) return;
        if (!confirm('¿Liberar esta conversación de vuelta al bot?')) return;
        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/release`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ Conversación liberada');
                if (currentConvData) currentConvData.status = 'active';
                updateChatHeaderStatus();
                updateChatHeaderActions();
                loadConversationList();
                loadStats();
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    async function reactivateBot() {
        if (!currentChatUserId) return;
        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/reactivate-bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ advisor: getCurrentAdvisor() })
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ IA activada para este chat');
                if (currentConvData) {
                    currentConvData.status = 'active';
                    currentConvData.bot_active = true;
                }
                updateChatHeaderStatus();
                updateChatHeaderActions();
                loadConversationList();
                loadStats();
            } else {
                showToast('Error: ' + data.error, 'error');
                // Revert switch if failed
                const sw = document.getElementById('ia-toggle-switch');
                if (sw) sw.checked = false;
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
            const sw = document.getElementById('ia-toggle-switch');
            if (sw) sw.checked = false;
        }
    }

    async function deactivateBot() {
        if (!currentChatUserId) return;
        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/deactivate-bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'manual_deactivation', advisor: getCurrentAdvisor() })
            });
            const data = await res.json();
            if (data.success) {
                showToast('🔴 IA desactivada para este chat');
                if (currentConvData) {
                    currentConvData.bot_active = false;
                    currentConvData.status = data.status || currentConvData.status;
                }
                updateChatHeaderStatus();
                updateChatHeaderActions();
                loadConversationList();
                loadStats();
            } else {
                showToast('Error: ' + data.error, 'error');
                // Revert switch if failed
                const sw = document.getElementById('ia-toggle-switch');
                if (sw) sw.checked = true;
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
            const sw = document.getElementById('ia-toggle-switch');
            if (sw) sw.checked = true;
        }
    }

    // Toggle IA via switch
    function toggleIA(enabled) {
        if (enabled) {
            reactivateBot();
        } else {
            deactivateBot();
        }
    }

    async function resetConversation() {
        if (!currentChatUserId) return;
        const phone = formatPhoneDisplay(currentConvData?.phoneNumber || currentChatUserId);
        if (!confirm(`¿Resetear conversación para ${phone}?\n\nEsto reiniciará el ciclo.`)) return;
        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/reset`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ Conversación reseteada');
                loadConversationList();
                loadStats();
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    // ==========================================
    // MESSAGE RENDERING
    // ==========================================
    function addDateSeparator(container, dateStr) {
        const sep = document.createElement('div');
        sep.className = 'chat-date-separator';
        sep.innerHTML = `<span>${dateStr}</span>`;
        container.appendChild(sep);
    }

    function appendMessage(msg) {
        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv) return;

        // Dedup
        const msgId = msg.id || msg.messageId;
        if (msgId && renderedMessageIds.has(msgId)) return;
        if (msgId) renderedMessageIds.add(msgId);

        const senderClass = (msg.sender === 'admin' || msg.sender === 'advisor') ? 'admin' : (msg.sender === 'bot' ? 'bot' : 'user');
        const senderName = msg.senderName || (senderClass === 'admin' ? 'Asesor' : senderClass === 'bot' ? '🤖 Bot' : 'Usuario');

        const timeStr = msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const mediaUrl = normalizeMediaUrl(msg.mediaUrl);

        let messageContent = '';
        if (msg.type === 'audio') {
            messageContent = `<div class="message-audio"><audio controls src="${mediaUrl}" style="max-width:260px;height:36px">Audio</audio></div>`;
        } else if (msg.type === 'image') {
            // ✅ FIX: Usar /stream/ para imágenes inline (Content-Disposition: inline)
            const streamUrl = mediaUrl.replace('/download/', '/stream/');
            messageContent = `<div class="message-image"><img src="${streamUrl}" alt="Imagen" onclick="window.open('${streamUrl}','_blank')" style="max-width:280px;border-radius:6px;cursor:pointer"></div>
      ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}`;
        } else if (msg.type === 'video') {
            messageContent = `<div class="message-video"><video controls src="${mediaUrl}" style="max-width:280px;border-radius:6px" preload="metadata">Video</video></div>
      ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}`;
        } else if (msg.type === 'document') {
            messageContent = `<div class="message-document">
        <span class="message-document-icon">📄</span>
        <div><div class="message-document-name">${escapeHtml(msg.fileName || 'Documento')}</div>
        <a class="message-document-link" href="${mediaUrl}" download>Descargar</a></div></div>
      ${msg.message && msg.message !== msg.fileName ? `<div class="message-text">${escapeHtml(msg.message)}</div>` : ''}`;
        } else {
            messageContent = `<div class="message-text">${escapeHtml(msg.message || '')}</div>`;
        }

        const checksHTML = senderClass !== 'user' ? `
      <span class="message-checks">
        <svg class="message-check double ${msg.read ? 'read' : ''}" viewBox="0 0 16 11" width="16" height="11">
          <path d="M11.5 1.5L5.5 7.5L2.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14.5 1.5L8.5 7.5L5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>` : '';

        // ✅ NUEVO: Render referencia si el mensaje tiene replyTo
        let replyHTML = '';
        if (msg.replyTo && msg.replyTo.message) {
            const replySenderLabel = msg.replyTo.senderName || ((msg.replyTo.sender === 'admin' || msg.replyTo.sender === 'advisor') ? 'Asesor' : msg.replyTo.sender === 'bot' ? '🤖 Bot' : 'Usuario');
            replyHTML = `
        <div class="quoted-message" onclick="ChatPage.scrollToMessage('${msg.replyTo.id || ''}')">
          <div class="quoted-sender">${escapeHtml(replySenderLabel)}</div>
          <div class="quoted-text">${escapeHtml((msg.replyTo.message || '').substring(0, 120))}${(msg.replyTo.message || '').length > 120 ? '...' : ''}</div>
        </div>`;
        }

        // ✅ NUEVO: Botón de responder
        const replyBtnHTML = `<button class="msg-reply-btn" title="Responder" onclick="ChatPage.setReplyTo('${msgId || ''}', '${senderClass}', '${escapeHtml(senderName).replace(/'/g, '\\&#39;')}', this)">↩</button>`;

        const el = document.createElement('div');
        el.className = `chat-message ${senderClass}`;
        if (msgId) el.setAttribute('data-message-id', msgId);
        el.innerHTML = `
      <div class="message-sender">${escapeHtml(senderName)}</div>
      <div class="message-bubble">
        ${replyHTML}
        ${messageContent}
        <div class="message-meta">
          <span class="message-time">${timeStr}</span>
          ${checksHTML}
        </div>
        ${replyBtnHTML}
      </div>`;

        messagesDiv.appendChild(el);
    }

    function scrollToBottom(smooth = true) {
        const el = document.getElementById('chat-messages');
        if (!el) return;
        if (smooth) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } else {
            el.scrollTop = el.scrollHeight;
        }
    }

    // ==========================================
    // ✅ LAZY LOAD: Load older messages
    // ==========================================

    /**
     * Shows or hides the "Cargar más" button based on hasMoreMessages flag.
     * Creates the button on first call; updates/removes it on subsequent calls.
     */
    function updateLoadMoreButton() {
        const messagesEl = document.getElementById('chat-messages');
        if (!messagesEl) return;

        let btn = document.getElementById('load-more-messages-btn');

        if (hasMoreMessages) {
            if (!btn) {
                // Create button and insert at the very top of the messages container
                btn = document.createElement('button');
                btn.id = 'load-more-messages-btn';
                btn.className = 'load-more-messages-btn';
                btn.textContent = 'Cargar más';
                btn.addEventListener('click', loadOlderMessages);
                messagesEl.insertBefore(btn, messagesEl.firstChild);
            } else {
                btn.disabled = false;
                btn.textContent = 'Cargar más';
                // Ensure it stays at the top (in case new content was prepended)
                if (btn !== messagesEl.firstChild) {
                    messagesEl.insertBefore(btn, messagesEl.firstChild);
                }
            }
        } else if (btn) {
            btn.remove();
        }
    }

    /**
     * Fetches the previous page of messages and prepends them to the chat,
     * preserving the user's visual scroll position so there is no jump.
     */
    async function loadOlderMessages() {
        if (!hasMoreMessages || !messageCursor || !currentChatUserId) return;

        const btn = document.getElementById('load-more-messages-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Cargando...'; }

        const messagesEl = document.getElementById('chat-messages');
        // Capture current scroll height BEFORE adding new elements (to restore position after)
        const prevScrollHeight = messagesEl.scrollHeight;

        try {
            const res = await authenticatedFetch(
                `/api/conversations/${encodeURIComponent(currentChatUserId)}/whatsapp-messages?limit=20&cursor=${messageCursor}`
            );
            const data = await res.json();

            if (data.success && data.messages && data.messages.length > 0) {
                // Build a DocumentFragment with the older messages
                const fragment = document.createDocumentFragment();
                let prevDate = '';

                data.messages.forEach(msg => {
                    const msgDate = msg.timestamp
                        ? new Date(msg.timestamp).toLocaleDateString()
                        : '';
                    if (msgDate && msgDate !== prevDate) {
                        const sep = document.createElement('div');
                        sep.className = 'chat-date-separator';
                        sep.innerHTML = `<span>${msgDate}</span>`;
                        fragment.appendChild(sep);
                        prevDate = msgDate;
                    }

                    // Reuse appendMessage but render into the fragment manually
                    // by temporarily appending to messagesEl, then moving to fragment
                    const beforeCount = messagesEl.childNodes.length;
                    appendMessage(msg);
                    // appendMessage uses appendChild — grab the last added node
                    if (messagesEl.childNodes.length > beforeCount) {
                        fragment.appendChild(messagesEl.lastChild);
                    }
                });

                // Prepend fragment (insert before the first existing message / load-more btn)
                const firstChild = messagesEl.firstChild;
                messagesEl.insertBefore(fragment, firstChild);

                // ✅ Restore scroll position: user stays at the same visual spot
                messagesEl.scrollTop = messagesEl.scrollHeight - prevScrollHeight;

                // Update cursor state
                messageCursor = data.nextCursor || null;
                hasMoreMessages = data.hasMore || false;
            } else {
                hasMoreMessages = false;
                messageCursor = null;
            }
        } catch (e) {
            console.error('[LAZY LOAD] Error cargando mensajes históricos:', e);
        } finally {
            updateLoadMoreButton();
        }
    }

    // ==========================================
    // SEND MESSAGE
    // ==========================================
    async function sendMessage() {
        const input = document.getElementById('chat-message-input');
        if (!input || !currentChatUserId) return;

        const message = input.value.trim();
        if (!message) return;

        const advisor = getCurrentAdvisor();
        input.value = '';
        input.style.height = 'auto';

        // ✅ NUEVO: Capturar replyTo antes de limpiarlo
        const replyTo = pendingReplyTo ? { ...pendingReplyTo } : null;
        cancelReply(); // Limpiar preview

        // Optimistic append
        appendMessage({
            id: 'local_' + Date.now(),
            sender: 'admin',
            senderName: advisor.name,
            message,
            replyTo,
            timestamp: Date.now()
        });
        scrollToBottom();

        try {
            const body = { message, advisor };
            if (replyTo) body.replyTo = replyTo;

            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!data.success) showToast('Error enviando mensaje: ' + (data.error || ''), 'error');
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    // ==========================================
    // EMOJI PICKER
    // ==========================================
    function toggleEmojiPicker() {
        const panel = document.getElementById('emoji-picker-panel');
        if (!panel) return;
        isEmojiPickerOpen = !isEmojiPickerOpen;
        panel.classList.toggle('active', isEmojiPickerOpen);
        if (isAttachMenuOpen) {
            isAttachMenuOpen = false;
            document.getElementById('attach-menu')?.classList.remove('active');
        }
    }

    function insertEmoji(emoji) {
        const input = document.getElementById('chat-message-input');
        if (input) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
            input.selectionStart = input.selectionEnd = start + emoji.length;
            input.focus();
        }
    }

    // ==========================================
    // ATTACH MENU & FILE UPLOAD
    // ==========================================
    function toggleAttachMenu() {
        const menu = document.getElementById('attach-menu');
        if (!menu) return;
        isAttachMenuOpen = !isAttachMenuOpen;
        menu.classList.toggle('active', isAttachMenuOpen);
        if (isEmojiPickerOpen) {
            isEmojiPickerOpen = false;
            document.getElementById('emoji-picker-panel')?.classList.remove('active');
        }
    }

    async function handleFileUpload(input, type) {
        if (!input.files || input.files.length === 0 || !currentChatUserId) return;
        const file = input.files[0];

        // Para imágenes y videos, mostrar preview antes de enviar
        if (type === 'image' || type === 'video') {
            showMediaPreview(file, type);
            input.value = '';
            return;
        }

        // Para documentos y audio, enviar directamente
        await sendFileToServer(file, type);
        input.value = '';
    }

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
        previewOverlay.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(11, 20, 26, 0.98);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            animation: fadeIn 0.2s ease-out;
        `;

        // Contenido del medio
        let mediaHTML = '';
        if (type === 'image') {
            mediaHTML = `<img src="${localUrl}" style="max-width: 90%; max-height: 70%; object-fit: contain; margin: auto; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);">`;
        } else if (type === 'video') {
            mediaHTML = `<video src="${localUrl}" controls style="max-width: 90%; max-height: 70%; margin: auto; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5);"></video>`;
        }

        previewOverlay.innerHTML = `
            <div style="position: absolute; top: 20px; left: 20px; z-index: 10001;">
                <button id="media-preview-close" style="background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; padding: 10px;" title="Cerrar">✕</button>
            </div>
            
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 20px;">
                ${mediaHTML}
            </div>

            <div style="background: rgba(11, 20, 26, 0.9); padding: 20px 30px; display: flex; flex-direction: column; gap: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; align-items: center; background: #2a3942; border-radius: 8px; padding: 5px 15px; gap: 10px;">
                    <span style="font-size: 20px; color: #8696a0;">😊</span>
                    <input type="text" id="media-preview-caption" placeholder="Escribe un mensaje" style="flex: 1; background: transparent; border: none; color: #e9edef; font-size: 15px; padding: 10px 0; outline: none;">
                </div>
                
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 45px; height: 45px; border: 2px solid #25d366; border-radius: 4px; overflow: hidden;">
                            ${type === 'image' ? `<img src="${localUrl}" style="width:100%;height:100%;object-fit:cover;">` : `<video src="${localUrl}" style="width:100%;height:100%;object-fit:cover;"></video>`}
                        </div>
                        <div style="color: #e9edef;">
                            <div style="font-size: 14px; font-weight: 500;">${file.name.replace(/</g, '&lt;')}</div>
                            <div style="font-size: 12px; color: #8696a0;">${sizeMB} MB</div>
                        </div>
                    </div>
                    
                    <button id="media-preview-send-fab" style="background: #25d366; border: none; color: #fff; border-radius: 50%; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: transform 0.2s;">
                        <span style="transform: translateX(2px);">➤</span>
                    </button>
                </div>
            </div>
        `;

        // Insertar el overlay en el contenedor principal de chat (.chat-panel es el contenedor en chat.html)
        const chatContainer = document.querySelector('.chat-panel');
        if (chatContainer) {
            chatContainer.style.position = 'relative';
            chatContainer.appendChild(previewOverlay);

            // Enfocar el input de subtítulo después de un breve delay
            setTimeout(() => {
                document.getElementById('media-preview-caption')?.focus();
            }, 300);
        } else {
            console.error('❌ [PREVIEW] No se encontró .chat-panel para insertar el overlay');
            // Fallback al body si falla algo crítico, aunque no es lo ideal
            document.body.appendChild(previewOverlay);
        }

        // Conectar eventos
        document.getElementById('media-preview-close')?.addEventListener('click', cancelMediaPreview);
        document.getElementById('media-preview-send-fab')?.addEventListener('click', () => {
            const caption = document.getElementById('media-preview-caption')?.value || '';
            cancelMediaPreview();
            sendFileToServer(file, type, caption);
        });

        document.getElementById('media-preview-caption')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const caption = document.getElementById('media-preview-caption')?.value || '';
                cancelMediaPreview();
                sendFileToServer(file, type, caption);
            }
        });

        // Inyectar estilos si no existen
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
     * Sube un archivo al servidor y lo envía al chat
     */
    async function sendFileToServer(file, type, caption = '') {
        if (!currentChatUserId) return;
        const advisor = getCurrentAdvisor();
        const sendBtn = document.getElementById('chat-send-btn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '⏳'; }

        try {
            // Step 1: Upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);
            if (caption) formData.append('caption', caption);

            const uploadRes = await authenticatedFetch('/api/conversations/upload-media', {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) throw new Error(`Upload error ${uploadRes.status}`);
            const uploadData = await uploadRes.json();
            if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

            // Step 2: Send
            const mediaData = {
                type,
                url: uploadData.file.url,
                filepath: uploadData.file.filepath,
                filename: uploadData.file.filename,
                size: uploadData.file.size
            };

            const sendRes = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ media: mediaData, caption: caption || '', advisor })
            });

            const sendData = await sendRes.json();
            if (sendData.success) {
                let mediaUrl = uploadData.file.url;
                if (mediaUrl.startsWith('/uploads/')) mediaUrl = window.location.origin + mediaUrl;

                appendMessage({
                    id: 'msg_' + Date.now(),
                    sender: 'admin',
                    senderName: advisor.name,
                    message: type === 'image' ? '' : file.name,
                    type,
                    mediaUrl,
                    fileName: file.name,
                    timestamp: Date.now()
                });
                scrollToBottom();
                showToast(`✅ ${type === 'image' ? 'Imagen' : type === 'video' ? 'Video' : type === 'document' ? 'Documento' : 'Audio'} enviado`);
            } else {
                throw new Error(sendData.error || 'Send failed');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
            }
            if (isAttachMenuOpen) toggleAttachMenu();
        }
    }

    // ==========================================
    // AUDIO RECORDING
    // ==========================================
    async function startAudioRecording() {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                showToast('Tu navegador no soporta grabación de audio', 'error');
                return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // ✅ Usar WebM como formato preferido (más compatible en navegadores)
            let options = { mimeType: 'audio/webm' };

            // Si no soporta webm, intentar ogg (algunos navegadores viejos)
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    options = { mimeType: 'audio/ogg' };
                } else {
                    options = {}; // Default browser
                }
            }

            console.log('🎤 Iniciando grabación con format:', options.mimeType || 'default');

            audioRecorder = new MediaRecorder(stream, options);
            audioChunks = [];

            audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
            audioRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: options.mimeType });
                await sendAudioMessage(blob, options.mimeType);
            };

            audioRecorder.start();
            isRecording = true;
            recordingStartTime = Date.now();
            updateRecordingUI();
            recordingTimer = setInterval(updateRecordingTime, 1000);
        } catch (e) {
            showToast('No se pudo acceder al micrófono', 'error');
        }
    }

    function stopAudioRecording() {
        if (!audioRecorder || !isRecording) return;
        audioRecorder.stop();
        audioRecorder.stream.getTracks().forEach(t => t.stop());
        isRecording = false;
        if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
        restoreInputUI();
    }

    function cancelAudioRecording() {
        if (!audioRecorder || !isRecording) return;
        audioRecorder.stop();
        audioRecorder.stream.getTracks().forEach(t => t.stop());
        isRecording = false;
        audioChunks = [];
        if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
        restoreInputUI();
    }

    async function sendAudioMessage(blob, mimeType) {
        if (!currentChatUserId) return;
        const sendBtn = document.getElementById('chat-send-btn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '⏳'; }

        try {
            const ext = (mimeType && mimeType.includes('webm')) ? 'webm' : 'ogg';
            const formData = new FormData();
            formData.append('file', blob, `audio.${ext}`);
            formData.append('type', 'audio');

            const uploadRes = await authenticatedFetch('/api/conversations/upload-media', { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error(`Upload error ${uploadRes.status}`);
            const uploadData = await uploadRes.json();
            if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

            const advisor = getCurrentAdvisor();
            const sendRes = await authenticatedFetch(`/api/conversations/${encodeURIComponent(currentChatUserId)}/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    media: { type: 'audio', url: uploadData.file.url, filepath: uploadData.file.filepath, filename: uploadData.file.filename, size: uploadData.file.size },
                    caption: '',
                    advisor
                })
            });

            const sendData = await sendRes.json();
            if (sendData.success) {
                let audioUrl = uploadData.file.url;
                if (audioUrl.startsWith('/uploads/')) audioUrl = window.location.origin + audioUrl;
                appendMessage({ id: 'msg_' + Date.now(), sender: 'admin', senderName: advisor.name, message: '🎤 Audio', type: 'audio', mediaUrl: audioUrl, timestamp: Date.now() });
                scrollToBottom();
                showToast('✅ Audio enviado');
            }
        } catch (e) {
            showToast('Error enviando audio: ' + e.message, 'error');
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
            }
        }
    }

    function toggleAudioRecorder() {
        if (isRecording) stopAudioRecording();
        else startAudioRecording();
    }

    function updateRecordingUI() {
        const footer = document.querySelector('.chat-footer');
        if (!footer) return;
        // Hide normal inputs
        document.querySelectorAll('.chat-footer > *').forEach(el => el.style.display = 'none');
        // Show recording indicator
        const indicator = document.createElement('div');
        indicator.className = 'audio-recording-indicator';
        indicator.id = 'audio-recording-indicator';
        indicator.innerHTML = `
      <button class="audio-recording-cancel" onclick="ChatPage.cancelAudioRecording()" title="Cancelar">✕</button>
      <div class="audio-recording-time" id="recording-time">0:00</div>
      <button class="audio-recording-send" onclick="ChatPage.stopAudioRecording()" title="Enviar">➤</button>`;
        footer.appendChild(indicator);
    }

    function updateRecordingTime() {
        if (!recordingStartTime) return;
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const el = document.getElementById('recording-time');
        if (el) el.textContent = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;
    }

    function restoreInputUI() {
        const indicator = document.getElementById('audio-recording-indicator');
        if (indicator) indicator.remove();
        document.querySelectorAll('.chat-footer > *').forEach(el => {
            // NO mostrar inputs de archivo
            if (el.tagName === 'INPUT' && el.type === 'file') {
                el.style.display = 'none';
            } else {
                el.style.display = '';
            }
        });

        // Asegurar que los inputs específicos estén ocultos
        ['file-image-input', 'file-document-input', 'file-audio-input'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.style.display = 'none';
        });
    }

    // ==========================================
    // SOCKET.IO REAL-TIME
    // ==========================================
    function initSocket() {
        socket = io();

        socket.on('connect', () => {
            console.log('✅ Socket.IO connected');
            socket.emit('get-status');
        });

        socket.on('ready', () => {
            updateConnectionStatus('connected', 'Conectado');
        });

        socket.on('disconnected', () => {
            updateConnectionStatus('disconnected', 'Desconectado');
        });

        socket.on('status', (data) => {
            if (data.isReady) {
                updateConnectionStatus('connected', 'Conectado');
            }
        });

        // New message
        socket.on('new-message', (data) => {
            const msg = data.message;
            const userId = data.userId;

            // ✅ FIX: Update conversation list IN-PLACE instead of full reload
            // This prevents replacing the entire array with partial server data
            const existingConv = conversations.find(c => c.userId === userId);
            if (existingConv) {
                // Update existing conversation metadata
                existingConv.lastMessage = msg.message || msg.text || existingConv.lastMessage;
                existingConv.lastMessageTime = msg.timestamp || Date.now();
                existingConv.lastInteraction = msg.timestamp || Date.now();
                if (data.status) existingConv.status = data.status;
                if (data.whatsappName) {
                    existingConv.whatsappName = data.whatsappName;
                    existingConv.registeredName = data.whatsappName;
                }
                // ✅ FIX: Update customName if provided
                if (data.customName !== undefined) {
                    existingConv.customName = data.customName;
                }
            } else {
                // New conversation — add it to the array
                conversations.unshift({
                    userId: userId,
                    phoneNumber: data.phoneNumber || normalizePhoneNumber(userId),
                    whatsappName: data.whatsappName || msg.senderName || 'Sin nombre',
                    registeredName: data.whatsappName || msg.senderName || 'Sin nombre',
                    customName: data.customName || null, // ✅ FIX: Include customName
                    lastMessage: msg.message || msg.text || '',
                    lastMessageTime: msg.timestamp || Date.now(),
                    lastInteraction: msg.timestamp || Date.now(),
                    status: data.status || 'active',
                    unreadCount: 1
                });
            }

            // Sort conversations: most recent first
            conversations.sort((a, b) => {
                const timeA = a.lastMessageTime || a.lastInteraction || 0;
                const timeB = b.lastMessageTime || b.lastInteraction || 0;
                return timeB - timeA;
            });

            // Re-render the sidebar list (no HTTP request)
            renderConversationList();
            loadStats();

            // If chat is open for this user, append message
            if (currentChatUserId === userId) {
                // ✅ FIX: Skip admin messages - they were already optimistically appended by sendMessage()
                if (msg.sender === 'admin') return;

                const msgId = msg.id || msg.messageId;
                if (msgId && renderedMessageIds.has(msgId)) return;

                // Clear loading states
                const messagesDiv = document.getElementById('chat-messages');
                if (messagesDiv && (messagesDiv.innerHTML.includes('Cargando') || messagesDiv.innerHTML.includes('No hay mensajes'))) {
                    messagesDiv.innerHTML = '';
                }

                appendMessage(msg);
                scrollToBottom();
            }
        });

        // Escalation
        socket.on('escalation-detected', (data) => {
            showEscalationBanner(data);
            loadConversationList();
            loadStats();
            updatePendingBadge();

            try {
                // Generate beep with Web Audio API (no external file needed)
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880;
                osc.type = 'sine';
                gain.gain.value = 0.3;
                osc.start();
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                osc.stop(ctx.currentTime + 0.5);
            } catch (e) { }
        });

        // Status change
        socket.on('conversation-status-changed', () => {
            loadConversationList();
            loadStats();
            updatePendingBadge();
            if (currentChatUserId) {
                // Refresh header
                currentConvData = conversations.find(c => c.userId === currentChatUserId);
                if (currentConvData) {
                    updateChatHeaderStatus();
                    updateChatHeaderActions();
                }
            }
        });

        // ✅ NUEVO: Listener para actualización de IA/Bot en tiempo real
        socket.on('bot-status-updated', (data) => {
            console.log('🤖 [SOCKET] Recibido bot-status-updated:', data);

            // 1. Actualizar datos locales de la conversación si ya existe
            const conv = conversations.find(c => c.userId === data.userId);
            if (conv) {
                conv.bot_active = data.botActive;
                if (data.status) conv.status = data.status;
                // Re-renderizar lista para reflejar badges si es necesario
                renderConversationList();
            }

            // 2. Si es el chat abierto, actualizar cabecera
            if (currentChatUserId === data.userId) {
                console.log('🤖 Actualizando UI del chat abierto para:', data.userId);
                if (currentConvData) {
                    currentConvData.bot_active = data.botActive;
                    if (data.status) currentConvData.status = data.status;
                    updateChatHeaderStatus();
                    updateChatHeaderActions();
                }
            }
        });
    }

    function updateConnectionStatus(status, text) {
        const badge = document.getElementById('header-status-badge');
        const textEl = document.getElementById('header-status-text');
        if (badge) badge.className = 'header-status-badge ' + status;
        if (textEl) textEl.textContent = text;
    }

    function showEscalationBanner(data) {
        const existing = document.querySelector('.notification-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.className = 'notification-banner';
        banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:24px">🚨</span>
        <div>
          <strong>¡Requiere atención humana!</strong>
          <div style="font-size:0.9em;opacity:0.9">Usuario: ${normalizePhoneNumber(data.phoneNumber)} | Razón: ${data.reason}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center">
        <button class="action-btn" onclick="ChatPage.selectConversation('${data.userId}');this.parentElement.parentElement.remove()">Ver Chat</button>
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>`;
        document.body.prepend(banner);
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 30000);
    }

    async function updatePendingBadge() {
        try {
            const res = await authenticatedFetch('/api/conversations');
            const data = await res.json();
            if (data.success && data.conversations) {
                const count = data.conversations.filter(c => c.status === 'pending_advisor' || c.status === 'out_of_hours').length;
                const badge = document.getElementById('pending-badge');
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'inline-block' : 'none';
                }
            }
        } catch (e) { }
    }

    // ==========================================
    // MOBILE BACK
    // ==========================================
    function mobileBack() {
        const listPanel = document.querySelector('.conv-list-panel');
        const chatPanel = document.querySelector('.chat-panel');
        listPanel.classList.remove('hidden-mobile');
        chatPanel.classList.add('hidden-mobile');
        currentChatUserId = null;
        window.currentChatUserId = null;
    }

    // ==========================================
    // FILTER & SEARCH
    // ==========================================
    function setFilter(filter) {
        activeFilter = filter;
        document.querySelectorAll('.conv-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        renderConversationList();
    }

    function onSearchInput(value) {
        searchQuery = value;
        renderConversationList();
    }

    // ==========================================
    // INIT ALL EVENT LISTENERS
    // ==========================================
    function initEventListeners() {
        // Send button
        const sendBtn = document.getElementById('chat-send-btn');
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);

        // Inyectar CSS para drag-and-drop si no existe
        if (!document.getElementById('drag-over-style')) {
            const style = document.createElement('style');
            style.id = 'drag-over-style';
            style.textContent = `.drag-over { outline: 2px dashed #25d366 !important; outline-offset: -4px; background: rgba(37,211,102,0.08) !important; }`;
            document.head.appendChild(style);
        }

        // ✅ Bind New Chat Button
        const btnNewChat = document.getElementById('btn-new-chat');
        if (btnNewChat) {
            btnNewChat.addEventListener('click', createNewChat);
        }

        // Input: Enter to send, auto-resize
        const input = document.getElementById('chat-message-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            input.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 100) + 'px';
            });
        }

        // Emoji button
        const emojiBtn = document.getElementById('emoji-picker-btn');
        if (emojiBtn) emojiBtn.addEventListener('click', toggleEmojiPicker);

        // Emoji items
        document.querySelectorAll('.emoji-picker-item').forEach(item => {
            item.addEventListener('click', function () { insertEmoji(this.textContent); });
        });

        // Attach button
        const attachBtn = document.getElementById('chat-attach-btn');
        if (attachBtn) attachBtn.addEventListener('click', toggleAttachMenu);

        // Attach menu items
        document.querySelectorAll('.attach-menu-item').forEach(item => {
            item.addEventListener('click', function () {
                const action = this.dataset.action;
                const inputMap = { image: 'file-image-input', document: 'file-document-input', audio: 'file-audio-input', video: 'file-video-input' };
                const inputId = inputMap[action];
                if (inputId) document.getElementById(inputId)?.click();
                if (isAttachMenuOpen) toggleAttachMenu();
            });
        });

        // File inputs
        const fileImage = document.getElementById('file-image-input');
        const fileDoc = document.getElementById('file-document-input');
        const fileAudio = document.getElementById('file-audio-input');
        const fileVideo = document.getElementById('file-video-input');
        if (fileImage) fileImage.addEventListener('change', (e) => handleFileUpload(e.target, 'image'));
        if (fileDoc) fileDoc.addEventListener('change', (e) => handleFileUpload(e.target, 'document'));
        if (fileAudio) fileAudio.addEventListener('change', (e) => handleFileUpload(e.target, 'audio'));
        if (fileVideo) fileVideo.addEventListener('change', (e) => handleFileUpload(e.target, 'video'));

        // Audio button
        const audioBtn = document.getElementById('chat-audio-btn');
        if (audioBtn) audioBtn.addEventListener('click', toggleAudioRecorder);

        // Search
        const searchInput = document.getElementById('conv-search-input');
        if (searchInput) searchInput.addEventListener('input', (e) => onSearchInput(e.target.value));

        // Filters
        document.querySelectorAll('.conv-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => setFilter(btn.dataset.filter));
        });

        // Load more
        const loadMoreBtn = document.getElementById('conv-load-more-btn');
        if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => {
            loadConversationList(conversationsOffset + CONVERSATIONS_LIMIT);
        });

        // Close menus on outside click
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
        const chatMessages = document.getElementById('chat-messages');
        const chatPanel = document.querySelector('.chat-panel');
        const dropArea = chatPanel || chatMessages;
        if (dropArea) {
            ['dragenter', 'dragover'].forEach(evt => {
                dropArea.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropArea.classList.add('drag-over');
                });
            });
            ['dragleave', 'drop'].forEach(evt => {
                dropArea.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropArea.classList.remove('drag-over');
                });
            });
            dropArea.addEventListener('drop', handleDropMedia);
        }
    }

    // ==========================================
    // APP INIT
    // ==========================================
    function initApp() {
        initGhostBuster(); // ✅ Iniciar Ghost Buster
        initDarkMode();
        initClock();
        initSocket();
        initEventListeners();
        loadConversationList();
        loadStats();
        updatePendingBadge();
    }

    // ==========================================
    // BOOT
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        initLogin();
        // If already logged in, init app
        if (localStorage.getItem('authToken')) {
            initApp();
        }
    });

    // ==========================================
    // EXPORT
    // ==========================================
    // ✅ NUEVO: Reply-to functions
    function setReplyTo(msgId, senderClass, senderName, btnEl) {
        // Get the message text from the DOM
        const msgEl = btnEl.closest('.chat-message');
        const textEl = msgEl?.querySelector('.message-text');
        const msgText = textEl ? textEl.textContent : '';

        pendingReplyTo = {
            id: msgId,
            message: msgText,
            sender: senderClass,
            senderName: senderName
        };

        // Show reply preview bar
        let preview = document.getElementById('reply-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'reply-preview';
            preview.className = 'reply-preview';
            const footer = document.querySelector('.chat-footer');
            if (footer) footer.parentNode.insertBefore(preview, footer);
        }
        const label = senderName || (senderClass === 'admin' ? 'Asesor' : senderClass === 'bot' ? '🤖 Bot' : 'Usuario');
        preview.innerHTML = `
            <div class="reply-preview-content">
                <div class="reply-preview-sender">${escapeHtml(label)}</div>
                <div class="reply-preview-text">${escapeHtml(msgText.substring(0, 100))}${msgText.length > 100 ? '...' : ''}</div>
            </div>
            <button class="reply-preview-close" onclick="ChatPage.cancelReply()">✕</button>
        `;
        preview.style.display = 'flex';
        document.getElementById('chat-message-input')?.focus();
    }

    function cancelReply() {
        pendingReplyTo = null;
        const preview = document.getElementById('reply-preview');
        if (preview) preview.style.display = 'none';
    }

    function scrollToMessage(msgId) {
        if (!msgId) return;
        const el = document.querySelector(`[data-message-id="${msgId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlight-message');
            setTimeout(() => el.classList.remove('highlight-message'), 2000);
        }
    }

    // ==========================================
    // NEW FEATURES: CHAT MANAGEMENT
    // ==========================================

    function createNewChat() {
        document.getElementById('form-new-chat').reset();
        openModal('modal-new-chat');
    }

    async function submitNewChat() {
        const phoneInput = document.getElementById('new-chat-phone');
        const nameInput = document.getElementById('new-chat-name');

        const phoneNumber = phoneInput.value.trim();
        const name = nameInput.value.trim();

        if (!phoneNumber) {
            showToast('Por favor ingresa un número de teléfono', 'error');
            return;
        }

        try {
            const res = await authenticatedFetch('/api/conversations/create-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber, name })
            });

            const data = await res.json();
            if (data.success) {
                closeModal('modal-new-chat');
                showToast('✅ Chat creado correctamente');
                // Reload list to show new chat
                loadConversationList();
                // Select the new chat
                setTimeout(() => selectConversation(data.conversation.userId), 500);
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Error al crear chat: ' + e.message, 'error');
        }
    }

    function editContactName(userId) {
        const conv = conversations.find(c => c.userId === userId);
        if (!conv) return;

        document.getElementById('edit-name-userid').value = userId;
        document.getElementById('edit-name-input').value = conv.customName || conv.whatsappName || '';
        openModal('modal-edit-name');
    }

    async function submitEditName() {
        const userId = document.getElementById('edit-name-userid').value;
        const name = document.getElementById('edit-name-input').value.trim();

        if (!userId) return;

        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}/custom-name`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            const data = await res.json();
            if (data.success) {
                closeModal('modal-edit-name');
                showToast('✅ Nombre actualizado');

                // Update local state and UI
                const conv = conversations.find(c => c.userId === userId);
                if (conv) {
                    conv.customName = data.conversation.customName;
                    conv.registeredName = data.conversation.registeredName;
                    // Re-render list
                    renderConversationList();
                    // If active, update header
                    if (currentChatUserId === userId) {
                        document.getElementById('chat-header-name').textContent = conv.registeredName;
                    }
                }
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Error al actualizar nombre: ' + e.message, 'error');
        }
    }

    function deleteChat(userId) {
        document.getElementById('delete-chat-userid').value = userId;
        openModal('modal-confirm-delete');
    }

    async function submitDeleteChat() {
        const userId = document.getElementById('delete-chat-userid').value;
        if (!userId) return;

        try {
            const res = await authenticatedFetch(`/api/conversations/${encodeURIComponent(userId)}`, {
                method: 'DELETE'
            });

            const data = await res.json();
            if (data.success) {
                closeModal('modal-confirm-delete');
                showToast('🗑️ Chat eliminado');

                // If active, clear chat panel
                if (currentChatUserId === userId) {
                    currentChatUserId = null;
                    document.getElementById('chat-active').style.display = 'none';
                    document.getElementById('chat-empty').style.display = 'flex';
                }

                // ✅ FIX: Remover inmediatamente de la lista local (sin esperar server)
                conversations = conversations.filter(c => c.userId !== userId);
                renderConversationList(conversations);
            } else {
                showToast('Error: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('Error al eliminar chat: ' + e.message, 'error');
        }
    }

    // Modal helpers
    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // Bind Global Functions for HTML onclick
    window.submitNewChat = submitNewChat;
    window.submitEditName = submitEditName;
    window.submitDeleteChat = submitDeleteChat;
    window.closeModal = closeModal;
    window.openModal = openModal;



    // ==========================================
    // CLIPBOARD PASTE & DRAG-DROP
    // ==========================================

    /**
     * Maneja pegado de imágenes desde el portapapeles (Ctrl+V)
     */
    function handlePasteMedia(event) {
        if (!currentChatUserId) return;

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
        if (!currentChatUserId) return;

        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const mime = file.type || '';

        let type = 'document';
        if (mime.startsWith('image/')) type = 'image';
        else if (mime.startsWith('video/')) type = 'video';
        else if (mime.startsWith('audio/')) type = 'audio';

        const dt = new DataTransfer();
        dt.items.add(file);
        const fakeInput = { files: dt.files, value: '' };

        handleFileUpload(fakeInput, type);
    }

    window.ChatPage = {
        selectConversation,
        takeConversation,
        releaseConversation,
        reactivateBot,
        deactivateBot,
        toggleIA,
        resetConversation,
        mobileBack,
        setFilter,
        stopAudioRecording,
        cancelAudioRecording,
        setReplyTo,
        cancelReply,
        setReplyTo,
        cancelReply,
        scrollToMessage,
        editContactName, // ✅ NUEVO
        deleteChat,      // ✅ NUEVO
        handlePasteMedia,
        handleDropMedia,
        loadMore: () => loadConversationList(conversationsOffset + CONVERSATIONS_LIMIT)
    };

    // For compatibility with chat-complete.js
    window.currentChatUserId = null;
    window.openChat = selectConversation;

})();
