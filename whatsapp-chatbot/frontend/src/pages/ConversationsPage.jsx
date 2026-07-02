import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import * as convService from '../services/conversationService';
import { getActiveQuickReplies } from '../services/quickReplyService';
import { getAllConfigs as getAllAgentConfigs } from '../services/agentConfigService';
import QuickReplyDropdown from '../components/chat/QuickReplyDropdown';
import { formatWhatsAppText } from '../utils/formatWhatsAppText';
import '../styles/chat-splitpane.css';

// ===========================
// UTILITY FUNCTIONS
// ===========================
/**
 * Safely extract a plain string from any message value.
 * Handles: plain strings, {type, text, useList} objects, arrays, null/undefined.
 * Prevents "Objects are not valid as React child" crashes.
 */
function safeMsg(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return typeof value.text === 'string' ? value.text : '';
  }
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item : item?.text || '')).join('\n');
  }
  return '';
}
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  let n = String(phone).trim().replace(/^whatsapp:/i, '');
  if (n.includes('@')) n = n.split('@')[0];
  return n.replace(/[^\d]/g, '');
}

function formatPhoneDisplay(phone) {
  const n = normalizePhoneNumber(phone);
  if (n.startsWith('57') && n.length > 10) {
    return `+57 ${n.substring(2, 5)} ${n.substring(5, 8)} ${n.substring(8)}`;
  }
  return '+' + n;
}

function getInitials(name) {
  if (!name) return '??';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();

  // Today: show time (10:42 a.m.)
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (isToday) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: true });

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Ayer';

  // This week (within 7 days): show day name
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[d.getDay()];
  }

  // Older: DD Mon
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function normalizeMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Direct /uploads/ paths (no auth needed)
  if (url.startsWith('/uploads/')) return window.location.origin + url;
  // API paths need auth token
  if (url.startsWith('/api/')) {
    const token = localStorage.getItem('authToken') || '';
    const abs = window.location.origin + url;
    return token ? abs + (abs.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) : abs;
  }
  return url;
}

