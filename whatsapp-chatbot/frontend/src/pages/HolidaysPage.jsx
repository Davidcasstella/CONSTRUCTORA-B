import { useState, useEffect, useMemo } from 'react';
import * as holidayService from '../services/holidayService';

// ─── Calendar Helpers ────────────────────────────────────────
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ─── Component ───────────────────────────────────────────────
export default function HolidaysPage() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [holidayConfig, setHolidayConfig] = useState({ enabled: false });
  const [scheduleConfig, setScheduleConfig] = useState({ enabled: false, businessHours: {} });
  const [showModal, setShowModal] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newRecurring, setNewRecurring] = useState(true);
  const [error, setError] = useState('');

  // Calendar state
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const [hData, hConfig, sConfig] = await Promise.all([
        holidayService.getHolidays(year),
        holidayService.getHolidayConfig(),
        holidayService.getScheduleConfig(),
      ]);
      if (hData?.holidays) setHolidays(hData.holidays);
      if (hConfig) setHolidayConfig(hConfig);
      if (sConfig) setScheduleConfig(sConfig);
    } catch { } finally { setLoading(false); }
  }

  async function handleToggle(h) {
    try { await holidayService.toggleHoliday(h.id, !h.active); loadData(); } catch { }
  }
  async function handleDelete(h) {
    if (!window.confirm(`¿Eliminar el festivo "${h.name}"?`)) return;
    try { await holidayService.deleteHoliday(h.id); loadData(); } catch { }
  }
  async function handleCreate() {
    if (!newDate || !newName.trim()) { setError('Fecha y nombre son requeridos'); return; }
    try {
      await holidayService.createHoliday({ date: newDate, name: newName, recurring: newRecurring });
      setShowModal(false); setNewDate(''); setNewName(''); setNewRecurring(true); setError('');
      loadData();
    } catch { setError('Error al crear festivo'); }
  }
  async function handleToggleHolidays(val) {
    try { await holidayService.setHolidayCheckEnabled(val); setHolidayConfig(p => ({ ...p, enabled: val })); } catch { }
  }
  async function handleToggleSchedule(val) {
    try { await holidayService.setScheduleCheckEnabled(val); setScheduleConfig(p => ({ ...p, enabled: val })); } catch { }
  }

  // ─── Calendar Data ────────────────────────────────────────
  const holidayDates = useMemo(() => {
    const m = {};
    holidays.forEach(h => {
      if (h.date) {
        const parts = h.date.split('-');
        const key = `${parts[1]}-${parts[2]}`; // MM-DD
        m[h.date] = h;          // full match
        m[`recurring-${key}`] = h; // recurring match
      }
    });
    return m;
  }, [holidays]);

  function getHolidayForDay(day) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (holidayDates[dateStr]) return holidayDates[dateStr];
    const mmdd = `${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const recur = holidayDates[`recurring-${mmdd}`];
    if (recur && recur.recurring) return recur;
    return null;
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }
  function goToday() { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); }

  function openCreateWithDate(day) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setNewDate(dateStr);
    setNewName('');
    setNewRecurring(true);
    setError('');
    setShowModal(true);
  }

  // ─── Active holiday stats ──────────────────────────────────
  const activeCount = holidays.filter(h => h.active !== false).length;
  const recurringCount = holidays.filter(h => h.recurring).length;

  // ─── Render ────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);

  return (
    <div>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h2 style={S.title}>📅 Días Festivos y Horarios</h2>
          <p style={S.subtitle}>Gestiona festivos y horarios de atención del bot</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="upload-btn" onClick={() => setShowModal(true)}>➕ Nuevo Festivo</button>
        </div>
      </div>

      {/* Control Cards Row */}
      <div style={S.controlsRow}>
        {/* Holiday Control */}
        <div style={{ ...S.controlCard, borderLeft: `4px solid ${holidayConfig.enabled ? '#25D366' : '#f44336'}` }}>
          <div style={S.controlHeader}>
            <span style={S.controlIcon}>📅</span>
            <span style={S.controlTitle}>Control de Festivos</span>
          </div>
          <p style={S.controlDesc}>
            {holidayConfig.enabled
              ? 'Los días festivos activados enviarán mensaje de "fuera de horario".'
              : 'No se verificarán los días festivos.'}
          </p>
          <div style={S.controlActions}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: holidayConfig.enabled ? '#2e7d32' : '#c62828' }}>
              {holidayConfig.enabled ? '✅ Activo' : '❌ Inactivo'}
            </span>
            <label style={S.switch}>
              <input type="checkbox" checked={holidayConfig.enabled} onChange={() => handleToggleHolidays(!holidayConfig.enabled)} />
              <span style={{ ...S.slider, background: holidayConfig.enabled ? '#25D366' : '#ccc' }}>
                <span style={{ ...S.sliderKnob, transform: holidayConfig.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
              </span>
            </label>
          </div>
        </div>

        {/* Schedule Control */}
        <div style={{ ...S.controlCard, borderLeft: `4px solid ${scheduleConfig.enabled ? '#25D366' : '#f44336'}` }}>
          <div style={S.controlHeader}>
            <span style={S.controlIcon}>⏰</span>
            <span style={S.controlTitle}>Control de Horario</span>
          </div>
          <p style={S.controlDesc}>
            Horario de atención: <strong>{scheduleConfig.businessHours?.start || '8:00 AM'}</strong> — <strong>{scheduleConfig.businessHours?.end || '4:30 PM'}</strong>
          </p>
          <div style={S.controlActions}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: scheduleConfig.enabled ? '#2e7d32' : '#c62828' }}>
              {scheduleConfig.enabled ? '✅ Activo' : '❌ Inactivo'}
            </span>
            <label style={S.switch}>
              <input type="checkbox" checked={scheduleConfig.enabled} onChange={() => handleToggleSchedule(!scheduleConfig.enabled)} />
              <span style={{ ...S.slider, background: scheduleConfig.enabled ? '#25D366' : '#ccc' }}>
                <span style={{ ...S.sliderKnob, transform: scheduleConfig.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
              </span>
            </label>
          </div>
        </div>

        {/* Stats Mini Cards */}
        <div style={S.controlCard}>
          <div style={S.statsGrid}>
            <div style={S.statMini}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary-green)' }}>{holidays.length}</span>
              <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>Total</span>
            </div>
            <div style={S.statMini}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#25D366' }}>{activeCount}</span>
              <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>Activos</span>
            </div>
            <div style={S.statMini}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: '#ff9800' }}>{recurringCount}</span>
              <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>Recurrentes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Calendar + List */}
      <div style={S.mainGrid}>
        {/* Calendar */}
        <div style={S.calendarPanel}>
          <div style={S.calendarHeader}>
            <button onClick={prevMonth} style={S.calNavBtn}>◀</button>
            <div style={{ textAlign: 'center' }}>
              <span style={S.calMonthLabel}>{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={goToday} style={S.todayBtn}>Hoy</button>
            </div>
            <button onClick={nextMonth} style={S.calNavBtn}>▶</button>
          </div>
          <div style={S.calDayHeaders}>
            {DAY_LABELS.map(d => <div key={d} style={S.calDayLabel}>{d}</div>)}
          </div>
          <div style={S.calGrid}>
            {/* Empty cells for first week offset */}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} style={S.calCellEmpty} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const hol = getHolidayForDay(day);
              const isToday = isSameDay(new Date(calYear, calMonth, day), today);
              const isWeekend = new Date(calYear, calMonth, day).getDay() === 0 || new Date(calYear, calMonth, day).getDay() === 6;

              return (
                <div
                  key={day}
                  style={{
                    ...S.calCell,
                    ...(isToday ? S.calCellToday : {}),
                    ...(hol ? S.calCellHoliday : {}),
                    ...(isWeekend && !hol ? S.calCellWeekend : {}),
                  }}
                  onClick={() => hol ? null : openCreateWithDate(day)}
                  title={hol ? `${hol.name} (Clic para más detalles)` : `Clic para agregar festivo`}
                >
                  <span style={{ fontSize: '13px', fontWeight: isToday ? 700 : 500 }}>{day}</span>
                  {hol && (
                    <span style={S.calHolidayDot} title={hol.name}>
                      {hol.active !== false ? '🔴' : '⚪'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={S.calLegend}>
            <span style={S.legendItem}><span style={{ ...S.legendDot, background: '#e8f5e9', border: '2px solid #25D366' }} /> Hoy</span>
            <span style={S.legendItem}><span style={{ ...S.legendDot, background: '#fff3e0' }} /> Festivo</span>
            <span style={S.legendItem}><span style={{ ...S.legendDot, background: '#f5f5f5' }} /> Fin de semana</span>
          </div>
        </div>

        {/* Holiday List */}
        <div style={S.listPanel}>
          <div style={S.listHeader}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Lista de Festivos ({holidays.length})</h3>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div className="loading-spinner"></div>
              <p style={{ color: '#999', marginTop: '10px', fontSize: '13px' }}>Cargando...</p>
            </div>
          ) : holidays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: '#999' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>📅</div>
              <p style={{ fontSize: '13px' }}>No hay festivos registrados</p>
              <button className="upload-btn" onClick={() => setShowModal(true)} style={{ marginTop: '10px', fontSize: '12px' }}>
                ➕ Agregar Festivo
              </button>
            </div>
          ) : (
            <div style={S.listScroll}>
              {holidays.map(h => (
                <div key={h.id || h.date} style={S.listItem}>
                  <div style={S.listItemLeft}>
                    <div style={{
                      ...S.listItemStatus,
                      background: h.active !== false ? '#e8f5e9' : '#ffebee',
                      color: h.active !== false ? '#2e7d32' : '#c62828',
                    }}>
                      {h.active !== false ? '✅' : '❌'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#333' }}>{h.name}</div>
                      <div style={{ fontSize: '11px', color: '#999' }}>
                        {h.date} {h.recurring ? '• 🔄 Recurrente' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => handleToggle(h)} style={{
                      ...S.listActionBtn,
                      background: h.active !== false ? '#fff3e0' : '#e8f5e9',
                      color: h.active !== false ? '#e65100' : '#2e7d32',
                    }} title={h.active !== false ? 'Desactivar' : 'Activar'}>
                      {h.active !== false ? '⏸️' : '▶️'}
                    </button>
                    <button onClick={() => handleDelete(h)} style={{
                      ...S.listActionBtn, background: '#ffebee', color: '#c62828',
                    }} title="Eliminar">
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Holiday Modal */}
      {showModal && (
        <div className="modal-overlay active" onClick={() => setShowModal(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title">➕ Nuevo Día Festivo</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div style={{ padding: '18px' }}>
              <div style={S.formGroup}>
                <label style={S.formLabel}>Nombre del Festivo</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Ej: Navidad, Día del Trabajo..." style={S.formInput} />
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>Fecha</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={S.formInput} />
              </div>
              <div style={{ ...S.formGroup, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={newRecurring} onChange={e => setNewRecurring(e.target.checked)} />
                  Recurrente cada año
                </label>
              </div>
              {error && <div style={S.formError}>{error}</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="upload-btn" onClick={handleCreate} style={{ flex: 1 }}>✅ Crear Festivo</button>
                <button className="upload-btn" onClick={() => setShowModal(false)} style={{ flex: 1, background: '#999' }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const S = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' },
  title: { color: 'var(--primary-green)', margin: 0, fontSize: '20px' },
  subtitle: { color: '#999', margin: '3px 0 0', fontSize: '12px' },

  // Controls row
  controlsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '16px' },
  controlCard: { background: '#fff', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  controlHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
  controlIcon: { fontSize: '18px' },
  controlTitle: { fontWeight: 600, fontSize: '14px', color: '#333' },
  controlDesc: { fontSize: '12px', color: '#666', margin: '0 0 10px', lineHeight: 1.4 },
  controlActions: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },

  // Switch
  switch: { position: 'relative', display: 'inline-block', cursor: 'pointer' },
  slider: { display: 'inline-block', width: '42px', height: '22px', borderRadius: '22px', position: 'relative', transition: 'background 0.3s' },
  sliderKnob: { position: 'absolute', top: '3px', left: '3px', width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'transform 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },

  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' },
  statMini: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },

  // Main grid
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: '14px' },

  // Calendar
  calendarPanel: { background: '#fff', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  calendarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  calNavBtn: { background: 'none', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', color: '#555' },
  calMonthLabel: { fontWeight: 700, fontSize: '15px', color: '#333' },
  todayBtn: { display: 'block', background: 'none', border: 'none', color: 'var(--primary-green)', fontSize: '11px', cursor: 'pointer', fontWeight: 600, marginTop: '2px' },
  calDayHeaders: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' },
  calDayLabel: { textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#999', padding: '4px 0' },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' },
  calCellEmpty: { padding: '8px', minHeight: '36px' },
  calCell: {
    padding: '6px 4px', minHeight: '36px', borderRadius: '6px', textAlign: 'center',
    cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '1px', position: 'relative',
  },
  calCellToday: { background: '#e8f5e9', border: '2px solid #25D366', fontWeight: 700 },
  calCellHoliday: { background: '#fff3e0', border: '1px solid #ffe0b2' },
  calCellWeekend: { background: '#fafafa' },
  calHolidayDot: { fontSize: '8px', lineHeight: 1 },

  calLegend: { display: 'flex', gap: '14px', marginTop: '12px', justifyContent: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#777' },
  legendDot: { width: '12px', height: '12px', borderRadius: '3px', display: 'inline-block' },

  // List panel
  listPanel: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 300px)' },
  listHeader: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 },
  listScroll: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  listItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid #f8f8f8', transition: 'background 0.15s',
  },
  listItemLeft: { display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 },
  listItemStatus: { width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 },
  listActionBtn: {
    border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
    fontSize: '13px', transition: 'all 0.15s',
  },

  // Form
  formGroup: { display: 'flex', flexDirection: 'column', marginBottom: '14px' },
  formLabel: { fontWeight: 500, marginBottom: '5px', fontSize: '13px' },
  formInput: { width: '100%', padding: '9px 12px', border: '2px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontSize: '13px', outline: 'none' },
  formError: { background: '#ffebee', color: '#c62828', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px' },
};
