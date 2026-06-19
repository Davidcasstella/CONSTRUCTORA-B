import { useState, useEffect, useCallback } from 'react';
import * as welcomeService from '../services/welcomeConfigService';
import { apiPostForm } from '../services/api';
import '../styles/welcome.css';

const TABS = [
  { id: 'welcome', label: '👋 Bienvenida' },
  { id: 'consent', label: '📄 Consentimiento' },
  { id: 'closure', label: '🔒 Cierre y Transferencia' },
  { id: 'advanced', label: '⚙️ Configuración Avanzada' },
];

const TYPE_BADGES = {
  text: '📝 Texto',
  image: '🖼️ Imagen',
  video: '🎬 Video',
  audio: '🔊 Audio',
};

const CLOSURE_ICONS = {
  auto_close: '🔒',
  transfer_human: '👩‍💼',
  followup: '🔄',
};

const CLOSURE_LABELS = {
  auto_close: 'Cierre automático',
  transfer_human: 'Transferencia a asesor',
  followup: 'Seguimiento',
};

export default function WelcomePage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('welcome');
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);


  // Load config on mount
  useEffect(() => { loadConfig(); }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await welcomeService.getWelcomeConfig();
      if (data?.success) {
        setConfig(data.config);
        setDirty(false);
      } else {
        showToast('Error cargando configuración', 'error');
      }
    } catch (err) {
      console.error('Error loading welcome config:', err);
      showToast('Error cargando configuración', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!config) return;
    try {
      const data = await welcomeService.saveWelcomeConfig(config);
      if (data?.success) {
        if (data.config) setConfig(data.config);
        setDirty(false);
        showToast('✅ Configuración guardada exitosamente', 'success');
      } else {
        showToast('❌ Error guardando configuración', 'error');
      }
    } catch (err) {
      console.error('Error saving:', err);
      showToast('❌ Error guardando configuración', 'error');
    }
  }

  function handleReset() {
    if (!window.confirm('Descartar todos los cambios y recargar desde el servidor?')) return;
    setDirty(false);
    loadConfig();
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
  }

  // Updater helper that marks dirty
  const updateConfig = useCallback((updater) => {
    setConfig(prev => {
      const next = typeof updater === 'function' ? updater({ ...prev }) : updater;
      return next;
    });
    setDirty(true);
  }, []);

  // ===========================================
  // WELCOME MESSAGES
  // ===========================================
  function addWelcomeMsg() {
    updateConfig(c => {
      const msgs = c.welcome?.messages || [];
      const maxOrder = msgs.reduce((max, m) => Math.max(max, m.order || 0), 0);
      const id = `w_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      return {
        ...c,
        welcome: {
          ...c.welcome,
          messages: [...msgs, {
            id, order: maxOrder + 1, type: 'text', content: '',
            delay: 2, mediaUrl: null, mediaType: null,
            useGreeting: false, includeUserName: false, enabled: true,
          }],
        },
      };
    });
  }

  function updateWelcomeMsg(msgId, field, value) {
    updateConfig(c => ({
      ...c,
      welcome: {
        ...c.welcome,
        messages: (c.welcome?.messages || []).map(m =>
          m.id === msgId ? { ...m, [field]: value } : m
        ),
      },
    }));
  }

  function deleteWelcomeMsg(msgId) {
    if (!window.confirm('Eliminar este mensaje de bienvenida?')) return;
    updateConfig(c => {
      const msgs = (c.welcome?.messages || [])
        .filter(m => m.id !== msgId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((m, i) => ({ ...m, order: i + 1 }));
      return { ...c, welcome: { ...c.welcome, messages: msgs } };
    });
  }

  // ===========================================
  // VARIANT MANAGEMENT
  // ===========================================
  function addVariant(msgId) {
    updateConfig(c => ({
      ...c,
      welcome: {
        ...c.welcome,
        messages: (c.welcome?.messages || []).map(m => {
          if (m.id !== msgId) return m;
          const variants = m.variants || [];
          const vId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          return { ...m, variants: [...variants, { id: vId, content: '', enabled: true }] };
        }),
      },
    }));
  }

  function updateVariant(msgId, variantId, field, value) {
    updateConfig(c => ({
      ...c,
      welcome: {
        ...c.welcome,
        messages: (c.welcome?.messages || []).map(m => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            variants: (m.variants || []).map(v =>
              v.id === variantId ? { ...v, [field]: value } : v
            ),
          };
        }),
      },
    }));
  }

  function deleteVariant(msgId, variantId) {
    updateConfig(c => ({
      ...c,
      welcome: {
        ...c.welcome,
        messages: (c.welcome?.messages || []).map(m => {
          if (m.id !== msgId) return m;
          return { ...m, variants: (m.variants || []).filter(v => v.id !== variantId) };
        }),
      },
    }));
  }

  // ===========================================
  // MEDIA UPLOAD
  // ===========================================
  async function handleFileUpload(msgId, file) {
    if (!file) return;

    const mime = file.type;
    let fileType = 'document';
    if (mime.startsWith('image/')) fileType = 'image';
    else if (mime.startsWith('video/')) fileType = 'video';
    else if (mime.startsWith('audio/')) fileType = 'audio';

    setUploadingId(msgId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', fileType);

      const data = await apiPostForm('/api/conversations/upload-media', formData);
      if (data?.success) {
        // Update msg with media info
        updateWelcomeMsg(msgId, 'mediaUrl', data.file.url);
        updateWelcomeMsg(msgId, 'mediaType', fileType);
        updateWelcomeMsg(msgId, 'type', fileType);
        showToast(`✅ ${fileType === 'image' ? 'Imagen' : fileType === 'video' ? 'Video' : 'Audio'} subido exitosamente`, 'success');
      } else {
        showToast('❌ Error subiendo archivo: ' + (data?.error || ''), 'error');
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('❌ Error subiendo archivo', 'error');
    } finally {
      setUploadingId(null);
    }
  }

  function renderMediaPreview(msg) {
    if (!msg.mediaUrl) return null;
    const t = msg.type || msg.mediaType;
    if (t === 'image') {
      return (
        <div style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '2px solid var(--border-color, #e0e0e0)', maxHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hover-bg, #f5f5f5)' }}>
          <img src={msg.mediaUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }} />
        </div>
      );
    }
    if (t === 'video') {
      return (
        <div style={{ margin: '8px 0' }}>
          <video src={msg.mediaUrl} controls style={{ width: '100%', maxHeight: 180, borderRadius: 8, border: '2px solid var(--border-color, #e0e0e0)' }} />
        </div>
      );
    }
    if (t === 'audio') {
      return (
        <div style={{ margin: '8px 0', padding: 10, background: '#e8f5e9', borderRadius: 8, border: '2px solid #c8e6c9', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🎵</span>
          <audio src={msg.mediaUrl} controls style={{ flex: 1 }} />
        </div>
      );
    }
    return null;
  }

  // Reorder welcome messages with up/down buttons
  function moveWelcomeMsg(msgId, direction) {
    updateConfig(c => {
      const msgs = [...(c.welcome?.messages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
      const idx = msgs.findIndex(m => m.id === msgId);
      if (idx === -1) return c;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= msgs.length) return c;

      // Swap the two messages
      [msgs[idx], msgs[targetIdx]] = [msgs[targetIdx], msgs[idx]];
      // Reassign order values
      msgs.forEach((m, i) => { m.order = i + 1; });

      return { ...c, welcome: { ...c.welcome, messages: msgs } };
    });
  }

  // ===========================================
  // CONSENT MESSAGES
  // ===========================================
  function getConsentMessages() {
    if (!config?.consent) return [];
    // Migrate legacy single string to messages array
    if (!Array.isArray(config.consent.messages)) {
      const oldMsg = config.consent.message || '';
      const oldDelay = config.consent.delay || 2;
      if (oldMsg) {
        return [{ id: 'cn_migrated', order: 1, content: oldMsg, delay: oldDelay, enabled: true }];
      }
      return [];
    }
    return [...config.consent.messages].sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function addConsentMsg() {
    updateConfig(c => {
      const consent = c.consent || { enabled: true };
      const msgs = Array.isArray(consent.messages) ? consent.messages : [];
      const maxOrder = msgs.reduce((max, m) => Math.max(max, m.order || 0), 0);
      const id = `cn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      return {
        ...c,
        consent: {
          ...consent,
          messages: [...msgs, {
            id, order: maxOrder + 1, content: '', delay: 2, enabled: true,
          }],
        },
      };
    });
  }

  function updateConsentMsg(msgId, field, value) {
    updateConfig(c => {
      const consent = c.consent || { enabled: true };
      let msgs = Array.isArray(consent.messages) ? consent.messages : [];
      return {
        ...c,
        consent: {
          ...consent,
          messages: msgs.map(m => m.id === msgId ? { ...m, [field]: value } : m),
        },
      };
    });
  }

  function deleteConsentMsg(msgId) {
    if (!window.confirm('Eliminar este mensaje de consentimiento?')) return;
    updateConfig(c => {
      const consent = c.consent || { enabled: true };
      const msgs = (Array.isArray(consent.messages) ? consent.messages : [])
        .filter(m => m.id !== msgId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((m, i) => ({ ...m, order: i + 1 }));
      return { ...c, consent: { ...consent, messages: msgs } };
    });
  }

  function moveConsentMsg(msgId, direction) {
    updateConfig(c => {
      const consent = c.consent || { enabled: true };
      const msgs = [...(Array.isArray(consent.messages) ? consent.messages : [])]
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const idx = msgs.findIndex(m => m.id === msgId);
      if (idx === -1) return c;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= msgs.length) return c;
      [msgs[idx], msgs[targetIdx]] = [msgs[targetIdx], msgs[idx]];
      msgs.forEach((m, i) => { m.order = i + 1; });
      return { ...c, consent: { ...consent, messages: msgs } };
    });
  }

  // ===========================================
  // CLOSURE MESSAGES
  // ===========================================
  function addClosureMsg() {
    updateConfig(c => {
      const msgs = c.closure?.messages || [];
      const id = `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      return {
        ...c,
        closure: {
          ...c.closure,
          enabled: c.closure?.enabled !== false,
          messages: [...msgs, {
            id, type: 'auto_close', label: 'Nuevo mensaje de cierre',
            content: '', delay: 0, enabled: true,
          }],
        },
      };
    });
  }

  function updateClosureMsg(msgId, field, value) {
    updateConfig(c => ({
      ...c,
      closure: {
        ...c.closure,
        messages: (c.closure?.messages || []).map(m =>
          m.id === msgId ? { ...m, [field]: value } : m
        ),
      },
    }));
  }

  function deleteClosureMsg(msgId) {
    if (!window.confirm('Eliminar este mensaje de cierre?')) return;
    updateConfig(c => ({
      ...c,
      closure: {
        ...c.closure,
        messages: (c.closure?.messages || []).filter(m => m.id !== msgId),
      },
    }));
  }

  // ===========================================
  // RENDER
  // ===========================================
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <div className="loading-spinner"></div>
        <p style={{ color: '#aaa', marginTop: 12 }}>Cargando configuración de bienvenida...</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h3>No se pudo cargar la configuración</h3>
        <button className="upload-btn" onClick={loadConfig}>🔄 Reintentar</button>
      </div>
    );
  }

  const messages = [...(config.welcome?.messages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const globalEnabled = config.welcome?.enabled !== false;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: 'var(--primary-green, #2e7d32)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          👋 Gestión de Bienvenida y Cierre
        </h2>
        <p style={{ color: 'var(--text-secondary, #777)', margin: 0, fontSize: '0.9em' }}>
          Administra los mensajes automáticos que reciben tus clientes al iniciar y finalizar una conversación
        </p>
      </div>

      {/* Global toggle */}
      <div className={`wm-global-banner ${globalEnabled ? '' : 'disabled'}`}>
        <div className="wm-global-banner-text">
          🟢 Mensajes de bienvenida
          <small>Activa o desactiva todos los mensajes de bienvenida automáticos</small>
        </div>
        <label className="wm-toggle">
          <input type="checkbox" checked={globalEnabled}
            onChange={e => updateConfig(c => ({
              ...c, welcome: { ...c.welcome, enabled: e.target.checked }
            }))} />
          <span className="wm-toggle-slider"></span>
        </label>
      </div>

      {/* Tabs */}
      <div className="wm-tabs">
        {TABS.map(tab => (
          <button key={tab.id}
            className={`wm-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Welcome */}
      {activeTab === 'welcome' && (
        <div>
          {messages.length === 0 ? (
            <div className="wm-empty">
              <div className="wm-empty-icon">👋</div>
              <h3>No hay mensajes de bienvenida</h3>
              <p>Agrega tu primer mensaje para dar la bienvenida a tus clientes</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={msg.id}
                className={`wm-card ${msg.enabled === false ? 'disabled-card' : ''}`}
                data-msg-id={msg.id}>
                <div className="wm-card-header">
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, marginRight: 4 }}>
                    <button
                      onClick={() => moveWelcomeMsg(msg.id, 'up')}
                      disabled={idx === 0}
                      title="Subir"
                      style={{
                        border: 'none', background: idx === 0 ? 'transparent' : 'var(--hover-bg, #f0f0f0)',
                        borderRadius: 4, cursor: idx === 0 ? 'default' : 'pointer',
                        padding: '1px 6px', fontSize: 12, lineHeight: 1,
                        opacity: idx === 0 ? 0.3 : 1, transition: 'all 0.15s'
                      }}>▲</button>
                    <button
                      onClick={() => moveWelcomeMsg(msg.id, 'down')}
                      disabled={idx === messages.length - 1}
                      title="Bajar"
                      style={{
                        border: 'none', background: idx === messages.length - 1 ? 'transparent' : 'var(--hover-bg, #f0f0f0)',
                        borderRadius: 4, cursor: idx === messages.length - 1 ? 'default' : 'pointer',
                        padding: '1px 6px', fontSize: 12, lineHeight: 1,
                        opacity: idx === messages.length - 1 ? 0.3 : 1, transition: 'all 0.15s'
                      }}>▼</button>
                  </span>
                  <span className="wm-order-badge">{idx + 1}</span>
                  <span className="wm-card-title">Mensaje #{idx + 1}</span>
                  <span className={`wm-type-badge type-${msg.type || 'text'}`}>
                    {TYPE_BADGES[msg.type] || TYPE_BADGES.text}
                  </span>
                  <label className="wm-toggle" title={msg.enabled !== false ? 'Activo' : 'Inactivo'}>
                    <input type="checkbox" checked={msg.enabled !== false}
                      onChange={e => updateWelcomeMsg(msg.id, 'enabled', e.target.checked)} />
                    <span className="wm-toggle-slider"></span>
                  </label>
                </div>

                <div className="wm-card-body">
                  {/* Text content — shown for text type, or as caption for media */}
                  <textarea className="wm-textarea"
                    value={msg.content || ''}
                    placeholder={msg.type !== 'text' ? 'Caption / descripción (opcional)...' : 'Escribe el contenido del mensaje...'}
                    onChange={e => updateWelcomeMsg(msg.id, 'content', e.target.value)} />

                  {/* Media upload section — shown for non-text types */}
                  {msg.type && msg.type !== 'text' && (
                    <div style={{ padding: 12, background: 'var(--hover-bg, #f8f9fa)', borderRadius: 10, border: '1px solid var(--border-color, #e8e8e8)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 16 }}>
                          {msg.type === 'image' ? '🖼️' : msg.type === 'video' ? '🎬' : '🔊'}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #333)' }}>
                          {msg.type === 'image' ? 'Imagen' : msg.type === 'video' ? 'Video' : 'Audio'}
                        </span>
                        {uploadingId === msg.id && (
                          <span style={{ color: 'var(--primary-green, #25d366)', fontSize: 12, fontWeight: 500 }}>⏳ Subiendo...</span>
                        )}
                      </div>

                      {/* Upload button */}
                      <label style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: uploadingId === msg.id ? 'wait' : 'pointer',
                        padding: '10px 18px', background: msg.mediaUrl ? '#e8f5e9' : '#f0fef4',
                        border: '2px dashed #4caf50', borderRadius: 8, color: '#1a7a45', fontWeight: 600,
                        fontSize: 13, opacity: uploadingId === msg.id ? 0.6 : 1,
                        transition: 'all 0.2s'
                      }}>
                        📎 {msg.mediaUrl ? 'Cambiar archivo' : `Subir ${msg.type === 'image' ? 'imagen' : msg.type === 'video' ? 'video' : 'audio'}`}
                        <input type="file"
                          accept={msg.type === 'image' ? 'image/*' : msg.type === 'video' ? 'video/*' : 'audio/*'}
                          onChange={e => { handleFileUpload(msg.id, e.target.files?.[0]); e.target.value = ''; }}
                          disabled={uploadingId === msg.id}
                          style={{ display: 'none' }} />
                      </label>

                      {/* Remove media button */}
                      {msg.mediaUrl && (
                        <button
                          onClick={() => { updateWelcomeMsg(msg.id, 'mediaUrl', null); updateWelcomeMsg(msg.id, 'mediaType', null); }}
                          style={{
                            marginLeft: 8, padding: '6px 12px', border: '1px solid #ffcdd2',
                            borderRadius: 6, background: 'white', color: '#c62828', fontSize: 12,
                            cursor: 'pointer', transition: 'all 0.2s'
                          }}>
                          🗑️ Quitar archivo
                        </button>
                      )}

                      {/* Media preview */}
                      {renderMediaPreview(msg)}

                      {/* URL display */}
                      {msg.mediaUrl && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary, #999)', wordBreak: 'break-all' }}>
                          📂 {msg.mediaUrl}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="wm-delay-row">
                    <span className="wm-delay-label">⏱ Retardo:</span>
                    <input type="range" className="wm-delay-slider"
                      min="0" max="120" value={msg.delay || 0}
                      onChange={e => updateWelcomeMsg(msg.id, 'delay', parseInt(e.target.value))} />
                    <span className="wm-delay-value">{msg.delay || 0}s</span>
                  </div>

                  <div className="wm-options-row">
                    <label className="wm-option-check">
                      <input type="checkbox" checked={!!msg.includeUserName}
                        onChange={e => updateWelcomeMsg(msg.id, 'includeUserName', e.target.checked)} />
                      Incluir nombre del usuario
                    </label>
                    <label className="wm-option-check">
                      <input type="checkbox" checked={!!msg.useGreeting}
                        onChange={e => updateWelcomeMsg(msg.id, 'useGreeting', e.target.checked)} />
                      Saludo según hora del día
                    </label>
                  </div>

                  {/* VARIANTS SECTION */}
                  <div style={{ padding: 12, background: 'var(--hover-bg, #f0f7ff)', borderRadius: 10, border: '1px solid var(--border-color, #d0e3f7)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 16 }}>🔄</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary, #333)' }}>Variantes de saludo</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary, #999)', fontWeight: 400 }}>
                          ({(msg.variants || []).filter(v => v.enabled !== false).length} activas)
                        </span>
                      </div>
                      <button
                        onClick={() => addVariant(msg.id)}
                        style={{
                          padding: '4px 12px', border: '1px solid #a5d6a7', borderRadius: 6,
                          background: '#e8f5e9', color: '#2e7d32', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                        ➕ Agregar
                      </button>
                    </div>

                    {(!msg.variants || msg.variants.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '16px 10px', color: 'var(--text-secondary, #aaa)', fontSize: 12 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🔄</div>
                        Sin variantes — se usará siempre el mensaje principal de arriba.
                        <br />Agrega variantes para que el saludo rote entre clientes.
                      </div>
                    ) : (
                      (msg.variants || []).map((variant, vIdx) => (
                        <div key={variant.id} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8,
                          padding: 8, background: 'var(--card-bg, white)', borderRadius: 8,
                          border: `1px solid ${variant.enabled !== false ? '#c8e6c9' : 'var(--border-color, #e0e0e0)'}`,
                          opacity: variant.enabled !== false ? 1 : 0.5,
                          transition: 'all 0.2s'
                        }}>
                          <span style={{
                            minWidth: 22, height: 22, borderRadius: '50%',
                            background: variant.enabled !== false ? '#4caf50' : '#ccc',
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, marginTop: 4, flexShrink: 0
                          }}>{vIdx + 1}</span>
                          <textarea
                            value={variant.content || ''}
                            placeholder={`Variante ${vIdx + 1}... Ej: Hola, soy AntonIA...`}
                            onChange={e => updateVariant(msg.id, variant.id, 'content', e.target.value)}
                            style={{
                              flex: 1, padding: '6px 10px', border: '1px solid var(--border-color, #e0e0e0)',
                              borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                              minHeight: 36, lineHeight: 1.4,
                              background: 'var(--card-bg, white)', color: 'var(--text-primary, #333)'
                            }} />
                          <label className="wm-toggle" style={{ marginTop: 4 }} title={variant.enabled !== false ? 'Activa' : 'Inactiva'}>
                            <input type="checkbox" checked={variant.enabled !== false}
                              onChange={e => updateVariant(msg.id, variant.id, 'enabled', e.target.checked)} />
                            <span className="wm-toggle-slider"></span>
                          </label>
                          <button
                            onClick={() => deleteVariant(msg.id, variant.id)}
                            title="Eliminar variante"
                            style={{
                              padding: '4px 6px', border: '1px solid #ffcdd2', borderRadius: 4,
                              background: 'transparent', color: '#c62828', fontSize: 14,
                              cursor: 'pointer', marginTop: 2, lineHeight: 1
                            }}>✕</button>
                        </div>
                      ))
                    )}

                    {msg.variants && msg.variants.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary, #888)', marginTop: 6, fontStyle: 'italic' }}>
                        💡 Se elige una variante al azar por cada cliente nuevo. Si no hay variantes activas, se usa el mensaje principal.
                      </div>
                    )}
                  </div>
                </div>

                <div className="wm-card-actions">
                  <div className="wm-card-actions-left">
                    <select className="wm-type-select"
                      value={msg.type || 'text'}
                      onChange={e => updateWelcomeMsg(msg.id, 'type', e.target.value)}>
                      <option value="text">📝 Texto</option>
                      <option value="image">🖼️ Imagen</option>
                      <option value="video">🎬 Video</option>
                      <option value="audio">🔊 Audio</option>
                    </select>
                  </div>
                  <div className="wm-card-actions-right">
                    <button className="wm-action-btn btn-delete"
                      onClick={() => deleteWelcomeMsg(msg.id)}>
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
          <button className="wm-add-btn" onClick={addWelcomeMsg}>
            ➕ Agregar mensaje de bienvenida
          </button>
        </div>
      )}

      {/* TAB: Consent */}
      {activeTab === 'consent' && (() => {
        const consentMsgs = getConsentMessages();
        const consentEnabled = config.consent?.enabled !== false;
        return (
          <div>
            {/* Consent header with global toggle */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
              border: '2px solid #90caf9', borderRadius: 12, padding: '16px 18px', marginBottom: 16
            }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1565c0' }}>📄 Mensajes de Consentimiento</h3>
                <p style={{ margin: 0, color: '#5c6bc0', fontSize: 13, lineHeight: 1.4 }}>
                  Se envían secuencialmente para informar al usuario sobre las políticas de datos. Cada mensaje tiene su propio retardo.
                </p>
              </div>
              <label className="wm-toggle" title="Activar/desactivar consentimiento">
                <input type="checkbox" checked={consentEnabled}
                  onChange={e => updateConfig(c => ({
                    ...c, consent: { ...c.consent, enabled: e.target.checked }
                  }))} />
                <span className="wm-toggle-slider"></span>
              </label>
            </div>

            {consentMsgs.length === 0 ? (
              <div className="wm-empty">
                <div className="wm-empty-icon">📄</div>
                <h3>No hay mensajes de consentimiento</h3>
                <p>Agrega tu primer mensaje de políticas de datos</p>
              </div>
            ) : (
              consentMsgs.map((msg, idx) => (
                <div key={msg.id}
                  className={`wm-card ${msg.enabled === false ? 'disabled-card' : ''}`}
                  style={{ borderColor: '#e0e7ff' }}>
                  <div className="wm-card-header">
                    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, marginRight: 4 }}>
                      <button
                        onClick={() => moveConsentMsg(msg.id, 'up')}
                        disabled={idx === 0}
                        title="Subir"
                        style={{
                          border: 'none', background: idx === 0 ? 'transparent' : 'var(--hover-bg, #f0f0f0)',
                          borderRadius: 4, cursor: idx === 0 ? 'default' : 'pointer',
                          padding: '1px 6px', fontSize: 12, lineHeight: 1,
                          opacity: idx === 0 ? 0.3 : 1, transition: 'all 0.15s'
                        }}>▲</button>
                      <button
                        onClick={() => moveConsentMsg(msg.id, 'down')}
                        disabled={idx === consentMsgs.length - 1}
                        title="Bajar"
                        style={{
                          border: 'none', background: idx === consentMsgs.length - 1 ? 'transparent' : 'var(--hover-bg, #f0f0f0)',
                          borderRadius: 4, cursor: idx === consentMsgs.length - 1 ? 'default' : 'pointer',
                          padding: '1px 6px', fontSize: 12, lineHeight: 1,
                          opacity: idx === consentMsgs.length - 1 ? 0.3 : 1, transition: 'all 0.15s'
                        }}>▼</button>
                    </span>
                    <span className="wm-order-badge" style={{ background: '#1565c0' }}>{idx + 1}</span>
                    <span className="wm-card-title">Mensaje #{idx + 1}</span>
                    <label className="wm-toggle" title={msg.enabled !== false ? 'Activo' : 'Inactivo'}>
                      <input type="checkbox" checked={msg.enabled !== false}
                        onChange={e => updateConsentMsg(msg.id, 'enabled', e.target.checked)} />
                      <span className="wm-toggle-slider"></span>
                    </label>
                  </div>

                  <div className="wm-card-body">
                    <textarea className="wm-textarea"
                      value={msg.content || ''}
                      placeholder="Escribe el contenido del mensaje de consentimiento..."
                      onChange={e => updateConsentMsg(msg.id, 'content', e.target.value)} />

                    <div className="wm-delay-row">
                      <span className="wm-delay-label">⏱ Retardo:</span>
                      <input type="range" className="wm-delay-slider"
                        style={{ background: 'linear-gradient(90deg, #90caf9, #1565c0)' }}
                        min="0" max="120" value={msg.delay || 0}
                        onChange={e => updateConsentMsg(msg.id, 'delay', parseInt(e.target.value))} />
                      <span className="wm-delay-value">{msg.delay || 0}s</span>
                    </div>
                  </div>

                  <div className="wm-card-actions">
                    <div className="wm-card-actions-left"></div>
                    <div className="wm-card-actions-right">
                      <button className="wm-action-btn btn-delete"
                        onClick={() => deleteConsentMsg(msg.id)}>
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            <button className="wm-add-btn" onClick={addConsentMsg}>
              ➕ Agregar mensaje de consentimiento
            </button>
          </div>
        );
      })()}

      {/* TAB: Closure */}
      {activeTab === 'closure' && (
        <div>
          <div className="wm-tip">
            <strong>💡 Tip:</strong> Puedes agregar múltiples mensajes por tipo. Se enviarán en secuencia, cada uno con su propio retardo.
          </div>

          {/* === TRANSFER HUMAN SECTION === */}
          {(() => {
            const transferMsgs = (config.closure?.messages || []).filter(m => m.type === 'transfer_human');
            return (
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                  padding: '10px 14px', background: 'linear-gradient(135deg, rgba(76,175,80,0.1), rgba(76,175,80,0.05))',
                  borderRadius: 10, border: '1px solid rgba(76,175,80,0.2)'
                }}>
                  <span style={{ fontSize: 20 }}>👩‍💼</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 14, color: 'var(--text-primary, #333)' }}>Transferencia a asesor</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary, #888)', marginTop: 2 }}>
                      {transferMsgs.length} mensaje{transferMsgs.length !== 1 ? 's' : ''} configurado{transferMsgs.length !== 1 ? 's' : ''} — se envían en secuencia cuando se escala
                    </div>
                  </div>
                  <button className="wm-add-btn" style={{ margin: 0, fontSize: 12, padding: '6px 12px' }}
                    onClick={() => {
                      updateConfig(c => ({
                        ...c,
                        closure: {
                          ...c.closure,
                          enabled: c.closure?.enabled !== false,
                          messages: [...(c.closure?.messages || []), {
                            id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                            type: 'transfer_human', label: `Mensaje ${transferMsgs.length + 1}`,
                            content: '', delay: 2, enabled: true,
                          }],
                        },
                      }));
                    }}>
                    ➕ Agregar
                  </button>
                </div>

                {transferMsgs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-secondary, #888)', fontSize: 13, fontStyle: 'italic' }}>
                    No hay mensajes de transferencia configurados
                  </div>
                ) : (
                  transferMsgs.map((msg, idx) => (
                    <div key={msg.id} className="wm-closure-card" style={{ marginBottom: 10, position: 'relative' }}>
                      <div style={{
                        position: 'absolute', top: -8, left: 14,
                        background: '#4CAF50', color: 'white', borderRadius: 12,
                        padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.5px'
                      }}>
                        Mensaje {idx + 1} de {transferMsgs.length}
                      </div>
                      <div className="wm-closure-type" style={{ marginTop: 8 }}>
                        <span className="wm-closure-type-label">{msg.label || `Transferencia ${idx + 1}`}</span>
                        <label className="wm-toggle">
                          <input type="checkbox" checked={msg.enabled !== false}
                            onChange={e => updateClosureMsg(msg.id, 'enabled', e.target.checked)} />
                          <span className="wm-toggle-slider"></span>
                        </label>
                      </div>

                      <textarea className="wm-textarea"
                        value={msg.content || ''}
                        placeholder="Contenido del mensaje..."
                        onChange={e => updateClosureMsg(msg.id, 'content', e.target.value)} />

                      <div className="wm-delay-row" style={{ marginTop: 8 }}>
                        <span className="wm-delay-label">⏱ Retardo:</span>
                        <input type="range" className="wm-delay-slider"
                          min="0" max="30" value={msg.delay || 0}
                          onChange={e => updateClosureMsg(msg.id, 'delay', parseInt(e.target.value))} />
                        <span className="wm-delay-value">{msg.delay || 0}s</span>
                      </div>

                      <div className="wm-card-actions" style={{ marginTop: 10 }}>
                        <div className="wm-card-actions-left">
                          <input type="text" value={msg.label || ''}
                            placeholder="Etiqueta..."
                            onChange={e => updateClosureMsg(msg.id, 'label', e.target.value)}
                            style={{ padding: '4px 8px', border: '1px solid var(--border-color, #e0e0e0)', borderRadius: 6, fontSize: 12, width: 160, background: 'var(--card-bg, white)', color: 'var(--text-primary, #333)' }} />
                        </div>
                        <div className="wm-card-actions-right">
                          <button className="wm-action-btn btn-delete"
                            onClick={() => deleteClosureMsg(msg.id)}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}

          {/* === AUTO CLOSE & FOLLOWUP SECTION === */}
          {(() => {
            const otherMsgs = (config.closure?.messages || []).filter(m => m.type !== 'transfer_human');
            return otherMsgs.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                  padding: '10px 14px', background: 'linear-gradient(135deg, rgba(255,152,0,0.1), rgba(255,152,0,0.05))',
                  borderRadius: 10, border: '1px solid rgba(255,152,0,0.2)'
                }}>
                  <span style={{ fontSize: 20 }}>🔒</span>
                  <strong style={{ fontSize: 14, color: 'var(--text-primary, #333)' }}>Otros mensajes de cierre</strong>
                </div>

                {otherMsgs.map(msg => (
                  <div key={msg.id} className="wm-closure-card" style={{ marginBottom: 10 }}>
                    <div className="wm-closure-type">
                      <span className="wm-closure-type-icon">{CLOSURE_ICONS[msg.type] || '📝'}</span>
                      <span className="wm-closure-type-label">{msg.label || CLOSURE_LABELS[msg.type] || 'Mensaje'}</span>
                      <label className="wm-toggle">
                        <input type="checkbox" checked={msg.enabled !== false}
                          onChange={e => updateClosureMsg(msg.id, 'enabled', e.target.checked)} />
                        <span className="wm-toggle-slider"></span>
                      </label>
                    </div>

                    <textarea className="wm-textarea"
                      value={msg.content || ''}
                      placeholder="Contenido del mensaje de cierre..."
                      onChange={e => updateClosureMsg(msg.id, 'content', e.target.value)} />

                    <div className="wm-delay-row" style={{ marginTop: 8 }}>
                      <span className="wm-delay-label">⏱ Retardo:</span>
                      <input type="range" className="wm-delay-slider"
                        min="0" max="30" value={msg.delay || 0}
                        onChange={e => updateClosureMsg(msg.id, 'delay', parseInt(e.target.value))} />
                      <span className="wm-delay-value">{msg.delay || 0}s</span>
                    </div>

                    <div className="wm-card-actions" style={{ marginTop: 10 }}>
                      <div className="wm-card-actions-left">
                        <input type="text" value={msg.label || ''}
                          placeholder="Etiqueta..."
                          onChange={e => updateClosureMsg(msg.id, 'label', e.target.value)}
                          style={{ padding: '4px 8px', border: '1px solid var(--border-color, #e0e0e0)', borderRadius: 6, fontSize: 12, width: 160, background: 'var(--card-bg, white)', color: 'var(--text-primary, #333)' }} />
                        <select className="wm-type-select"
                          value={msg.type || 'auto_close'}
                          onChange={e => updateClosureMsg(msg.id, 'type', e.target.value)}>
                          <option value="auto_close">🔒 Cierre auto</option>
                          <option value="transfer_human">👩‍💼 Transferencia</option>
                          <option value="followup">🔄 Seguimiento</option>
                        </select>
                      </div>
                      <div className="wm-card-actions-right">
                        <button className="wm-action-btn btn-delete"
                          onClick={() => deleteClosureMsg(msg.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <button className="wm-add-btn" onClick={addClosureMsg}>
            ➕ Agregar mensaje de cierre
          </button>
        </div>
      )}

      {/* TAB: Advanced */}
      {activeTab === 'advanced' && (
        <div>
          <div className="wm-section-card">
            <h3>⚡ Velocidad Global</h3>
            <p>Controla la velocidad de envío de todos los mensajes automáticos</p>
            <div className="wm-delay-row">
              <span className="wm-delay-label">Multiplicador:</span>
              <input type="range" className="wm-delay-slider"
                min="1" max="30"
                value={Math.round((config.advanced?.globalSpeedMultiplier || 1.0) * 10)}
                onChange={e => {
                  const mult = parseFloat((parseInt(e.target.value) / 10).toFixed(1));
                  updateConfig(c => ({
                    ...c, advanced: { ...c.advanced, globalSpeedMultiplier: mult }
                  }));
                }} />
              <span className="wm-delay-value">{config.advanced?.globalSpeedMultiplier || 1.0}x</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary, #999)', marginTop: 4 }}>
              1.0x = velocidad normal, 0.5x = más rápido, 2.0x = más lento
            </p>
          </div>

          <div className="wm-section-card">
            <h3>🔧 Reglas de Envío</h3>
            <p>Configura el comportamiento de los mensajes automáticos</p>

            <div className="wm-setting-row">
              <div className="wm-setting-info">
                <label>Enviar solo una vez</label>
                <small>Los mensajes de bienvenida solo se envían la primera vez que el usuario escribe</small>
              </div>
              <label className="wm-toggle">
                <input type="checkbox" checked={config.advanced?.sendOnlyOnce !== false}
                  onChange={e => updateConfig(c => ({
                    ...c, advanced: { ...c.advanced, sendOnlyOnce: e.target.checked }
                  }))} />
                <span className="wm-toggle-slider"></span>
              </label>
            </div>

            <div className="wm-setting-row">
              <div className="wm-setting-info">
                <label>Respetar horario de atención</label>
                <small>No enviar bienvenida fuera del horario configurado</small>
              </div>
              <label className="wm-toggle">
                <input type="checkbox" checked={config.advanced?.respectSchedule !== false}
                  onChange={e => updateConfig(c => ({
                    ...c, advanced: { ...c.advanced, respectSchedule: e.target.checked }
                  }))} />
                <span className="wm-toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Save bar */}
      <div className="wm-save-bar">
        <button className="wm-save-btn secondary" onClick={handleReset}>
          ↩️ Descartar cambios
        </button>
        <button className="wm-save-btn primary" onClick={handleSave}>
          💾 Guardar configuración {dirty && '•'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`wm-toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
