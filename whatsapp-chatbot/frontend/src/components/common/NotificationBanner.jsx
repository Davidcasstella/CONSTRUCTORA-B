import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import '../../styles/notifications.css';

/**
 * Formats a phone number for display (removes @s.whatsapp.net, adds + prefix).
 */
function formatPhone(phone) {
  if (!phone) return '';
  let n = String(phone).replace(/^whatsapp:/i, '').trim();
  if (n.includes('@')) n = n.split('@')[0];
  n = n.replace(/\D/g, '');
  if (n.startsWith('57') && n.length > 10) {
    return `+57 ${n.substring(2, 5)} ${n.substring(5, 8)} ${n.substring(8)}`;
  }
  return '+' + n;
}

/**
 * Plays an escalation alert sound (short beep generated via AudioContext).
 * Falls back silently if the browser doesn't support the API.
 */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (_) {
    // Ignore audio errors silently
  }
}

/**
 * Label for escalation reason codes received from the backend.
 */
function reasonLabel(reason) {
  const labels = {
    out_of_hours:       'Fuera de horario',
    manual_escalation:  'Escalación manual',
    escalation:         'Requiere asesor',
    no_info:            'Sin información disponible',
    spam:               'Control de spam',
  };
  return labels[reason] || reason || 'Escalación';
}

/* ============================================================
   BANNER INDIVIDUAL
   ============================================================ */
function EscalationBanner({ notif, onDismiss, onViewChat }) {
  const phone = formatPhone(notif.phoneNumber || notif.userId);

  return (
    <div className="notification-banner">
      <div className="notification-banner-left">
        <span className="notification-banner-icon">🚨</span>
        <div className="notification-banner-text">
          <div className="notification-banner-title">¡Requiere atención humana!</div>
          <div className="notification-banner-detail">
            {phone && <span>Usuario: {phone}</span>}
            {phone && notif.reason && <span> · </span>}
            {notif.reason && <span>Razón: {reasonLabel(notif.reason)}</span>}
          </div>
        </div>
      </div>
      <div className="notification-banner-actions">
        <button className="notification-banner-btn" onClick={() => onViewChat(notif.userId)}>
          Ver Chat
        </button>
        <button className="notification-banner-close" onClick={() => onDismiss(notif.id)} title="Cerrar">
          ×
        </button>
      </div>
      {/* Auto-dismiss progress bar */}
      <div className="notification-banner-progress" />
    </div>
  );
}

/* ============================================================
   TOAST INDIVIDUAL
   ============================================================ */
function Toast({ toast, onDismiss }) {
  const iconMap = {
    warning: '⚠️',
    error:   '🚫',
    success: '✅',
    info:    'ℹ️',
  };

  return (
    <div className={`toast toast-${toast.type || 'info'}`}>
      <span className="toast-icon">{iconMap[toast.type] || 'ℹ️'}</span>
      <span className="toast-text">{toast.message}</span>
      <button className="toast-close" onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function NotificationBanner() {
  const navigate = useNavigate();
  const { notifications, toasts, dismissNotification, dismissToast, playNotificationSound } = useSocket();

  // Play sound whenever a new escalation banner appears
  useEffect(() => {
    if (notifications.length > 0) {
      playNotificationSound();
    }
  }, [notifications.length, playNotificationSound]);

  const handleViewChat = useCallback((userId) => {
    // Dismiss all banners and navigate to conversations
    if (userId) dismissNotification(null); // clear all on navigate
    navigate('/conversations');
  }, [navigate, dismissNotification]);

  const handleDismiss = useCallback((id) => {
    dismissNotification(id);
  }, [dismissNotification]);

  const handleDismissToast = useCallback((id) => {
    dismissToast(id);
  }, [dismissToast]);

  return (
    <>
      {/* Escalation banners — top of screen */}
      {notifications.length > 0 && (
        <div className="notification-banner-container">
          {notifications.map(notif => (
            <EscalationBanner
              key={notif.id}
              notif={notif}
              onDismiss={handleDismiss}
              onViewChat={handleViewChat}
            />
          ))}
        </div>
      )}

      {/* Toast notifications — bottom right */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast key={toast.id} toast={toast} onDismiss={handleDismissToast} />
          ))}
        </div>
      )}
    </>
  );
}
