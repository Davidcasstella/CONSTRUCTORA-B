import { useState, useEffect } from 'react';
import * as qrService from '../services/quickReplyService';
import { apiPostForm } from '../services/api';
import { formatDate, truncateText } from '../utils/formatters';

const TYPE_ICONS = { text: '📝', image: '🖼️', video: '🎬', audio: '🎤' };
const TYPE_LABELS = { text: 'Texto', image: 'Imagen', video: 'Video', audio: 'Audio' };
const ALLOWED = ['text', 'image', 'video', 'audio'];

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState([]);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('qr_fontSize');
    return saved ? parseInt(saved, 10) : 14;
  });

  // Persist font size to localStorage
  useEffect(() => { localStorage.setItem('qr_fontSize', String(fontSize)); }, [fontSize]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  // Form state
  const [title, setTitle] = useState('');
  const [type, setType] = useState('text');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadReplies(); }, []);

  async function loadReplies() {
    setLoading(true);
    try {
      const data = await qrService.getQuickReplies();
      const list = data?.quickReplies || (Array.isArray(data) ? data : []);
      // Sort newest first: by updated_at, then created_at, then keep original order
      const sorted = [...list].sort((a, b) => {
        const tA = new Date(a.updated_at || a.created_at || 0).getTime();
        const tB = new Date(b.updated_at || b.created_at || 0).getTime();
        return tB - tA;
      });
      setReplies(sorted);
    } catch { } finally { setLoading(false); }
  }

  function resetForm() {
    setTitle(''); setType('text'); setContent(''); setMediaUrl('');
    setMediaPreviewUrl(''); setUploading(false); setActive(true); setError('');
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setShowModal(true);
  }

  function openEdit(reply) {
    setEditing(reply);
    setTitle(reply.title);
    setType(reply.type || 'text');
    setContent(reply.content || '');
    setMediaUrl(reply.mediaUrl || '');
    // Build preview URL from stored mediaUrl
    setMediaPreviewUrl(reply.mediaUrl || '');
    setActive(reply.active !== false);
    setError('');
    setShowModal(true);
  }

  // Handle file upload — reuses the same /upload-media endpoint as the chat
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const mime = file.type;
    let fileType = 'document';
    if (mime.startsWith('image/')) fileType = 'image';
    else if (mime.startsWith('video/')) fileType = 'video';
    else if (mime.startsWith('audio/')) fileType = 'audio';

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', fileType);

      const data = await apiPostForm('/api/conversations/upload-media', formData);
      if (data?.success) {
        setMediaUrl(data.file.url);
        setMediaPreviewUrl(data.file.url);
        setType(fileType); // Auto-detect type from file
      } else {
        setError(data?.error || 'Error subiendo archivo');
      }
    } catch (err) {
      setError('Error subiendo archivo: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError('El título es requerido'); return; }
    if (type === 'text' && !content.trim()) { setError('El contenido es requerido'); return; }
    if (type !== 'text' && !mediaUrl) { setError('Debes subir un archivo'); return; }

    const payload = { title, type, content, mediaUrl, active };

    try {
      if (editing) {
        await qrService.updateQuickReply(editing.id, payload);
      } else {
        await qrService.createQuickReply(payload);
      }
      setShowModal(false);
      loadReplies();
    } catch { setError('Error al guardar'); }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta respuesta rápida?')) return;
    try { await qrService.deleteQuickReply(id); loadReplies(); } catch { }
  }

  // Render file preview inside modal
  function renderMediaPreview() {
    if (!mediaPreviewUrl) return null;
    if (type === 'image') {
      return (
        <div style={{ margin: '10px 0', borderRadius: 8, overflow: 'hidden', border: '2px solid #e0e0e0', maxHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
          <img src={mediaPreviewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }} />
        </div>
      );
    }
    if (type === 'video') {
      return (
        <div style={{ margin: '10px 0' }}>
          <video src={mediaPreviewUrl} controls style={{ width: '100%', maxHeight: 220, borderRadius: 8, border: '2px solid #e0e0e0' }} />
        </div>
      );
    }
    if (type === 'audio') {
      return (
        <div style={{ margin: '10px 0', padding: '12px', background: '#f0fef4', borderRadius: 8, border: '2px solid #c8e6c9', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>🎵</span>
          <audio src={mediaPreviewUrl} controls style={{ flex: 1 }} />
        </div>
      );
    }
    return null;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ color: 'var(--primary-green)', margin: 0 }}>⚡ Respuestas Rápidas</h2>
          <p style={{ color: '#999', margin: '5px 0 0', fontSize: '0.9em' }}>Escribe <strong>/</strong> en el chat para insertar una respuesta rápida</p>
        </div>
        <button className="upload-btn" onClick={openCreate}>➕ Nueva Respuesta</button>
      </div>

      {/* Font size control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', padding: '8px 14px', background: '#f5f5f5', borderRadius: '8px', width: 'fit-content' }}>
        <span style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>🔤 Tamaño:</span>
        <button onClick={() => setFontSize(s => Math.max(10, s - 1))} style={{ width: 28, height: 28, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }} title="Reducir">−</button>
        <span style={{ fontSize: '13px', color: '#333', minWidth: 32, textAlign: 'center', fontWeight: 600 }}>{fontSize}px</span>
        <button onClick={() => setFontSize(s => Math.min(22, s + 1))} style={{ width: 28, height: 28, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }} title="Aumentar">+</button>
        {fontSize !== 14 && <button onClick={() => setFontSize(14)} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Reset</button>}
      </div>

      <div style={{ background: '#e3f2fd', borderLeft: '4px solid #42a5f5', padding: '12px 16px', borderRadius: '0 8px 8px 0', marginBottom: '20px', fontSize: '13px', color: '#1565c0' }}>
        💡 Escribe <code>/</code> seguido del título para filtrar. Las respuestas de <strong>texto</strong> se insertan en el chat para editar. Las <strong>multimedia</strong> abren la vista previa y se envían directamente.
      </div>

      <div style={{ marginBottom: '16px', color: '#777', fontSize: '13px' }}>{replies.length} respuestas</div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div><p>Cargando respuestas...</p></div>
      ) : replies.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '64px', marginBottom: '15px' }}>⚡</div>
          <h3 style={{ color: '#999' }}>No hay respuestas rápidas</h3>
          <p style={{ color: '#999' }}>Crea tu primera respuesta para usarla con <code>/</code> en el chat</p>
          <button className="upload-btn" onClick={openCreate}>➕ Crear primera respuesta</button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="conversations-table">
            <thead><tr>
              <th style={{ width: '8%' }}>Tipo</th>
              <th style={{ width: '17%' }}>Título</th>
              <th style={{ width: '38%' }}>Contenido / Caption</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Activa</th>
              <th style={{ width: '11%' }}>Actualizado</th>
              <th style={{ width: '16%' }}>Acciones</th>
            </tr></thead>
            <tbody style={{ fontSize: `${fontSize}px` }}>
              {replies.map(r => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', fontSize: 20 }} title={TYPE_LABELS[r.type] || 'Texto'}>
                    {TYPE_ICONS[r.type] || TYPE_ICONS.text}
                  </td>
                  <td><strong>{r.title}</strong></td>
                  <td style={{ fontWeight: 600, color: '#333' }}>
                    {r.type && r.type !== 'text'
                      ? (r.content ? truncateText(r.content, 50) : <em style={{ color: '#aaa', fontWeight: 400 }}>Sin caption</em>)
                      : truncateText(r.content, 60)
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.active !== false ? '✅' : '❌'}</td>
                  <td style={{ fontSize: '12px', color: '#444', fontWeight: 600 }}>{formatDate(r.updated_at || r.created_at)}</td>
                  <td>
                    <button className="upload-btn" onClick={() => openEdit(r)} style={{ fontSize: '12px', padding: '4px 10px', marginRight: '6px' }}>✏️ Editar</button>
                    <button className="upload-btn" onClick={() => handleDelete(r.id)} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #f44336, #c62828)' }}>🗑️ Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay active" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '✏️ Editar Respuesta Rápida' : '➕ Nueva Respuesta Rápida'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>

              {/* Title */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>Título (usado para filtrar con /)</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Horario, Precio, Catálogo..." maxLength={80}
                  style={{ width: '100%', padding: '10px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              {/* Type selector */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>Tipo de respuesta</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ALLOWED.map(t => (
                    <button key={t} onClick={() => { setType(t); if (t === 'text') { setMediaUrl(''); setMediaPreviewUrl(''); } }}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: '2px solid',
                        borderColor: type === t ? '#25d366' : '#e0e0e0',
                        background: type === t ? '#f0fef4' : '#fff',
                        color: type === t ? '#1a7a45' : '#555',
                        fontWeight: type === t ? 700 : 400,
                        cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6
                      }}>
                      {TYPE_ICONS[t]} {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content area — changes by type */}
              {type === 'text' ? (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>Contenido (texto que se insertará en el chat)</label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={e => {
                      // Enter = save, Shift+Enter = newline
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                    }}
                    onInput={e => {
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    rows={4}
                    placeholder="Ej: ¡Hola! Nuestro horario es de 8am a 6pm...&#10;Shift+Enter para saltar línea"
                    style={{ width: '100%', padding: '10px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', overflowY: 'auto', minHeight: '100px', maxHeight: '250px' }} />
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: 4 }}>💡 <strong>Shift+Enter</strong> para saltar línea · <strong>Enter</strong> para guardar</div>
                </div>
              ) : (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                    Archivo {TYPE_LABELS[type]} {uploading && <span style={{ color: '#25d366', fontSize: 12 }}>⏳ Subiendo...</span>}
                  </label>

                  {/* Upload button */}
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    padding: '10px 18px', background: uploading ? '#f0f0f0' : '#f0fef4',
                    border: '2px dashed #25d366', borderRadius: 8, color: '#1a7a45', fontWeight: 600,
                    fontSize: 14, marginBottom: mediaPreviewUrl ? 10 : 0
                  }}>
                    📎 {mediaUrl ? 'Cambiar archivo' : `Subir ${TYPE_LABELS[type]}`}
                    <input type="file"
                      accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : type === 'audio' ? 'audio/*' : '*/*'}
                      onChange={handleFileUpload} disabled={uploading}
                      style={{ display: 'none' }} />
                  </label>

                  {/* File preview */}
                  {renderMediaPreview()}

                  {/* Caption — textarea to support newlines (Shift+Enter) */}
                  <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block', marginTop: 10 }}>
                    Caption / Descripción <span style={{ color: '#aaa', fontWeight: 400 }}>(opcional)</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={e => {
                      // Shift+Enter = newline, Enter = save
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                    }}
                    onInput={e => {
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                    }}
                    rows={2}
                    placeholder={`Ej: Nuestro catálogo actualizado 2026\nShift+Enter para saltar línea`}
                    style={{ width: '100%', padding: '10px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', overflowY: 'auto', minHeight: '60px', maxHeight: '200px' }} />
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: 4 }}>💡 <strong>Shift+Enter</strong> para saltar línea · <strong>Enter</strong> para guardar</div>
                </div>
              )}

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                  Respuesta activa (visible en el dropdown del chat)
                </label>
              </div>

              {error && <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px' }}>{error}</div>}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="upload-btn" onClick={handleSave} disabled={uploading} style={{ flex: 1, opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? '⏳ Subiendo...' : '✅ Guardar'}
                </button>
                <button className="upload-btn" onClick={() => setShowModal(false)} style={{ flex: 1, background: '#999' }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
