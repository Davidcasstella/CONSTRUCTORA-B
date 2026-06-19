// Dashboard Views — Number control, holidays calendar, spam management
// Extracted from dashboard-main.js


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
