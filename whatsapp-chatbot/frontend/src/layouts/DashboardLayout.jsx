import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import * as agentConfigService from '../services/agentConfigService';
import '../styles/dashboard.css';

const NAV_ITEMS = [
  { to: '/', icon: '🏠', label: 'Inicio' },
  { to: '/conversations', icon: '💬', label: 'Conversaciones', hasBadge: true },
  { section: 'Herramientas' },
  { to: '/welcome', icon: '👋', label: 'Bienvenida', badge: 'Nuevo' },
  { to: '/quick-replies', icon: '⚡', label: 'Respuestas Rápidas' },
  { to: '/documents', icon: '📁', label: 'Documentos' },
  { to: '/number-control', icon: '🔢', label: 'Control de Números' },
  { to: '/holidays', icon: '📅', label: 'Días Festivos' },
  { to: '/statistics', icon: '📊', label: 'Estadísticas' },
  { to: '/settings', icon: '⚙️', label: 'Configuración' },
  { to: '/statuses', icon: '🔵', label: 'Estados', badge: 'Nuevo' },
  { to: '/ai-rules', icon: '🤖', label: 'Reglas IA', badge: 'Nuevo' },
  { section: 'Marketing' },
  { to: '/bulk-messages', icon: '📢', label: 'Mensajes Masivos', badge: 'Nuevo' },
];

