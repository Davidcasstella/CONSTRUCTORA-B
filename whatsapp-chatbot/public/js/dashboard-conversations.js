// Dashboard Conversations — Conversation list, schedule, stats, polling
// Extracted from dashboard-main.js


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
    const CONVERSATIONS_LIMIT = 20;
    let totalConversations = 0;
    let hasMoreConversations = false;

    // Cargar lista de conversaciones
    async function loadConversations(offset = 0, limit = CONVERSATIONS_LIMIT) {
      const loadingEl = document.getElementById('conversations-loading');
      const contentEl = document.getElementById('conversations-content');
      const emptyEl = document.getElementById('conversations-empty');
      const tableBody = document.getElementById('conversations-table-body');

      // Mostrar loading solo si es la primera carga
      if (offset === 0) {
        loadingEl.style.display = 'block';
        contentEl.style.display = 'none';
        emptyEl.style.display = 'none';
      }

      try {
        // ✅ NUEVO: Obtener chats directamente desde WhatsApp
        const url = `/api/conversations/whatsapp-chats?limit=${limit}&offset=${offset}`;
        const response = await authenticatedFetch(url);
        const data = await response.json();

        // ✅ NUEVO: Log informativo para debugging
        console.log(`📊 Conversaciones recibidas desde WhatsApp: ${data.returned}/${data.total} (hasMore: ${data.hasMore})`);
        console.log('   Fuente:', data.source);

        // Actualizar variables de paginación
        totalConversations = data.total;
        hasMoreConversations = data.hasMore;
        conversationsOffset = offset;

        // Ocultar loading
        loadingEl.style.display = 'none';

        if (data.success && data.conversations.length > 0) {
          contentEl.style.display = 'block';

          // ✅ NUEVO: Mostrar contador de conversaciones con información de paginación
          const statsInfo = document.getElementById('conversations-stats-info') || document.createElement('div');
          statsInfo.id = 'conversations-stats-info';
          statsInfo.style.cssText = 'text-align: center; color: var(--medium-gray); font-size: 0.9rem; padding: 10px; margin-bottom: 10px;';

          const endCount = offset + data.conversations.length;
          statsInfo.innerHTML = `
            💬 Mostrando ${offset + 1}-${endCount} de ${data.total} conversaciones
            ${data.hasMore ? `<button class="btn-small" onclick="loadMoreConversations()" style="margin-left: 10px;">⬇️ Cargar más</button>` : ''}
          `;
          tableBody.parentElement.parentElement.insertBefore(statsInfo, tableBody.parentElement);

          // Llenar tabla
          tableBody.innerHTML = data.conversations.map(conv => {
            // Mapeo de estados
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
            const remainingText = conv.remainingTime > 0
              ? conv.remainingTimeFormatted
              : 'Expirado';

            const shortMessage = conv.lastMessage
              ? (conv.lastMessage.length > 50 ? conv.lastMessage.substring(0, 50) + '...' : conv.lastMessage)
              : 'Sin mensajes';

            // Fila resaltada si necesita atención
            const rowClass = conv.status === 'pending_advisor' ? 'row-pending-advisor' : '';

            // Botones según estado
            const actionButtons = getActionButtons(conv);

            // Badge de IA Desactivada (si está en control de números con IA desactivada)
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

          // Cargar estadísticas
          loadConversationsStats();
        } else {
          emptyEl.style.display = 'block';
          // ✅ NUEVO: Mensaje más claro cuando no hay conversaciones
          emptyEl.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
              <div style="font-size: 64px; margin-bottom: 15px;">💬</div>
              <h3 style="color: var(--medium-gray);">No hay conversaciones activas</h3>
              <p style="color: var(--medium-gray);">Las conversaciones aparecerán aquí cuando los usuarios envíen mensajes por WhatsApp.</p>
            </div>
          `;
        }
      } catch (error) {
        loadingEl.style.display = 'none';
        emptyEl.innerHTML = `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: var(--medium-gray);">Error al cargar conversaciones</h3>
            <p style="color: var(--medium-gray);">${error.message}</p>
          </div>
        `;
        emptyEl.style.display = 'block';
      }
    }

    // ✅ NUEVO: Cargar más conversaciones (paginación)
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
