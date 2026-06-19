import { useState, useEffect } from 'react';
import * as settingsService from '../services/settingsService';

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('api-keys');

  // Form states
  const [groqKey, setGroqKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [groqModel, setGroqModel] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [activeProvider, setActiveProvider] = useState('');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await settingsService.getSettings();
      if (data) {
        setSettings(data);
        setGroqKey(data.groqApiKey || '');
        setOpenaiKey(data.openaiApiKey || '');
        setGroqModel(data.groqModel || 'llama-3.3-70b-versatile');
        setOpenaiModel(data.openaiModel || 'gpt-4o-mini');
        setActiveProvider(data.activeProvider || 'groq');
        setAwsAccessKey(data.awsAccessKeyId || '');
        setAwsSecretKey(data.awsSecretAccessKey || '');
        setAwsRegion(data.awsRegion || 'us-east-1');
      }
    } catch { } finally { setLoading(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await settingsService.saveSettings({
        groqApiKey: groqKey,
        openaiApiKey: openaiKey,
        groqModel,
        openaiModel,
        activeProvider,
        awsAccessKeyId: awsAccessKey,
        awsSecretAccessKey: awsSecretKey,
        awsRegion,
      });
      setTestResult({ success: true, message: '✅ Configuración guardada correctamente' });
      setTimeout(() => setTestResult(null), 3000);
    } catch {
      setTestResult({ success: false, message: '❌ Error al guardar configuración' });
    } finally { setSaving(false); }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await settingsService.testConnection({
        groqApiKey: groqKey,
        openaiApiKey: openaiKey,
        activeProvider,
      });
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: '❌ Error de conexión' });
    } finally { setTesting(false); }
  }

  async function handleDeleteKey(provider) {
    if (!window.confirm(`¿Eliminar la API Key de ${provider}?`)) return;
    try {
      await settingsService.deleteApiKey(provider);
      if (provider === 'groq') setGroqKey('');
      if (provider === 'openai') setOpenaiKey('');
      loadSettings();
    } catch { }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div><p>Cargando configuración...</p></div>;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--primary-green)', margin: 0 }}>⚙️ Configuración</h2>
        <p style={{ color: '#999', margin: '5px 0 0', fontSize: '0.9em' }}>Configura las API keys, modelos de IA y credenciales AWS</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
        {[{ key: 'api-keys', label: '🔑 API Keys' }, { key: 'ai-provider', label: '🤖 Proveedor IA' }, { key: 'aws', label: '☁️ AWS' }].map(tab => (
          <button key={tab.key} className={`conv-filter-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      {testResult && (
        <div style={{ background: testResult.success ? '#e8f5e9' : '#ffebee', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', color: testResult.success ? '#2e7d32' : '#c62828' }}>
          {testResult.message}
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <div>
          <div style={{ background: '#fff3e0', borderLeft: '4px solid #ff9800', padding: '15px', borderRadius: '0 8px 8px 0', marginBottom: '20px', fontSize: '14px' }}>
            💡 <strong>Importante:</strong> Necesitas al menos una API key configurada para que el chatbot funcione. Se recomienda tener ambas como respaldo.
          </div>

          {/* Groq */}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>🟠 Groq API Key</h3>
              {groqKey && <button className="upload-btn" onClick={() => handleDeleteKey('groq')} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #f44336, #c62828)' }}>🗑️ Eliminar</button>}
            </div>
            <input type="password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} placeholder="gsk_..."
              style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: '10px' }} />
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Modelo:</label>
            <select value={groqModel} onChange={(e) => setGroqModel(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }}>
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
              <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
              <option value="gemma2-9b-it">gemma2-9b-it</option>
            </select>
          </div>

          {/* OpenAI */}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>🟢 OpenAI API Key</h3>
              {openaiKey && <button className="upload-btn" onClick={() => handleDeleteKey('openai')} style={{ fontSize: '12px', padding: '4px 10px', background: 'linear-gradient(135deg, #f44336, #c62828)' }}>🗑️ Eliminar</button>}
            </div>
            <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..."
              style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: '10px' }} />
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Modelo:</label>
            <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }}>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </select>
          </div>
        </div>
      )}

      {/* AI Provider Tab */}
      {activeTab === 'ai-provider' && (
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>🤖 Proveedor Activo</h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>Selecciona cuál proveedor de IA usará el chatbot para generar respuestas.</p>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            {[{ key: 'groq', label: '🟠 Groq', desc: 'Rápido y gratuito' }, { key: 'openai', label: '🟢 OpenAI', desc: 'Más preciso' }].map(p => (
              <div key={p.key} onClick={() => setActiveProvider(p.key)}
                style={{
                  flex: 1, minWidth: '200px', padding: '20px', border: activeProvider === p.key ? '3px solid var(--primary-green)' : '2px solid #e0e0e0',
                  borderRadius: '12px', cursor: 'pointer', textAlign: 'center', background: activeProvider === p.key ? '#e8f5e9' : 'white',
                  transition: 'all 0.2s',
                }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>{p.label.split(' ')[0]}</div>
                <h4 style={{ margin: '0 0 5px' }}>{p.label.split(' ').slice(1).join(' ')}</h4>
                <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>{p.desc}</p>
                {activeProvider === p.key && <div style={{ color: 'var(--primary-green)', fontWeight: 700, marginTop: '10px' }}>✅ Activo</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AWS Tab */}
      {activeTab === 'aws' && (
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>☁️ Credenciales AWS</h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>Configuración de AWS para DynamoDB y S3.</p>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', padding: '20px' }}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>Region</label>
              <select value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)}
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }}>
                {['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'sa-east-1'].map(r =>
                  <option key={r} value={r}>{r}</option>
                )}
              </select>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>Access Key ID</label>
              <input type="password" value={awsAccessKey} onChange={(e) => setAwsAccessKey(e.target.value)} placeholder="AKIA..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontWeight: 500, marginBottom: '6px', display: 'block' }}>Secret Access Key</label>
              <input type="password" value={awsSecretKey} onChange={(e) => setAwsSecretKey(e.target.value)} placeholder="Tu secret key..."
                style={{ width: '100%', padding: '12px', border: '2px solid #e0e0e0', borderRadius: '8px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #e0e0e0' }}>
        <button className="upload-btn" onClick={handleSave} disabled={saving}
          style={{ flex: 1, background: 'linear-gradient(135deg, #4caf50, #2e7d32)', padding: '14px' }}>
          {saving ? '⏳ Guardando...' : '💾 Guardar Configuración'}
        </button>
        <button className="upload-btn" onClick={handleTestConnection} disabled={testing}
          style={{ flex: 1, background: 'linear-gradient(135deg, #42a5f5, #1565c0)', padding: '14px' }}>
          {testing ? '⏳ Probando...' : '🔌 Probar Conexión'}
        </button>
      </div>
    </div>
  );
}
