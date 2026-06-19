// Dashboard Documents — Document management and stages
// Extracted from dashboard-main.js


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
                    <button class="take-btn" onclick="openManualDocModalForEdit('${file.id}')" style="font-size: 11px; padding: 6px 12px; background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);" title="Editar documento">✏️ Editar</button>
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

/* ========================================
   ✅ NUEVO: FUNCIONES PARA DOCUMENTOS MANUALES
   ======================================== */

function openManualDocModal() {
  const titleInput = document.getElementById('manual-doc-title');
  const contentInput = document.getElementById('manual-doc-content');
  const idInput = document.getElementById('manual-doc-id');
  const saveBtn = document.getElementById('manual-doc-save-btn');
  const modalTitle = document.getElementById('manual-doc-modal-title');

  if (modalTitle) modalTitle.textContent = '✏️ Nuevo Documento Manual';
  if (titleInput) titleInput.value = '';
  if (contentInput) contentInput.value = '';
  if (idInput) idInput.value = '';
  if (saveBtn) saveBtn.innerHTML = '💾 Guardar Documento';

  const modal = document.getElementById('manual-doc-modal');
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      if (titleInput) titleInput.focus();
    }, 100);
  }
}

function closeManualDocModal() {
  const modal = document.getElementById('manual-doc-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function openManualDocModalForEdit(fileId) {
  if (!fileId) return;

  try {
    const response = await authenticatedFetch('/api/knowledge/content/' + fileId);
    const data = await response.json();

    if (data.success && data.file) {
      const titleInput = document.getElementById('manual-doc-title');
      const contentInput = document.getElementById('manual-doc-content');
      const idInput = document.getElementById('manual-doc-id');
      const saveBtn = document.getElementById('manual-doc-save-btn');
      const modalTitle = document.getElementById('manual-doc-modal-title');
      const modal = document.getElementById('manual-doc-modal');

      if (modalTitle) modalTitle.textContent = '✏️ Editar Documento Manual';
      if (titleInput) titleInput.value = data.file.title || data.file.originalName.replace('.txt', '');
      if (contentInput) contentInput.value = data.file.content;
      if (idInput) idInput.value = fileId;
      if (saveBtn) saveBtn.innerHTML = '💾 Actualizar Documento';

      if (modal) {
        modal.classList.add('active');
      }
    } else {
      showAlert('Error al cargar documento: ' + (data.error || 'Error desconocido'), 'error');
    }
  } catch (error) {
    console.error('Error opening manual doc for edit:', error);
    showAlert('Error al cargar documento: ' + error.message, 'error');
  }
}

async function saveManualDoc() {
  const titleEl = document.getElementById('manual-doc-title');
  const contentEl = document.getElementById('manual-doc-content');
  const idEl = document.getElementById('manual-doc-id');

  const titleInput = titleEl ? titleEl.value.trim() : '';
  const contentInput = contentEl ? contentEl.value.trim() : '';
  const fileId = idEl ? idEl.value : '';

  if (!titleInput) {
    showAlert('Por favor, ingresa un título para el documento.', 'error');
    if (titleEl) titleEl.focus();
    return;
  }

  if (!contentInput) {
    showAlert('Por favor, ingresa el contenido del documento.', 'error');
    if (contentEl) contentEl.focus();
    return;
  }

  const uploadStageId = window.currentUploadStageId || currentStageId;
  if (!uploadStageId && !fileId) {
    showAlert('Por favor, selecciona una etapa primero.', 'error');
    return;
  }

  const saveBtn = document.getElementById('manual-doc-save-btn');
  let originalText = '💾 Guardar Documento';

  if (saveBtn) {
    originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '⏳ Guardando...';
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.7';
  }

  try {
    let response;
    if (fileId) {
      // Actualizando existente
      response = await authenticatedFetch('/api/knowledge/manual/' + fileId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: contentInput
        })
      });
    } else {
      // Creando nuevo
      response = await authenticatedFetch('/api/knowledge/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: titleInput,
          content: contentInput,
          stageId: uploadStageId
        })
      });
    }

    const data = await response.json();

    if (data.success) {
      closeManualDocModal();

      const docModal = document.getElementById('documents-modal');
      if (docModal && docModal.classList.contains('active')) {
        await loadDocumentsList();
      }

      const docView = document.getElementById('documents-view');
      if (docView && docView.style.display === 'block') {
        await loadDocumentsView();
      }

      showAlert('✅ Documento actualizado correctamente', 'success');
    } else {
      showAlert('Error: ' + (data.error || 'Error desconocido al guardar'), 'error');
    }
  } catch (error) {
    console.error('Error saving manual doc:', error);
    showAlert('Error al guardar: ' + error.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
    }
  }
}

/**
 * Reloads the knowledge base: clears all caches, reloads embeddings, refreshes RAG data.
 * No server restart needed.
 */
async function reloadKnowledgeBase() {
  const btn = document.getElementById('btn-reload-knowledge');
  const originalText = btn ? btn.innerHTML : '';

  try {
    if (btn) {
      btn.innerHTML = '⏳ Recargando...';
      btn.disabled = true;
      btn.style.opacity = '0.7';
    }

    const token = localStorage.getItem('authToken') || localStorage.getItem('admin_token') || '';
    const response = await fetch('/api/knowledge/reload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.success) {
      const stats = data.stats || {};
      const regenMsg = stats.regenerated > 0 ? `\n🔧 Documentos regenerados: ${stats.regenerated}` : '';
      alert(`✅ Base de conocimiento recargada!\n\n📦 Chunks totales: ${stats.totalChunks || 0}\n🔗 Con embeddings: ${stats.withEmbeddings || 0}${regenMsg}\n\nEl bot ahora usará la información más reciente.`);
    } else {
      alert(`❌ Error al recargar: ${data.error || 'Error desconocido'}`);
    }
  } catch (error) {
    console.error('Error reloading knowledge base:', error);
    alert(`❌ Error de conexión al recargar la base de conocimiento: ${error.message}`);
  } finally {
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
}
