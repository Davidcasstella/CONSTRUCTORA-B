import { useState, useEffect } from "react";
import * as calendarService from "../services/calendarService";
import "../styles/dashboard.css";

// Event chip colors — solid, always readable (white text on dark bg)
const EVENT_COLORS = [
  { bg: "#1976D2", text: "#fff" }, // blue
  { bg: "#388E3C", text: "#fff" }, // green
  { bg: "#F57C00", text: "#fff" }, // orange
  { bg: "#7B1FA2", text: "#fff" }, // purple
  { bg: "#C62828", text: "#fff" }, // red
  { bg: "#00838F", text: "#fff" }, // teal
];
const getEventColor = (idx) => EVENT_COLORS[idx % EVENT_COLORS.length];

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const DAY_NAMES = ["Lun","Mar","Mie","Jue","Vie","Sab","Dom"];

function DetailRow({ label, value, bold }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: "#888",
        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: bold ? 700 : 400, color: "var(--text-primary, #333)", lineHeight: 1.5 }}>
        {value}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [config, setConfig] = useState({ calendarId: "" });
  const [editConfig, setEditConfig] = useState("");
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => { loadConfig(); }, []);
  useEffect(() => { loadEventsForMonth(currentDate); }, [currentDate]);

  const loadConfig = async () => {
    try {
      const res = await calendarService.getCalendarConfig();
      if (res?.success) { setConfig(res.config); setEditConfig(res.config.calendarId); }
    } catch (err) { console.error("Error loading config", err); }
  };

  const loadEventsForMonth = async (date) => {
    setLoading(true); setError(null);
    try {
      const year = date.getFullYear(); const month = date.getMonth();
      const start = new Date(year, month, 1); start.setDate(start.getDate() - 7);
      const end = new Date(year, month + 1, 0); end.setDate(end.getDate() + 7);
      const res = await calendarService.getCalendarEvents(start.toISOString(), end.toISOString());
      if (res?.success) { setEvents(res.events || []); }
      else { setError(res?.error || "Error al cargar eventos"); }
    } catch (err) { setError("Excepcion al cargar eventos"); console.error(err); }
    finally { setLoading(false); }
  };

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(""), 3000); };

  const handleSaveConfig = async () => {
    try {
      const res = await calendarService.updateCalendarConfig(editConfig);
      if (res?.success) { setConfig(res.config); setIsEditingConfig(false); showSuccess("Configuracion guardada"); loadEventsForMonth(currentDate); }
      else { setError(res?.error || "Error al guardar"); }
    } catch { setError("Error al guardar configuracion"); }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm("Eliminar esta cita?")) return;
    try {
      const res = await calendarService.deleteCalendarEvent(eventId);
      if (res?.success) { setSelectedEvent(null); showSuccess("Cita eliminada"); loadEventsForMonth(currentDate); }
      else { setError(res?.error || "Error al eliminar"); }
    } catch { setError("Error al eliminar evento"); }
  };

  const prevMonth = () => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; });
  const nextMonth = () => setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; });
  const goToday = () => setCurrentDate(new Date());

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear(); const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
    let startingDay = firstDay.getDay() - 1;
    if (startingDay === -1) startingDay = 6;
    const days = [];
    const prevLast = new Date(year, month, 0).getDate();
    for (let i = 0; i < startingDay; i++) days.unshift({ date: new Date(year, month - 1, prevLast - i), isCurrentMonth: false });
    for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    return days;
  };

  const getEventsForDate = (dateObj) => events.filter(e => {
    const dt = e.start?.dateTime || e.start?.date;
    if (!dt) return false;
    const d = new Date(dt);
    return d.getDate() === dateObj.getDate() && d.getMonth() === dateObj.getMonth() && d.getFullYear() === dateObj.getFullYear();
  });

  const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
  const formatDateLong = (iso) => iso ? new Date(iso).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";

  const calendarDays = generateCalendarDays();
  const todayStr = new Date().toDateString();

  return (
    <div className="dashboard-content">
      <div className="section-header">
        <h2 className="section-title">Calendario de Citas</h2>
        <p className="section-subtitle">Visualiza y gestiona las citas agendadas desde WhatsApp</p>
      </div>

      {error      && <div style={{ padding:"10px 16px", borderRadius:8, marginBottom:12, fontWeight:600, fontSize:13, background:"#ffebee", color:"#c62828", border:"1px solid #ffcdd2" }}>{error}</div>}
      {successMsg && <div style={{ padding:"10px 16px", borderRadius:8, marginBottom:12, fontWeight:600, fontSize:13, background:"#e8f5e9", color:"#2e7d32", border:"1px solid #c8e6c9" }}>{successMsg}</div>}

      {/* Config */}
      <div className="settings-card" style={{ marginBottom:20 }}>
        <div className="card-header"><h3>Configuracion de Google Calendar</h3></div>
        <div className="card-body">
          {isEditingConfig ? (
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <input type="email" className="form-input" value={editConfig} onChange={e => setEditConfig(e.target.value)} placeholder="ejemplo@gmail.com" style={{ flex:1 }} />
              <button className="btn btn-primary" onClick={handleSaveConfig}>Guardar</button>
              <button className="btn btn-secondary" onClick={() => setIsEditingConfig(false)}>Cancelar</button>
            </div>
          ) : (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <span style={{ color:"var(--text-secondary)", fontWeight:600 }}>Calendar ID: </span>
                <span style={{ fontWeight:700, marginLeft:6 }}>{config.calendarId || "No configurado"}</span>
              </div>
              <button className="btn btn-secondary" onClick={() => setIsEditingConfig(true)}>Editar Correo</button>
            </div>
          )}
        </div>
      </div>

      {/* Calendar */}
      <div className="settings-card" style={{ flex:1 }}>
        <div className="card-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontSize:18, fontWeight:700 }}>{MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
          <div style={{ display:"flex", gap:6 }}>
            <button className="btn btn-secondary" onClick={prevMonth} style={{ minWidth:36 }}>&lt;</button>
            <button className="btn btn-secondary" onClick={goToday}>Hoy</button>
            <button className="btn btn-secondary" onClick={nextMonth} style={{ minWidth:36 }}>&gt;</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding:60, textAlign:"center", color:"var(--text-secondary)" }}>
            <div className="loading-spinner" style={{ marginBottom:12 }}/>
            Cargando eventos...
          </div>
        ) : (
          <div style={{ padding:"12px 16px 16px" }}>
            {/* Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:6 }}>
              {/* Day headers */}
              {DAY_NAMES.map(d => (
                <div key={d} style={{ textAlign:"center", fontWeight:700, fontSize:11, padding:"6px 0", color:"var(--text-secondary, #666)", textTransform:"uppercase", letterSpacing:"0.5px" }}>{d}</div>
              ))}

              {/* Day cells */}
              {calendarDays.map((dayObj, i) => {
                const dayEvents = getEventsForDate(dayObj.date);
                const isToday = dayObj.date.toDateString() === todayStr;
                return (
                  <div key={i} style={{
                    minHeight:100, borderRadius:8, padding:8,
                    display:"flex", flexDirection:"column", gap:3,
                    backgroundColor: isToday ? "rgba(255,140,0,0.06)" : "#fff",
                    border: isToday ? "2px solid #FF8C00" : "1px solid #e0e0e0",
                    opacity: dayObj.isCurrentMonth ? 1 : 0.3,
                  }}>
                    {/* Number */}
                    <div style={{
                      textAlign:"right", fontSize:13, fontWeight: isToday ? 800 : 500,
                      color: isToday ? "#FF8C00" : "#333",
                      background: isToday ? "rgba(255,140,0,0.12)" : "transparent",
                      borderRadius:"50%", width:26, height:26,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      marginLeft:"auto", marginBottom:2,
                    }}>
                      {dayObj.date.getDate()}
                    </div>

                    {/* Event chips */}
                    {dayEvents.map((ev, ei) => {
                      const clr = getEventColor(ei);
                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          title={ev.summary}
                          style={{
                            fontSize:11, fontWeight:700,
                            backgroundColor: clr.bg,
                            color: clr.text,
                            padding:"3px 7px",
                            borderRadius:5,
                            cursor:"pointer",
                            whiteSpace:"nowrap",
                            overflow:"hidden",
                            textOverflow:"ellipsis",
                            boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
                            userSelect:"none",
                          }}
                        >
                          {ev.start?.dateTime ? formatTime(ev.start.dateTime) + " " : ""}
                          {(ev.summary || "(sin titulo)").replace("Cita: ", "")}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ marginTop:14, display:"flex", gap:16, fontSize:12, color:"#888", flexWrap:"wrap" }}>
              <span><span style={{ display:"inline-block", width:10, height:10, borderRadius:"50%", background:"#FF8C00", marginRight:5, verticalAlign:"middle" }}/>Hoy</span>
              <span><span style={{ display:"inline-block", width:10, height:10, borderRadius:"50%", background:"#1976D2", marginRight:5, verticalAlign:"middle" }}/>Cita agendada</span>
              <span style={{ marginLeft:"auto" }}>{events.length} evento{events.length !== 1 ? "s" : ""} en el periodo visible</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)} style={{ zIndex:2000 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"#fff", borderRadius:14, width:"100%", maxWidth:460,
            boxShadow:"0 12px 40px rgba(0,0,0,0.2)", overflow:"hidden",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 24px", borderBottom:"1px solid #e0e0e0", background:"#f9fafb" }}>
              <span style={{ fontSize:16, fontWeight:700 }}>Detalles de la Cita</span>
              <button onClick={() => setSelectedEvent(null)} style={{ background:"none", border:"none", fontSize:24, cursor:"pointer", color:"#999", lineHeight:1, padding:"2px 6px", borderRadius:6 }}>x</button>
            </div>
            <div style={{ padding:"20px 24px" }}>
              <DetailRow label="Titulo" value={selectedEvent.summary || "(sin titulo)"} bold />
              <DetailRow label="Fecha" value={formatDateLong(selectedEvent.start?.dateTime || selectedEvent.start?.date)} />
              {selectedEvent.start?.dateTime && (
                <DetailRow label="Horario" value={`${formatTime(selectedEvent.start.dateTime)} — ${formatTime(selectedEvent.end?.dateTime)}`} />
              )}
              {selectedEvent.description && <DetailRow label="Descripcion" value={selectedEvent.description} />}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 24px", borderTop:"1px solid #e0e0e0", background:"#f9fafb" }}>
              <button className="btn" style={{ background:"#c62828", color:"#fff" }} onClick={() => handleDeleteEvent(selectedEvent.id)}>Eliminar cita</button>
              <button className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
