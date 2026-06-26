import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiPost, apiFetch } from '../services/api';

// ===========================================
// SESSION CARD COMPONENT
// ===========================================
function SessionCard({ sessionId, label, sessionData, onLogout, onClear }) {
  const { status, qr, phone, name } = sessionData;
  const isConnected = status === 'connected';
  const isWaiting = status === 'waiting';

  return (
    <div style={{
      flex: '1 1 380px',
      minWidth: '320px',
      background: 'var(--card-bg, #fff)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      border: isConnected ? '2px solid #4caf50' : '2px solid transparent',
      transition: 'border-color 0.3s ease',
    }}>
      {/* Session Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1em', color: 'var(--text-primary, #333)' }}>
          {label}
        </h3>
        <div className={`status ${isConnected ? 'connected' : isWaiting ? 'waiting' : 'disconnected'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85em' }}>
          <span className="status-dot"></span>
          <span>
            {isConnected ? 'Conectado' :
              isWaiting ? 'Esperando escaneo...' :
                status === 'authenticating' ? 'Autenticando...' :
                  status === 'expired' ? 'Expirado' :
                    'Desconectado'}
          </span>
        </div>
      </div>

      {/* QR / Connected Info */}
      <div style={{ textAlign: 'center', minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {isConnected ? (
          <div className="connected-info">
            {phone && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: '#e8f5e9',
                border: '1.5px solid #4caf50',
                borderRadius: '12px',
                padding: '10px 20px',
                marginBottom: '12px',
                boxShadow: '0 2px 8px rgba(76,175,80,0.1)'
              }}>
                <span style={{ fontSize: '22px' }}>📱</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', color: '#388e3c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Empresa conectada
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1b5e20', letterSpacing: '1px' }}>
                    +{phone}
                  </div>
                  <div style={{ fontSize: '12px', color: '#4caf50' }}>{name || 'WhatsApp Business'}</div>
                </div>
              </div>
            )}
            <div style={{ fontSize: '36px', marginTop: '8px' }}>✅</div>
            <p style={{ margin: '8px 0 0', color: '#4caf50', fontWeight: 600 }}>WhatsApp Conectado</p>
          </div>
        ) : qr ? (
          <>
            <img src={qr} alt={`QR ${label}`} style={{ maxWidth: '250px', borderRadius: '8px' }} />
            <div style={{ marginTop: '12px', fontSize: '0.85em', color: '#666' }}>
              <p style={{ margin: '4px 0' }}>📱 Escanea con WhatsApp</p>
              <p style={{ margin: '4px 0', fontSize: '0.8em' }}>Configuración → Dispositivos vinculados</p>
            </div>
          </>
        ) : (
          <div>
            <div className="spinner"></div>
            <p className="qr-placeholder" style={{ fontSize: '0.9em' }}>
              {status === 'expired' ? 'Regenerando QR...' : 'Cargando...'}
            </p>
          </div>
        )}
      </div>

      {/* Session Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        {isConnected ? (
          <>
            <button className="btn btn-secondary" onClick={() => onLogout(sessionId)}
              style={{ flex: 1, minWidth: '120px', fontSize: '0.85em', padding: '8px 12px' }}>
              🔓 Cerrar Sesión
            </button>
            <button className="btn btn-secondary" onClick={() => onClear(sessionId)}
              style={{ flex: 1, minWidth: '120px', fontSize: '0.85em', padding: '8px 12px', background: '#ffebee', color: '#c62828' }}>
              🗑️ Nuevo QR
            </button>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={() => onClear(sessionId)}
            style={{ width: '100%', fontSize: '0.85em', padding: '8px 12px', background: '#ffebee', color: '#c62828' }}>
            🗑️ Generar Nuevo QR
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================
// HOME PAGE
// ===========================================
export default function HomePage() {
  const { sessions, whatsappStatus, connectedPhone, connectedName } = useSocket();
  const [testMessage, setTestMessage] = useState('');
  const [chatTest, setChatTest] = useState([]);

  async function testChat() {
    if (!testMessage.trim()) return;
    setChatTest(prev => [...prev, { text: testMessage, type: 'user' }]);
    const msg = testMessage;
    setTestMessage('');

    try {
      const data = await apiPost('/api/test-chat', { message: msg });
      setChatTest(prev => [...prev, { text: data.response, type: 'bot' }]);
    } catch (error) {
      setChatTest(prev => [...prev, { text: 'Error: ' + error.message, type: 'bot' }]);
    }
  }

  async function cerrarSesion(sessionId) {
    if (!window.confirm(`¿Cerrar sesión de WhatsApp (${sessionId})?`)) return;
    try {
      await apiFetch('/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch { }
  }

  async function limpiarSesion(sessionId) {
    if (!window.confirm(`¿Generar nuevo QR para ${sessionId}? Esto requiere escanear nuevamente.`)) return;
    try {
      await apiFetch('/clear-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch { }
  }

  // Check if any session is connected (for test chat)
  const anyConnected = Object.values(sessions).some(s => s.status === 'connected');

  return (
    <div className="container">
      <div className="header" style={{ marginBottom: '20px' }}>
        <div className="header-left">
          <img src="/LOGO.jpeg" alt="NORBOY Logo" className="logo" style={{ width: 50, height: 50, objectFit: 'contain' }} />
          <div className="header-title">
            <h1 style={{ margin: 0, fontSize: '1.4em' }}>NORBOY Chatbot</h1>
            <p style={{ margin: 0, fontSize: '0.85em', color: '#666' }}>Elegimos Juntos 2026-2029</p>
          </div>
        </div>
      </div>

      {/* Multi-Session Cards */}
      <div style={{
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        marginBottom: '24px',
      }}>
        <SessionCard
          sessionId="session1"
          label="📱 Sesión 1 — Principal"
          sessionData={sessions.session1 || { status: 'disconnected', qr: null, phone: null, name: null }}
          onLogout={cerrarSesion}
          onClear={limpiarSesion}
        />
        <SessionCard
          sessionId="session2"
          label="📱 Sesión 2 — Secundaria"
          sessionData={sessions.session2 || { status: 'disconnected', qr: null, phone: null, name: null }}
          onLogout={cerrarSesion}
          onClear={limpiarSesion}
        />
      </div>

      {/* Connection Instructions (only show if neither session is connected) */}
      {!anyConnected && (
        <div style={{
          background: '#f5f5f5',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px',
          textAlign: 'left',
          maxWidth: '600px',
          margin: '0 auto 20px'
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1em' }}>📱 Cómo conectar WhatsApp:</h3>
          <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
            <li>Abre WhatsApp en tu teléfono</li>
            <li>Ve a <strong>Configuración</strong> → <strong>Dispositivos vinculados</strong></li>
            <li>Toca en <strong>Vincular un dispositivo</strong></li>
            <li>Escanea el código QR de la sesión correspondiente</li>
          </ol>
          <p style={{ margin: '12px 0 0', fontSize: '0.85em', color: '#666' }}>
            💡 Cada sesión requiere un celular diferente con WhatsApp instalado.
          </p>
        </div>
      )}

      {/* Test Chat */}
      {anyConnected && (
        <div className="test-section" style={{ marginTop: '20px' }}>
          <h3>🧪 Probar Chatbot</h3>
          <div className="test-input" style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Escribe un mensaje..."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && testChat()}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
            />
            <button onClick={testChat} className="btn" style={{ whiteSpace: 'nowrap' }}>Enviar</button>
          </div>
          {chatTest.length > 0 && (
            <div className="chat-test active" style={{ marginTop: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {chatTest.map((msg, i) => (
                <div key={i} className={`message ${msg.type}`}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    marginBottom: '6px',
                    maxWidth: '80%',
                    marginLeft: msg.type === 'user' ? 'auto' : '0',
                    background: msg.type === 'user' ? '#dcf8c6' : '#f0f0f0',
                  }}>
                  {msg.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
