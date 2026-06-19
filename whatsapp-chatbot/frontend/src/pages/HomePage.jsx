import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiPost, apiFetch } from '../services/api';

export default function HomePage() {
  const { whatsappStatus, qrCode, connectedPhone, connectedName } = useSocket();
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

  async function cerrarSesion() {
    if (!window.confirm('¿Cerrar sesión de WhatsApp?')) return;
    try { await apiFetch('/logout', { method: 'POST' }); } catch { }
  }

  async function limpiarSesion() {
    if (!window.confirm('¿Generar nuevo QR? Esto requiere escanear nuevamente.')) return;
    try { await apiFetch('/clear-session', { method: 'POST' }); } catch { }
  }

  const isConnected = whatsappStatus === 'connected';
  const isWaiting = whatsappStatus === 'waiting';

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

      {/* WhatsApp Status */}
      <div className="status-container" style={{ marginBottom: '20px' }}>
        <div className={`status ${isConnected ? 'connected' : isWaiting ? 'waiting' : 'disconnected'}`}>
          <span className="status-dot"></span>
          <span>{isConnected ? 'Conectado' : isWaiting ? 'Esperando escaneo...' : whatsappStatus === 'authenticating' ? 'Autenticando...' : 'Desconectado'}</span>
        </div>
      </div>

      {/* QR Code / Connected Info */}
      <div className="qr-container" style={{ marginBottom: '20px', textAlign: 'center' }}>
        {isConnected ? (
          <div className="connected-info">
            {/* Phone number badge above checkmark */}
            {connectedPhone && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: '#e8f5e9',
                border: '1.5px solid #4caf50',
                borderRadius: '12px',
                padding: '10px 20px',
                marginBottom: '18px',
                boxShadow: '0 2px 8px rgba(76,175,80,0.1)'
              }}>
                <span style={{ fontSize: '22px' }}>📱</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', color: '#388e3c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Empresa conectada
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#1b5e20', letterSpacing: '1px' }}>
                    +{connectedPhone}
                  </div>
                  <div style={{ fontSize: '12px', color: '#4caf50' }}>{connectedName || 'WhatsApp Business'}</div>
                </div>
              </div>
            )}
            <div className="icon" style={{ fontSize: '48px' }}>✅</div>
            <h3>WhatsApp Conectado!</h3>
            <p>El chatbot está activo.</p>
          </div>
        ) : qrCode ? (
          <>
            <img src={qrCode} alt="Código QR" style={{ maxWidth: '300px' }} />
            <div className="instructions" style={{ marginTop: '15px' }}>
              <h3>📱 Cómo conectar WhatsApp:</h3>
              <ol style={{ textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Ve a <strong>Configuración</strong> → <strong>Dispositivos vinculados</strong></li>
                <li>Toca en <strong>Vincular un dispositivo</strong></li>
                <li>Escanea el código QR de arriba</li>
              </ol>
            </div>
          </>
        ) : (
          <div>
            <div className="spinner"></div>
            <p className="qr-placeholder">{whatsappStatus === 'expired' ? 'Regenerando QR automáticamente...' : 'Cargando...'}</p>
          </div>
        )}
      </div>

      {/* Session Buttons */}
      {isConnected ? (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button className="btn btn-secondary" onClick={cerrarSesion} style={{ flex: 1, minWidth: '200px' }}>
            🔓 Cerrar Sesión Actual
          </button>
          <button className="btn btn-secondary" onClick={limpiarSesion}
            style={{ flex: 1, minWidth: '200px', background: '#ffebee', color: '#c62828' }}>
            🗑️ Nuevo QR Code
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '20px' }}>
          <button className="btn btn-secondary" onClick={limpiarSesion}
            style={{ width: '100%', background: '#ffebee', color: '#c62828' }}>
            🗑️ Generar Nuevo QR Code
          </button>
          <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#666' }}>
            ⚠️ Usa este botón si no aparece el QR o tienes problemas de conexión
          </p>
        </div>
      )}

      {/* Test Chat */}
      {isConnected && (
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
