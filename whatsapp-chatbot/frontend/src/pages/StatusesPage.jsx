import { useState, useEffect, useRef, useCallback } from 'react';
import * as statusesService from '../services/statusesService';
import '../styles/statuses.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const STORY_DURATION_MS = 5000; // 5 seconds per status

const BG_COLORS = [
  { bg: '#075E54', text: '#ffffff' },
  { bg: '#128C7E', text: '#ffffff' },
  { bg: '#25D366', text: '#ffffff' },
  { bg: '#1565C0', text: '#ffffff' },
  { bg: '#6A1B9A', text: '#ffffff' },
  { bg: '#BF360C', text: '#ffffff' },
  { bg: '#F57F17', text: '#222222' },
  { bg: '#1B5E20', text: '#ffffff' },
  { bg: '#880E4F', text: '#ffffff' },
  { bg: '#212121', text: '#ffffff' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function timeUntilExpiry(isoDate) {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const hrs = Math.floor(diff / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `Expira en ${hrs}h ${min}m`;
  return `Expira en ${min} min`;
}

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Format seconds as mm:ss
function fmtTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── API base URL for images ──────────────────────────────────────────────────
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocal
  ? 'http://localhost:3001'
  : (import.meta.env.VITE_API_URL || '');

function resolveUrl(content) {
  if (!content) return '';
  if (content.startsWith('http')) return content;
  return `${API_BASE}${content}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Avatar circle with initials */
function Avatar({ name, isMe, size = 48 }) {
  const initials = getInitials(name);
  return (
    <div className={`status-avatar-ring ${isMe ? 'mine' : ''}`}
      style={{ width: size + 6, height: size + 6, padding: 2 }}>
      <div className="status-avatar-inner" style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {initials}
      </div>
    </div>
  );
}

// ─── Video Player (used inside StoryViewer) ───────────────────────────────────
function VideoPlayer({ src, onEnded }) {
  const videoRef  = useRef(null);
  const [playing, setPlaying]   = useState(false);
  const [muted,   setMuted]     = useState(false);
  const [current, setCurrent]   = useState(0);
  const [duration, setDuration] = useState(0);

  // Auto-play on mount
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setPlaying(true)).catch(() => {});
    const onTimeUpdate = () => setCurrent(v.currentTime);
    const onDuration   = () => setDuration(v.duration);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('loadedmetadata', onDuration);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('loadedmetadata', onDuration);
    };
  }, [src]);

  function togglePlay(e) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); }
  }

  function handleSeek(e) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    v.currentTime = ratio * duration;
  }

  function toggleMute(e) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <>
      <video
        ref={videoRef}
        className="story-video"
        src={src}
        playsInline
        onEnded={onEnded}
        onClick={togglePlay}
      />
      {/* Custom controls */}
      <div className="story-video-controls" onClick={e => e.stopPropagation()}>
        <button className="story-video-play-btn" onClick={togglePlay}>
          {playing ? '⏸' : '▶'}
        </button>
        <div className="story-video-bar-wrap" onClick={handleSeek}>
          <div className="story-video-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="story-video-time">{fmtTime(current)} / {fmtTime(duration)}</span>
        <button className="story-video-mute-btn" onClick={toggleMute}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </>
  );
}

// ─── Story Viewer ─────────────────────────────────────────────────────────────
function StoryViewer({ statuses, activeGroupIndex, onClose, onDelete, currentUserId }) {
  const group         = statuses[activeGroupIndex];
  const items         = group?.items || [];
  const [idx, setIdx] = useState(0);
  const timerRef      = useRef(null);
  const [progress, setProgress] = useState(0);
  const progressRef   = useRef(null);

  const currentItem = items[idx];

  // State for WhatsApp publish action
  const [publishing, setPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState(null);  // 'ok' | 'error'
  // Pause auto-advance while publishing so the viewer doesn't close mid-request
  const [paused, setPaused] = useState(false);
  const [publishError, setPublishError] = useState(null);

  // Two-step delete confirmation (avoids blocking window.confirm)
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmDeleteTimer = useRef(null);

  function handleDeleteClick(e) {
    e.stopPropagation();
    if (!confirmDelete) {
      // First click: show confirm state, pause timer
      setConfirmDelete(true);
      setPaused(true);
      clearTimeout(confirmDeleteTimer.current);
      // Auto-cancel confirm after 3 seconds
      confirmDeleteTimer.current = setTimeout(() => {
        setConfirmDelete(false);
        setPaused(false);
      }, 3000);
    } else {
      // Second click: execute deletion
      clearTimeout(confirmDeleteTimer.current);
      setConfirmDelete(false);
      setPaused(false);
      onDelete(currentItem.id);
    }
  }

  // Cancel confirm if item changes
  useEffect(() => {
    setConfirmDelete(false);
    setPaused(false);
    clearTimeout(confirmDeleteTimer.current);
  }, [idx, activeGroupIndex]);

  async function handlePublishToWhatsApp(e) {
    e.stopPropagation();
    if (publishing) return;
    setPublishing(true);
    setPaused(true);  // Stop auto-advance timer
    setPublishFeedback(null);
    setPublishError(null);
    try {
      const res = await statusesService.publishToWhatsApp(currentItem.id);
      if (res?.success) {
        setPublishFeedback('ok');
        setTimeout(() => { setPublishFeedback(null); setPaused(false); }, 3500);
      } else {
        const errMsg = res?.error || 'Error desconocido del servidor';
        setPublishError(errMsg);
        throw new Error(errMsg);
      }
    } catch (err) {
      setPublishFeedback('error');
      if (!publishError) setPublishError(err.message || 'Error al publicar');
      setTimeout(() => { setPublishFeedback(null); setPublishError(null); setPaused(false); }, 5000);
    } finally {
      setPublishing(false);
    }
  }

  // Reset idx when group changes
  useEffect(() => { setIdx(0); }, [activeGroupIndex]);

  const goNext = useCallback(() => {
    if (idx < items.length - 1) {
      setIdx(i => i + 1);
    } else {
      onClose();
    }
  }, [idx, items.length, onClose]);

  const goPrev = useCallback(() => {
    if (idx > 0) setIdx(i => i - 1);
  }, [idx]);

  // Auto-advance timer (skipped for videos — they advance via onEnded)
  // Also paused while a WhatsApp publish is in progress
  useEffect(() => {
    // Clear previous animation
    if (progressRef.current) {
      progressRef.current.style.animation = 'none';
      void progressRef.current.offsetWidth; // reflow
    }

    clearTimeout(timerRef.current);

    // Do NOT auto-advance while publishing to WhatsApp
    if (paused) {
      return () => clearTimeout(timerRef.current);
    }

    if (currentItem?.type === 'video') {
      // For video, just fill the bar immediately (static) and rely on onEnded
      if (progressRef.current) {
        progressRef.current.style.width = '0%';
      }
      return () => clearTimeout(timerRef.current);
    }

    // Start timer for text / image
    timerRef.current = setTimeout(goNext, STORY_DURATION_MS);

    // Restart CSS animation
    if (progressRef.current) {
      progressRef.current.style.animation = `story-progress ${STORY_DURATION_MS}ms linear forwards`;
    }

    return () => clearTimeout(timerRef.current);
  }, [idx, activeGroupIndex, goNext, currentItem?.type, paused]);

  if (!group || !currentItem) return null;

  const isOwner = currentItem.userId === currentUserId;

  return (
    <div className="story-viewer" onClick={goNext}>
      {/* Progress bars */}
      <div className="story-progress-bars" onClick={e => e.stopPropagation()}>
        {items.map((_, i) => (
          <div key={i} className="story-progress-bar-track">
            <div
              ref={i === idx ? progressRef : null}
              className={`story-progress-bar-fill ${i < idx ? 'done' : i === idx ? 'active' : ''}`}
              style={i < idx ? { width: '100%' } : i > idx ? { width: '0%' } : {}}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="story-header" onClick={e => e.stopPropagation()}>
        <div className="story-header-avatar">
          {getInitials(group.userName)}
        </div>
        <div className="story-header-info">
          <div className="story-header-name">{group.userName}</div>
          <div className="story-header-time">{timeAgo(currentItem.createdAt)} · {timeUntilExpiry(currentItem.expiresAt)}</div>
        </div>
        <button className="story-header-close" onClick={onClose}>✕</button>
      </div>

      {/* Content */}
      <div className="story-content">
        {currentItem.type === 'image' ? (
          <>
            <img
              className="story-image"
              src={resolveUrl(currentItem.content)}
              alt="Status"
              onClick={goNext}
            />
            {currentItem.caption && (
              <div className="story-caption">{currentItem.caption}</div>
            )}
          </>
        ) : currentItem.type === 'video' ? (
          <>
            <VideoPlayer
              key={currentItem.id}
              src={resolveUrl(currentItem.content)}
              onEnded={goNext}
            />
            {currentItem.caption && (
              <div className="story-caption">{currentItem.caption}</div>
            )}
          </>
        ) : (
          <div
            className="story-text-content"
            style={{ background: currentItem.color || '#075E54' }}
          >
            <div
              className="story-text-body"
              style={{ color: currentItem.textColor || '#ffffff' }}
            >
              {currentItem.content}
            </div>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <button
        className="story-nav-btn prev"
        onClick={e => { e.stopPropagation(); goPrev(); }}
        disabled={idx === 0}
      >‹</button>
      <button
        className="story-nav-btn next"
        onClick={e => { e.stopPropagation(); goNext(); }}
        disabled={idx === items.length - 1}
      >›</button>

      {/* ── Action bar (delete + publish) — stop propagation so viewer doesn't advance ── */}
      <div className="story-action-bar" onClick={e => e.stopPropagation()}>
        {/* Delete (own statuses only) — two-step confirm: 1st click shows "¿Confirmar?", 2nd click deletes */}
        {isOwner && (
          <button
            className={`story-delete-btn ${confirmDelete ? 'confirming' : ''}`}
            onClick={handleDeleteClick}
          >
            {confirmDelete ? '⚠️ ¿Confirmar?' : '🗑️ Eliminar'}
          </button>
        )}

        {/* Publish to WhatsApp */}
        <button
          className={`story-wa-publish-btn ${publishFeedback === 'ok' ? 'success' : publishFeedback === 'error' ? 'error' : ''}`}
          onClick={handlePublishToWhatsApp}
          disabled={publishing}
          title={publishError || 'Publicar este estado en WhatsApp (lo verán tus contactos)'}
        >
          {publishing
            ? '⏳ Publicando...'
            : publishFeedback === 'ok'
              ? '✅ Publicado en WhatsApp'
              : publishFeedback === 'error'
                ? `❌ ${publishError || 'Error al publicar'}`
                : '📱 Publicar en WhatsApp'}
        </button>

        {/* Inline error detail */}
        {publishFeedback === 'error' && publishError && (
          <div className="story-publish-error-detail" onClick={e => e.stopPropagation()}>
            ⚠️ {publishError}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onCreated, currentUser }) {
  const [tab,        setTab]        = useState('text');   // 'text' | 'image' | 'video'
  const [text,       setText]       = useState('');
  const [color,      setColor]      = useState(BG_COLORS[0]);
  const [imageFile,  setImageFile]  = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoFile,  setVideoFile]  = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [caption,    setCaption]    = useState('');
  const [dragging,   setDragging]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [feedback,   setFeedback]   = useState(null);
  const fileInputRef  = useRef(null);
  const videoInputRef = useRef(null);

  function handleImageSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', msg: 'Solo se permiten imágenes (JPG, PNG, WebP, GIF)' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFeedback({ type: 'error', msg: 'La imagen no puede superar 8 MB' });
      return;
    }
    setImageFile(file);
    setFeedback(null);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  }

  function handleVideoSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setFeedback({ type: 'error', msg: 'Solo se permiten videos (MP4, WebM, MOV)' });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setFeedback({ type: 'error', msg: 'El video no puede superar 100 MB' });
      return;
    }
    setVideoFile(file);
    setFeedback(null);
    setVideoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      let result;
      if (tab === 'text') {
        if (!text.trim()) throw new Error('Escribe algo para tu estado');
        result = await statusesService.createTextStatus({
          content: text.trim(),
          color: color.bg,
          textColor: color.text,
        });
      } else if (tab === 'image') {
        if (!imageFile) throw new Error('Selecciona una imagen');
        const fd = new FormData();
        fd.append('image', imageFile);
        fd.append('caption', caption.trim());
        result = await statusesService.createImageStatus(fd);
      } else {
        // video tab
        if (!videoFile) throw new Error('Selecciona un video');
        const fd = new FormData();
        fd.append('video', videoFile);
        fd.append('caption', caption.trim());
        result = await statusesService.createVideoStatus(fd);
      }

      if (result?.success) {
        setFeedback({ type: 'success', msg: '✅ ¡Estado publicado!' });
        setTimeout(() => { onCreated(result.status); onClose(); }, 900);
      } else {
        throw new Error(result?.error || 'Error desconocido');
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: `❌ ${err.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="status-modal-overlay" onClick={onClose}>
      <div className="status-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="status-modal-header">
          <h3>📸 Nuevo Estado</h3>
          <button className="status-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="status-modal-tabs">
          <button
            id="status-tab-text"
            className={`status-modal-tab ${tab === 'text' ? 'active' : ''}`}
            onClick={() => setTab('text')}
          >✏️ Texto</button>
          <button
            id="status-tab-image"
            className={`status-modal-tab ${tab === 'image' ? 'active' : ''}`}
            onClick={() => setTab('image')}
          >🖼️ Imagen</button>
          <button
            id="status-tab-video"
            className={`status-modal-tab ${tab === 'video' ? 'active' : ''}`}
            onClick={() => setTab('video')}
          >🎥 Video</button>
        </div>

        <div className="status-modal-body">
          {/* ── Text tab ── */}
          {tab === 'text' && (
            <>
              <div
                className="status-text-preview"
                style={{ background: color.bg, minHeight: 140 }}
              >
                <textarea
                  id="status-text-input"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="¿Qué quieres compartir?"
                  maxLength={700}
                  rows={4}
                  style={{ color: color.text }}
                />
              </div>
              <div className="status-color-picker">
                {BG_COLORS.map((c, i) => (
                  <button
                    key={i}
                    id={`status-color-${i}`}
                    className={`status-color-dot ${color.bg === c.bg ? 'selected' : ''}`}
                    style={{ background: c.bg }}
                    onClick={() => setColor(c)}
                    title={c.bg}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Image tab ── */}
          {tab === 'image' && (
            <>
              {!imagePreview ? (
                <div
                  className={`status-image-dropzone ${dragging ? 'dragging' : ''}`}
                  onDragEnter={() => setDragging(true)}
                  onDragLeave={() => setDragging(false)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); setDragging(false); handleImageSelect(e.dataTransfer.files[0]); }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="status-image-file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={e => handleImageSelect(e.target.files[0])}
                  />
                  <div className="drop-icon">🖼️</div>
                  <p><strong>Arrastra una imagen aquí</strong></p>
                  <p>o haz clic para seleccionar (JPG, PNG, WebP · máx 8MB)</p>
                </div>
              ) : (
                <div className="status-image-preview-wrap">
                  <img className="status-image-preview" src={imagePreview} alt="Vista previa" />
                  <button
                    className="status-image-preview-remove"
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                  >✕</button>
                </div>
              )}
              <textarea
                id="status-image-caption"
                className="status-caption-input"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Escribe un pie de foto (opcional)"
                rows={2}
                maxLength={200}
                style={{ marginTop: 12 }}
              />
            </>
          )}

          {/* ── Video tab ── */}
          {tab === 'video' && (
            <>
              {!videoPreview ? (
                <div
                  className={`status-image-dropzone ${dragging ? 'dragging' : ''}`}
                  onDragEnter={() => setDragging(true)}
                  onDragLeave={() => setDragging(false)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); setDragging(false); handleVideoSelect(e.dataTransfer.files[0]); }}
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    id="status-video-file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    onChange={e => handleVideoSelect(e.target.files[0])}
                  />
                  <div className="drop-icon">🎥</div>
                  <p><strong>Arrastra un video aquí</strong></p>
                  <p>o haz clic para seleccionar (MP4, WebM, MOV · máx 100 MB)</p>
                </div>
              ) : (
                <div className="status-video-preview-wrap">
                  <video
                    className="status-video-preview"
                    src={videoPreview}
                    controls
                    playsInline
                  />
                  <button
                    className="status-video-preview-remove"
                    onClick={() => {
                      URL.revokeObjectURL(videoPreview);
                      setVideoFile(null);
                      setVideoPreview(null);
                    }}
                  >✕</button>
                </div>
              )}
              <textarea
                id="status-video-caption"
                className="status-caption-input"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Escribe un pie de video (opcional)"
                rows={2}
                maxLength={200}
                style={{ marginTop: 12 }}
              />
            </>
          )}

          {feedback && (
            <div className={`status-modal-feedback ${feedback.type}`}>{feedback.msg}</div>
          )}

          <button
            id="status-submit-btn"
            className="status-submit-btn"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '⏳ Publicando...' : tab === 'video' ? '📤 Publicar Video' : '📤 Publicar Estado'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function StatusesPage() {
  const [statuses,         setStatuses]        = useState([]);
  const [loading,          setLoading]         = useState(true);
  const [activeGroupIdx,   setActiveGroupIdx]  = useState(null);
  const [showUploadModal,  setShowUploadModal] = useState(false);

  // Derive current user from JWT stored in localStorage
  const currentUser = (() => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return { id: 'admin', name: 'Admin' };
      const payload = JSON.parse(atob(token.split('.')[1]));
      return { id: payload.username || payload.sub || 'admin', name: payload.username || 'Admin' };
    } catch { return { id: 'admin', name: 'Admin' }; }
  })();

  // ── Load statuses ───────────────────────────────────────────────────────────
  const loadStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await statusesService.getStatuses();
      if (res?.success) setStatuses(res.statuses || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  // ── Group statuses by userId ────────────────────────────────────────────────
  const grouped = statuses.reduce((acc, s) => {
    const key = s.userId;
    if (!acc[key]) acc[key] = { userId: s.userId, userName: s.userName, items: [] };
    acc[key].items.push(s);
    return acc;
  }, {});

  // Ensure current user's group is first
  const myGroup    = grouped[currentUser.id];
  const otherGroups = Object.values(grouped).filter(g => g.userId !== currentUser.id);
  const allGroups  = myGroup ? [myGroup, ...otherGroups] : otherGroups;

  // ── Delete a status ─────────────────────────────────────────────────────────
  async function handleDelete(id) {
    try {
      const res = await statusesService.deleteStatus(id);
      if (res?.success) {
        // Remove the deleted status from local state
        const updatedStatuses = statuses.filter(s => s.id !== id);
        setStatuses(updatedStatuses);

        // Re-compute groups with the updated list to correctly close viewer
        const updatedGrouped = updatedStatuses.reduce((acc, s) => {
          const key = s.userId;
          if (!acc[key]) acc[key] = { userId: s.userId, userName: s.userName, items: [] };
          acc[key].items.push(s);
          return acc;
        }, {});
        const updatedMyGroup   = updatedGrouped[currentUser.id];
        const updatedOthers    = Object.values(updatedGrouped).filter(g => g.userId !== currentUser.id);
        const updatedAllGroups = updatedMyGroup ? [updatedMyGroup, ...updatedOthers] : updatedOthers;

        // Close viewer if the active group no longer exists or is now empty
        if (activeGroupIdx !== null) {
          const activeGroup = updatedAllGroups[activeGroupIdx];
          if (!activeGroup || activeGroup.items.length === 0) {
            setActiveGroupIdx(null);
          }
        }
      } else {
        alert('No se pudo eliminar: ' + (res?.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error al eliminar el estado: ' + (err?.message || 'Error de red'));
    }
  }

  // ── Handle new status created ───────────────────────────────────────────────
  function handleCreated(newStatus) {
    setStatuses(prev => [newStatus, ...prev]);
  }

  // ── Preview text for sidebar ────────────────────────────────────────────────
  function getPreview(group) {
    const last = group.items[group.items.length - 1];
    if (!last) return '';
    if (last.type === 'text')  return last.content.slice(0, 40) + (last.content.length > 40 ? '…' : '');
    if (last.type === 'video') return '🎥 Video';
    return '📷 Imagen';
  }

  return (
    <div className="statuses-wrapper">
      {/* ── Sidebar ── */}
      <aside className="statuses-sidebar">
        <div className="statuses-sidebar-header">
          <h2>🔵 Estados</h2>
          <p>Visibles por 24 horas</p>
        </div>

        {/* Info banner */}
        <div className="statuses-info-banner">
          📱 Al ver un estado, usa <strong>"Publicar en WhatsApp"</strong> para enviarlo
          a las historias de tu número. Solo lo verán contactos que tengan tu número guardado.
        </div>

        <div className="statuses-sidebar-list">
          {/* "Mi estado" / upload trigger */}
          <div className="statuses-section-label">Mi estado</div>
          <button
            id="status-add-mine-btn"
            className="status-upload-trigger"
            onClick={() => setShowUploadModal(true)}
          >
            <div className="status-avatar">
              <div className="status-upload-trigger-icon">
                {myGroup ? getInitials(currentUser.name) : '+'}
              </div>
              {myGroup && (
                <div className="status-add-btn-overlay">+</div>
              )}
            </div>
            <div className="status-upload-trigger-text">
              <strong>{myGroup ? currentUser.name : 'Agregar estado'}</strong>
              <span>
                {myGroup
                  ? `${myGroup.items.length} estado(s) · ${timeAgo(myGroup.items[0].createdAt)}`
                  : 'Comparte texto, imagen o video'}
              </span>
            </div>
          </button>

          {/* My existing statuses in sidebar */}
          {myGroup && (
            <button
              id={`status-group-${currentUser.id}`}
              className={`status-list-item ${activeGroupIdx === allGroups.indexOf(myGroup) ? 'active' : ''}`}
              onClick={() => setActiveGroupIdx(allGroups.indexOf(myGroup))}
            >
              <div className="status-avatar">
                <Avatar name={currentUser.name} isMe />
              </div>
              <div className="status-list-info">
                <div className="status-list-name">{currentUser.name} (tú)</div>
                <div className="status-list-preview">{getPreview(myGroup)}</div>
                <div className="status-expiry-badge">{timeUntilExpiry(myGroup.items[0].expiresAt)}</div>
              </div>
              <div className="status-list-time">{timeAgo(myGroup.items[0].createdAt)}</div>
            </button>
          )}

          {/* Other users' statuses */}
          {otherGroups.length > 0 && (
            <>
              <div className="statuses-section-label" style={{ marginTop: 8 }}>Recientes</div>
              {otherGroups.map((group) => {
                const gIdx = allGroups.indexOf(group);
                return (
                  <button
                    key={group.userId}
                    id={`status-group-${group.userId}`}
                    className={`status-list-item ${activeGroupIdx === gIdx ? 'active' : ''}`}
                    onClick={() => setActiveGroupIdx(gIdx)}
                  >
                    <div className="status-avatar">
                      <Avatar name={group.userName} isMe={false} />
                    </div>
                    <div className="status-list-info">
                      <div className="status-list-name">{group.userName}</div>
                      <div className="status-list-preview">{getPreview(group)}</div>
                      <div className="status-expiry-badge">{timeUntilExpiry(group.items[0].expiresAt)}</div>
                    </div>
                    <div className="status-list-time">{timeAgo(group.items[0].createdAt)}</div>
                  </button>
                );
              })}
            </>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#aaa' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 3 }} />
              <p style={{ fontSize: 12 }}>Cargando estados…</p>
            </div>
          )}

          {/* Empty */}
          {!loading && allGroups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 16px', color: '#bbb' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔵</div>
              <p style={{ fontSize: 13 }}>Sin estados activos.<br />¡Sé el primero en publicar!</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main viewer ── */}
      <main className="statuses-main">
        {activeGroupIdx !== null && allGroups[activeGroupIdx] ? (
          <StoryViewer
            statuses={allGroups}
            activeGroupIndex={activeGroupIdx}
            onClose={() => setActiveGroupIdx(null)}
            onDelete={handleDelete}
            currentUserId={currentUser.id}
          />
        ) : (
          <div className="statuses-empty-state">
            <div className="empty-icon">🔵</div>
            <h3>Estados del Equipo</h3>
            <p>
              Selecciona un estado de la lista para verlo,<br />
              o crea el tuyo con el botón <strong>"Agregar estado"</strong>.
            </p>
            <button
              id="status-create-empty-btn"
              onClick={() => setShowUploadModal(true)}
              style={{
                marginTop: 20,
                padding: '12px 28px',
                background: 'linear-gradient(135deg, #128C7E, #075E54)',
                color: '#fff',
                border: 'none',
                borderRadius: 30,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ＋ Publicar mi estado
            </button>
          </div>
        )}
      </main>

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onCreated={handleCreated}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
