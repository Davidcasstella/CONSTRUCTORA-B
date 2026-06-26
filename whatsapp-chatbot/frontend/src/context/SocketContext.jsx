import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

// Default session state
const defaultSessionState = {
  status: 'disconnected',
  qr: null,
  phone: null,
  name: null,
};

export function SocketProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);

  // Multi-session state: { session1: { status, qr, phone, name }, session2: { ... } }
  const [sessions, setSessions] = useState({
    session1: { ...defaultSessionState },
    session2: { ...defaultSessionState },
  });

  // Helper to update a single session's state
  const updateSession = useCallback((sessionId, updates) => {
    setSessions(prev => ({
      ...prev,
      [sessionId]: { ...(prev[sessionId] || defaultSessionState), ...updates },
    }));
  }, []);

  // Backward-compatible single-session values (mapped to session1)
  const whatsappStatus = sessions.session1?.status || 'disconnected';
  const qrCode = sessions.session1?.qr || null;
  const connectedPhone = sessions.session1?.phone || null;
  const connectedName = sessions.session1?.name || null;

  useEffect(() => {
    if (!isAuthenticated) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Auto-detect: localhost → local backend, remote/CloudFront → remote backend
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const BACKEND_URL = window.location.protocol === 'https:'
      ? window.location.origin
      : isLocal
        ? 'http://localhost:3001'
        : (import.meta.env.VITE_API_URL || '');

    const isHTTPS = window.location.protocol === 'https:';
    const newSocket = io(BACKEND_URL, {
      transports: isHTTPS ? ['polling', 'websocket'] : ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[Socket.IO] Connected');
      newSocket.emit('get-status');
    });

    // ===========================================
    // MULTI-SESSION EVENTS
    // ===========================================

    // QR for a specific session
    newSocket.on('session:qr', ({ sessionId, qr }) => {
      updateSession(sessionId, { status: 'waiting', qr });
    });

    // Session authenticated
    newSocket.on('session:authenticated', ({ sessionId }) => {
      updateSession(sessionId, { status: 'authenticating', qr: null });
    });

    // Session ready
    newSocket.on('session:ready', ({ sessionId, miNumero, miNombre }) => {
      updateSession(sessionId, {
        status: 'connected',
        qr: null,
        phone: miNumero || null,
        name: miNombre || null,
      });
    });

    // Session disconnected
    newSocket.on('session:disconnected', ({ sessionId }) => {
      updateSession(sessionId, { status: 'disconnected', qr: null });
    });

    // Session expired
    newSocket.on('session:expired', ({ sessionId }) => {
      updateSession(sessionId, { status: 'expired', qr: null });
    });

    // All sessions status (response to get-status)
    newSocket.on('all-sessions-status', (allStatuses) => {
      setSessions(prev => {
        const next = { ...prev };
        for (const [sessionId, data] of Object.entries(allStatuses)) {
          next[sessionId] = {
            ...(prev[sessionId] || defaultSessionState),
            status: data.isReady ? 'connected' : data.hasQR ? 'waiting' : (data.status || 'disconnected'),
            phone: data.miNumero || prev[sessionId]?.phone || null,
            name: data.miNombre || prev[sessionId]?.name || null,
          };
          // Request QR if waiting
          if (data.hasQR && !data.isReady) {
            newSocket.emit('get-qr', { sessionId });
          }
        }
        return next;
      });
    });

    // ===========================================
    // LEGACY EVENTS (backward compat for session1)
    // ===========================================

    newSocket.on('qr', (qr) => {
      updateSession('session1', { status: 'waiting', qr });
    });

    newSocket.on('authenticated', () => {
      updateSession('session1', { status: 'authenticating', qr: null });
    });

    newSocket.on('ready', (data) => {
      updateSession('session1', {
        status: 'connected',
        qr: null,
        phone: data?.miNumero || null,
        name: data?.miNombre || null,
      });
    });

    newSocket.on('disconnected', () => {
      updateSession('session1', { status: 'disconnected', qr: null });
    });

    newSocket.on('session-expired', () => {
      updateSession('session1', { status: 'expired', qr: null });
    });

    newSocket.on('status', (data) => {
      if (data.isReady) {
        updateSession('session1', {
          status: 'connected',
          qr: null,
          phone: data.miNumero || null,
          name: data.miNombre || null,
        });
      } else if (data.hasQR) {
        newSocket.emit('get-qr', { sessionId: 'session1' });
      }
    });

    setSocket(newSocket);

    // Poll status periodically
    const interval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('get-status');
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      newSocket.disconnect();
    };
  }, [isAuthenticated, updateSession]);

  return (
    <SocketContext.Provider value={{
      socket,
      // Multi-session state
      sessions,
      // Backward-compatible single-session values
      whatsappStatus,
      qrCode,
      connectedPhone,
      connectedName,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