// Download file via fetch+blob (works with token URLs)
function downloadFile(url, filename) {
  fetch(url)
    .then(res => {
      const blob = res.blob();
      const ct = res.headers.get('content-type') || '';
      return blob.then(b => ({ blob: b, ct }));
    })
    .then(({ blob, ct }) => {
      // Build a proper filename with extension
      let name = filename || 'download';
      if (!name.includes('.')) {
        const extMap = {
          'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
          'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
          'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/webm': '.webm', 'audio/wav': '.wav',
          'application/pdf': '.pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        };
        name += extMap[ct] || (ct.startsWith('image/') ? '.jpg' : ct.startsWith('video/') ? '.mp4' : ct.startsWith('audio/') ? '.mp3' : '');
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    })
    .catch(() => window.open(url, '_blank'));
}

// ===========================
// PROFILE AVATAR COMPONENT
// ===========================
function ProfileAvatar({ jid, name, isGroup, onClick }) {
  const [picUrl, setPicUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!jid || isGroup) return;

    // We can use a local in-memory cache on the frontend to avoid repeated fetches across remounts
    const cacheKey = `profile_pic_v5_${jid}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      if (cached === 'null') setError(true);
      else setPicUrl(cached);
      return;
    }

    const fetchPic = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/conversations/${jid}/profile-picture`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success && data.url) {
          setPicUrl(data.url);
          sessionStorage.setItem(cacheKey, data.url);
        } else if (res.ok && data.success === true && !data.url) {
          // It successfully queried but user has no pic
          setError(true);
          sessionStorage.setItem(cacheKey, 'null');
        } else {
          // If 404 or 500, don't cache the null permanently so it retries next time
          setError(true);
        }
      } catch (err) {
        setError(true);
      }
    };
    fetchPic();
  }, [jid, isGroup]);

  if (isGroup || (jid && jid.endsWith('@g.us'))) {
    return <div className="conv-avatar">👥</div>;
  }

  if (!picUrl || error) {
    return <div className="conv-avatar">{getInitials(name)}</div>;
  }

  return (
    <div className="conv-avatar" onClick={(e) => { e.stopPropagation(); onClick && onClick(picUrl); }} style={{ cursor: 'pointer', padding: 0, overflow: 'hidden', backgroundColor: '#37474F' }}>
      <img src={picUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}

function getCurrentAdvisor() {
  try {
    const u = JSON.parse(localStorage.getItem('user'));
    if (!u) return { id: 'admin', name: 'admin', email: 'admin@constructoragya.com' };
    return {
      id: u.id || u.username || 'advisor_' + Date.now(),
      name: u.name || u.username || 'Asesor',
      email: u.email || `${u.username || 'advisor'}@constructoragya.com`
    };
  } catch { return { id: 'advisor_' + Date.now(), name: 'Asesor', email: 'advisor@constructoragya.com' }; }
}

const EMOJIS = ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😗','😙','😋','😛','😜','🤪','😎','🤩','🥳','😏','😤','😠','😡','🤬','😢','😭','😱','😰','👍','👎','👋','🤝','🙏','👏','💪','🎉','❤️','💚','💙','💜','🔥','⭐','✅','❌'];

const STATUS_CONFIG = {
  active: { text: 'Activa', cls: 'active', bg: '#e8f5e9', color: '#2e7d32' },
  expired: { text: 'Expirada', cls: 'expired', bg: '#fce4ec', color: '#c62828' },
  pending_advisor: { text: '⚠️ Pendiente', cls: 'pending_advisor', bg: '#fff3e0', color: '#e65100' },
  out_of_hours: { text: '🌙 Fuera horario', cls: 'out_of_hours', bg: '#e3f2fd', color: '#1565c0' },
  advisor_handled: { text: '👨‍💼 Con Asesor', cls: 'advisor_handled', bg: '#ede7f6', color: '#6a1b9a' },
  new_cycle: { text: 'Nuevo Ciclo', cls: 'new_cycle', bg: '#e0f7fa', color: '#00838f' },
};

// ✅ DEVICE: Badge config for each WhatsApp session
const DEVICE_CONFIG = {
  session1: { label: 'Disp. 1', color: '#1565c0', bg: '#e3f2fd', emoji: '📱' },
  session2: { label: 'Disp. 2', color: '#6a1b9a', bg: '#f3e5f5', emoji: '📲' },
};

// ✅ PERFORMANCE: Module-level cache — survives tab switches (component unmount/remount)
const _convsCache = { data: null, stats: null, ts: 0, hasMore: false, selectedUserId: null, scrollPositions: {} };

// ✅ PERFORMANCE: Per-conversation message cache (15s TTL)
// Key: userId, Value: { messages, cursor, hasMore, ts }
const _msgsCache = new Map();
const MSGS_CACHE_TTL_MS = 15000;

function _invalidateMsgsCache(userId) {
  if (userId) _msgsCache.delete(userId);
}

// ===========================
// MAIN COMPONENT
// ===========================
export default function ConversationsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();

  // Stats — restore from cache if available
  const [stats, setStats] = useState(_convsCache.stats || { total: 0, active: 0, expired: 0, consent: 0, pending: 0, advisor: 0 });

  // Conversations — restore from cache if available
  const [conversations, setConversations] = useState(_convsCache.data || []);
  const [filter, setFilter] = useState('device1');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMoreConvs, setHasMoreConvs] = useState(_convsCache.hasMore || false);
  const [convsOffset, setConvsOffset] = useState(0);
  // Only show loading spinner if no cached data
  const [loadingConvs, setLoadingConvs] = useState(!_convsCache.data);
  const [searchingServer, setSearchingServer] = useState(false);
  const searchTimerRef = useRef(null);
  const activeSearchRef = useRef('');

  // Chat
  const [selectedUserId, setSelectedUserIdRaw] = useState(_convsCache.selectedUserId || null);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [messageCursor, setMessageCursor] = useState(null);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  
  // NEW: Lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null); // [{ file, type, url, caption }] or null
  const [mediaPreviewIdx, setMediaPreviewIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Lightbox viewer
  const [lightbox, setLightbox] = useState(null); // { type: 'image'|'video', url, downloadUrl }
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Quick Replies (slash commands)
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQRDropdown, setShowQRDropdown] = useState(false);
  const [qrQuery, setQrQuery] = useState('');
  const [qrFocusedIndex, setQrFocusedIndex] = useState(-1);
  const [qrFiltered, setQrFiltered] = useState([]);

  // Agent configs (for display names and colors)
  const [agentConfigs, setAgentConfigs] = useState({});

  // Modals
  const [modal, setModal] = useState(null);
  const [modalData, setModalData] = useState({});

  // Refs
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const renderedIdsRef = useRef(new Set());
  const fileImageRef = useRef(null);
  const fileDocRef = useRef(null);
  const fileAudioRef = useRef(null);
  const fileVideoRef = useRef(null);
  const isLoadingOlderRef = useRef(false);
  const justOpenedChatRef = useRef(false);
  // scrollPositions stored in module-level _convsCache so they survive tab switches
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const pendingFilesRef = useRef([]);
  // ✅ FIX: Ref to always have the latest selectedUserId inside socket handlers (avoids stale closure)
  const selectedUserIdRef = useRef(_convsCache.selectedUserId || null);

  // ✅ FIX Problem 2: Wrap setSelectedUserId to also persist to module-level cache
  const setSelectedUserId = useCallback((val) => {
    setSelectedUserIdRaw(val);
    _convsCache.selectedUserId = val;
    selectedUserIdRef.current = val; // ✅ FIX: Keep ref in sync for socket handlers
  }, []);

  // ✅ FIX Problem 2: Auto-restore selected conversation on remount (tab switch back)
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const cachedId = _convsCache.selectedUserId;
    if (cachedId && conversations.length > 0) {
      // Always restore — selectedUserId may already be set from cache init
      // but messages need to be reloaded since component was remounted
      selectConversation(cachedId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // ✅ Save scroll position when component unmounts (tab switch away)
  useEffect(() => {
    return () => {
      const uid = _convsCache.selectedUserId;
      if (uid && messagesContainerRef.current) {
        _convsCache.scrollPositions[uid] = messagesContainerRef.current.scrollTop;
      }
    };
  }, []);

  // ===========================
  // LOAD STATS
  // ===========================
  const loadStats = useCallback(async () => {
    try {
      const data = await convService.getStats();
      if (data?.stats) {
        const s = data.stats;
        const newStats = {
          total: s.total || 0,
          active: s.active || 0,
          expired: s.expired || 0,
          consent: typeof s.consent === 'object' ? (s.consent?.accepted || 0) : (s.consent || 0),
          pending: s.escalation?.pendingAdvisor || 0,
          advisor: s.escalation?.advisorHandled || 0,
        };
        setStats(newStats);
        _convsCache.stats = newStats; // Cache stats
      }
    } catch (e) { console.error('Error loading stats:', e); }
  }, []);

  // ===========================
  // LOAD CONVERSATIONS
  // ===========================
  const loadConversations = useCallback(async (offset = 0, search = '') => {
    // Only show loading spinner if no cached data
    if (offset === 0 && !_convsCache.data) setLoadingConvs(true);
    try {
      const data = await convService.getConversations(offset, 30, search);
      if (data?.success) {
        setConversations(prev => {
          let newConvs;
          if (offset === 0) {
            newConvs = data.conversations;
          } else {
            // Merge for load-more
            const map = new Map();
            prev.forEach(c => map.set(c.userId, c));
            data.conversations.forEach(c => map.set(c.userId, { ...map.get(c.userId), ...c }));
            newConvs = Array.from(map.values());
          }
          // Cache the initial load (no search)
          if (offset === 0 && !search) {
            _convsCache.data = newConvs;
            _convsCache.hasMore = data.hasMore || false;
            _convsCache.ts = Date.now();
          }
          return newConvs;
        });
        setHasMoreConvs(data.hasMore || false);
        setConvsOffset(offset);
      }
    } catch (e) { console.error('Error loading conversations:', e); }
    setLoadingConvs(false);
    setSearchingServer(false);
  }, []); // No dependencies — uses functional setState

  // Initial load
  useEffect(() => {
    loadStats();
    loadConversations(0);
  }, [loadStats, loadConversations]);

  // Load active quick replies for slash dropdown
  useEffect(() => {
    async function loadQR() {
      try {
        const data = await getActiveQuickReplies();
        const list = data?.quickReplies || (Array.isArray(data) ? data : []);
        // Sort newest first so the most recently created/edited appear at the top
        const sorted = [...list].sort((a, b) => {
          const tA = new Date(a.updated_at || a.created_at || 0).getTime();
          const tB = new Date(b.updated_at || b.created_at || 0).getTime();
          return tB - tA;
        });
        setQuickReplies(sorted);
      } catch (e) { console.error('Error loading quick replies:', e); }
    }
    loadQR();
  }, []);

  // Load all agent configs (for display names and colors in messages)
  useEffect(() => {
    async function loadAgentConfigs() {
      try {
        const data = await getAllAgentConfigs();
        if (data?.success && data.configs) {
          setAgentConfigs(data.configs);
        }
      } catch (e) { console.error('Error loading agent configs:', e); }
    }
    loadAgentConfigs();
  }, []);

  // Debounced server-side search
  const isInitialMount = useRef(true);
  useEffect(() => {
    // Skip the initial mount — loadConversations(0) already runs in the effect above
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    activeSearchRef.current = searchQuery;
    if (!searchQuery.trim()) {
      // Empty search — reload all
      loadConversations(0, '');
      return;
    }
    setSearchingServer(true);
    searchTimerRef.current = setTimeout(() => {
      loadConversations(0, searchQuery.trim());
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, loadConversations]);

  // ===========================
  // SELECT CONVERSATION
  // ===========================
  const selectConversation = useCallback(async (userId) => {
    // Save scroll position of current chat before switching
    // Only save if there are messages loaded (avoid overwriting with 0 during restore)
    if (selectedUserId && messagesContainerRef.current && messagesContainerRef.current.scrollHeight > messagesContainerRef.current.clientHeight) {
      _convsCache.scrollPositions[selectedUserId] = messagesContainerRef.current.scrollTop;
    }

    setSelectedUserId(userId);
    const conv = conversations.find(c => c.userId === userId);
    setSelectedConv(conv);
    renderedIdsRef.current = new Set();
    setReplyTo(null);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    justOpenedChatRef.current = true;

    // ✅ PERFORMANCE: Serve from cache instantly if fresh (< 15s)
    const now = Date.now();
    const cached = _msgsCache.get(userId);
    if (cached && (now - cached.ts) < MSGS_CACHE_TTL_MS) {
      setMessages(cached.messages);
      setMessageCursor(cached.cursor || null);
      setHasMoreMsgs(cached.hasMore || false);
      setLoadingMsgs(false);
      cached.messages.forEach(m => { if (m.id) renderedIdsRef.current.add(m.id); });
      // Background refresh to pick up any new messages
      convService.getMessages(userId, 20).then(data => {
        if (data?.success && data.messages?.length > 0) {
          _msgsCache.set(userId, { messages: data.messages, cursor: data.nextCursor || null, hasMore: data.hasMore || false, ts: Date.now() });
          // Only update if still viewing this conversation
          if (selectedUserIdRef.current === userId) {
            setMessages(prev => {
              const merged = [...data.messages];
              const newIds = new Set(data.messages.map(m => m.id));
              prev.forEach(p => {
                if (!newIds.has(p.id)) merged.push(p);
              });
              merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              return merged;
            });
            data.messages.forEach(m => { if (m.id) renderedIdsRef.current.add(m.id); });
            setMessageCursor(data.nextCursor || null);
            setHasMoreMsgs(data.hasMore || false);
          }
        }
      }).catch(() => {});
      return;
    }

    // No cache: show loading spinner and fetch from server
    setMessages([]);
    setMessageCursor(null);
    setHasMoreMsgs(false);
    setLoadingMsgs(true);

    try {
      const data = await convService.getMessages(userId, 20);
      if (data?.success && data.messages?.length > 0) {
        setMessages(data.messages);
        data.messages.forEach(m => { if (m.id) renderedIdsRef.current.add(m.id); });
        setMessageCursor(data.nextCursor || null);
        setHasMoreMsgs(data.hasMore || false);
        // Store in cache
        _msgsCache.set(userId, { messages: data.messages, cursor: data.nextCursor || null, hasMore: data.hasMore || false, ts: Date.now() });
      }
    } catch (e) { console.error('Error loading messages:', e); }
    setLoadingMsgs(false);
  }, [conversations, selectedUserId]);

  // ✅ useLayoutEffect: runs BEFORE browser paint — no visible scroll jump
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    if (justOpenedChatRef.current) {
      justOpenedChatRef.current = false;
      // Check if we have a cached scroll position for this chat (module-level, survives tab switches)
      if (selectedUserId && _convsCache.scrollPositions[selectedUserId] !== undefined) {
        const savedPos = _convsCache.scrollPositions[selectedUserId];
        container.scrollTop = savedPos;
        // Fallback after layout recalculation
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = savedPos;
          }
        });
      } else {
        // First time opening: position at bottom instantly
        container.scrollTop = container.scrollHeight;
        // Fallback: ensure scroll after layout is fully calculated
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        });
      }
    }
  }, [messages, selectedUserId]);

  // useEffect for new incoming messages (doesn't need to block paint)
  useEffect(() => {
    if (messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    // Don't auto-scroll when loading older messages or just opened
    if (isLoadingOlderRef.current) return;

    // Only auto-scroll if user is near the bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // ===========================
  // LOAD OLDER MESSAGES
  // ===========================
  const loadOlderMessages = async () => {
    if (!hasMoreMsgs || !messageCursor || !selectedUserId) return;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    const prevScrollTop = container?.scrollTop || 0;
    isLoadingOlderRef.current = true;

    try {
      const data = await convService.getMessages(selectedUserId, 20, messageCursor);
      if (data?.success && data.messages?.length > 0) {
        const newMsgs = data.messages.filter(m => !renderedIdsRef.current.has(m.id));
        newMsgs.forEach(m => { if (m.id) renderedIdsRef.current.add(m.id); });
        setMessages(prev => [...newMsgs, ...prev]);
        setMessageCursor(data.nextCursor || null);
        setHasMoreMsgs(data.hasMore || false);
        // Restore scroll position so user stays in same place
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight - prevScrollHeight + prevScrollTop;
          }
          isLoadingOlderRef.current = false;
        }, 50);
      } else {
        setHasMoreMsgs(false);
        isLoadingOlderRef.current = false;
      }
    } catch (e) {
      console.error('Error loading older messages:', e);
      isLoadingOlderRef.current = false;
    }
  };

  // ===========================
  // SEND TEXT MESSAGE
  // ===========================
  const handleSendMessage = async () => {
    if (!msgInput.trim() || !selectedUserId || sending) return;
    const text = msgInput.trim();
    const advisor = getCurrentAdvisor();
    setMsgInput('');
    const currentReply = replyTo ? { ...replyTo } : null;
    setReplyTo(null);

    // Optimistic append — no local rendering.
    // The socket 'new-message' event will add the message once confirmed.
    try {
      await convService.sendMessage(selectedUserId, text, advisor, currentReply);
    } catch (e) {
      showToast('Error enviando: ' + e.message, 'error');
    }
  };

  // ===========================
  // FILE UPLOAD & SEND MEDIA
  // ===========================
  const handleFileSelect = (e, type) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedUserId) return;
    const items = files.map(f => ({ file: f, type, url: URL.createObjectURL(f), caption: '' }));
    setMediaPreview(items);
    setMediaPreviewIdx(0);
    e.target.value = '';
  };

  // ===========================
  // DRAG & DROP + PASTE
  // ===========================
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) { setIsDragging(false); dragCounterRef.current = 0; }
  };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (!selectedUserId) return;

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    const items = files.map(f => {
      const mime = f.type || '';
      let type = 'document';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('video/')) type = 'video';
      else if (mime.startsWith('audio/')) type = 'audio';
      return { file: f, type, url: URL.createObjectURL(f), caption: '' };
    });
    setMediaPreview(items);
    setMediaPreviewIdx(0);
  };

  // Clipboard paste (Ctrl+V images)
  useEffect(() => {
    const handlePaste = (e) => {
      if (!selectedUserId) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const ext = item.type.split('/')[1] || 'png';
          const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type: item.type });
          setMediaPreview([{ file, type: 'image', url: URL.createObjectURL(file), caption: '' }]);
          setMediaPreviewIdx(0);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selectedUserId]);

  const sendFileToServer = async (file, type, caption = '') => {
    if (!selectedUserId) return;
    const advisor = getCurrentAdvisor();

    try {
      const uploadData = await convService.uploadMedia(file, type, caption);
      if (!uploadData?.success) throw new Error(uploadData?.error || 'Upload failed');

      const media = {
        type,
        url: uploadData.file.url,
        filepath: uploadData.file.filepath,
        filename: uploadData.file.originalname || file.name,
        size: uploadData.file.size
      };

      const sendData = await convService.sendMedia(selectedUserId, media, caption, advisor);
      if (sendData?.success) {
        showToast('✅ Archivo enviado');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    setShowAttachMenu(false);
  };

  // Send all files from multi-file preview
  const sendAllPreviewFiles = async () => {
    if (!mediaPreview || mediaPreview.length === 0) return;
    setSending(true);
    const filesToSend = [...mediaPreview];
    // Clean up URLs and close preview
    mediaPreview.forEach(p => URL.revokeObjectURL(p.url));
    setMediaPreview(null);
    setMediaPreviewIdx(0);
    // Send each file sequentially
    for (const item of filesToSend) {
      await sendFileToServer(item.file, item.type, item.caption || '');
    }
    setSending(false);
  };

  // ===========================
  // AUDIO RECORDING
  // ===========================
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast('Tu navegador no soporta grabación de audio', 'error');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = MediaRecorder.isTypeSupported('audio/ogg') ? { mimeType: 'audio/ogg' } : {};
      }
      const recorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const mimeType = options.mimeType || 'audio/webm';
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType });
        await sendFileToServer(file, 'audio');
      };
      recorder.start();
      audioRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      showToast('No se pudo acceder al micrófono: ' + err.message, 'error');
    }
  };

  const stopRecording = () => {
    if (!audioRecorderRef.current || !isRecording) return;
    audioRecorderRef.current.stop();
    audioRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const cancelRecording = () => {
    if (!audioRecorderRef.current || !isRecording) return;
    audioRecorderRef.current.ondataavailable = null;
    audioRecorderRef.current.onstop = null;
    audioRecorderRef.current.stop();
    audioRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    audioChunksRef.current = [];
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
    setRecordingTime(0);
  };

  const formatRecordingTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ===========================
  // CONVERSATION ACTIONS
  // ===========================
  const handleTake = async () => {
    if (!selectedUserId) return;
    try {
      const data = await convService.takeConversation(selectedUserId, getCurrentAdvisor());
      if (data?.success) {
        showToast('✅ Conversación tomada');
        setSelectedConv(prev => prev ? { ...prev, status: 'advisor_handled' } : prev);
        loadConversations(0);
        loadStats();
      }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleRelease = async () => {
    if (!selectedUserId || !confirm('¿Liberar conversación de vuelta al bot?')) return;
    try {
      const data = await convService.releaseConversation(selectedUserId);
      if (data?.success) {
        showToast('✅ Conversación liberada');
        setSelectedConv(prev => prev ? { ...prev, status: 'active' } : prev);
        loadConversations(0);
        loadStats();
      }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleReset = () => {
    if (!selectedUserId) return;
    // Use custom modal instead of native confirm() to avoid browser blocking issues
    setModal('reset');
    setModalData({ userId: selectedUserId, phone: formatPhoneDisplay(selectedConv?.phoneNumber || selectedUserId) });
  };

  const handleConfirmReset = async () => {
    const userId = modalData.userId;
    if (!userId) return;
    setModal(null);
    try {
      const data = await convService.resetConversation(userId);
      if (data?.success) {
        showToast('✅ Conversación reseteada');
        // ✅ FIX Problem 1: Update local selectedConv to reflect the reset immediately
        setSelectedConv(prev => prev ? {
          ...prev,
          bot_active: true,
          status: data.conversation?.status || 'new_cycle',
          needsHuman: false,
          assignedTo: null,
          advisorName: null,
          escalationMessageSent: false,
          waitingForHuman: false,
        } : prev);
        loadConversations(0);
        loadStats();
      } else {
        showToast('Error: ' + (data?.error || 'Reset fallido'), 'error');
      }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleToggleIA = async (enabled) => {
    if (!selectedUserId) return;
    const advisor = getCurrentAdvisor();
    try {
      const data = enabled
        ? await convService.reactivateBot(selectedUserId, advisor)
        : await convService.deactivateBot(selectedUserId, advisor);
      if (data?.success) {
        showToast(enabled ? '✅ IA activada' : '🔴 IA desactivada');
        setSelectedConv(prev => prev ? { ...prev, bot_active: enabled, status: data.status || prev.status } : prev);
        loadConversations(0);
        loadStats();
      }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  // ===========================
  // MODALS (New Chat, Edit Name, Delete)
  // ===========================
  const handleNewChat = async () => {
    const rawPhone = (modalData.phone || '').replace(/\D/g, '');
    if (!rawPhone || rawPhone.length !== 10 || !rawPhone.startsWith('3')) {
      showToast('Ingresa un número colombiano válido (10 dígitos, empieza por 3)', 'error');
      return;
    }
    const fullPhone = '57' + rawPhone;
    try {
      const data = await convService.createChat(fullPhone, modalData.name || '');
      if (data?.success) {
        setModal(null);
        showToast('✅ Chat creado');
        loadConversations(0);
        if (data.conversation?.userId) {
          setTimeout(() => selectConversation(data.conversation.userId), 500);
        }
      } else { showToast('Error: ' + (data?.error || ''), 'error'); }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleEditName = async () => {
    const userId = modalData.userId;
    const name = modalData.name?.trim();
    if (!userId) return;
    try {
      const data = await convService.editCustomName(userId, name || '');
      if (data?.success) {
        setModal(null);
        showToast('✅ Nombre actualizado');
        setConversations(prev => prev.map(c =>
          c.userId === userId ? { ...c, customName: data.conversation?.customName, registeredName: data.conversation?.registeredName } : c
        ));
        if (selectedUserId === userId) {
          setSelectedConv(prev => prev ? { ...prev, customName: data.conversation?.customName, registeredName: data.conversation?.registeredName } : prev);
        }
      }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleDeleteChat = async () => {
    const userId = modalData.userId;
    if (!userId) return;
    try {
      const data = await convService.deleteConversation(userId);
      if (data?.success) {
        setModal(null);
        showToast('🗑️ Chat eliminado');
        setConversations(prev => prev.filter(c => c.userId !== userId));
        if (selectedUserId === userId) {
          setSelectedUserId(null);
          setSelectedConv(null);
          setMessages([]);
        }
      }
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  // ===========================
  // SOCKET.IO EVENTS
  // ===========================
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data) => {
      // Backend sends: { userId, phoneNumber, message: messageRecord, timestamp }
      // where messageRecord is an object: { id, message, sender, senderName, type, mediaUrl, fileName, ... }
      const targetUserId = data.userId || data.from;
      // ✅ FIX: Use ref instead of closure to always have the latest selectedUserId
      if (targetUserId === selectedUserIdRef.current) {
        // Extract from nested messageRecord if present
        const rec = (data.message && typeof data.message === 'object') ? data.message : null;
        const senderVal = rec?.sender || data.sender || 'user';
        const msg = {
          id: rec?.id || data.messageId || data.id || 'socket_' + Date.now(),
          sender: senderVal,
          senderName: rec?.senderName || data.senderName || (senderVal === 'bot' ? '🤖 Bot' : senderVal === 'admin' || senderVal === 'advisor' ? 'admin' : 'Usuario'),
          message: (rec ? rec.message : null) || data.body || '',
          type: rec?.type || data.type || 'text',
          mediaUrl: rec?.mediaUrl || data.mediaUrl,
          fileName: rec?.fileName || data.fileName,
          fileSize: rec?.fileSize || data.fileSize,
          timestamp: rec?.timestamp || data.timestamp || Date.now(),
          replyTo: rec?.replyTo || data.replyTo,
          senderDisplayName: rec?.senderDisplayName || data.senderDisplayName || null,
          senderColor: rec?.senderColor || data.senderColor || null,
        };
        if (!renderedIdsRef.current.has(msg.id)) {
          renderedIdsRef.current.add(msg.id);
          setMessages(prev => {
            // ✅ FIX: Improved dedup — detect Baileys duplicate (same text, compatible sender, within 10s window)
            const msgTimestamp = msg.timestamp || Date.now();
            const dupIdx = prev.findIndex(m => {
              const timeDiff = Math.abs(msgTimestamp - (m.timestamp || 0));
              const isSameSender = m.sender === msg.sender
                || (m.sender === 'bot' && msg.sender === 'advisor')
                || (m.sender === 'advisor' && msg.sender === 'bot');
              return isSameSender && m.message === msg.message && timeDiff < 10000;
            });

            if (dupIdx !== -1) {
              // Duplicate detected — keep the original, skip this one
              return prev;
            }
            return [...prev, msg];
          });
          
          // ✅ FIX: Auto-scroll into view when new messages arrive
          setTimeout(() => {
            if (messagesEndRef.current) {
               messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
        }
      }
      // ✅ PERFORMANCE: Invalidate message cache so next open fetches fresh data
      _invalidateMsgsCache(targetUserId);
      // Refresh conversation list
      loadConversations(0);
      loadStats();
    };

    const handleStatusChange = () => {
      loadConversations(0);
      loadStats();
    };

    // ✅ FIX: Listen for bot-status-updated to sync IA toggle in real-time
    const handleBotStatusUpdated = (data) => {
      const { userId: targetId, botActive, status: newStatus } = data;
      // Update the selected conversation if it matches
      if (targetId === selectedUserIdRef.current) {
        setSelectedConv(prev => prev ? {
          ...prev,
          bot_active: botActive,
          status: newStatus || prev.status,
        } : prev);
      }
      // Update the conversations list for the sidebar
      setConversations(prev => prev.map(c =>
        c.userId === targetId
          ? { ...c, bot_active: botActive, status: newStatus || c.status }
          : c
      ));
      loadStats();
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message', handleNewMessage);
    socket.on('conversation-updated', handleStatusChange);
    socket.on('conversation-taken', handleStatusChange);
    socket.on('conversation-released', handleStatusChange);
    socket.on('bot-status-updated', handleBotStatusUpdated);
    socket.on('escalation-detected', handleStatusChange);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message', handleNewMessage);
      socket.off('conversation-updated', handleStatusChange);
      socket.off('conversation-taken', handleStatusChange);
      socket.off('conversation-released', handleStatusChange);
      socket.off('bot-status-updated', handleBotStatusUpdated);
      socket.off('escalation-detected', handleStatusChange);
    };
  // ✅ FIX: Removed selectedUserId from deps — using selectedUserIdRef instead to prevent
  // listener re-creation that causes stale closures and missed bot messages
  }, [socket, loadConversations, loadStats]);

  // ===========================
  // TOAST
  // ===========================
  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ===========================
  // BOLD TOGGLE
  // ===========================
  const handleBoldToggle = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = msgInput;

    if (start !== end) {
      // Text is selected → wrap in asterisks
      const selected = text.substring(start, end);
      // If already wrapped, unwrap
      if (selected.startsWith('*') && selected.endsWith('*') && selected.length > 2) {
        const unwrapped = selected.slice(1, -1);
        const newText = text.substring(0, start) + unwrapped + text.substring(end);
        setMsgInput(newText);
        setTimeout(() => { ta.focus(); ta.setSelectionRange(start, start + unwrapped.length); }, 0);
      } else {
        const wrapped = '*' + selected + '*';
        const newText = text.substring(0, start) + wrapped + text.substring(end);
        setMsgInput(newText);
        setTimeout(() => { ta.focus(); ta.setSelectionRange(start, start + wrapped.length); }, 0);
      }
    } else {
      // No selection → insert ** at cursor and place cursor between them
      const newText = text.substring(0, start) + '**' + text.substring(end);
      setMsgInput(newText);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 1, start + 1); }, 0);
    }
  };

  // ===========================
  // TEXTAREA AUTO-RESIZE
  // ===========================
  const handleInputChange = (e) => {
    const val = e.target.value;
    setMsgInput(val);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';

    // Slash command detection
    if (val.startsWith('/')) {
      const query = val.substring(1).toLowerCase();
      setQrQuery(val.substring(1));
      const filtered = query === ''
        ? quickReplies
        : quickReplies.filter(r =>
            r.title.toLowerCase().includes(query) ||
            // For text, also search in content; for media, only search by title to avoid matching URLs
            ((r.type || 'text') === 'text' && r.content?.toLowerCase().includes(query))
          );
      setQrFiltered(filtered);
      setShowQRDropdown(true);
      setQrFocusedIndex(-1);
    } else {
      setShowQRDropdown(false);
      setQrFiltered([]);
      setQrQuery('');
    }
  };

  const handleSelectQuickReply = (item) => {
    // Always close the dropdown first
    setShowQRDropdown(false);
    setQrFiltered([]);
    setQrQuery('');
    setQrFocusedIndex(-1);

    const itemType = item.type || 'text';

    if (itemType === 'text') {
      // Existing behavior — insert text into textarea for editing before send
      setMsgInput(item.content);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
          textareaRef.current.focus();
        }
      }, 0);
    } else {
      // Multimedia quick reply — open the same media preview overlay
      openQuickReplyMediaPreview(item);
    }
  };

  // Opens the existing mediaPreview overlay with the quick reply's file
  // Fetches the file from server as Blob so the existing sendAllPreviewFiles() pipeline works as-is
  const openQuickReplyMediaPreview = async (item) => {
    if (!selectedUserId) return;
    try {
      const token = localStorage.getItem('authToken');
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const API_BASE = window.location.protocol === 'https:' ? '' : isLocal ? 'http://localhost:3001' : '';
      const resp = await fetch(`${API_BASE}${item.mediaUrl}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!resp.ok) throw new Error('No se pudo cargar el archivo');
      const blob = await resp.blob();
      const ext = item.mediaUrl.split('.').pop().split('?')[0] || '';
      const file = new File([blob], `${item.title}.${ext}`, { type: blob.type });
      const localUrl = URL.createObjectURL(blob);
      // Open the same overlay used for drag & drop / file attach
      setMediaPreview([{
        file,
        type: item.type,
        url: localUrl,
        caption: item.content || ''  // Pre-fill caption from quick reply
      }]);
      setMediaPreviewIdx(0);
    } catch (e) {
      showToast('Error cargando archivo multimedia: ' + e.message, 'error');
    }
  };

  const handleKeyDown = (e) => {
    // Quick Reply dropdown keyboard navigation
    if (showQRDropdown && qrFiltered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setQrFocusedIndex(prev => Math.min(prev + 1, qrFiltered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setQrFocusedIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && qrFocusedIndex >= 0) {
        e.preventDefault();
        handleSelectQuickReply(qrFiltered[qrFocusedIndex]);
        return;
      }
    }
    if (e.key === 'Escape' && showQRDropdown) {
      e.preventDefault();
      setShowQRDropdown(false);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ===========================
  // FILTER & SEARCH
  // ===========================
  // Search is now server-side; only apply status filter client-side
  const filteredConvs = conversations
    .filter(c => {
      const isGroup = c.isGroup || (c.userId && c.userId.endsWith('@g.us'));
      // ✅ Groups filter: show only group chats (@g.us)
      if (filter === 'groups') return isGroup;
      // ✅ All other filters exclude groups by default
      if (isGroup) return false;

      // ✅ Device filters: show only conversations from that session
      if (filter === 'device1') return c.sessionIds?.includes('session1') || c.sessionId === 'session1';
      if (filter === 'device2') return c.sessionIds?.includes('session2') || c.sessionId === 'session2';
      
      if (filter === 'pending') return c.status === 'pending_advisor' || c.status === 'out_of_hours';
      if (filter === 'advisor') return c.status === 'advisor_handled';
      if (filter === 'active') return c.status === 'active';
      if (filter === 'expired') return c.status === 'expired';
      return true;
    })
    .sort((a, b) => {
      const tA = a.lastMessageTime || a.lastInteraction || a.timestamp || 0;
      const tB = b.lastMessageTime || b.lastInteraction || b.timestamp || 0;
      return tB - tA;
    });

  // ===========================
  // RENDER MESSAGE
  // ===========================
  function renderMessage(msg, filterType) {
    // Safety: ensure msg.message is always a string (not a nested object)
    if (msg.message && typeof msg.message === 'object') {
      msg = { ...msg, message: msg.message.message || msg.message.body || JSON.stringify(msg.message) };
    }

    const senderClass = (msg.sender === 'admin' || msg.sender === 'advisor') ? 'admin' : (msg.sender === 'bot' ? 'bot' : 'user');
    // Resolve display name: prefer senderDisplayName from message, then look up agentConfigs, fallback to senderName
    let senderName = msg.senderDisplayName || msg.senderName || (senderClass === 'admin' ? 'admin' : senderClass === 'bot' ? '🤖 Bot' : 'Usuario');
    // If no displayName in message, try to resolve from loaded agent configs
    const configKey = msg.senderName || msg.senderId;
    const agentCfg = configKey ? agentConfigs[configKey] : null;
    if (!msg.senderDisplayName && agentCfg?.display_name) {
      senderName = agentCfg.display_name;
    }
    // Resolve color: prefer from message, then from config
    const senderColor = msg.senderColor || agentCfg?.color || null;
    const timeStr = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
      
    // DEVICE BADGE
    let deviceBadge = null;
    if (filterType === 'all') {
      const msgSessionId = msg.sessionId || msg.metadata?.sessionId;
      if (msgSessionId === 'session1') {
        deviceBadge = <span className="message-device-badge session1" style={{fontSize: '0.7em', padding: '2px 4px', borderRadius: '4px', backgroundColor: '#e0f2fe', color: '#0284c7', marginLeft: '6px'}}>📱 Disp. 1</span>;
      } else if (msgSessionId === 'session2') {
        deviceBadge = <span className="message-device-badge session2" style={{fontSize: '0.7em', padding: '2px 4px', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#9333ea', marginLeft: '6px'}}>📲 Disp. 2</span>;
      }
    }
    
    let resolvedUrl = normalizeMediaUrl(msg.mediaUrl);
    // Fallback: build URL from message ID only for REAL Baileys IDs (not frontend-generated ones)
    const isBaileysId = msg.id && !msg.id.startsWith('adv_media_') && !msg.id.startsWith('msg_') && !msg.id.startsWith('adv_');
    if (!resolvedUrl && isBaileysId && ['audio', 'image', 'document', 'video'].includes(msg.type)) {
      resolvedUrl = normalizeMediaUrl(`/api/media/download/${msg.id}`);
    }
    // Stream URL for audio — only use /api/media/stream for real Baileys IDs
    const streamUrl = (msg.type === 'audio' && isBaileysId)
      ? normalizeMediaUrl(`/api/media/stream/${msg.id}`)
      : resolvedUrl;

    let content = null;
    if (msg.type === 'audio' && (resolvedUrl || streamUrl)) {
      content = (
        <div className="message-audio">
          <audio controls src={streamUrl || resolvedUrl} style={{ maxWidth: 260, height: 36 }} />
          <a className="media-download-btn" href="#" onClick={(e) => { e.preventDefault(); downloadFile(resolvedUrl, msg.fileName || 'audio'); }} title="Descargar audio">⬇️</a>
        </div>
      );
    } else if (msg.type === 'audio') {
      content = <div className="message-text">🎤 {formatWhatsAppText(safeMsg(msg.message) || 'Audio')}</div>;
    } else if (msg.type === 'image' && resolvedUrl) {
      const imgStreamUrl = resolvedUrl.replace('/download/', '/stream/');
      content = (
        <>
          <div className="message-image">
            <img src={imgStreamUrl} alt="Imagen" onClick={() => { setLightbox({ type: 'image', url: imgStreamUrl, downloadUrl: resolvedUrl }); setLightboxZoom(1); }} />
            <a className="media-download-btn" href="#" onClick={(e) => { e.preventDefault(); downloadFile(resolvedUrl, msg.fileName || 'imagen'); }} title="Descargar imagen">⬇️ Descargar</a>
          </div>
          {msg.message && safeMsg(msg.message) !== '[Imagen recibida]' && <div className="message-text">{formatWhatsAppText(safeMsg(msg.message))}</div>}
        </>
      );
    } else if (msg.type === 'image') {
      content = <div className="message-text">🖼️ {msg.message || 'Imagen'}</div>;
    } else if (msg.type === 'video' && resolvedUrl) {
      content = (
        <>
          <div className="message-video" onClick={() => { setLightbox({ type: 'video', url: resolvedUrl, downloadUrl: resolvedUrl }); setLightboxZoom(1); }}>
            <video src={resolvedUrl} style={{ maxWidth: 280, borderRadius: 6 }} preload="metadata" />
            <div className="video-play-overlay">▶</div>
            <a className="media-download-btn" href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadFile(resolvedUrl, msg.fileName || 'video'); }} title="Descargar video">⬇️ Descargar</a>
          </div>
          {msg.message && safeMsg(msg.message) !== '[Video recibido]' && <div className="message-text">{formatWhatsAppText(safeMsg(msg.message))}</div>}
        </>
      );
    } else if (msg.type === 'video') {
      content = <div className="message-text">🎬 {msg.message || 'Video'}</div>;
    } else if (msg.type === 'document' && resolvedUrl) {
      const fileSizeStr = msg.fileSize ? ` (${(msg.fileSize / 1024).toFixed(1)} KB)` : '';
      content = (
        <>
          <div className="message-document">
            <span className="message-document-icon">📄</span>
            <div>
              <div className="message-document-name">{msg.fileName || 'Documento'}{fileSizeStr}</div>
              <a className="message-document-link" href={resolvedUrl} download>Descargar</a>
            </div>
          </div>
          {msg.message && safeMsg(msg.message) !== msg.fileName && safeMsg(msg.message) !== '[Documento recibido]' && <div className="message-text">{formatWhatsAppText(safeMsg(msg.message))}</div>}
        </>
      );
    } else if (msg.type === 'document') {
      content = <div className="message-text">📄 {msg.message || 'Documento'}</div>;
    } else {
      content = <div className="message-text">{formatWhatsAppText(safeMsg(msg.message))}</div>;
    }

    return (
      <div key={msg.id || msg.messageId || Math.random()} className={`chat-message ${senderClass}`} data-message-id={msg.id}>
        <div className="message-sender" style={senderColor && senderClass === 'admin' ? { color: senderColor, fontWeight: 600 } : undefined}>{senderName}</div>
        <div className="message-bubble">
          {/* Reply-to quote */}
          {msg.replyTo?.message && (
            <div className="quoted-message">
              <div className="quoted-sender">{msg.replyTo.senderName || 'Usuario'}</div>
              <div className="quoted-text">{String(typeof msg.replyTo.message === 'object' ? (msg.replyTo.message?.message || '') : (msg.replyTo.message || '')).substring(0, 120)}</div>
            </div>
          )}
          {content}
          <div className="message-meta">
            <span className="message-time">{timeStr}</span>
            {deviceBadge}
            {senderClass !== 'user' && (
              <span className="message-checks">
                <svg className={`message-check double ${msg.read ? 'read' : ''}`} viewBox="0 0 16 11" width="16" height="11">
                  <path d="M11.5 1.5L5.5 7.5L2.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M14.5 1.5L8.5 7.5L5.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            )}
          </div>
          {/* Reply button */}
          <button className="msg-reply-btn" title="Responder" onClick={() => setReplyTo({
            id: msg.id,
            message: msg.message,
            sender: senderClass,
            senderName
          })}>↩</button>
        </div>
      </div>
    );
  }

  // ===========================
  // RENDER DATE SEPARATORS
  // ===========================
  function renderMessagesWithDates() {
    const elements = [];
    let lastDate = '';

    // Load more button
    if (hasMoreMsgs) {
      elements.push(
        <button key="load-more" className="load-more-messages-btn" onClick={loadOlderMessages}>
          ⬆️ Cargar más
        </button>
      );
    }

    let filteredMessages = messages;
    if (filter === 'device1') {
      filteredMessages = messages.filter(msg => (msg.sessionId || msg.metadata?.sessionId) === 'session1');
    } else if (filter === 'device2') {
      filteredMessages = messages.filter(msg => (msg.sessionId || msg.metadata?.sessionId) === 'session2');
    }

    filteredMessages.forEach(msg => {
      const msgDate = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString() : '';
      if (msgDate && msgDate !== lastDate) {
        elements.push(
          <div key={`date-${msgDate}`} className="chat-date-separator">
            <span>{msgDate}</span>
          </div>
        );
        lastDate = msgDate;
      }
      elements.push(renderMessage(msg, filter));
    });

    return elements;
  }

  // ===========================
  // RENDER
  // ===========================
  const convName = (c) => c.customName || c.whatsappName || c.registeredName || 'Sin nombre';
  const botIsActive = selectedConv?.bot_active !== false;
  const status = STATUS_CONFIG[selectedConv?.status] || { text: selectedConv?.status || '', cls: '', bg: '#f5f5f5', color: '#666' };

  return (
    <div className="chat-page-wrapper">
      {/* Stats Bar */}
      <div className="stats-bar">
        {[
          { icon: '💬', val: stats.total, label: 'Total' },
          { icon: '🟢', val: stats.active, label: 'Activas' },
          { icon: '⚠️', val: stats.pending, label: 'Pendientes' },
          { icon: '👨‍💼', val: stats.advisor, label: 'Con Asesor' },
          { icon: '🔴', val: stats.expired, label: 'Expiradas' },
          { icon: '✅', val: stats.consent, label: 'Aceptaron' },
        ].map(s => (
          <div key={s.label} className="stat-card-mini">
            <span className="stat-icon">{s.icon}</span>
            <div>
              <div className="stat-value">{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chat Layout */}
      <div className={`chat-layout ${selectedUserId ? 'chat-open' : ''}`}>

        {/* LEFT: Conversation List */}
        <div className="conv-list-panel">
          <div className="conv-list-header">
            <div className="conv-search-container">
              <button className="new-chat-btn" title="Nuevo Chat" onClick={() => { setModal('new-chat'); setModalData({}); }}>➕</button>
              <input
                type="text"
                className="conv-search-input"
                placeholder="🔍 Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="conv-filter-row">
              {[
                { key: 'device1', label: '📱 Disp. 1' },
                { key: 'device2', label: '📲 Disp. 2' },
                { key: 'pending', label: '⚠️ Pendientes' },
                { key: 'advisor', label: '👨‍💼 Asesor' },
                { key: 'active', label: '🟢 Activas' },
                { key: 'expired', label: '🔴 Expiradas' },
                { key: 'groups', label: '👥 Grupos' },
              ].map(f => (
                <button
                  key={f.key}
                  className={`conv-filter-btn ${filter === f.key ? 'active' : ''} ${f.key === 'device1' ? 'device1' : ''} ${f.key === 'device2' ? 'device2' : ''}`}
                  onClick={() => setFilter(f.key)}
                >{f.label}</button>
              ))}
            </div>
          </div>

          <div className="conv-list-scroll">
            {loadingConvs ? (
              <div className="conv-list-loading">
                <div className="spinner" />
                <div>Cargando conversaciones...</div>
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="conv-list-empty">
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div>{searchQuery || filter !== 'all' ? 'Sin resultados' : 'No hay conversaciones'}</div>
              </div>
            ) : (
              filteredConvs.map(c => {
                const name = convName(c);
                const rawMsg = c.lastMessage && typeof c.lastMessage === 'object' ? (c.lastMessage.message || c.lastMessage.body || '') : (c.lastMessage || '');
                const lastMsg = rawMsg
                  ? (rawMsg.length > 40 ? rawMsg.substring(0, 40) + '...' : rawMsg)
                  : 'Sin mensajes';
                const cStatus = STATUS_CONFIG[c.status];

                return (
                  <div
                    key={c.userId}
                    className={`conv-item ${selectedUserId === c.userId ? 'active' : ''} ${c.status === 'pending_advisor' ? 'pending' : ''}`}
                    onClick={() => selectConversation(c.userId)}
                  >
                    <ProfileAvatar 
                      jid={c.userId} 
                      name={name} 
                      isGroup={c.isGroup} 
                      onClick={(picUrl) => setLightboxImage(picUrl)} 
                    />
                    <div className="conv-info">
                      <div className="conv-info-top">
                        <span className="conv-name">
                          {name}
                          {(c.isGroup || (c.userId && c.userId.endsWith('@g.us'))) && <span className="conv-group-badge">Grupo</span>}
                        </span>
                        <span className="conv-time">{timeAgo(c.lastMessageTime || c.lastInteraction || c.timestamp)}</span>
                      </div>
                      <div className="conv-info-bottom">
                        <span className="conv-last-msg">{lastMsg}</span>
                        {cStatus && <span className={`conv-status-badge ${cStatus.cls}`}>{cStatus.text}</span>}
                        {/* ✅ DEVICE badge */}
                        {c.sessionId && DEVICE_CONFIG[c.sessionId] && (
                          <span
                            className="conv-device-badge"
                            style={{
                              background: DEVICE_CONFIG[c.sessionId].bg,
                              color: DEVICE_CONFIG[c.sessionId].color
                            }}
                          >
                            {DEVICE_CONFIG[c.sessionId].emoji} {DEVICE_CONFIG[c.sessionId].label}
                          </span>
                        )}
                        <div className="conv-actions">
                          <button className="conv-action-btn edit" title="Editar" onClick={e => {
                            e.stopPropagation();
                            setModal('edit-name');
                            setModalData({ userId: c.userId, name: c.customName || c.whatsappName || '' });
                          }}>✏️</button>
                          <button className="conv-action-btn delete" title="Eliminar" onClick={e => {
                            e.stopPropagation();
                            setModal('delete');
                            setModalData({ userId: c.userId, name: convName(c), phone: formatPhoneDisplay(c.phoneNumber || c.userId) });
                          }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {hasMoreConvs && (
            <button className="conv-load-more-btn" onClick={() => loadConversations(convsOffset + 30, activeSearchRef.current)}>
              ⬇️ Cargar más conversaciones
            </button>
          )}
        </div>

        {/* RIGHT: Chat Panel */}
        <div
          className="chat-panel"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && selectedUserId && (
            <div className="drag-overlay">
              <div className="drag-overlay-content">
                <div style={{ fontSize: 48 }}>📂</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Suelta el archivo aquí</div>
                <div style={{ fontSize: 13, color: '#8696a0' }}>Imagen, PDF, audio o documento</div>
              </div>
            </div>
          )}
          {!selectedUserId ? (
            <div className="chat-empty-state">
              <div className="empty-icon">💬</div>
              <h2>CONSTRUCTORA G&A Chat</h2>
              <p>Selecciona una conversación del panel izquierdo para ver los mensajes y responder en tiempo real.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="chat-header-left">
                  <div className="chat-header-avatar" style={{ overflow: 'hidden' }}>
                    <ProfileAvatar 
                      jid={selectedConv?.userId} 
                      name={selectedConv?.registeredName || selectedConv?.whatsappName || normalizePhoneNumber(selectedConv?.phoneNumber)}
                      isGroup={selectedConv?.isGroup}
                      onClick={(picUrl) => setLightboxImage(picUrl)}
                    />
                  </div>
                  <div className="chat-header-info">
                    <span className="chat-header-name">{convName(selectedConv || {})}</span>
                    <span className="chat-header-phone">
                      {formatPhoneDisplay(selectedConv?.phoneNumber || selectedUserId)}
                      {/* ✅ DEVICE: Show which device is handling this conversation */}
                      {selectedConv?.sessionId && DEVICE_CONFIG[selectedConv.sessionId] && (
                        <span
                          className="chat-header-device-badge"
                          style={{
                            background: DEVICE_CONFIG[selectedConv.sessionId].bg,
                            color: DEVICE_CONFIG[selectedConv.sessionId].color
                          }}
                        >
                          {DEVICE_CONFIG[selectedConv.sessionId].emoji} {DEVICE_CONFIG[selectedConv.sessionId].label}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="chat-header-status" style={{ background: status.bg, color: status.color }}>
                    {status.text}
                  </span>
                </div>
                <div className="chat-header-actions">
                  {selectedConv?.status === 'pending_advisor' && (
                    <button className="chat-action-btn take" onClick={handleTake}>👥 Tomar</button>
                  )}
                  <div className="ia-toggle-wrapper" title={botIsActive ? 'IA activa' : 'IA inactiva'}>
                    <span className="ia-toggle-label">{botIsActive ? '🤖 IA' : '🔴 IA'}</span>
                    <label className="ia-switch">
                      <input type="checkbox" checked={botIsActive} onChange={e => handleToggleIA(e.target.checked)} />
                      <span className="ia-slider" />
                    </label>
                  </div>
                  {selectedConv?.status === 'advisor_handled' && (
                    <button className="chat-action-btn release" onClick={handleRelease}>↩️ Liberar</button>
                  )}
                  <button className="chat-action-btn reset" onClick={handleReset}>🔄 Reset</button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="chat-messages-area" ref={messagesContainerRef}>
                {loadingMsgs ? (
                  <div className="chat-loading-messages">
                    <div className="spinner" />
                    <div>Cargando mensajes...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-loading-messages">No hay mensajes aún. ¡Inicia la conversación!</div>
                ) : (
                  renderMessagesWithDates()
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Preview */}
              {replyTo && (
                <div className="reply-preview">
                  <div className="reply-preview-content">
                    <div className="reply-preview-sender">{replyTo.senderName || 'Usuario'}</div>
                    <div className="reply-preview-text">{(replyTo.message || '').substring(0, 100)}</div>
                  </div>
                  <button className="reply-preview-close" onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}

              {/* Chat Footer */}
              <div className="chat-footer" style={{ position: 'relative' }}>
                {isRecording ? (
                  /* Recording mode */
                  <div className="recording-bar">
                    <button className="chat-footer-btn recording-cancel" title="Cancelar" onClick={cancelRecording}>🗑️</button>
                    <div className="recording-indicator">
                      <span className="recording-dot" />
                      <span className="recording-timer">{formatRecordingTime(recordingTime)}</span>
                    </div>
                    <button className="chat-send-btn" title="Enviar audio" onClick={stopRecording}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  /* Normal mode */
                  <>
                    <button className="chat-footer-btn" title="Emoji" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowAttachMenu(false); }}>😊</button>
                    <button className="chat-footer-btn" title="Adjuntar" onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmojiPicker(false); }}>📎</button>
                    <button className="chat-footer-btn bold-btn" title="Negrilla" onClick={handleBoldToggle}><strong>N</strong></button>

                    <div className="chat-input-wrapper" style={{ position: 'relative' }}>
                      <QuickReplyDropdown
                        visible={showQRDropdown}
                        query={qrQuery}
                        items={qrFiltered}
                        focusedIndex={qrFocusedIndex}
                        onSelect={handleSelectQuickReply}
                      />
                      <textarea
                        ref={textareaRef}
                        placeholder="Escribe un mensaje... (/ para respuestas rápidas)"
                        rows={1}
                        value={msgInput}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                      />
                    </div>

                    {msgInput.trim() ? (
                      <button className="chat-send-btn" title="Enviar" disabled={sending} onClick={handleSendMessage}>
                        {sending ? '⏳' : (
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <button className="chat-mic-btn" title="Grabar audio" onClick={startRecording}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="1" width="6" height="12" rx="3" />
                          <path d="M19 10v2a7 7 0 01-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                      </button>
                    )}
                  </>
                )}

                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div className="emoji-picker-panel active">
                    <div className="emoji-picker-grid">
                      {EMOJIS.map(em => (
                        <span key={em} className="emoji-picker-item" onClick={() => {
                          setMsgInput(prev => prev + em);
                          textareaRef.current?.focus();
                        }}>{em}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attach Menu */}
                {showAttachMenu && (
                  <div className="attach-menu active">
                    <div className="attach-menu-item" onClick={() => fileImageRef.current?.click()}>
                      <div className="item-icon">📷</div>
                      <span>Imagen</span>
                    </div>
                    <div className="attach-menu-item" onClick={() => fileDocRef.current?.click()}>
                      <div className="item-icon">📄</div>
                      <span>Documento</span>
                    </div>
                    <div className="attach-menu-item" onClick={() => fileAudioRef.current?.click()}>
                      <div className="item-icon">🎵</div>
                      <span>Audio</span>
                    </div>
                    <div className="attach-menu-item" onClick={() => fileVideoRef.current?.click()}>
                      <div className="item-icon">🎬</div>
                      <span>Video</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden file inputs */}
              <input ref={fileImageRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFileSelect(e, 'image')} />
              <input ref={fileDocRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" multiple style={{ display: 'none' }} onChange={e => handleFileSelect(e, 'document')} />
              <input ref={fileAudioRef} type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={e => handleFileSelect(e, 'audio')} />
              <input ref={fileVideoRef} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => handleFileSelect(e, 'video')} />

              {/* Media Preview Overlay — Multi-file carousel */}
              {mediaPreview && mediaPreview.length > 0 && (() => {
                const current = mediaPreview[mediaPreviewIdx] || mediaPreview[0];
                return (
                <div className="media-preview-overlay">
                  {/* Top bar: close + file counter */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', zIndex: 10001 }}>
                    <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', padding: 10 }}
                      onClick={() => { mediaPreview.forEach(p => URL.revokeObjectURL(p.url)); setMediaPreview(null); setMediaPreviewIdx(0); }}>✕</button>
                    {mediaPreview.length > 1 && (
                      <span style={{ color: '#e9edef', fontSize: 14, fontWeight: 600 }}>
                        {mediaPreviewIdx + 1} / {mediaPreview.length}
                      </span>
                    )}
                    {/* Remove current file */}
                    {mediaPreview.length > 1 && (
                      <button style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', padding: '6px 14px', borderRadius: 6 }}
                        onClick={() => {
                          URL.revokeObjectURL(current.url);
                          const updated = mediaPreview.filter((_, i) => i !== mediaPreviewIdx);
                          setMediaPreview(updated.length > 0 ? updated : null);
                          setMediaPreviewIdx(prev => Math.min(prev, (updated.length || 1) - 1));
                        }}>🗑️ Quitar</button>
                    )}
                  </div>

                  {/* Main preview area with navigation arrows */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 20px', position: 'relative' }}>
                    {/* Left arrow */}
                    {mediaPreview.length > 1 && mediaPreviewIdx > 0 && (
                      <button style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
                        onClick={() => setMediaPreviewIdx(prev => prev - 1)}>◀</button>
                    )}
                    {/* Right arrow */}
                    {mediaPreview.length > 1 && mediaPreviewIdx < mediaPreview.length - 1 && (
                      <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
                        onClick={() => setMediaPreviewIdx(prev => prev + 1)}>▶</button>
                    )}

                    {/* Current file preview */}
                    {current.type === 'image' ? (
                      <img src={current.url} alt="Preview" style={{ maxWidth: '85%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 30px rgba(0,0,0,0.5)' }} />
                    ) : current.type === 'video' ? (
                      <video src={current.url} controls style={{ maxWidth: '85%', maxHeight: '65vh', borderRadius: 8 }} />
                    ) : current.type === 'audio' ? (
                      <div style={{ textAlign: 'center', color: '#e9edef' }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>🎵</div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{current.file.name}</div>
                        <audio src={current.url} controls style={{ maxWidth: 320 }} />
                        <div style={{ fontSize: 12, color: '#8696a0', marginTop: 8 }}>{(current.file.size / 1024).toFixed(1)} KB</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#e9edef' }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>📄</div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{current.file.name}</div>
                        <div style={{ fontSize: 13, color: '#8696a0' }}>{(current.file.size / 1024).toFixed(1)} KB</div>
                      </div>
                    )}
                  </div>

                  {/* Thumbnail strip (if multiple files) */}
                  {mediaPreview.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '10px 20px', flexWrap: 'wrap' }}>
                      {mediaPreview.map((item, idx) => (
                        <div key={idx}
                          style={{ width: 52, height: 52, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', border: idx === mediaPreviewIdx ? '2px solid #25d366' : '2px solid transparent', background: '#2a3942', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}
                          onClick={() => setMediaPreviewIdx(idx)}>
                          {item.type === 'image' ? (
                            <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '📄'}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bottom bar: caption + send */}
                  <div style={{ background: 'rgba(11,20,26,0.9)', padding: '14px 30px', display: 'flex', alignItems: 'center', gap: 15, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 0 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a3942', fontSize: 18, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }}>
                        {current.type === 'image' ? (
                          <img src={current.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : current.type === 'video' ? '🎬' : current.type === 'audio' ? '🎵' : '📄'}
                      </div>
                      <div style={{ color: '#e9edef', minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{current.file.name}</div>
                        <div style={{ fontSize: 10, color: '#8696a0' }}>{(current.file.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                    </div>
                    <textarea
                      placeholder={`Descripción${mediaPreview.length > 1 ? ` (archivo ${mediaPreviewIdx + 1})` : ''}...`}
                      value={current.caption || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setMediaPreview(prev => prev.map((p, i) => i === mediaPreviewIdx ? { ...p, caption: val } : p));
                      }}
                      style={{ flex: 1, background: '#2a3942', border: 'none', color: '#e9edef', fontSize: 14, padding: '10px 15px', borderRadius: 8, outline: 'none', resize: 'none', minHeight: 40, maxHeight: 100, lineHeight: '1.4', fontFamily: 'inherit', overflow: 'auto' }}
                      rows={1}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAllPreviewFiles(); } }}
                      onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                      autoFocus
                    />
                    <button
                      style={{ background: '#25d366', border: 'none', color: '#fff', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}
                      disabled={sending}
                      onClick={sendAllPreviewFiles}
                    >{sending ? '⏳' : '➤'}</button>
                  </div>
                </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
      {/* ===== LIGHTBOX VIEWER ===== */}
      {lightbox && (
        <div
          className="lightbox-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setLightbox(null); setLightboxZoom(1); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setLightbox(null); setLightboxZoom(1); } }}
          onWheel={(e) => {
            e.preventDefault();
            setLightboxZoom(prev => Math.min(5, Math.max(0.5, prev + (e.deltaY > 0 ? -0.15 : 0.15))));
          }}
          tabIndex={0}
          ref={el => el && el.focus()}
        >
          <div className="lightbox-toolbar">
            {lightbox.type === 'image' && (
              <>
                <button className="lightbox-btn" title="Alejar" onClick={() => setLightboxZoom(prev => Math.max(0.5, prev - 0.25))}>➖</button>
                <span className="lightbox-zoom-label">{Math.round(lightboxZoom * 100)}%</span>
                <button className="lightbox-btn" title="Acercar" onClick={() => setLightboxZoom(prev => Math.min(5, prev + 0.25))}>➕</button>
                <button className="lightbox-btn" title="Restablecer" onClick={() => setLightboxZoom(1)}>🔄</button>
              </>
            )}
            <button className="lightbox-btn" title="Descargar" onClick={() => downloadFile(lightbox.downloadUrl, lightbox.type === 'image' ? 'imagen' : 'video')}>⬇️</button>
            <button className="lightbox-btn lightbox-close" title="Cerrar" onClick={() => { setLightbox(null); setLightboxZoom(1); }}>✕</button>
          </div>
          <div className="lightbox-content">
            {lightbox.type === 'image' ? (
              <img
                src={lightbox.url}
                alt="Imagen"
                className="lightbox-image"
                style={{ transform: `scale(${lightboxZoom})` }}
                draggable={false}
              />
            ) : (
              <video
                src={lightbox.url}
                controls
                autoPlay
                className="lightbox-video"
              />
            )}
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}
      {/* New Chat */}
      {modal === 'new-chat' && (
        <div className="modal-overlay active">
          <div className="modal-content">
            <div className="modal-header"><div className="modal-title">Nuevo Chat</div></div>
            <div className="modal-body">
              <label className="modal-label">Número de Teléfono</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12 }}>
                <span style={{
                  padding: '8px 12px', background: '#f0f2f5', border: '1px solid #d1d7db',
                  borderRight: 'none', borderRadius: '8px 0 0 8px', color: '#667781',
                  fontWeight: 600, fontSize: 14, userSelect: 'none'
                }}>+57</span>
                <input className="modal-input" type="tel" placeholder="3001234567"
                  value={modalData.phone || ''}
                  maxLength={10}
                  style={{ borderRadius: '0 8px 8px 0', margin: 0 }}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setModalData(p => ({ ...p, phone: val }));
                  }} />
              </div>
              <label className="modal-label">Nombre (Opcional)</label>
              <input className="modal-input" type="text" placeholder="Nombre del contacto" value={modalData.name || ''}
                onChange={e => setModalData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="modal-btn primary" onClick={handleNewChat}>Crear Chat</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Name */}
      {modal === 'edit-name' && (
        <div className="modal-overlay active">
          <div className="modal-content">
            <div className="modal-header"><div className="modal-title">Editar Nombre</div></div>
            <div className="modal-body">
              <label className="modal-label">Nombre Personalizado</label>
              <input className="modal-input" type="text" placeholder="Nombre del contacto" value={modalData.name || ''}
                onChange={e => setModalData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="modal-btn primary" onClick={handleEditName}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {modal === 'delete' && (
        <div className="modal-overlay active">
          <div className="modal-content">
            <div className="modal-header"><div className="modal-title">Ocultar Conversación</div></div>
            <div className="modal-body">
              <p style={{ color: '#667781', marginBottom: 10 }}>¿Ocultar la conversación de <strong>{modalData.name || modalData.phone}</strong>?</p>
              <p style={{ fontSize: 12, color: '#667781' }}>La conversación no se eliminará de la base de datos. Si el usuario vuelve a escribir, la conversación reaparecerá automáticamente.</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="modal-btn primary" style={{ background: '#e74c3c' }} onClick={handleDeleteChat}>Ocultar</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      {modal === 'reset' && (
        <div className="modal-overlay active">
          <div className="modal-content">
            <div className="modal-header"><div className="modal-title">Resetear Conversación</div></div>
            <div className="modal-body">
              <p style={{ color: '#667781', marginBottom: 10 }}>¿Resetear conversación para <strong>{modalData.phone}</strong>?</p>
              <p style={{ fontSize: 12, color: '#667781' }}>Se reiniciará el ciclo del bot, el estado de consentimiento y la IA volverá a activarse automáticamente.</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="modal-btn primary" onClick={handleConfirmReset}>Resetear</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Profile Picture Lightbox ===== */}
      {lightboxImage && (
        <div className="profile-lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="profile-lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button className="profile-lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
            <img src={lightboxImage} alt="Foto de perfil" className="profile-lightbox-img" />
          </div>
        </div>
      )}
    </div>
  );
}
