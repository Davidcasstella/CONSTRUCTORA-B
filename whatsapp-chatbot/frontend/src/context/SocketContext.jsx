import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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

  // ✅ NUEVO: Notificaciones de escalación (banners top-screen)
  const [notifications, setNotifications] = useState([]);

  // ✅ NUEVO: Toasts rápidos (spam, info, etc.)
  const [toasts, setToasts] = useState([]);

  // ✅ NUEVO: Contador de conversaciones pendientes de asesor
  const [pendingCount, setPendingCount] = useState(0);

  // ✅ NUEVO: Mute state para notificaciones de sonido (persistente en localStorage)
  const [soundMuted, setSoundMuted] = useState(() => {
    return localStorage.getItem('sound_muted') === 'true';
  });

  const toggleSoundMute = useCallback(() => {
    setSoundMuted(prev => {
      const next = !prev;
      localStorage.setItem('sound_muted', String(next));
      return next;
    });
  }, []);

  const playNotificationSound = useCallback(() => {
    if (localStorage.getItem('sound_muted') === 'true') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) {}
  }, []);

  // Refs for auto-dismiss timers
  const dismissTimers = useRef({});

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

  // ✅ NUEVO: Agregar notificación de escalación (con auto-dismiss a 30s)
  const addNotification = useCallback((data) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const notif = { id, ...data, receivedAt: Date.now() };

    setNotifications(prev => {
      // Evitar duplicados del mismo usuario en menos de 10 segundos
      const isDuplicate = prev.some(
        n => n.userId === data.userId && (Date.now() - n.receivedAt) < 10000
      );
      if (isDuplicate) return prev;
      return [notif, ...prev].slice(0, 5); // Max 5 banners simultáneos
    });

    // Auto-dismiss después de 30 segundos
    dismissTimers.current[id] = setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
      delete dismissTimers.current[id];
    }, 30000);
  }, []);

  // ✅ NUEVO: Descartar notificación por ID (null = descartar todas)
  const dismissNotification = useCallback((id) => {
    if (id === null) {
      // Limpiar todos los timers y notificaciones
      Object.values(dismissTimers.current).forEach(clearTimeout);
      dismissTimers.current = {};
      setNotifications([]);
    } else {
      if (dismissTimers.current[id]) {
        clearTimeout(dismissTimers.current[id]);
        delete dismissTimers.current[id];
      }
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
  }, []);

  // ✅ NUEVO: Agregar toast
  const addToast = useCallback((message, type = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    setToasts(prev => [{ id, message, type }, ...prev].slice(0, 4)); // Max 4 toasts

    // Auto-dismiss a los 6 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  // ✅ NUEVO: Descartar toast por ID
  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ✅ NUEVO: Actualizar badge de conversaciones pendientes via API
  const refreshPendingCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch('/api/conversations', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.conversations)) {
        const count = data.conversations.filter(
          c => c.status === 'pending_advisor' || c.status === 'out_of_hours'
        ).length;
        setPendingCount(count);
      }
    } catch (_) {
      // Ignore — will retry on next event
    }
  }, []);

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
      // Load initial pending count on connect
      refreshPendingCount();
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

    // ===========================================
    // ✅ NUEVO: EVENTOS DE NOTIFICACIÓN EN TIEMPO REAL
    // ===========================================

    // Escalación detectada — muestra banner persistente
    newSocket.on('escalation-detected', (data) => {
      console.log('[Socket.IO] 🚨 escalation-detected:', data);
      addNotification({
        userId:      data.userId,
        phoneNumber: data.phoneNumber,
        reason:      data.reason,
        priority:    data.priority || 'normal',
        type:        data.type || 'escalation',
      });
      playNotificationSound();
      // Actualizar badge de conversaciones pendientes
      refreshPendingCount();
    });

    // Cambio de estado de conversación (tomar/liberar)
    newSocket.on('conversation-status-changed', (data) => {
      console.log('[Socket.IO] 📊 conversation-status-changed:', data);
      refreshPendingCount();
    });

    // Bloqueo por spam — toast de advertencia
    newSocket.on('spam-blocked', (data) => {
      console.log('[Socket.IO] 🚫 spam-blocked:', data);
      if (data.iaDeactivated) {
        const phone = data.phoneNumber
          ? data.phoneNumber.replace(/\D/g, '').slice(-10)
          : 'desconocido';
        addToast(
          `🚫 Spam detectado: IA desactivada para ${phone} (${data.consecutiveCount || '?'} repeticiones)`,
          'warning'
        );
      }
      refreshPendingCount();
    });

    // Nuevo mensaje — reproduce sonido si no está silenciado
    newSocket.on('new-message', (data) => {
      // Reproducir sonido para nuevos mensajes entrantes
      if (!data || data.sender === 'user' || data.fromUser || !data.fromMe) {
        playNotificationSound();
      }
      refreshPendingCount();
    });

    setSocket(newSocket);

    // Poll status periodically
    const interval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('get-status');
      }
    }, 60000);

    // Poll pending badge every 2 minutes as fallback
    const badgeInterval = setInterval(refreshPendingCount, 120000);

    return () => {
      clearInterval(interval);
      clearInterval(badgeInterval);
      newSocket.disconnect();
    };
  }, [isAuthenticated, updateSession, addNotification, addToast, refreshPendingCount, playNotificationSound]);

  // Cleanup all dismiss timers on unmount
  useEffect(() => {
    return () => {
      Object.values(dismissTimers.current).forEach(clearTimeout);
    };
  }, []);

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
      // ✅ NUEVO: Notification system & Sound controls
      notifications,
      toasts,
      pendingCount,
      soundMuted,
      toggleSoundMute,
      playNotificationSound,
      dismissNotification,
      dismissToast,
      addToast,
      refreshPendingCount,
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

