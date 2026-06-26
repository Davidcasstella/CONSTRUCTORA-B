import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import * as convService from '../services/conversationService';
import { normalizePhoneNumber, getInitials, formatRelativeTime } from '../utils/formatters';
import { formatWhatsAppText } from '../utils/formatWhatsAppText';
import '../styles/chat.css';

/**
 * Safely extract the display text from a message object.
 * Handles plain strings, {type, text, useList} objects, and null/undefined.
 */
function getMsgText(msg) {
  const raw = msg.message || msg.content || msg.body || msg.text;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // Object with .text property (e.g. {type, text, useList})
  if (typeof raw === 'object' && typeof raw.text === 'string') return raw.text;
  // Array of content blocks — join their text
  if (Array.isArray(raw)) {
    return raw.map(item => (typeof item === 'string' ? item : item?.text || '')).join('\n');
  }
  // Fallback: stringify to avoid crash
  try { return JSON.stringify(raw); } catch { return ''; }
}



export default function ChatPage() {
  const { socket } = useSocket();
  const [searchParams] = useSearchParams();
  const initialUserId = searchParams.get('userId') || '';

  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({});
  const messagesEndRef = useRef(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const data = await convService.getConversations(0, 100);
      if (data?.conversations) {
        setConversations(data.conversations);
        if (data.stats) setStats(data.stats);
      }
    } catch { } finally {
      setLoadingConvs(false);
    }
  }, []);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (userId) => {
    if (!userId) return;
    setLoadingMessages(true);
    try {
      const data = await convService.getMessages(userId, 50);
      if (data?.messages) {
        setMessages(data.messages);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch { } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { if (selectedUserId) loadMessages(selectedUserId); }, [selectedUserId]);

  // Real-time message updates
  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (data) => {
      loadConversations();
      if (data?.from === selectedUserId || data?.to === selectedUserId) {
        loadMessages(selectedUserId);
      }
    };
    socket.on('message-received', onNewMessage);
    socket.on('bot-response', onNewMessage);
    socket.on('new-message', onNewMessage);
    return () => {
      socket.off('message-received', onNewMessage);
      socket.off('bot-response', onNewMessage);
      socket.off('new-message', onNewMessage);
    };
  }, [socket, selectedUserId]);

  async function sendMessage() {
    if (!messageInput.trim() || !selectedUserId) return;
    try {
      const user = JSON.parse(localStorage.getItem('authUser') || '{}');
      const authData = {
        id: user.id || user.username || 'advisor_' + Date.now(),
        name: user.name || user.username || 'Asesor',
        email: user.email || 'admin@constructoragya.com'
      };
      await convService.sendMessage(selectedUserId, messageInput, authData);
      setMessageInput('');
      await loadMessages(selectedUserId);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    const name = c.registeredName || c.whatsappName || c.customName || '';
    const matchesSearch = !searchTerm ||
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.userId || '').includes(searchTerm) ||
      (c.phoneNumber || '').includes(searchTerm);
    const matchesFilter = filter === 'all' ||
      (filter === 'pending' && (c.status === 'pending_advisor' || c.status === 'escalated')) ||
      (filter === 'advisor' && c.status === 'advisor_handled') ||
      (filter === 'active' && c.status === 'active') ||
      (filter === 'expired' && (c.status === 'expired' || c.status === 'new_cycle'));
    return matchesSearch && matchesFilter;
  });

  const selectedConv = conversations.find(c => c.userId === selectedUserId);

  return (
    <div className="chat-page-container">
      {/* Conversation List */}
      <div className="conv-list-panel">
        <div className="conv-list-header">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span className="conv-search-icon">🔍</span>
              <input type="text" className="conv-search-input" placeholder="Buscar..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="conv-filter-row">
            {['all', 'pending', 'advisor', 'active', 'expired'].map(f => (
              <button key={f} className={`conv-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Todos' : f === 'pending' ? '⚠️ Pendientes' : f === 'advisor' ? '👨‍💼 Asesor' : f === 'active' ? '🟢 Activas' : '🔴 Expiradas'}
              </button>
            ))}
          </div>
        </div>

        <div className="conv-list-scroll">
          {loadingConvs ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div className="spinner"></div>
              <div>Cargando conversaciones...</div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Sin conversaciones</div>
          ) : filteredConversations.map(conv => (
            <div key={conv.userId}
              className={`conv-list-item ${conv.userId === selectedUserId ? 'selected' : ''}`}
              onClick={() => setSelectedUserId(conv.userId)}>
              <div className="conv-list-avatar">{getInitials(conv.registeredName || conv.whatsappName)}</div>
              <div className="conv-list-info">
                <div className="conv-list-name">{conv.registeredName || conv.whatsappName || normalizePhoneNumber(conv.userId)}</div>
                <div className="conv-list-preview">{conv.lastMessage ? (conv.lastMessage.length > 35 ? conv.lastMessage.substring(0, 35) + '...' : conv.lastMessage) : '...'}</div>
              </div>
              <div className="conv-list-meta">
                <div className="conv-list-time">{formatRelativeTime(conv.lastInteraction)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Panel */}
      <div className="chat-panel">
        {!selectedUserId ? (
          <div className="chat-empty-state" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            <div style={{ fontSize: 60, marginBottom: 15 }}>💬</div>
            <h2>CONSTRUCTORA G&A Chat</h2>
            <p>Selecciona una conversación del panel izquierdo para comenzar a chatear.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Chat Header */}
            <div className="chat-header-bar">
              <div className="chat-header-avatar-sm">{getInitials(selectedConv?.registeredName || selectedConv?.whatsappName)}</div>
              <div>
                <div className="chat-header-name-sm">{selectedConv?.registeredName || selectedConv?.whatsappName || 'Contacto'}</div>
                <div className="chat-header-phone-sm">{normalizePhoneNumber(selectedUserId)}</div>
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages-area">
              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '40px' }}><div className="spinner"></div></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>No hay mensajes aún</div>
              ) : messages.map((msg, i) => (
                <div key={msg.id || i} className={`chat-bubble ${msg.sender === 'user' || msg.direction === 'incoming' ? 'incoming' : 'outgoing'}`}>
                  <div className="bubble-text">{formatWhatsAppText(getMsgText(msg))}</div>
                  <div className="bubble-time">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input-bar">
              <textarea
                className="chat-message-textarea"
                placeholder="Escribe un mensaje..."
                rows={1}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <button className="chat-send-btn" onClick={sendMessage} title="Enviar">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
