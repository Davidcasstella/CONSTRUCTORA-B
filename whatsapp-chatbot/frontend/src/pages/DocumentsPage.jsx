import { useState, useEffect, useRef, useCallback } from 'react';
import * as docService from '../services/documentService';

// ===========================
// UTILITY FUNCTIONS
// ===========================
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function showToast(msg, type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ===========================
// STYLES (inline for this page)
// ===========================
const styles = {
  wrapper: {
    maxWidth: 1200,
    margin: '0 auto',
    fontFamily: 'Inter, Segoe UI, sans-serif',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    color: '#fff',
    transition: 'opacity 0.2s',
  },
  stagesRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 20,
    padding: '12px 0',
    borderBottom: '2px solid rgba(0,0,0,0.06)',
  },
  stageTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 18px',
    borderRadius: '10px 10px 0 0',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 14,
    border: '2px solid',
    borderBottom: 'none',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    borderRadius: 12,
    padding: '18px 24px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 800,
    lineHeight: 1,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.75,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  th: {
    background: '#1a3a2a',
    color: '#fff',
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 14,
    verticalAlign: 'middle',
  },
  // Toggle switch
  toggleWrapper: {
    position: 'relative',
    display: 'inline-block',
    width: 36,
    height: 20,
    flexShrink: 0,
  },
  toggleInput: {
    opacity: 0,
    width: 0,
    height: 0,
    position: 'absolute',
  },
  toggleSlider: (checked) => ({
    position: 'absolute',
    cursor: 'pointer',
    top: 0, left: 0, right: 0, bottom: 0,
    background: checked ? '#43a047' : '#ef5350',
    borderRadius: 20,
    transition: '0.3s',
  }),
  toggleKnob: (checked) => ({
    position: 'absolute',
    height: 14,
    width: 14,
    left: checked ? 19 : 3,
    bottom: 3,
    background: '#fff',
    borderRadius: '50%',
    transition: '0.3s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  }),
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 15,
    padding: '4px 6px',
    borderRadius: 4,
    opacity: 0.7,
    transition: 'opacity 0.2s',
  },
  miniBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 11,
    color: '#fff',
    transition: 'opacity 0.2s',
  },
};

