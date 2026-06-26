import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import * as bulkService from '../services/bulkService';
import '../styles/bulk-messages.css';

// ===========================================
// MAIN PAGE
// ===========================================

export default function BulkMessagesPage() {
  const [activeTab, setActiveTab] = useState('campaign');
  const { socket } = useSocket();
  const [liveProgress, setLiveProgress] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleProgress = (data) => {
      setLiveProgress(prev => {
        if (prev && prev.campaignId === data.campaignId) {
          return { ...prev, ...data };
        }
        return data;
      });
    };

    const handleComplete = (data) => {
      setLiveProgress(prev => {
        const finalStatus = data.status || 'completed';
        if (prev && prev.campaignId === data.campaignId) {
          return { ...prev, ...data, status: finalStatus };
        }
        return { ...data, status: finalStatus };
      });
    };

    socket.on('bulk-progress', handleProgress);
    socket.on('bulk-complete', handleComplete);
    return () => {
      socket.off('bulk-progress', handleProgress);
      socket.off('bulk-complete', handleComplete);
    };
  }, [socket]);

  return (
    <div className="bulk-page">
      <div className="bulk-header">
        <h2>📢 Mensajes Masivos</h2>
        <div className="bulk-tabs">
          <button className={`bulk-tab ${activeTab === 'campaign' ? 'active' : ''}`} onClick={() => setActiveTab('campaign')}>
            📢 Nueva Campaña
          </button>
          <button className={`bulk-tab ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveTab('contacts')}>
            👥 Contactos
          </button>
          <button className={`bulk-tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            📝 Plantillas
          </button>
          <button className={`bulk-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            📊 Historial
          </button>
        </div>
      </div>

      <div className="bulk-content">
        {activeTab === 'campaign' && <CampaignTab liveProgress={liveProgress} setLiveProgress={setLiveProgress} />}
        {activeTab === 'contacts' && <ContactsTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'history' && <HistoryTab liveProgress={liveProgress} setLiveProgress={setLiveProgress} />}
      </div>
    </div>
  );
}

// ===========================================
// DEBOUNCE HOOK
// ===========================================
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ===========================================
// STRING NORMALIZATION UTILITY (for search)
// ===========================================
function normalizeStringForSearch(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ===========================================
// CAMPAIGN TAB
// ===========================================

function CampaignTab({ liveProgress, setLiveProgress }) {
  // Campaign form
  const [campaignName, setCampaignName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [delayMs, setDelayMs] = useState(2000);
  const [batchSize, setBatchSize] = useState(50);

  // Contacts — paginated
  const [contacts, setContacts] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [selectedContactsMap, setSelectedContactsMap] = useState({});
  const [visibleSelectedCount, setVisibleSelectedCount] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Saved lists selector
  const [savedLists, setSavedLists] = useState([]);
  const [selectedListIds, setSelectedListIds] = useState(new Set());

  // Templates selector
  const [templates, setTemplates] = useState([]);

  // Drag selection
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState(null);

  // Selected panel search
  const [selectedSearch, setSelectedSearch] = useState('');

  // State
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentCampaign, setSentCampaign] = useState(null);
  const [savedDraft, setSavedDraft] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  const textareaRef = useRef(null);

  // Load first page + saved lists + templates on mount
  useEffect(() => {
    loadContacts(1, true);
    loadSavedLists();
    loadTemplates();
  }, []);

  // Reload when search changes (debounced)
  useEffect(() => {
    loadContacts(1, true);
  }, [debouncedSearch]);

  const loadSavedLists = async () => {
    try {
      const data = await bulkService.getLists();
      if (data?.success) setSavedLists(data.lists || []);
    } catch (err) { console.error('Error loading lists:', err); }
  };

  const loadTemplates = async () => {
    try {
      const data = await bulkService.getTemplates();
      if (data?.success) setTemplates(data.templates || []);
    } catch (err) { console.error('Error loading templates:', err); }
  };

  // Toggle a saved list selection
  const toggleListSelection = async (listId) => {
    const next = new Set(selectedListIds);
    if (next.has(listId)) {
      next.delete(listId);
      // Remove contacts from that list from selection
      const list = savedLists.find(l => l.listId === listId);
      if (list) {
        try {
          const data = await bulkService.getListContacts(listId);
          if (data?.success) {
            const listPhones = new Set((data.contacts || []).map(c => c.phone));
            setSelectedPhones(prev => {
              const updated = new Set(prev);
              listPhones.forEach(p => updated.delete(p));
              return updated;
            });
            setSelectedContactsMap(prevMap => {
              const nextMap = { ...prevMap };
              listPhones.forEach(p => delete nextMap[p]);
              return nextMap;
            });
          }
        } catch (e) { /* ignore */ }
      }
    } else {
      next.add(listId);
      // Add all contacts from that list to selection
      try {
        const data = await bulkService.getListContacts(listId);
        if (data?.success) {
          const listContacts = data.contacts || [];
          setSelectedPhones(prev => {
            const updated = new Set(prev);
            listContacts.forEach(c => updated.add(c.phone));
            return updated;
          });
          setSelectedContactsMap(prevMap => {
            const nextMap = { ...prevMap };
            listContacts.forEach(c => {
              nextMap[c.phone] = c;
            });
            return nextMap;
          });
        }
      } catch (e) { /* ignore */ }
    }
    setSelectedListIds(next);
  };

  // Apply template to message
  const applyTemplate = (templateId) => {
    const tpl = templates.find(t => t.templateId === templateId);
    if (tpl) setMessageTemplate(tpl.messageTemplate);
  };

  // Global mouseup to end drag
  useEffect(() => {
    const handleGlobalMouseUp = () => { if (isDragging) setIsDragging(false); };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  const loadContacts = async (pageNum = 1, reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await bulkService.getAllContacts({ page: pageNum, limit: 50, search: debouncedSearch });
      if (data?.success) {
        if (reset) {
          setContacts(data.contacts || []);
        } else {
          setContacts(prev => [...prev, ...(data.contacts || [])]);
        }
        setTotalContacts(data.total || 0);
        setHasMore(data.hasMore || false);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadContacts(page + 1, false);
    }
  };

  // Selection handlers
  const toggleContact = useCallback((phone, contactInfo = null) => {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
        setSelectedContactsMap(prevMap => {
          const nextMap = { ...prevMap };
          delete nextMap[phone];
          return nextMap;
        });
      } else {
        next.add(phone);
        const info = contactInfo || contacts.find(c => c.phone === phone) || { phone, firstName: '', lastName: '' };
        setSelectedContactsMap(prevMap => ({
          ...prevMap,
          [phone]: info
        }));
      }
      return next;
    });
  }, [contacts]);

  const selectAllVisible = () => {
    const newMapEntries = {};
    setSelectedPhones(prev => {
      const next = new Set(prev);
      contacts.forEach(c => {
        next.add(c.phone);
        newMapEntries[c.phone] = c;
      });
      return next;
    });
    setSelectedContactsMap(prevMap => ({
      ...prevMap,
      ...newMapEntries
    }));
  };

  const deselectAll = () => {
    setSelectedPhones(new Set());
    setSelectedContactsMap({});
  };

  // Drag-to-select
  const handleMouseDown = (idx) => {
    setIsDragging(true);
    setDragStartIdx(idx);
    toggleContact(contacts[idx].phone, contacts[idx]);
  };

  const handleMouseEnter = (idx) => {
    if (!isDragging || dragStartIdx === null) return;
    const start = Math.min(dragStartIdx, idx);
    const end = Math.max(dragStartIdx, idx);
    const newMapEntries = {};
    setSelectedPhones(prev => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        const c = contacts[i];
        next.add(c.phone);
        newMapEntries[c.phone] = c;
      }
      return next;
    });
    setSelectedContactsMap(prevMap => ({
      ...prevMap,
      ...newMapEntries
    }));
  };

  // Variable insertion
  const insertVariable = (variable) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = messageTemplate.substring(0, start);
    const after = messageTemplate.substring(end);
    setMessageTemplate(before + variable + after);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    }, 0);
  };

  // Send campaign — sends listIds when lists are selected (fixes pagination bug)
  const handleSend = async () => {
    if (selectedPhones.size === 0) { setError('Selecciona al menos un contacto'); return; }
    if (!messageTemplate.trim()) { setError('Escribe un mensaje'); return; }

    setSending(true);
    setError(null);
    try {
      // Build contact data from selectedContactsMap with fallback
      const contactsToSend = [...selectedPhones].map(phone => {
        return selectedContactsMap[phone] || { phone, firstName: '', lastName: '' };
      });

      // Send listIds so backend can resolve ALL contacts from DynamoDB
      // This fixes the bug where only paginated contacts were sent
      const payload = {
        name: campaignName || `Campaña ${new Date().toLocaleDateString('es-CO')}`,
        messageTemplate,
        contacts: contactsToSend,
        batchSize,
        delayMs,
        dryRun
      };

      // Include listIds if any saved lists are selected
      if (selectedListIds.size > 0) {
        payload.listIds = [...selectedListIds];
      }

      const data = await bulkService.startSend(payload);

      if (data?.success) {
        setSentCampaign(data.campaign);
      } else {
        // Handle both { error: "string" } and { error: { message: "string" } } formats
        const errMsg = typeof data?.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : (data?.error || 'Error al iniciar envío');
        setError(errMsg);
      }
    } catch (e) {
      setError(e.message || 'Error al iniciar envío');
    } finally {
      setSending(false);
    }
  };

  // Save as draft
  const handleSaveDraft = async () => {
    if (!campaignName.trim() || !messageTemplate.trim()) {
      setError('Nombre y mensaje son requeridos para guardar borrador');
      return;
    }
    try {
      const data = await bulkService.saveDraft({
        name: campaignName,
        messageTemplate,
        contactPhones: [...selectedPhones]
      });
      if (data?.success) {
        setSavedDraft(true);
        setTimeout(() => setSavedDraft(false), 3000);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  // Selected contacts with data
  const selectedContactsList = [...selectedPhones].map(phone => {
    return selectedContactsMap[phone] || { phone, firstName: '', lastName: '' };
  });

  // If campaign is running or just completed/cancelled, show progress
  const activeCampaignId = sentCampaign?.campaignId || liveProgress?.campaignId;
  const isCampaignActive = activeCampaignId && (sentCampaign || (liveProgress && liveProgress.campaignId === activeCampaignId));

  if (isCampaignActive) {
    const progress = liveProgress && liveProgress.campaignId === activeCampaignId ? liveProgress : {
      percent: 0,
      sent: 0,
      failed: 0,
      pending: selectedPhones.size,
      total: selectedPhones.size,
      status: 'sending'
    };

    const handlePause = async () => {
      try {
        const res = await bulkService.pauseCampaign(activeCampaignId);
        if (res?.success) {
          setLiveProgress(prev => ({ ...(prev || {}), status: 'paused' }));
        }
      } catch (err) {
        console.error('Error pausing campaign:', err);
      }
    };

    const handleResume = async () => {
      try {
        const res = await bulkService.resumeCampaign(activeCampaignId);
        if (res?.success) {
          setLiveProgress(prev => ({ ...(prev || {}), status: 'sending' }));
        }
      } catch (err) {
        console.error('Error resuming campaign:', err);
      }
    };

    const handleCancel = async () => {
      if (!window.confirm('¿Estás seguro de que deseas cancelar esta campaña? Los mensajes que faltan no serán enviados.')) {
        return;
      }
      try {
        const res = await bulkService.cancelCampaign(activeCampaignId);
        if (res?.success) {
          setLiveProgress(prev => ({ ...(prev || {}), status: 'cancelled' }));
        }
      } catch (err) {
        console.error('Error cancelling campaign:', err);
      }
    };

    const handleCloseProgress = () => {
      setCampaignName('');
      setMessageTemplate('');
      setSelectedPhones(new Set());
      setSelectedContactsMap({});
      setSelectedListIds(new Set());
      setSentCampaign(null);
      setLiveProgress(null);
      setError(null);
    };

    const isSending = progress.status === 'sending' || !progress.status;
    const isPaused = progress.status === 'paused';
    const isCompleted = progress.status === 'completed';
    const isCancelled = progress.status === 'cancelled';

    return (
      <div className="progress-section" style={{ maxWidth: 600, margin: '20px auto', padding: '30px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginBottom: 8, fontSize: '18px', fontWeight: 700 }}>
          {isSending && '📤 Enviando campaña...'}
          {isPaused && '⏸️ Campaña en pausa'}
          {isCompleted && '✅ Campaña completada'}
          {isCancelled && '🚫 Campaña cancelada'}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
          {sentCampaign?.name || progress.name || 'Campaña en progreso'}
        </p>

        <div className="progress-bar-wrapper" style={{ height: '16px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)', overflow: 'hidden', position: 'relative' }}>
          <div 
            className="progress-bar-fill" 
            style={{ 
              width: `${progress.percent || 0}%`, 
              height: '100%', 
              background: isCancelled ? '#c62828' : isPaused ? '#f57c00' : 'linear-gradient(90deg, #FFB347, #FF8C00)',
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
            }} 
          />
        </div>

        <div style={{ fontSize: 24, fontWeight: 800, color: isCancelled ? '#c62828' : isPaused ? '#f57c00' : 'var(--primary-green)', margin: '14px 0' }}>
          {progress.percent || 0}%
        </div>

        <div className="progress-stats" style={{ display: 'flex', justifyContent: 'space-around', padding: '12px', background: 'white', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', margin: '16px 0' }}>
          <span className="progress-stat sent" style={{ color: '#2e7d32', fontWeight: 600 }}>✅ Enviados: {progress.sent || 0}</span>
          <span className="progress-stat failed" style={{ color: '#c62828', fontWeight: 600 }}>❌ Fallidos: {progress.failed || 0}</span>
          <span className="progress-stat pending" style={{ color: '#e65100', fontWeight: 600 }}>⏳ Pendientes: {progress.pending || 0}</span>
        </div>

        {progress.currentPhone && isSending && (
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>Enviando a: <strong>{progress.currentPhone}</strong></p>
        )}

        {isCompleted && (
          <div className="bulk-alert success" style={{ marginTop: 20, padding: '12px', borderRadius: '8px', background: '#e8f5e9', color: '#2e7d32', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            ✅ ¡Todos los mensajes se han procesado con éxito!
          </div>
        )}

        {isCancelled && (
          <div className="bulk-alert error" style={{ marginTop: 20, padding: '12px', borderRadius: '8px', background: '#ffebee', color: '#c62828', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            🚫 Campaña cancelada por el usuario. Se detuvo el envío.
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
          {isSending && (
            <button className="toolbar-btn" onClick={handlePause} style={{ padding: '10px 20px', background: '#ffe0b2', color: '#e65100', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
              ⏸️ Pausar envío
            </button>
          )}
          {isPaused && (
            <button className="toolbar-btn primary" onClick={handleResume} style={{ padding: '10px 20px', background: 'var(--primary-green)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
              ▶️ Reanudar envío
            </button>
          )}
          {(isSending || isPaused) && (
            <button className="delete-btn" onClick={handleCancel} style={{ padding: '10px 20px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
              🚫 Cancelar envío
            </button>
          )}
          {(isCompleted || isCancelled) && (
            <button className="toolbar-btn primary" onClick={handleCloseProgress} style={{ padding: '10px 24px', background: 'var(--primary-green)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
              🔙 Volver a Nueva Campaña
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="campaign-builder">
      {/* Main area */}
      <div className="campaign-main">
        {/* Campaign info */}
        <div className="campaign-form-section">
          <div className="section-title">📝 Información de la campaña</div>
          <div className="campaign-form-row">
            <div className="form-group">
              <label>Nombre de la campaña</label>
              <input type="text" placeholder={`Campaña ${new Date().toLocaleDateString('es-CO')}`} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>✏️ Mensaje</label>
            {/* Template selector */}
            {templates.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <select
                  className="template-selector"
                  onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}
                  defaultValue=""
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                >
                  <option value="">📝 Usar plantilla guardada...</option>
                  {templates.map(t => (
                    <option key={t.templateId} value={t.templateId}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="variable-buttons" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Variables:</span>
              <button className="variable-btn" onClick={() => insertVariable('{{nombre}}')}>{'{{nombre}}'}</button>
              <button className="variable-btn" onClick={() => insertVariable('{{apellido}}')}>{'{{apellido}}'}</button>
              <button className="variable-btn" onClick={() => insertVariable('{{telefono}}')}>{'{{telefono}}'}</button>
            </div>
            <textarea ref={textareaRef} className="message-textarea" placeholder="Hola {{nombre}}, te escribimos para informarte..." value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} />
            <div className="char-count">{messageTemplate.length} caracteres</div>
          </div>

          <div className="campaign-form-row">
            <div className="form-group">
              <label>⏱️ Delay entre mensajes</label>
              <select value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))}>
                <option value={2000}>2s (recomendado)</option>
                <option value={3000}>3s (seguro)</option>
                <option value={5000}>5s (muy seguro)</option>
                <option value={10000}>10s (ultra seguro)</option>
              </select>
            </div>
            <div className="form-group">
              <label>📦 Tamaño de lote</label>
              <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}>
                <option value={10}>10 mensajes</option>
                <option value={25}>25 mensajes</option>
                <option value={50}>50 mensajes</option>
                <option value={100}>100 mensajes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Saved lists selector */}
        {savedLists.length > 0 && (
          <div className="campaign-form-section">
            <div className="section-title">📋 Seleccionar listas guardadas</div>
            <div className="saved-lists-grid">
              {savedLists.map(list => (
                <label key={list.listId} className={`saved-list-card ${selectedListIds.has(list.listId) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedListIds.has(list.listId)}
                    onChange={() => toggleListSelection(list.listId)}
                  />
                  <div className="saved-list-info">
                    <span className="saved-list-name">{list.name}</span>
                    <span className="saved-list-count">👥 {list.contactCount} contactos</span>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>💡 Al seleccionar una lista, todos sus contactos se incluyen en el envío</div>
          </div>
        )}

        {/* Contact selector */}
        <div className="campaign-form-section">
          <div className="contact-list-toolbar">
            <div className="section-title" style={{ margin: 0 }}>👥 Seleccionar contactos ({totalContacts} total)</div>
            <div className="toolbar-actions">
              <button className="toolbar-btn" onClick={selectAllVisible}>✅ Todos visibles</button>
              <button className="toolbar-btn" onClick={deselectAll}>❌ Ninguno</button>
            </div>
          </div>

          <div className="contact-search-bar" style={{ margin: '12px 0' }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre o número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#888' }}>✕</button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="loading-spinner" /></div>
          ) : contacts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-text">{searchTerm ? 'No se encontraron contactos' : 'No hay contactos'}</div>
              <div className="empty-state-hint">{searchTerm ? 'Intenta con otro término' : 'Ve a la pestaña Contactos para agregar o importar'}</div>
            </div>
          ) : (
            <>
              <div className="contact-table-wrapper">
                <table className="contact-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={contacts.length > 0 && contacts.every(c => selectedPhones.has(c.phone))}
                          onChange={(e) => e.target.checked ? selectAllVisible() : deselectAll()}
                        />
                      </th>
                      <th>Nombre</th>
                      <th>Número</th>
                      <th>Lista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact, idx) => (
                      <tr
                        key={contact.phone}
                        className={`contact-row ${selectedPhones.has(contact.phone) ? 'selected' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); handleMouseDown(idx); }}
                        onMouseEnter={() => handleMouseEnter(idx)}
                      >
                        <td>
                          <input type="checkbox" checked={selectedPhones.has(contact.phone)} onChange={() => toggleContact(contact.phone)} onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="contact-name">{contact.firstName || ''} {contact.lastName || ''}</td>
                        <td className="contact-phone">{contact.phone}</td>
                        <td>{contact.listName && <span className="contact-list-badge">{contact.listName}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Load more button */}
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button className="toolbar-btn" onClick={loadMore} disabled={loadingMore} style={{ padding: '10px 32px' }}>
                    {loadingMore ? '⏳ Cargando...' : `📥 Cargar más (${contacts.length} de ${totalContacts})`}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                <span>Mostrando {contacts.length} de {totalContacts} contactos</span>
                <span>💡 Mantén clic y arrastra para seleccionar varios</span>
              </div>
            </>
          )}
        </div>

        {error && <div className="bulk-alert error">⚠️ {typeof error === 'string' ? error : (error.message || JSON.stringify(error))}</div>}
        {savedDraft && <div className="bulk-alert success">✅ Borrador guardado correctamente</div>}

        {/* Action buttons */}
        <div className="bulk-action-bar">
          <button className="btn btn-secondary" onClick={handleSaveDraft} disabled={!campaignName.trim() || !messageTemplate.trim()}>
            📝 Guardar borrador
          </button>

          {/* Simulation toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: dryRun ? '#fff3e0' : 'transparent',
            border: dryRun ? '2px solid #ff9800' : '2px solid transparent',
            transition: 'all 0.2s'
          }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              style={{ accentColor: '#ff9800' }}
            />
            <span style={{ color: dryRun ? '#e65100' : 'var(--text-muted)' }}>
              🧪 Modo simulación
            </span>
          </label>

          <button
            className="btn"
            onClick={handleSend}
            disabled={sending || selectedPhones.size === 0 || !messageTemplate.trim()}
            style={{
              padding: '12px 32px',
              fontWeight: 700,
              background: (selectedPhones.size > 0 && messageTemplate.trim())
                ? dryRun
                  ? 'linear-gradient(135deg, #ff9800, #e65100)'
                  : 'linear-gradient(135deg, #FFB347, #FF8C00)'
                : '#ccc'
            }}
          >
            {sending
              ? '⏳ Iniciando...'
              : dryRun
                ? `🧪 Simular envío a ${selectedPhones.size} contacto(s)`
                : `📤 Enviar a ${selectedPhones.size} contacto(s)`
            }
          </button>
        </div>

        {dryRun && (
          <div style={{
            background: '#fff3e0', borderLeft: '4px solid #ff9800', padding: '10px 14px',
            borderRadius: '0 8px 8px 0', fontSize: '12px', color: '#e65100', marginTop: '8px'
          }}>
            🧪 <strong>Modo simulación activo</strong> — No se enviarán mensajes reales por WhatsApp.
            El progreso se simula con un delay de 500ms por mensaje. Ideal para probar el flujo completo.
          </div>
        )}
      </div>

      {/* Selected panel (right sidebar) */}
      <div className="selected-panel">
        <div className="selected-panel-header">
          <div className="selected-panel-title">📋 Seleccionados</div>
          <div className="selected-count-badge">{selectedPhones.size}</div>
        </div>

        {selectedPhones.size === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            Selecciona contactos de la lista o elige una lista guardada
          </div>
        ) : (
          <>
            {/* Search within selected */}
            <div className="selected-search-bar" style={{ padding: '6px 8px' }}>
              <input
                type="text"
                placeholder="🔍 Buscar en seleccionados..."
                value={selectedSearch}
                onChange={(e) => setSelectedSearch(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', fontSize: 11, border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)' }}
              />
            </div>

            {/* Selected lists indicator */}
            {selectedListIds.size > 0 && (
              <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--primary-green)', fontWeight: 600 }}>
                📋 {selectedListIds.size} lista(s) seleccionada(s)
              </div>
            )}

            <div className="selected-list">
              {(() => {
                const filtered = selectedContactsList.filter(c => {
                  if (!selectedSearch) return true;
                  const searchNorm = normalizeStringForSearch(selectedSearch);
                  const nameNorm = normalizeStringForSearch(`${c.firstName || ''} ${c.lastName || ''}`);
                  return nameNorm.includes(searchNorm) || c.phone.includes(searchNorm);
                });
                const shown = filtered.slice(0, visibleSelectedCount);
                const remaining = filtered.length - shown.length;
                return (
                  <>
                    {shown.map(c => (
                      <div key={c.phone} className="selected-item">
                        <div className="selected-item-info">
                          <span className="selected-item-name">{c.firstName || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>⚠️ Solo número</span>}</span>
                          <span className="selected-item-phone">{c.phone}</span>
                        </div>
                        <button className="selected-item-remove" onClick={() => toggleContact(c.phone)} title="Remover">✕</button>
                      </div>
                    ))}
                    {remaining > 0 && (
                      <div style={{ textAlign: 'center', padding: '6px 0' }}>
                        <button 
                          className="toolbar-btn" 
                          onClick={() => setVisibleSelectedCount(prev => prev + 50)}
                          style={{ fontSize: '11px', padding: '4px 8px', width: '100%' }}
                        >
                          📥 Ver más ({remaining} restantes)
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}

        {selectedPhones.size > 0 && (
          <div className="selected-panel-actions">
            <button className="toolbar-btn" onClick={deselectAll} style={{ width: '100%', textAlign: 'center' }}>❌ Limpiar selección</button>
          </div>
        )}

        {/* Preview */}
        {messageTemplate && selectedContactsList.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>👁️ Vista previa:</div>
            <div className="preview-item" style={{ fontSize: 12 }}>
              <div className="preview-item-message">
                {messageTemplate
                  .replace(/\{\{nombre\}\}/gi, selectedContactsList[0].firstName || 'Contacto')
                  .replace(/\{\{apellido\}\}/gi, selectedContactsList[0].lastName || '')
                  .replace(/\{\{telefono\}\}/gi, selectedContactsList[0].phone)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================
// CONTACTS TAB (with pagination)
// ===========================================

function ContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Add contact form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);

  // Import
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Rename list
  const [editingListId, setEditingListId] = useState(null);
  const [editingListName, setEditingListName] = useState('');

  // View list contacts
  const [viewingListId, setViewingListId] = useState(null);
  const [viewingContacts, setViewingContacts] = useState([]);

  useEffect(() => {
    loadContacts(1, true);
    loadLists();
  }, []);

  // Reload when search changes
  useEffect(() => {
    loadContacts(1, true);
  }, [debouncedSearch]);

  const loadContacts = async (pageNum = 1, reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await bulkService.getAllContacts({ page: pageNum, limit: 50, search: debouncedSearch });
      if (data?.success) {
        if (reset) {
          setContacts(data.contacts || []);
        } else {
          setContacts(prev => [...prev, ...(data.contacts || [])]);
        }
        setTotalContacts(data.total || 0);
        setHasMore(data.hasMore || false);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  const loadLists = async () => {
    try {
      const data = await bulkService.getLists();
      if (data?.success) setLists(data.lists || []);
    } catch (err) {
      console.error('Error loading lists:', err);
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadContacts(page + 1, false);
    }
  };

  // Add contact manually
  const handleAddContact = async () => {
    setAddError(null);
    if (!newPhone.trim()) { setAddError('Teléfono requerido'); return; }

    setAdding(true);
    try {
      const data = await bulkService.addContact(newName, newPhone);
      if (data?.success) {
        setShowAddModal(false);
        setNewName('');
        setNewPhone('');
        loadContacts(1, true);
        loadLists();
      } else {
        setAddError(data?.error || 'Error al agregar contacto');
      }
    } catch (e) {
      setAddError(e.message || 'Error al agregar contacto');
    }
    setAdding(false);
  };

  // Import file
  const handleFileUpload = async (file) => {
    setUploading(true);
    setImportResult(null);
    try {
      const data = await bulkService.uploadFile(file);
      if (data?.success) {
        setImportResult({ success: true, count: data.parsed?.contacts?.length || data.list?.contactCount || 0, warnings: data.parsed?.warnings || [] });
        loadContacts(1, true);
        loadLists();
      } else {
        setImportResult({ success: false, error: data?.error || 'Error al importar' });
      }
    } catch (e) {
      setImportResult({ success: false, error: e.message || 'Error al importar' });
    }
    setUploading(false);
  };

  const handleDeleteList = async (listId) => {
    if (!window.confirm('¿Eliminar esta lista y todos sus contactos?')) return;
    try {
      await bulkService.deleteList(listId);
      loadContacts(1, true);
      loadLists();
    } catch (err) {
      console.error('Error deleting list:', err);
      alert('Error al eliminar la lista.');
    }
  };

  const handleRenameList = async (listId) => {
    if (!editingListName.trim()) return;
    try {
      await bulkService.renameList(listId, editingListName.trim());
      setEditingListId(null);
      setEditingListName('');
      loadLists();
    } catch (err) {
      console.error('Error renaming list:', err);
      alert('Error al renombrar la lista.');
    }
  };

  const handleViewListContacts = async (listId) => {
    if (viewingListId === listId) {
      setViewingListId(null);
      setViewingContacts([]);
      return;
    }
    try {
      const data = await bulkService.getListContacts(listId);
      if (data?.success) {
        setViewingContacts(data.contacts || []);
        setViewingListId(listId);
      }
    } catch (err) {
      console.error('Error viewing list contacts:', err);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><div className="loading-spinner" /></div>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="contacts-tab-toolbar">
        <div className="contact-search-bar">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Buscar contacto por nombre o número..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#888' }}>✕</button>
          )}
        </div>
        <div className="contacts-tab-actions">
          <button className="toolbar-btn primary" onClick={() => setShowAddModal(true)}>➕ Añadir contacto</button>
          <button className="toolbar-btn" onClick={() => { setShowImportModal(true); setImportResult(null); }}>📁 Importar archivo</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div className="conv-badge badge-success">👥 {totalContacts} contactos</div>
        <div className="conv-badge" style={{ background: 'rgba(7,94,84,0.08)', color: 'var(--primary-green)' }}>📋 {lists.length} listas</div>
      </div>

      {/* Contact table */}
      {contacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-text">{searchTerm ? 'No se encontraron contactos' : 'No hay contactos'}</div>
          <div className="empty-state-hint">{searchTerm ? 'Intenta con otro término' : 'Usa los botones de arriba para añadir o importar'}</div>
        </div>
      ) : (
        <>
          <div className="contact-table-wrapper" style={{ maxHeight: 500 }}>
            <table className="contact-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Número</th>
                  <th>Lista</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(contact => (
                  <tr key={contact.contactId || contact.phone} className="contact-row">
                    <td className="contact-name">{contact.firstName || ''} {contact.lastName || ''}</td>
                    <td className="contact-phone">{contact.phone}</td>
                    <td>{contact.listName && <span className="contact-list-badge">{contact.listName}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="toolbar-btn" onClick={loadMore} disabled={loadingMore} style={{ padding: '10px 32px' }}>
                {loadingMore ? '⏳ Cargando...' : `📥 Cargar más (${contacts.length} de ${totalContacts})`}
              </button>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Mostrando {contacts.length} de {totalContacts} contactos
          </div>
        </>
      )}

      {/* Lists section */}
      {lists.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="section-title">📋 Listas de contactos ({lists.length})</div>
          <div className="table-responsive">
            <table className="lists-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Contactos</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th style={{ width: 140 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lists.map(list => (
                  <tr key={list.listId}>
                    <td style={{ fontWeight: 600 }}>
                      {editingListId === list.listId ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            type="text"
                            value={editingListName}
                            onChange={(e) => setEditingListName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameList(list.listId); if (e.key === 'Escape') setEditingListId(null); }}
                            style={{ fontSize: 12, padding: '2px 6px', width: 140, border: '1px solid var(--primary-green)', borderRadius: 4 }}
                            autoFocus
                          />
                          <button className="toolbar-btn" onClick={() => handleRenameList(list.listId)} style={{ padding: '2px 6px', fontSize: 11 }}>✅</button>
                          <button className="toolbar-btn" onClick={() => setEditingListId(null)} style={{ padding: '2px 6px', fontSize: 11 }}>✕</button>
                        </div>
                      ) : (
                        <span onDoubleClick={() => { setEditingListId(list.listId); setEditingListName(list.name); }} title="Doble clic para renombrar">{list.name}</span>
                      )}
                    </td>
                    <td><span className="conv-badge badge-success">👥 {list.contactCount}</span></td>
                    <td>{list.type === 'file' ? '📁 Archivo' : '✍️ Manual'}</td>
                    <td>{new Date(list.createdAt).toLocaleDateString('es-CO')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="toolbar-btn" onClick={() => handleViewListContacts(list.listId)} title="Ver contactos" style={{ padding: '2px 6px', fontSize: 11 }}>
                          {viewingListId === list.listId ? '🔼' : '👁️'}
                        </button>
                        <button className="toolbar-btn" onClick={() => { setEditingListId(list.listId); setEditingListName(list.name); }} title="Renombrar" style={{ padding: '2px 6px', fontSize: 11 }}>✏️</button>
                        <button className="delete-btn" onClick={() => handleDeleteList(list.listId)} title="Eliminar lista">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* View list contacts panel */}
          {viewingListId && viewingContacts.length > 0 && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                👥 Contactos de la lista ({viewingContacts.length})
                <button onClick={() => { setViewingListId(null); setViewingContacts([]); }} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕ Cerrar</button>
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {viewingContacts.map(c => (
                  <div key={c.contactId || c.phone} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, borderBottom: '1px solid var(--border-color)' }}>
                    <span>{c.firstName || ''} {c.lastName || ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{c.phone}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Añadir contacto</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Nombre</label>
              <input type="text" placeholder="Juan Pérez" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Número de teléfono *</label>
              <input type="tel" placeholder="3001234567" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Formato: 10 dígitos colombianos. Ej: 3001234567</div>
            </div>
            {addError && <div className="bulk-alert error" style={{ marginTop: 12 }}>⚠️ {addError}</div>}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button className="btn" onClick={handleAddContact} disabled={adding || !newPhone.trim()}>{adding ? '⏳ Guardando...' : '✅ Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import File Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📁 Importar archivo</h3>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>✕</button>
            </div>
            <div
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file) handleFileUpload(file); }}
            >
              <div className="drop-zone-icon">{uploading ? '⏳' : '📂'}</div>
              <div className="drop-zone-text">{uploading ? 'Procesando archivo...' : 'Arrastra tu archivo aquí o haz clic'}</div>
              <div className="drop-zone-hint">Formatos: .xlsx, .xls, .csv — Máx 10MB</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
              <strong>Formato esperado:</strong><br />
              <code style={{ fontSize: 11 }}>nombre,telefono</code><br />
              <code style={{ fontSize: 11 }}>Juan Perez,573001112233</code>
            </div>
            {importResult && (
              <div className={`bulk-alert ${importResult.success ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
                {importResult.success ? `✅ ${importResult.count} contactos importados correctamente` : `⚠️ ${importResult.error}`}
              </div>
            )}
            {importResult?.warnings?.map((w, i) => (
              <div key={i} className="bulk-alert warning" style={{ marginTop: 4 }}>ℹ️ {w}</div>
            ))}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================
// HISTORY TAB
// ===========================================

function HistoryTab({ liveProgress, setLiveProgress }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => { loadCampaigns(); }, []);

  // Reload campaigns list when active campaign completes or is cancelled
  useEffect(() => {
    if (liveProgress?.status === 'completed' || liveProgress?.status === 'cancelled') {
      loadCampaigns();
    }
  }, [liveProgress?.status]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const data = await bulkService.getCampaigns();
      if (data?.success) setCampaigns(data.campaigns || []);
    } catch (err) { console.error('Error loading campaigns:', err); }
    setLoading(false);
  };

  const toggleExpand = async (campaignId) => {
    if (expanded === campaignId) { setExpanded(null); setMessages([]); return; }
    setExpanded(campaignId);
    try {
      const data = await bulkService.getCampaignDetail(campaignId);
      if (data?.success) setMessages(data.messages || []);
    } catch (err) { console.error('Error loading campaign detail:', err); }
  };

  const handlePause = async (campaignId) => {
    await bulkService.pauseCampaign(campaignId);
    if (liveProgress && liveProgress.campaignId === campaignId) {
      setLiveProgress(prev => ({ ...(prev || {}), status: 'paused' }));
    }
    loadCampaigns();
  };

  const handleResume = async (campaignId) => {
    await bulkService.resumeCampaign(campaignId);
    if (liveProgress && liveProgress.campaignId === campaignId) {
      setLiveProgress(prev => ({ ...(prev || {}), status: 'sending' }));
    }
    loadCampaigns();
  };

  const handleCancel = async (campaignId) => {
    if (!window.confirm('¿Estás seguro de que deseas cancelar esta campaña? Los mensajes que faltan no serán enviados.')) {
      return;
    }
    try {
      await bulkService.cancelCampaign(campaignId);
      if (liveProgress && liveProgress.campaignId === campaignId) {
        setLiveProgress(prev => ({ ...(prev || {}), status: 'cancelled' }));
      }
      loadCampaigns();
    } catch (err) {
      console.error('Error cancelling campaign:', err);
    }
  };

  const statusLabel = (status) => {
    const map = {
      completed: { label: '✅ Completada', cls: 'completed' },
      sending: { label: '📤 Enviando', cls: 'sending' },
      paused: { label: '⏸️ Pausada', cls: 'paused' },
      failed: { label: '❌ Fallida', cls: 'failed' },
      draft: { label: '📝 Borrador', cls: 'draft' },
      cancelled: { label: '🚫 Cancelada', cls: 'failed' },
    };
    return map[status] || { label: status, cls: 'draft' };
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="loading-spinner" /></div>;

  if (campaigns.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="empty-state-text">No hay campañas</div>
        <div className="empty-state-hint">Las campañas enviadas aparecerán aquí</div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">📊 Historial de campañas ({campaigns.length})</div>

      {liveProgress && liveProgress.status !== 'completed' && liveProgress.status !== 'cancelled' && (
        <div className="progress-section" style={{ marginBottom: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>
              {liveProgress.status === 'paused' ? '⏸️ Campaña en pausa' : '📤 Campaña en progreso'}
            </strong>
            <span style={{ fontSize: 13, fontWeight: 700, color: liveProgress.status === 'paused' ? '#f57c00' : 'var(--primary-green)' }}>
              {liveProgress.percent || 0}%
            </span>
          </div>
          <div className="progress-bar-wrapper" style={{ height: 10, margin: '8px 0' }}>
            <div className="progress-bar-fill" style={{ width: `${liveProgress.percent || 0}%`, background: liveProgress.status === 'paused' ? '#f57c00' : 'linear-gradient(90deg, #FFB347, #FF8C00)' }} />
          </div>
          <div className="progress-stats" style={{ marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="progress-stat sent" style={{ fontSize: 12, color: '#2e7d32' }}>✅ {liveProgress.sent || 0}</span>
              <span className="progress-stat failed" style={{ fontSize: 12, color: '#c62828' }}>❌ {liveProgress.failed || 0}</span>
              <span className="progress-stat pending" style={{ fontSize: 12, color: '#e65100' }}>⏳ {liveProgress.pending || 0}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {liveProgress.status === 'paused' ? (
                <button className="toolbar-btn" onClick={() => handleResume(liveProgress.campaignId)} title="Reanudar" style={{ padding: '2px 8px', fontSize: 11 }}>▶️ Reanudar</button>
              ) : (
                <button className="toolbar-btn" onClick={() => handlePause(liveProgress.campaignId)} title="Pausar" style={{ padding: '2px 8px', fontSize: 11 }}>⏸️ Pausar</button>
              )}
              <button className="delete-btn" onClick={() => handleCancel(liveProgress.campaignId)} title="Cancelar" style={{ padding: '2px 8px', fontSize: 11, background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 4 }}>🚫 Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="campaign-table">
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Estado</th>
              <th>Enviados</th>
              <th>Fallidos</th>
              <th>Total</th>
              <th>Fecha</th>
              <th style={{ width: 120 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => {
              const st = statusLabel(c.status);
              return (
                <tr key={c.campaignId} onClick={() => toggleExpand(c.campaignId)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className={`campaign-status ${st.cls}`}>{st.label}</span></td>
                  <td>{c.sent || 0}</td>
                  <td>{c.failed || 0}</td>
                  <td>{c.totalRecipients || 0}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString('es-CO')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      {c.status === 'sending' && (
                        <>
                          <button className="toolbar-btn" onClick={() => handlePause(c.campaignId)} title="Pausar" style={{ padding: '4px 8px' }}>⏸️</button>
                          <button className="toolbar-btn" onClick={() => handleCancel(c.campaignId)} title="Cancelar" style={{ padding: '4px 8px', color: '#c62828' }}>🚫</button>
                        </>
                      )}
                      {c.status === 'paused' && (
                        <>
                          <button className="toolbar-btn" onClick={() => handleResume(c.campaignId)} title="Reanudar" style={{ padding: '4px 8px' }}>▶️</button>
                          <button className="toolbar-btn" onClick={() => handleCancel(c.campaignId)} title="Cancelar" style={{ padding: '4px 8px', color: '#c62828' }}>🚫</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expanded && messages.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title" style={{ fontSize: 13 }}>📋 Detalle de mensajes</div>
          <div className="table-responsive" style={{ maxHeight: 300, overflow: 'auto' }}>
            <table className="lists-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th>Enviado</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m.bulkMessageId}>
                    <td>{m.phone}</td>
                    <td>
                      <span className={`campaign-status ${m.status === 'sent' ? 'completed' : m.status === 'failed' ? 'failed' : 'draft'}`}>
                        {m.status === 'sent' ? '✅' : m.status === 'failed' ? '❌' : '⏳'} {m.status}
                      </span>
                    </td>
                    <td>{m.sentAt ? new Date(m.sentAt).toLocaleTimeString('es-CO') : '—'}</td>
                    <td style={{ color: '#c62828', fontSize: 11 }}>{m.errorMessage || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================
// TEMPLATES TAB
// ===========================================

function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await bulkService.getTemplates();
      if (data?.success) setTemplates(data.templates || []);
    } catch (err) { console.error('Error loading templates:', err); }
    setLoading(false);
  };

  const openNew = () => {
    setEditingId(null);
    setFormName('');
    setFormMessage('');
    setShowForm(true);
    setError(null);
  };

  const openEdit = (tpl) => {
    setEditingId(tpl.templateId);
    setFormName(tpl.name);
    setFormMessage(tpl.messageTemplate);
    setShowForm(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formMessage.trim()) {
      setError('Nombre y mensaje son requeridos');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await bulkService.updateTemplate(editingId, { name: formName, messageTemplate: formMessage });
      } else {
        await bulkService.createTemplate({ name: formName, messageTemplate: formMessage });
      }
      setShowForm(false);
      loadTemplates();
    } catch (e) {
      setError(e.message || 'Error al guardar');
    }
    setSaving(false);
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('¿Eliminar esta plantilla?')) return;
    try {
      await bulkService.deleteTemplate(templateId);
      loadTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const insertVariable = (variable) => {
    setFormMessage(prev => prev + variable);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="loading-spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>📝 Plantillas de mensajes ({templates.length})</div>
        <button className="toolbar-btn primary" onClick={openNew}>➕ Nueva plantilla</button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="campaign-form-section" style={{ marginBottom: 16, border: '2px solid var(--primary-green)', borderRadius: 12 }}>
          <div className="section-title">{editingId ? '✏️ Editar plantilla' : '➕ Nueva plantilla'}</div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Nombre de la plantilla</label>
            <input type="text" placeholder="Ej: Recordatorio de pago" value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Mensaje</label>
            <div className="variable-buttons" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Variables:</span>
              <button className="variable-btn" onClick={() => insertVariable('{{nombre}}')}>{'{{nombre}}'}</button>
              <button className="variable-btn" onClick={() => insertVariable('{{apellido}}')}>{'{{apellido}}'}</button>
              <button className="variable-btn" onClick={() => insertVariable('{{telefono}}')}>{'{{telefono}}'}</button>
            </div>
            <textarea className="message-textarea" placeholder="Hola {{nombre}}, te escribimos para..." value={formMessage} onChange={(e) => setFormMessage(e.target.value)} />
            <div className="char-count">{formMessage.length} caracteres</div>
          </div>
          {error && <div className="bulk-alert error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={handleSave} disabled={saving || !formName.trim() || !formMessage.trim()}>
              {saving ? '⏳ Guardando...' : editingId ? '✅ Actualizar' : '✅ Guardar'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Templates list */}
      {templates.length === 0 && !showForm ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-text">No hay plantillas guardadas</div>
          <div className="empty-state-hint">Crea una plantilla para reutilizar mensajes en tus campañas</div>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map(tpl => (
            <div key={tpl.templateId} className="template-card">
              <div className="template-card-header">
                <span className="template-card-name">{tpl.name}</span>
                <div className="template-card-actions">
                  <button className="toolbar-btn" onClick={() => openEdit(tpl)} title="Editar" style={{ padding: '2px 6px', fontSize: 11 }}>✏️</button>
                  <button className="delete-btn" onClick={() => handleDelete(tpl.templateId)} title="Eliminar">🗑️</button>
                </div>
              </div>
              <div className="template-card-body">
                {tpl.messageTemplate.length > 120 ? tpl.messageTemplate.substring(0, 120) + '...' : tpl.messageTemplate}
              </div>
              <div className="template-card-footer">
                Creada: {new Date(tpl.createdAt).toLocaleDateString('es-CO')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
