import { useState, useEffect } from 'react';
import * as aiRulesService from '../services/aiRulesService';
import { formatDate } from '../utils/formatters';

export default function AIRulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  // Form state
  const [content, setContent] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    setLoading(true);
    try {
      const data = await aiRulesService.getRules();
      const list = data?.rules || [];
      // Sort newest first
      const sorted = [...list].sort((a, b) => {
        const tA = new Date(a.updated_at || a.created_at || 0).getTime();
        const tB = new Date(b.updated_at || b.created_at || 0).getTime();
        return tB - tA;
      });
      setRules(sorted);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  function resetForm() {
    setContent(''); setActive(true); setError(''); setSaving(false);
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setShowModal(true);
  }

  function openEdit(rule) {
    setEditing(rule);
    setContent(rule.content);
    setActive(rule.active !== false);
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!content.trim()) { setError('El contenido de la regla es requerido'); return; }

    setSaving(true);
    try {
      if (editing) {
        await aiRulesService.updateRule(editing.id, { content, active });
      } else {
        await aiRulesService.createRule({ content, active });
      }
      setShowModal(false);
      loadRules();
    } catch { setError('Error al guardar'); } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta regla?')) return;
    try { await aiRulesService.deleteRule(id); loadRules(); } catch { /* ignore */ }
  }

  async function handleToggle(rule) {
    try {
      await aiRulesService.toggleRule(rule.id, !rule.active);
      loadRules();
    } catch { /* ignore */ }
  }

  const activeCount = rules.filter(r => r.active).length;

  // Example rules for empty state - constructora context
  const EXAMPLES = [
    'Siempre presenta el proyecto como el único VIP en Tunja',
    'Toda conversación debe terminar ofreciendo agendar una visita',
    'Si preguntan precio, menciona también la cuota de separación de $2.500.000',
    'Cuando el cliente dude, menciona el Subsidio Ecovivienda de $10.258.620',
    'Usa el nombre del cliente para dar un trato personalizado',
    'Nunca inventes información; si no sabes, ofrece agendar una cita',
  ];

  return (
    <div translate="no">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ color: 'var(--primary-green)', margin: 0 }}>🤖 Reglas IA</h2>
          <p style={{ color: '#999', margin: '5px 0 0', fontSize: '0.9em' }}>
            Define cómo se comunica la IA — estas reglas moldean el tono, formato y estilo de las respuestas
          </p>
        </div>
        <button className="upload-btn" onClick={openCreate}>➕ Nueva Regla</button>
      </div>

      {/* Info banner */}
      <div style={{ background: '#e8f5e9', borderLeft: '4px solid #43a047', padding: '12px 16px', borderRadius: '0 8px 8px 0', marginBottom: '20px', fontSize: '13px', color: '#1b5e20' }}>
        🏗️ Las reglas definen <strong>cómo</strong> responde la IA como asesora de Bellavista II.
        Cada regla debe orientar la conversación hacia el <strong>agendamiento de una cita o visita al proyecto</strong>.
        Solo las reglas <strong>activas</strong> se aplican en tiempo real.
      </div>

      {/* Active count */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
          background: activeCount > 0 ? '#e8f5e9' : '#f5f5f5',
          color: activeCount > 0 ? '#2e7d32' : '#999'
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeCount > 0 ? '#4caf50' : '#ccc', display: 'inline-block' }}></span>
          {activeCount} regla{activeCount !== 1 ? 's' : ''} activa{activeCount !== 1 ? 's' : ''}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', borderRadius: '20px', fontSize: '13px',
          background: '#f5f5f5', color: '#666'
        }}>
          📋 {rules.length} total
        </div>
      </div>

      {/* Rules list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div><p>Cargando reglas...</p></div>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '64px', marginBottom: '15px' }}>🤖</div>
          <h3 style={{ color: '#999', marginBottom: '8px' }}>No hay reglas configuradas</h3>
          <p style={{ color: '#999', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
            Crea reglas para personalizar cómo la IA responde a los usuarios. Ejemplos:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '24px', maxWidth: '600px', margin: '0 auto 24px' }}>
            {EXAMPLES.map((ex, i) => (
              <span key={i} style={{
                padding: '6px 12px', borderRadius: '16px', fontSize: '12px',
                background: '#f0f4f8', color: '#555', border: '1px solid #e0e0e0',
              }}>"{ex}"</span>
            ))}
          </div>
          <button className="upload-btn" onClick={openCreate}>➕ Crear primera regla</button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="conversations-table">
            <thead><tr>
              <th style={{ width: '6%', textAlign: 'center' }}>Estado</th>
              <th style={{ width: '52%' }}>Regla</th>
              <th style={{ width: '16%' }}>Actualizado</th>
              <th style={{ width: '26%' }}>Acciones</th>
            </tr></thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} style={{ opacity: rule.active ? 1 : 0.55 }}>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => handleToggle(rule)}
                      title={rule.active ? 'Desactivar regla' : 'Activar regla'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '20px', lineHeight: 1, padding: '4px',
                        transition: 'transform 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {rule.active ? '✅' : '⬜'}
                    </button>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: rule.active ? '#333' : '#999', lineHeight: 1.4 }}>
                      {rule.content}
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', color: '#444', fontWeight: 600 }}>
                    {formatDate(rule.updated_at || rule.created_at)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button className="upload-btn" onClick={() => openEdit(rule)} style={{ fontSize: '12px', padding: '4px 10px' }}>
                        ✏️ Editar
                      </button>
                      <button className="upload-btn" onClick={() => handleToggle(rule)} style={{
                        fontSize: '12px', padding: '4px 10px',
                        background: rule.active
                          ? 'linear-gradient(135deg, #ff9800, #e65100)'
                          : 'linear-gradient(135deg, #4caf50, #2e7d32)'
                      }}>
                        {rule.active ? '⏸ Desactivar' : '▶ Activar'}
                      </button>
                      <button className="upload-btn" onClick={() => handleDelete(rule.id)} style={{
                        fontSize: '12px', padding: '4px 10px',
                        background: 'linear-gradient(135deg, #f44336, #c62828)'
                      }}>
                        🗑️ Eliminar
                      </button>
                    </div>
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
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '✏️ Editar Regla IA' : '➕ Nueva Regla IA'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>
              {/* Content */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>
                  Contenido de la regla
                </label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                  }}
                  onInput={e => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  rows={3}
                  placeholder="Ej: Siempre responde en español y con tono profesional"
                  autoFocus
                  style={{
                    width: '100%', padding: '12px', border: '2px solid #e0e0e0',
                    borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit',
                    resize: 'vertical', overflowY: 'auto', minHeight: '80px', maxHeight: '200px',
                    fontSize: '14px', lineHeight: 1.5,
                  }}
                />
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: 4 }}>
                  💡 <strong>Enter</strong> para guardar · <strong>Shift+Enter</strong> para saltar línea
                </div>
              </div>

              {/* Examples (only in create mode) */}
              {!editing && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block', fontSize: '13px', color: '#666' }}>
                    💡 Ejemplos (click para usar):
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {EXAMPLES.map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => setContent(ex)}
                        style={{
                          padding: '5px 10px', borderRadius: '14px', fontSize: '11px',
                          background: content === ex ? '#e8f5e9' : '#f5f5f5',
                          color: content === ex ? '#2e7d32' : '#666',
                          border: content === ex ? '1px solid #a5d6a7' : '1px solid #e0e0e0',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                  Regla activa (se aplica inmediatamente a las respuestas de la IA)
                </label>
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="upload-btn" onClick={handleSave} disabled={saving} style={{ flex: 1, opacity: saving ? 0.6 : 1 }}>
                  {saving ? '⏳ Guardando...' : '✅ Guardar'}
                </button>
                <button className="upload-btn" onClick={() => setShowModal(false)} style={{ flex: 1, background: '#999' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
