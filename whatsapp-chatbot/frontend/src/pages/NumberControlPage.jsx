import { useState, useEffect } from 'react';
import * as ncService from '../services/numberControlService';
import { normalizePhoneNumber, formatDate } from '../utils/formatters';

export default function NumberControlPage() {
  // All conversations (for "All Numbers" tab)
  const [conversations, setConversations] = useState([]);
  // Controlled numbers with IA disabled (from number-control endpoint)
  const [controlled, setControlled] = useState([]);
  // Spam blocked numbers
  const [spamBlocked, setSpamBlocked] = useState([]);
  // Stats
  const [ncStats, setNcStats] = useState({});
  const [spamStats, setSpamStats] = useState({});

  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [showUnblockModal, setShowUnblockModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [disableReason, setDisableReason] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addName, setAddName] = useState('');
  const [addReason, setAddReason] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [convData, ncData, spamData] = await Promise.all([
        ncService.getAllConversations(),
        ncService.getNumberControlData(),
        ncService.getActiveSpam()
      ]);

      // Conversations: { conversations: [...], total, hasMore }
      if (convData?.conversations) {
        setConversations(convData.conversations);
      }

      // Number control: { numbers: [...], stats, total }
      if (ncData?.numbers) {
        setControlled(ncData.numbers);
      }
      if (ncData?.stats) {
        setNcStats(ncData.stats);
      }

      // Spam: { blocks: [...], total }
      if (spamData?.blocks) {
        setSpamBlocked(spamData.blocks);
      }
      if (spamData?.stats) {
        setSpamStats(spamData.stats);
      }
    } catch (err) {
      console.error('Error loading number control data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    if (!selectedUserId) return;
    try {
      await ncService.disableIA(selectedUserId, disableReason);
      setShowDisableModal(false);
      setDisableReason('');
      loadData();
    } catch (err) {
      console.error('Error disabling IA:', err);
    }
  }

  async function handleEnable() {
    if (!selectedUserId) return;
    try {
      await ncService.enableIA(selectedUserId);
      setShowEnableModal(false);
      setSelectedUserId('');
      loadData();
    } catch (err) {
      console.error('Error enabling IA:', err);
    }
  }

  async function handleAddNumber() {
    if (!addPhone.trim()) return;
    try {
      await ncService.addNumber(addPhone, addName, addReason);
      setShowAddModal(false);
      setAddPhone('');
      setAddName('');
      setAddReason('');
      loadData();
    } catch (err) {
      console.error('Error adding number:', err);
    }
  }

  async function handleUnblockSpam() {
    if (!selectedUserId) return;
    try {
      await ncService.unblockSpam(selectedUserId);
      setShowUnblockModal(false);
      setSelectedUserId('');
      loadData();
    } catch (err) {
      console.error('Error unblocking spam:', err);
    }
  }

  // Computed values
  const iaDisabledCount = controlled.filter(n => n.iaActive === false).length;
  const iaActiveCount = conversations.length - iaDisabledCount;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--primary-green)', margin: 0 }}>🔢 Control de Números</h2>
        <p style={{ color: '#999', margin: '5px 0 0', fontSize: '0.9em' }}>Gestiona los números a los que la IA NO debe responder automáticamente</p>
      </div>

      {/* Stats */}
      <div className="stats-cards" style={{ marginBottom: '20px' }}>
        <div className="stat-card"><div className="stat-number">{conversations.length}</div><div className="stat-label">Total Conversaciones</div></div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ffebee, #ffcdd2)' }}><div className="stat-number">{iaDisabledCount}</div><div className="stat-label">🔴 IA Desactivada</div></div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)' }}><div className="stat-number">{iaActiveCount}</div><div className="stat-label">🟢 IA Activa</div></div>
      </div>

      {/* Info */}
      <div style={{ background: '#fff3e0', borderLeft: '4px solid #ff9800', padding: '15px', marginBottom: '20px', borderRadius: '0 8px 8px 0' }}>
        <strong>⚠️ Importante:</strong>
        <ul style={{ margin: '10px 0 0', paddingLeft: '20px' }}>
          <li>Los números con IA desactivada <strong>pueden seguir escribiendo</strong> mensajes.</li>
          <li>Solo se desactiva la <strong>respuesta automática de la IA</strong>.</li>
          <li>Los asesores pueden ver y responder manualmente desde "Conversaciones".</li>
        </ul>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          {[{ key: 'all', label: '📋 Todos los Números' }, { key: 'disabled', label: `🔴 IA Desactivada (${iaDisabledCount})` }, { key: 'spam', label: `🚫 Spam (${spamBlocked.length})` }].map(tab => (
            <button key={tab.key} className={`conv-filter-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
          ))}
        </div>
        <button className="upload-btn" onClick={() => setShowAddModal(true)}>➕ Agregar Número</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div><p>Cargando números...</p></div>
      ) : (
        <>
          {/* All Numbers Tab */}
          {activeTab === 'all' && (conversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}><div style={{ fontSize: '64px' }}>📱</div><h3 style={{ color: '#999' }}>No hay conversaciones aún</h3></div>
          ) : (
            <div className="table-responsive"><table className="conversations-table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Última Interacción</th><th>Estado IA</th><th>Acción</th></tr></thead><tbody>
              {conversations.map(c => (
                <tr key={c.userId || c.phoneNumber}>
                  <td>{c.registeredName || c.whatsappName || c.pushName || 'Sin nombre'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{normalizePhoneNumber(c.phoneNumber || c.userId)}</td>
                  <td>{formatDate(c.lastInteraction || c.lastActivity)}</td>
                  <td>{c.iaActive === false ? '🔴 Desactivada' : '🟢 Activa'}</td>
                  <td>{c.iaActive === false ? (
                    <button className="upload-btn" onClick={() => { setSelectedUserId(c.phoneNumber || c.userId); setShowEnableModal(true); }} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #4caf50, #2e7d32)' }}>🟢 Activar IA</button>
                  ) : (
                    <button className="upload-btn" onClick={() => { setSelectedUserId(c.phoneNumber || c.userId); setShowDisableModal(true); }} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #f44336, #c62828)' }}>🔴 Desactivar IA</button>
                  )}</td>
                </tr>
              ))}
            </tbody></table></div>
          ))}

          {/* Disabled Tab */}
          {activeTab === 'disabled' && (controlled.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}><div style={{ fontSize: '64px' }}>✅</div><h3 style={{ color: '#999' }}>No hay números con IA desactivada</h3></div>
          ) : (
            <div className="table-responsive"><table className="conversations-table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Fecha</th><th>Motivo</th><th>Acción</th></tr></thead><tbody>
              {controlled.map(c => (
                <tr key={c.phoneNumber}>
                  <td>{c.displayName || c.name || c.whatsappName || 'Sin nombre'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{normalizePhoneNumber(c.phoneNumber)}</td>
                  <td>{formatDate(c.registeredAt || c.updatedAt)}</td>
                  <td>{c.reason || '-'}</td>
                  <td><button className="upload-btn" onClick={() => { setSelectedUserId(c.phoneNumber); setShowEnableModal(true); }} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #4caf50, #2e7d32)' }}>🟢 Reactivar IA</button></td>
                </tr>
              ))}
            </tbody></table></div>
          ))}

          {/* Spam Tab */}
          {activeTab === 'spam' && (spamBlocked.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}><div style={{ fontSize: '64px' }}>✅</div><h3 style={{ color: '#999' }}>No hay bloqueos por spam</h3></div>
          ) : (
            <div className="table-responsive"><table className="conversations-table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Fecha</th><th>Motivo</th><th>Repeticiones</th><th>Acción</th></tr></thead><tbody>
              {spamBlocked.map(c => (
                <tr key={c.phoneNumber || c.userId}>
                  <td>{c.name || 'Sin nombre'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{normalizePhoneNumber(c.phoneNumber || c.userId)}</td>
                  <td>{c.blockedAtFormatted || formatDate(c.blockedAt)}</td>
                  <td>{c.reason || 'Spam detectado'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#c62828' }}>{c.consecutiveCount || '-'}</td>
                  <td><button className="upload-btn" onClick={() => { setSelectedUserId(c.phoneNumber || c.userId); setShowUnblockModal(true); }} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #4caf50, #2e7d32)' }}>✅ Desbloquear</button></td>
                </tr>
              ))}
            </tbody></table></div>
          ))}
        </>
      )}

      {/* Disable IA Modal */}
      {showDisableModal && (
        <div className="modal-overlay active" onClick={() => setShowDisableModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header"><h3 className="modal-title">🔴 Desactivar IA</h3><button className="modal-close" onClick={() => setShowDisableModal(false)}>&times;</button></div>
            <div style={{ padding: '20px' }}>
              <p style={{ color: '#666', marginBottom: '15px' }}>La IA dejará de responder automáticamente a este número.</p>
              <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}><strong>Número:</strong> <span style={{ fontFamily: 'monospace' }}>{normalizePhoneNumber(selectedUserId)}</span></div>
              <label>📝 Motivo (opcional)</label>
              <textarea value={disableReason} onChange={(e) => setDisableReason(e.target.value)} rows={3} placeholder="Ej: Cliente VIP, Requiere atención especial..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '10px', marginTop: '8px', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="upload-btn" onClick={() => setShowDisableModal(false)} style={{ flex: 1, background: '#999' }}>Cancelar</button>
                <button className="upload-btn" onClick={handleDisable} style={{ flex: 1, background: 'linear-gradient(135deg, #c62828, #b71c1c)' }}>🔴 Desactivar IA</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Number Modal */}
      {showAddModal && (
        <div className="modal-overlay active" onClick={() => setShowAddModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header"><h3 className="modal-title">➕ Agregar Número Manualmente</h3><button className="modal-close" onClick={() => setShowAddModal(false)}>&times;</button></div>
            <div style={{ padding: '20px' }}>
              <label>📱 Teléfono <span style={{ color: '#c62828' }}>*</span></label>
              <input type="text" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="Ej: 3001234567 (sin código de país)"
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '10px', fontFamily: 'monospace', marginTop: '8px', marginBottom: '15px', boxSizing: 'border-box' }} />
              <label>👤 Nombre (opcional)</label>
              <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Ej: Juan Pérez"
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '10px', marginTop: '8px', marginBottom: '15px', boxSizing: 'border-box' }} />
              <label>📝 Motivo (opcional)</label>
              <textarea value={addReason} onChange={(e) => setAddReason(e.target.value)} rows={2} placeholder="Ej: Cliente VIP..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '10px', marginTop: '8px', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="upload-btn" onClick={() => setShowAddModal(false)} style={{ flex: 1, background: '#999' }}>Cancelar</button>
                <button className="upload-btn" onClick={handleAddNumber} style={{ flex: 1 }}>➕ Agregar y Desactivar IA</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enable IA Modal */}
      {showEnableModal && (
        <div className="modal-overlay active" onClick={() => setShowEnableModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header"><h3 className="modal-title">🟢 Reactivar IA</h3><button className="modal-close" onClick={() => setShowEnableModal(false)}>&times;</button></div>
            <div style={{ padding: '20px' }}>
              <p style={{ color: '#666', marginBottom: '15px' }}>La IA volverá a responder automáticamente a este número.</p>
              <div style={{ background: '#e8f5e9', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}><strong>Número:</strong> <span style={{ fontFamily: 'monospace' }}>{normalizePhoneNumber(selectedUserId)}</span></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="upload-btn" onClick={() => setShowEnableModal(false)} style={{ flex: 1, background: '#999' }}>Cancelar</button>
                <button className="upload-btn" onClick={handleEnable} style={{ flex: 1, background: 'linear-gradient(135deg, #4caf50, #2e7d32)' }}>🟢 Reactivar IA</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unblock Spam Modal */}
      {showUnblockModal && (
        <div className="modal-overlay active" onClick={() => setShowUnblockModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header"><h3 className="modal-title">✅ Desbloquear Spam</h3><button className="modal-close" onClick={() => setShowUnblockModal(false)}>&times;</button></div>
            <div style={{ padding: '20px' }}>
              <p style={{ color: '#666', marginBottom: '15px' }}>Este número será desbloqueado y la IA volverá a responder.</p>
              <div style={{ background: '#e8f5e9', padding: '12px', borderRadius: '8px', marginBottom: '15px' }}><strong>Número:</strong> <span style={{ fontFamily: 'monospace' }}>{normalizePhoneNumber(selectedUserId)}</span></div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="upload-btn" onClick={() => setShowUnblockModal(false)} style={{ flex: 1, background: '#999' }}>Cancelar</button>
                <button className="upload-btn" onClick={handleUnblockSpam} style={{ flex: 1, background: 'linear-gradient(135deg, #4caf50, #2e7d32)' }}>✅ Desbloquear</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
