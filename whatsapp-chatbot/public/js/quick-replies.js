/**
 * ================================================
 * QUICK REPLIES — Sistema de respuestas rápidas
 * activadas con / en el input del chat
 * ================================================
 *
 * ARQUITECTURA:
 * - No modifica ninguna función existente
 * - Solo agrega listeners adicionales al textarea
 * - El envío de mensajes sigue completamente intacto
 * - El dropdown usa position:absolute dentro del footer
 *
 * FUNCIONES EXPORTADAS AL SCOPE GLOBAL:
 * - showQuickRepliesView()
 * - hideQuickRepliesView()
 * - openQRModal(id?)
 * - closeQRModal()
 * - confirmDeleteQR(id, title)
 * - saveQRForm()
 * - toggleQRActive(id, currentActive)
 * ================================================
 */

(function () {
    'use strict';

    // ---- Estado del módulo ----
    let quickRepliesList = []; // Lista cacheada (solo activas)
    let allQuickReplies = [];  // Lista completa para CRUD
    let dropdownEl = null;
    let focusedIndex = -1;
    let editingId = null;      // null = crear, string = editar

    // ---- Sync Channel (Real-time updates across tabs/iframes) ----
    const syncChannel = new BroadcastChannel('qr_sync_channel');
    syncChannel.onmessage = (event) => {
        if (event.data === 'reload') {
            console.log('🔄 Quick Replies: Recibida señal de sincronización, recargando...');
            loadActiveQuickReplies();
            // Si la vista CRUD está cargada, recargarla también
            if (document.getElementById('quick-replies-view')?.style.display === 'block') {
                loadAllQuickRepliesForCRUD();
            }
        }
    };

    function notifySync() {
        syncChannel.postMessage('reload');
    }

    // ---- Constantes ----

    const PREVIEW_MAX = 70;

    // ==================================================
    // INICIALIZACIÓN — Se llama en DOMContentLoaded
    // ==================================================
    function initQuickReplies() {
        console.log('⚡ Quick Replies: Inicializando...');
        const input = document.getElementById('chat-message-input');
        if (!input) {
            console.error('❌ Quick Replies: No se encontró #chat-message-input');
            return;
        }

        // Añadir listener de input (no reemplaza nada existente)
        input.addEventListener('input', handleSlashInput);

        // Añadir listener de teclado para navegar el dropdown
        input.addEventListener('keydown', handleDropdownKeydown);

        // Cerrar dropdown al hacer click fuera
        document.addEventListener('click', handleOutsideClick);

        // Precargar respuestas activas cuando el chat modal se abre
        const chatModal = document.getElementById('chat-modal');
        if (chatModal) {
            // Si ya está activo hoy (casos de recarga), cargar ya
            if (chatModal.classList.contains('active')) {
                loadActiveQuickReplies();
            }

            const observer = new MutationObserver(() => {
                if (chatModal.classList.contains('active')) {
                    console.log('⚡ Quick Replies: Chat modal detectado activo, cargando respuestas...');
                    loadActiveQuickReplies();
                } else {
                    closeDropdown();
                }
            });
            observer.observe(chatModal, { attributes: true, attributeFilter: ['class'] });
        } else {
            // Si no hay #chat-modal, estamos en chat.html o similar. Cargar ya.
            console.log('⚡ Quick Replies: No hay #chat-modal (entorno standalone), cargando respuestas...');
            loadActiveQuickReplies();
        }
    }


    // ==================================================
    // CARGA DE DATOS
    // ==================================================
    async function loadActiveQuickReplies() {
        try {
            const res = await authenticatedFetch('/api/quick-replies');
            const data = await res.json();
            if (data.success) {
                quickRepliesList = data.quickReplies || [];
                console.log(`⚡ Quick Replies: ${quickRepliesList.length} respuestas activas cargadas.`);
            }
        } catch (e) {
            console.error('❌ Quick Replies: Error cargando activas:', e);
            quickRepliesList = [];
        }
    }

    async function loadAllQuickRepliesForCRUD() {
        try {
            const loadingEl = document.getElementById('qr-loading');
            const tableWrapper = document.getElementById('qr-table-wrapper');
            const emptyEl = document.getElementById('qr-empty');

            if (loadingEl) loadingEl.style.display = 'block';
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'none';

            const res = await authenticatedFetch('/api/quick-replies/all');
            const data = await res.json();

            if (data.success) {
                allQuickReplies = data.quickReplies || [];
                renderQRTable();
            }
        } catch (e) {
            console.error('Error cargando quick replies:', e);
        }
    }

    // ==================================================
    // SLASH LISTENER — Lógica del dropdown en el input
    // ==================================================
    function handleSlashInput(event) {
        const input = event.target;
        const val = input.value;
        console.log('⚡ Quick Replies Input:', val);

        if (val.startsWith('/')) {
            const query = val.substring(1).toLowerCase();
            const filtered = query === ''
                ? quickRepliesList
                : quickRepliesList.filter(r =>
                    r.title.toLowerCase().includes(query) ||
                    r.content.toLowerCase().includes(query)
                );
            showDropdown(filtered, query);
        } else {
            closeDropdown();
        }
    }

    function handleDropdownKeydown(event) {
        if (!dropdownEl) return;

        const items = dropdownEl.querySelectorAll('.qr-dropdown-item');
        if (items.length === 0) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeDropdown();
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
            updateFocus(items);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusedIndex = Math.max(focusedIndex - 1, 0);
            updateFocus(items);
            return;
        }

        // Enter selecciona el item enfocado
        if (event.key === 'Enter' && focusedIndex >= 0) {
            // Solo interceptar si hay un item enfocado en el dropdown
            event.preventDefault();
            const focused = items[focusedIndex];
            if (focused) {
                const idx = parseInt(focused.dataset.idx, 10);
                const visibleList = getCurrentFilteredList();
                if (visibleList[idx]) {
                    selectQuickReply(visibleList[idx]);
                }
            }
        }
    }

    // Mantiene la lista filtrada actual para evitar re-calcularla
    let _currentFiltered = [];
    function getCurrentFilteredList() { return _currentFiltered; }

    function updateFocus(items) {
        items.forEach((el, i) => {
            el.classList.toggle('focused', i === focusedIndex);
            if (i === focusedIndex) el.scrollIntoView({ block: 'nearest' });
        });
    }

    function handleOutsideClick(event) {
        if (!dropdownEl) return;
        const input = document.getElementById('chat-message-input');
        if (input && input.contains(event.target)) return;
        if (dropdownEl.contains(event.target)) return;
        closeDropdown();
    }

    // ==================================================
    // DROPDOWN UI
    // ==================================================
    function showDropdown(items, query) {
        _currentFiltered = items;
        focusedIndex = -1;

        // Crear o reusar el elemento
        if (!dropdownEl) {
            dropdownEl = document.createElement('div');
            dropdownEl.className = 'qr-dropdown';
            dropdownEl.id = 'qr-slash-dropdown';

            // Insertar dentro del contenedor del input (position:relative)
            // Intentar encontrar el contenedor en index.html o chat.html
            const container = document.querySelector('.chat-input-container') ||
                document.querySelector('.chat-input-wrapper');

            if (!container) {
                console.error('❌ Quick Replies: No se encontró contenedor para el dropdown (.chat-input-container o .chat-input-wrapper)');
                return;
            }
            container.style.position = 'relative';
            container.appendChild(dropdownEl);
        }


        // Construir contenido
        let html = `<div class="qr-dropdown-header">⚡ Respuestas Rápidas${query ? ` — "${query}"` : ''}</div>`;

        if (items.length === 0) {
            html += `<div class="qr-dropdown-empty">Sin resultados${query ? ` para "<strong>${escapeHtml(query)}</strong>"` : ''}</div>`;
        } else {
            items.forEach((item, i) => {
                const preview = item.content.length > PREVIEW_MAX
                    ? item.content.substring(0, PREVIEW_MAX) + '…'
                    : item.content;
                html += `
          <div class="qr-dropdown-item" data-idx="${i}"
               onclick="window._qrSelectItem(${i})">
            <span class="qr-dropdown-item-title">${escapeHtml(item.title)}</span>
            <span class="qr-dropdown-item-preview">${escapeHtml(preview)}</span>
          </div>`;
            });
        }

        dropdownEl.innerHTML = html;
        dropdownEl.style.display = 'block';
    }

    function closeDropdown() {
        if (dropdownEl) {
            dropdownEl.style.display = 'none';
        }
        focusedIndex = -1;
        _currentFiltered = [];
    }

    // Función global para manejar click en item (evita problemas con closures en innerHTML)
    window._qrSelectItem = function (idx) {
        const item = _currentFiltered[idx];
        if (item) selectQuickReply(item);
    };

    function selectQuickReply(item) {
        const input = document.getElementById('chat-message-input');
        if (!input) return;

        // Insertar el contenido en el input SIN enviar
        input.value = item.content;

        // Trigger evento input para auto-resize del textarea (si existe)
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Posicionar cursor al final
        input.setSelectionRange(input.value.length, input.value.length);

        // Cerrar dropdown y hacer foco
        closeDropdown();
        input.focus();
    }

    // ==================================================
    // VISTA CRUD — Tabla de gestión
    // ==================================================
    function showQuickRepliesView() {
        document.querySelector('.content-card') &&
            (document.querySelector('.content-card').style.display = 'none');

        const view = document.getElementById('quick-replies-view');
        if (view) {
            view.style.display = 'block';
            loadAllQuickRepliesForCRUD();
        }
    }

    function hideQuickRepliesView() {
        const view = document.getElementById('quick-replies-view');
        if (view) view.style.display = 'none';

        const contentCard = document.querySelector('.content-card');
        if (contentCard) contentCard.style.display = '';
    }

    function renderQRTable() {
        const loadingEl = document.getElementById('qr-loading');
        const tableWrapper = document.getElementById('qr-table-wrapper');
        const emptyEl = document.getElementById('qr-empty');
        const tbody = document.getElementById('qr-table-body');
        const countEl = document.getElementById('qr-count');

        if (loadingEl) loadingEl.style.display = 'none';

        if (!allQuickReplies || allQuickReplies.length === 0) {
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'block';
            if (countEl) countEl.textContent = '0 respuestas';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (tableWrapper) tableWrapper.style.display = 'block';
        if (countEl) countEl.textContent = `${allQuickReplies.length} respuesta${allQuickReplies.length !== 1 ? 's' : ''}`;

        if (!tbody) return;
        tbody.innerHTML = allQuickReplies.map((r, i) => {
            const preview = r.content.length > 80 ? r.content.substring(0, 80) + '…' : r.content;
            const date = r.updated_at
                ? new Date(r.updated_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';

            return `
        <tr>
          <td class="qr-title-cell">⚡ ${escapeHtml(r.title)}</td>
          <td class="qr-content-cell" title="${escapeHtml(r.content)}">${escapeHtml(preview)}</td>
          <td style="text-align:center;">
            <label class="qr-toggle" title="${r.active ? 'Activa' : 'Inactiva'}">
              <input type="checkbox" ${r.active ? 'checked' : ''}
                     onchange="toggleQRActive('${r.id}', ${r.active})">
              <span class="qr-toggle-slider"></span>
            </label>
          </td>
          <td style="font-size:12px;color:#999;">${date}</td>
          <td>
            <button class="qr-btn qr-btn-edit" onclick="openQRModal('${r.id}')">✏️ Editar</button>
            <button class="qr-btn qr-btn-delete" onclick="confirmDeleteQR('${r.id}', '${escapeHtml(r.title).replace(/'/g, "\\'")}')">🗑️</button>
          </td>
        </tr>
      `;
        }).join('');
    }

    // ==================================================
    // MODAL CREAR / EDITAR
    // ==================================================
    function openQRModal(id) {
        editingId = id || null;
        const modal = document.getElementById('qr-modal');
        const titleEl = document.getElementById('qr-modal-title');
        const inputTitle = document.getElementById('qr-form-title');
        const inputContent = document.getElementById('qr-form-content');
        const inputActive = document.getElementById('qr-form-active');
        const errorEl = document.getElementById('qr-form-error');

        if (errorEl) errorEl.style.display = 'none';

        if (id) {
            const reply = allQuickReplies.find(r => r.id === id);
            if (!reply) return;
            titleEl.textContent = '✏️ Editar Respuesta Rápida';
            inputTitle.value = reply.title;
            inputContent.value = reply.content;
            inputActive.checked = reply.active !== false;
        } else {
            titleEl.textContent = '➕ Nueva Respuesta Rápida';
            inputTitle.value = '';
            inputContent.value = '';
            inputActive.checked = true;
        }

        modal.classList.add('active');
        setTimeout(() => inputTitle.focus(), 100);
    }

    function closeQRModal() {
        const modal = document.getElementById('qr-modal');
        if (modal) modal.classList.remove('active');
        editingId = null;
    }

    async function saveQRForm() {
        const inputTitle = document.getElementById('qr-form-title');
        const inputContent = document.getElementById('qr-form-content');
        const inputActive = document.getElementById('qr-form-active');
        const errorEl = document.getElementById('qr-form-error');
        const saveBtn = document.getElementById('qr-form-save-btn');

        errorEl.style.display = 'none';

        const title = (inputTitle.value || '').trim();
        const content = (inputContent.value || '').trim();
        const active = inputActive.checked;

        if (!title) {
            errorEl.textContent = '❌ El título es obligatorio';
            errorEl.style.display = 'block';
            inputTitle.focus();
            return;
        }
        if (!content) {
            errorEl.textContent = '❌ El contenido es obligatorio';
            errorEl.style.display = 'block';
            inputContent.focus();
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            const method = editingId ? 'PUT' : 'POST';
            const url = editingId ? `/api/quick-replies/${editingId}` : '/api/quick-replies';

            const res = await authenticatedFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, active })
            });
            const data = await res.json();

            if (data.success) {
                closeQRModal();
                await loadAllQuickRepliesForCRUD();
                // También recargar lista activa para que el dropdown se actualice
                await loadActiveQuickReplies();
                notifySync();
                if (typeof showAlert === 'function') {
                    showAlert(editingId ? '✅ Respuesta actualizada' : '✅ Respuesta creada', 'success');
                }
            } else {
                errorEl.textContent = '❌ ' + (data.error || 'Error desconocido');
                errorEl.style.display = 'block';
            }
        } catch (e) {
            errorEl.textContent = '❌ Error de conexión: ' + e.message;
            errorEl.style.display = 'block';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '✅ Guardar';
        }
    }

    async function confirmDeleteQR(id, title) {
        if (!confirm(`¿Eliminar la respuesta rápida "${title}"?\n\nEsta acción no se puede deshacer.`)) return;

        try {
            const res = await authenticatedFetch(`/api/quick-replies/${id}`, { method: 'DELETE' });
            const data = await res.json();

            if (data.success) {
                await loadAllQuickRepliesForCRUD();
                await loadActiveQuickReplies();
                notifySync();
                if (typeof showAlert === 'function') {
                    showAlert('🗑️ Respuesta eliminada', 'success');
                }
            } else {
                alert('Error: ' + (data.error || 'No se pudo eliminar'));
            }
        } catch (e) {
            alert('Error de conexión: ' + e.message);
        }
    }

    async function toggleQRActive(id, currentActive) {
        try {
            const res = await authenticatedFetch(`/api/quick-replies/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: !currentActive })
            });
            const data = await res.json();

            if (data.success) {
                // Actualizar en memoria para feedback inmediato
                const idx = allQuickReplies.findIndex(r => r.id === id);
                if (idx !== -1) allQuickReplies[idx].active = !currentActive;
                // Sincronizar lista activa
                await loadActiveQuickReplies();
                notifySync();
            } else {
                alert('Error: ' + (data.error || 'No se pudo actualizar'));
                // Recargar para revertir checkbox
                await loadAllQuickRepliesForCRUD();
            }
        } catch (e) {
            alert('Error de conexión: ' + e.message);
            await loadAllQuickRepliesForCRUD();
        }
    }

    // ==================================================
    // UTILIDADES
    // ==================================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==================================================
    // EXPONER AL SCOPE GLOBAL (requerido por el HTML inline)
    // ==================================================
    window.showQuickRepliesView = showQuickRepliesView;
    window.hideQuickRepliesView = hideQuickRepliesView;
    window.openQRModal = openQRModal;
    window.closeQRModal = closeQRModal;
    window.saveQRForm = saveQRForm;
    window.confirmDeleteQR = confirmDeleteQR;
    window.toggleQRActive = toggleQRActive;

    // ==================================================
    // ARRANQUE
    // ==================================================
    document.addEventListener('DOMContentLoaded', initQuickReplies);

})();