// ===========================
// COMPONENT
// ===========================
export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [stages, setStages] = useState([]);
  const [activeStage, setActiveStage] = useState(null); // null = will auto-select first
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [stageName, setStageName] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);

  // ===========================
  // LOAD DATA
  // ===========================
  const loadStages = useCallback(async () => {
    try {
      const data = await docService.getStages();
      if (data?.stages) {
        setStages(data.stages);
        // Auto-select first stage if none selected
        if (!activeStage && data.stages.length > 0) {
          setActiveStage(data.stages[0].id);
        }
      }
    } catch (e) { console.error('Error loading stages:', e); }
  }, [activeStage]);

  const loadDocuments = useCallback(async (stageId) => {
    setLoading(true);
    try {
      const data = await docService.getDocuments(stageId || activeStage);
      if (data?.files) setDocuments(data.files);
      else setDocuments([]);
    } catch (e) { console.error('Error loading docs:', e); setDocuments([]); }
    setLoading(false);
  }, [activeStage]);

  // Initial load
  useEffect(() => { loadStages(); }, []);
  useEffect(() => { if (activeStage) loadDocuments(activeStage); }, [activeStage]);

  // ===========================
  // STAGE ACTIONS
  // ===========================
  const handleToggleStage = async (stageId, isActive, e) => {
    e.stopPropagation();
    try {
      const data = await docService.toggleStage(stageId, isActive);
      if (data?.success) {
        setStages(prev => prev.map(s => s.id === stageId ? { ...s, is_active: isActive } : s));
        showToast(isActive ? '🟢 Etapa activada' : '🔴 Etapa desactivada');
      } else {
        showToast('Error: ' + (data?.error || ''), 'error');
      }
    } catch (e) { showToast('Error al cambiar estado', 'error'); }
  };

  const handleSelectStage = (stageId) => {
    setActiveStage(stageId);
  };

  const handleSaveStage = async () => {
    if (!stageName.trim()) return;
    try {
      if (editingStage) {
        await docService.updateStage(editingStage.id, { name: stageName });
      } else {
        const data = await docService.createStage({ name: stageName });
        if (data?.stage?.id) setActiveStage(data.stage.id);
      }
      setShowStageModal(false); setStageName(''); setEditingStage(null);
      loadStages();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleDeleteStage = async (stageId, name, e) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar la etapa "${name}"?\n\nLos documentos se quedarán sin asignar.`)) return;
    try {
      await docService.deleteStage(stageId);
      showToast('🗑️ Etapa eliminada');
      if (activeStage === stageId) {
        const remaining = stages.filter(s => s.id !== stageId);
        setActiveStage(remaining.length > 0 ? remaining[0].id : null);
      }
      loadStages();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  // ===========================
  // DOCUMENT ACTIONS
  // ===========================
  const handleDelete = async (fileId, fileName) => {
    if (!window.confirm(`¿Eliminar "${fileName}"?`)) return;
    try {
      await docService.deleteDocument(fileId);
      showToast('🗑️ Documento eliminado');
      loadDocuments(activeStage);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      await docService.downloadDocument(fileId, fileName);
    } catch (e) { showToast('Error al descargar: ' + e.message, 'error'); }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      if (uploadStage || activeStage) formData.append('stageId', uploadStage || activeStage);

      try {
        await docService.uploadDocument(formData);
        showToast(`✅ ${file.name} subido`);
      } catch (err) {
        showToast(`Error subiendo ${file.name}`, 'error');
      }
    }

    setUploading(false);
    setShowUploadModal(false);
    loadDocuments(activeStage);
    e.target.value = '';
  };

  const handleSaveManual = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) return;
    try {
      if (editingDoc) {
        await docService.updateManualDocument(editingDoc.id, {
          title: manualTitle,
          content: manualContent,
          stageId: activeStage || undefined
        });
      } else {
        await docService.saveManualDocument({
          title: manualTitle,
          content: manualContent,
          stageId: activeStage || undefined
        });
      }
      setShowManualModal(false);
      setManualTitle(''); setManualContent(''); setEditingDoc(null);
      showToast('✅ Documento guardado');
      loadDocuments(activeStage);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleEditDoc = async (doc) => {
    try {
      const data = await docService.getDocumentContent(doc.id);
      if (data?.success && data.file) {
        setEditingDoc(doc);
        setManualTitle(data.file.originalName || data.file.title || '');
        setManualContent(data.file.content || '');
        setShowManualModal(true);
      }
    } catch (e) { showToast('Error cargando contenido', 'error'); }
  };

  const handleToggleDocument = async (docId, isActive, e) => {
    if (e) e.stopPropagation();
    try {
      const data = await docService.toggleDocument(docId, isActive);
      if (data?.success) {
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, is_active: isActive } : d));
        showToast(isActive ? '🟢 Documento activado' : '🔴 Documento desactivado');
      } else {
        showToast('Error: ' + (data?.error || ''), 'error');
      }
    } catch (err) { showToast('Error al cambiar estado del documento', 'error'); }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await docService.reloadKnowledge();
      showToast('✅ Conocimiento recargado');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    setReloading(false);
  };

  // ===========================
  // COMPUTED STATS
  // ===========================
  const stats = {
    total: documents.length,
    pdf: documents.filter(d => d.type === 'pdf' || d.originalName?.endsWith('.pdf')).length,
    txt: documents.filter(d => d.type === 'txt' || d.type === 'manual' || d.originalName?.endsWith('.txt')).length,
    chunks: documents.reduce((sum, d) => sum + (d.chunksCount || d.chunks || 0), 0),
  };

  // ===========================
  // RENDER
  // ===========================
  return (
    <div style={styles.wrapper}>

      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={{ color: 'var(--primary-green, #25d366)', margin: 0, fontSize: 22 }}>📁 Base de Conocimiento</h2>
          <p style={{ color: '#999', margin: '4px 0 0', fontSize: 13 }}>Gestiona los documentos organizados por etapas del proceso</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #4caf50, #2e7d32)' }}
            onClick={() => { setEditingStage(null); setStageName(''); setShowStageModal(true); }}>
            ➕ Agregar Etapa
          </button>
          <button style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #1565c0, #0d47a1)' }}
            onClick={() => { setEditingDoc(null); setManualTitle(''); setManualContent(''); setShowManualModal(true); }}>
            ✏️ Nuevo Documento Manual
          </button>
          <button style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #26a69a, #00897b)' }}
            onClick={() => { setUploadStage(activeStage || ''); setShowUploadModal(true); }}>
            📤 Subir Documento
          </button>
          <button style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #ff9800, #e65100)' }}
            onClick={handleReload} disabled={reloading}>
            {reloading ? '⏳ Recargando...' : '🔄 Recargar Conocimiento'}
          </button>
        </div>
      </div>

      {/* Stage Tabs with Toggle Switches */}
      <div style={styles.stagesRow}>
        {stages.length === 0 ? (
          <div style={{ color: '#999', fontSize: 14, padding: 10 }}>No hay etapas. Agrega una para empezar.</div>
        ) : stages.map(stage => {
          const isSelected = activeStage === stage.id;
          const isEnabled = stage.is_active !== false;

          return (
            <div key={stage.id}
              style={{
                ...styles.stageTab,
                background: isSelected ? 'var(--primary-green, #25d366)' : '#f5f5f5',
                color: isSelected ? '#fff' : '#666',
                borderColor: isSelected ? 'var(--primary-green, #25d366)' : '#e0e0e0',
                opacity: isEnabled ? 1 : 0.5,
              }}
              onClick={() => handleSelectStage(stage.id)}
            >
              <span>{stage.name}</span>

              {/* Toggle Switch */}
              <label style={styles.toggleWrapper} onClick={e => e.stopPropagation()} title={isEnabled ? 'Etapa activa — click para desactivar' : 'Etapa inactiva — click para activar'}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => handleToggleStage(stage.id, e.target.checked, e)}
                  style={styles.toggleInput}
                />
                <span style={styles.toggleSlider(isEnabled)}></span>
                <span style={styles.toggleKnob(isEnabled)}></span>
              </label>

              {/* Edit Button */}
              <button style={styles.iconBtn} title="Editar etapa"
                onClick={(e) => { e.stopPropagation(); setEditingStage(stage); setStageName(stage.name); setShowStageModal(true); }}>
                ✏️
              </button>

              {/* Delete Button (only if >1 stages) */}
              {stages.length > 1 && (
                <button style={styles.iconBtn} title="Eliminar etapa"
                  onClick={(e) => handleDeleteStage(stage.id, stage.name, e)}>
                  🗑️
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats Cards */}
      <div style={styles.statsRow}>
        <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)' }}>
          <div style={{ ...styles.statNumber, color: '#2e7d32' }}>{stats.total}</div>
          <div style={{ ...styles.statLabel, color: '#2e7d32' }}>Total Documentos</div>
        </div>
        <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)' }}>
          <div style={{ ...styles.statNumber, color: '#1565c0' }}>{stats.pdf}</div>
          <div style={{ ...styles.statLabel, color: '#1565c0' }}>📄 PDF</div>
        </div>
        <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #f3e5f5, #e1bee7)' }}>
          <div style={{ ...styles.statNumber, color: '#7b1fa2' }}>{stats.txt}</div>
          <div style={{ ...styles.statLabel, color: '#7b1fa2' }}>📝 TXT</div>
        </div>
        <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #fff3e0, #ffe0b2)' }}>
          <div style={{ ...styles.statNumber, color: '#e65100' }}>{stats.chunks}</div>
          <div style={{ ...styles.statLabel, color: '#e65100' }}>🧩 Fragmentos</div>
        </div>
      </div>

      {/* Document Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" />
          <p style={{ color: '#999' }}>Cargando documentos...</p>
        </div>
      ) : documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 64, marginBottom: 15 }}>📁</div>
          <h3 style={{ color: '#999' }}>No hay documentos en esta etapa</h3>
          <button style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #26a69a, #00897b)', marginTop: 10 }}
            onClick={() => { setUploadStage(activeStage || ''); setShowUploadModal(true); }}>
            📤 Subir Primer Documento
          </button>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Tipo</th>
              <th style={styles.th}>Nombre del Archivo</th>
              <th style={styles.th}>Fecha de Subida</th>
              <th style={styles.th}>Tamaño</th>
              <th style={styles.th}>Fragmentos</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {documents.map(doc => {
              const isDocActive = doc.is_active !== false;
              return (
              <tr key={doc.id || doc.originalName} style={{ transition: 'background 0.15s', opacity: isDocActive ? 1 : 0.5 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <td style={{ ...styles.td, fontSize: 20, textAlign: 'center' }}>
                  {doc.type === 'pdf' ? '📄' : doc.type === 'manual' ? '✏️' : '📝'}
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>{doc.originalName || doc.title}</td>
                <td style={{ ...styles.td, color: '#888', fontSize: 13 }}>{formatDate(doc.uploadDate || doc.createdAt)}</td>
                <td style={{ ...styles.td, fontSize: 13 }}>{formatFileSize(doc.size || doc.sizeBytes)}</td>
                <td style={{ ...styles.td, fontSize: 13 }}>{doc.chunksCount || doc.chunks || 0}</td>
                <td style={styles.td}>
                  <label style={styles.toggleWrapper} title={isDocActive ? 'Documento activo — click para desactivar' : 'Documento inactivo — click para activar'}>
                    <input
                      type="checkbox"
                      checked={isDocActive}
                      onChange={(e) => handleToggleDocument(doc.id, e.target.checked)}
                      style={styles.toggleInput}
                    />
                    <span style={styles.toggleSlider(isDocActive)}></span>
                    <span style={styles.toggleKnob(isDocActive)}></span>
                  </label>
                </td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...styles.miniBtn, background: 'linear-gradient(135deg, #1565c0, #0d47a1)' }}
                      onClick={() => handleEditDoc(doc)} title="Editar">
                      ✏️ Editar
                    </button>
                    <button style={{ ...styles.miniBtn, background: 'linear-gradient(135deg, #26a69a, #00897b)' }}
                      onClick={() => handleDownload(doc.id, doc.originalName || doc.title)} title="Descargar">
                      📥 Descargar
                    </button>
                    <button style={{ ...styles.miniBtn, background: 'linear-gradient(135deg, #f44336, #c62828)' }}
                      onClick={() => handleDelete(doc.id, doc.originalName || doc.title)} title="Eliminar">
                      🗑️ Eliminar
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ==================== MODALS ==================== */}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay active" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><div className="modal-title">📤 Subir Documentos</div></div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '30px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 15 }}>📁</div>
              <p style={{ marginBottom: 8 }}>Arrastra archivos aquí o haz clic para seleccionar</p>
              <p style={{ fontSize: 12, color: '#999', marginBottom: 15 }}>Archivos: PDF, TXT (máx. 10MB)</p>
              {stages.length > 0 && (
                <select value={uploadStage} onChange={e => setUploadStage(e.target.value)}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', marginBottom: 15, width: '100%' }}>
                  <option value="">Sin etapa</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <br />
              <button style={{ ...styles.actionBtn, background: 'linear-gradient(135deg, #26a69a, #00897b)' }}
                onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? '⏳ Subiendo...' : '📁 Seleccionar Archivos'}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple onChange={handleUpload} />
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setShowUploadModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Doc Modal */}
      {showManualModal && (
        <div className="modal-overlay active" onClick={() => setShowManualModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <div className="modal-title">{editingDoc ? '✏️ Editar Documento' : '✏️ Nuevo Documento Manual'}</div>
            </div>
            <div className="modal-body">
              <label className="modal-label">Título del Documento:</label>
              <input className="modal-input" type="text" value={manualTitle}
                onChange={e => setManualTitle(e.target.value)} placeholder="Ej: Políticas de Crédito 2026"
                style={{ marginBottom: 15 }} />
              <label className="modal-label">Contenido del Documento:</label>
              <textarea value={manualContent} onChange={e => setManualContent(e.target.value)}
                placeholder="Escribe aquí el contenido del documento..."
                style={{
                  width: '100%', minHeight: 300, padding: 12, border: '1px solid #ddd', borderRadius: 8,
                  fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none'
                }} />
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setShowManualModal(false)}>Cancelar</button>
              <button className="modal-btn primary" onClick={handleSaveManual}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Modal */}
      {showStageModal && (
        <div className="modal-overlay active" onClick={() => setShowStageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">{editingStage ? '✏️ Editar Etapa' : '➕ Nueva Etapa'}</div>
            </div>
            <div className="modal-body">
              <label className="modal-label">Nombre de la Etapa:</label>
              <input className="modal-input" type="text" value={stageName}
                onChange={e => setStageName(e.target.value)} placeholder="Ej: Validación Inicial" autoFocus />
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setShowStageModal(false)}>Cancelar</button>
              <button className="modal-btn primary" onClick={handleSaveStage}>✅ Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
