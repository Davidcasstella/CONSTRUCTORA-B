import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState('disconnected');
  const [qrCode, setQrCode] = useState(null);
  const [connectedPhone, setConnectedPhone] = useState(null);
  const [connectedName, setConnectedName] = useState(null);

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

    // On CloudFront (HTTPS): use polling first for reliable initial connection,
    // then Socket.IO auto-upgrades to WebSocket.
    // On direct HTTP: websocket first is fine.
    const isHTTPS = window.location.protocol === 'https:';
    const newSocket = io(BACKEND_URL, {
      transports: isHTTPS ? ['polling', 'websocket'] : ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[Socket.IO] Connected');
      newSocket.emit('get-status');
    });

    newSocket.on('qr', (qr) => {
      setWhatsappStatus('waiting');
      setQrCode(qr);
    });

    newSocket.on('authenticated', () => {
      setWhatsappStatus('authenticating');
      setQrCode(null);
    });

    newSocket.on('ready', (data) => {
      setWhatsappStatus('connected');
      setQrCode(null);
      // Backend may send phone info with ready event
      if (data && data.miNumero) setConnectedPhone(data.miNumero);
      if (data && data.miNombre) setConnectedName(data.miNombre);
    });

    newSocket.on('disconnected', () => {
      setWhatsappStatus('disconnected');
      setQrCode(null);
    });

    newSocket.on('session-expired', () => {
      setWhatsappStatus('expired');
      setQrCode(null);
    });

    newSocket.on('status', (data) => {
      if (data.isReady) {
        setWhatsappStatus('connected');
        setQrCode(null);
        // Store the connected phone number and name
        if (data.miNumero) setConnectedPhone(data.miNumero);
        if (data.miNombre) setConnectedName(data.miNombre);
      } else if (data.hasQR) {
        newSocket.emit('get-qr');
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
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, whatsappStatus, qrCode, connectedPhone, connectedName }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