const VIEW_NAMES = {
  '/': 'Inicio',
  '/conversations': 'Conversaciones',
  '/chat': 'Chat',
  '/documents': 'Documentos',
  '/number-control': 'Control de Números',
  '/holidays': 'Días Festivos',
  '/quick-replies': 'Respuestas Rápidas',
  '/welcome': 'Bienvenida',
  '/statistics': 'Estadísticas',
  '/settings': 'Configuración',
  '/statuses': 'Estados',
  '/ai-rules': 'Reglas IA',
  '/bulk-messages': 'Mensajes Masivos',
};

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const { whatsappStatus } = useSocket();
  const { darkMode, toggleTheme } = useTheme();
  const location = useLocation();
  const [clockTime, setClockTime] = useState('');
  const [clockSeconds, setClockSeconds] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Agent profile state
  const [profileOpen, setProfileOpen] = useState(false);
  const [editMode, setEditMode] = useState(null); // 'name' | 'color' | null
  const [displayName, setDisplayName] = useState(null);
  const [agentColor, setAgentColor] = useState(null);
  const [editInput, setEditInput] = useState('');
  const profileRef = useRef(null);

  const username = user?.username || 'admin';
  const currentViewName = VIEW_NAMES[location.pathname] || 'Inicio';

  // Load agent config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const data = await agentConfigService.getMyConfig();
        if (data?.success && data.config) {
          setDisplayName(data.config.display_name || null);
          setAgentColor(data.config.color || null);
        }
      } catch { /* ignore */ }
    }
    loadConfig();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
        setEditMode(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clock
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      const s = now.getSeconds().toString().padStart(2, '0');
      setClockTime(`${h}:${m}`);
      setClockSeconds(`:${s}`);
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleSaveName = async () => {
    const name = editInput.trim();
    try {
      const data = await agentConfigService.updateMyConfig({ display_name: name || null });
      if (data?.success) {
        setDisplayName(data.config.display_name || null);
        setEditMode(null);
      }
    } catch { /* ignore */ }
  };

  const handleSelectColor = async (color) => {
    try {
      const data = await agentConfigService.updateMyConfig({ color });
      if (data?.success) {
        setAgentColor(data.config.color || null);
        setEditMode(null);
      }
    } catch { /* ignore */ }
  };

  const handleReset = async () => {
    try {
      const data = await agentConfigService.resetMyConfig();
      if (data?.success) {
        setDisplayName(null);
        setAgentColor(null);
        setProfileOpen(false);
      }
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    if (window.confirm('¿Cerrar sesión?')) logout();
  };

  const visibleName = displayName || username;

  const statusClass = whatsappStatus === 'connected' ? 'connected' :
    whatsappStatus === 'waiting' ? 'waiting' : 'disconnected';
  const statusText = whatsappStatus === 'connected' ? 'Conectado' :
    whatsappStatus === 'waiting' ? 'Esperando escaneo...' :
    whatsappStatus === 'authenticating' ? 'Autenticando...' :
    whatsappStatus === 'expired' ? 'Sesión expirada' : 'Desconectado';

  return (
    <div className="dashboard-wrapper">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="sidebar-overlay active" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/LOGO.jpeg" alt="NORBOY Logo" style={{ maxWidth: '80px', height: 'auto', marginBottom: '6px' }} />
          <div className="sidebar-logo-text">NORBOY</div>
          <div className="sidebar-logo-subtitle">Chatbot WhatsApp</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item, idx) =>
            item.section ? (
              <div key={idx} className="nav-section-title">{item.section}</div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="nav-item-icon">{item.icon}</span>
                <span className="nav-item-text">{item.label}</span>
                {item.badge && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    background: 'linear-gradient(135deg, #25d366, #128c7e)',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '20px',
                    lineHeight: 1.4,
                    flexShrink: 0,
                  }}>{item.badge}</span>
                )}
              </NavLink>
            )
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            🔓 Cerrar sesión
          </button>
          <div style={{ marginTop: '10px' }}>v1.0.0 - Dashboard</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <div>
              <div className="header-title">Dashboard Chatbot</div>
              <div className="header-subtitle">{currentViewName}</div>
            </div>
          </div>
          <div className="header-right">
            <div className="dashboard-clock">
              <span className="clock-icon">🕐</span>
              <span className="clock-time">{clockTime}</span>
              <span className="clock-seconds">{clockSeconds}</span>
            </div>
            <button className="theme-toggle-btn" onClick={toggleTheme} title="Cambiar tema">
              {darkMode ? '☀️' : '🌙'}
            </button>
            <div className={`header-status-badge ${statusClass}`}>
              <span className="status-dot"></span>
              <span>{statusText}</span>
            </div>

            {/* Agent Profile Menu */}
            <div className="agent-profile-wrapper" ref={profileRef}>
              <button
                className="agent-profile-btn"
                onClick={() => { setProfileOpen(!profileOpen); setEditMode(null); }}
              >
                <span className="agent-profile-dot" style={{ background: agentColor || '#3B82F6' }}></span>
                <span className="agent-profile-name" style={{ color: agentColor || undefined }}>{visibleName}</span>
                <span className="agent-profile-arrow">{profileOpen ? '▲' : '▼'}</span>
              </button>

              {profileOpen && (
                <div className="agent-profile-dropdown">
                  {editMode === null && (
                    <>
                      <div className="agent-dropdown-header">
                        <span className="agent-dropdown-dot" style={{ background: agentColor || '#3B82F6' }}></span>
                        <div>
                          <div className="agent-dropdown-name" style={{ color: agentColor || undefined }}>{visibleName}</div>
                          {displayName && <div className="agent-dropdown-username">@{username}</div>}
                        </div>
                      </div>
                      <div className="agent-dropdown-divider"></div>
                      <button className="agent-dropdown-item" onClick={() => { setEditMode('name'); setEditInput(displayName || ''); }}>
                        <span>✏️</span> Editar nombre
                      </button>
                      <button className="agent-dropdown-item" onClick={() => setEditMode('color')}>
                        <span>🎨</span> Elegir color
                      </button>
                      {(displayName || agentColor) && (
                        <button className="agent-dropdown-item agent-dropdown-reset" onClick={handleReset}>
                          <span>🔄</span> Resetear nombre
                        </button>
                      )}
                      <div className="agent-dropdown-divider"></div>
                      <button className="agent-dropdown-item agent-dropdown-logout" onClick={handleLogout}>
                        <span>🔓</span> Cerrar sesión
                      </button>
                    </>
                  )}

                  {editMode === 'name' && (
                    <div className="agent-edit-panel">
                      <div className="agent-edit-title">Editar nombre visible</div>
                      <input
                        type="text"
                        className="agent-edit-input"
                        placeholder={username}
                        value={editInput}
                        onChange={e => setEditInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                        maxLength={30}
                      />
                      <div className="agent-edit-actions">
                        <button className="agent-edit-cancel" onClick={() => setEditMode(null)}>Cancelar</button>
                        <button className="agent-edit-save" onClick={handleSaveName}>Guardar</button>
                      </div>
                    </div>
                  )}

                  {editMode === 'color' && (
                    <div className="agent-edit-panel">
                      <div className="agent-edit-title">Elegir color</div>
                      <div className="agent-color-grid">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            className={`agent-color-swatch ${agentColor === c ? 'active' : ''}`}
                            style={{ background: c }}
                            onClick={() => handleSelectColor(c)}
                            title={c}
                          />
                        ))}
                      </div>
                      <button className="agent-edit-cancel" style={{ marginTop: 8, width: '100%' }} onClick={() => setEditMode(null)}>Cancelar</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className={`dashboard-content dashboard-content-flush${(location.pathname === '/conversations' || location.pathname === '/statuses' || location.pathname === '/bulk-messages') ? '' : ' dashboard-content-pages'}`}>
          {location.pathname !== '/conversations' && location.pathname !== '/statuses' && location.pathname !== '/bulk-messages' && (
            <div className="breadcrumb">
              <span className="breadcrumb-item">
                <span>🏠</span>
                <span>Dashboard</span>
              </span>
              <span className="breadcrumb-separator">›</span>
              <span className="breadcrumb-item breadcrumb-active">{currentViewName}</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

