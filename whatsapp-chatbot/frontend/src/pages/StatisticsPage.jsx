import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import * as statsApi from '../services/statisticsService';
import '../styles/statistics.css';

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'all', label: 'Todo' },
];

const PIE_COLORS = ['#10b981', '#f59e0b', '#6366f1', '#ef4444'];

export default function StatisticsPage() {
  const [period, setPeriod] = useState('month');
  const [overview, setOverview] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [topQuestions, setTopQuestions] = useState([]);
  const [topComplaints, setTopComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pdfMonth, setPdfMonth] = useState(new Date().getMonth() + 1);
  const [pdfYear, setPdfYear] = useState(new Date().getFullYear());
  const [downloading, setDownloading] = useState(false);
  const [filterMode, setFilterMode] = useState('month'); // 'period' or 'month'

  useEffect(() => { loadData(); }, [period, pdfMonth, pdfYear, filterMode]);

  // When user clicks period buttons (Hoy/Semana/Mes/Todo)
  function handlePeriodChange(newPeriod) {
    setFilterMode('period');
    setPeriod(newPeriod);
  }

  // When user changes month/year selectors
  function handleMonthChange(newMonth) {
    setFilterMode('month');
    setPdfMonth(newMonth);
  }

  function handleYearChange(newYear) {
    setFilterMode('month');
    setPdfYear(newYear);
  }

  async function loadData() {
    setLoading(true);
    try {
      // If filterMode is 'month', send month/year to API for range filtering
      // If filterMode is 'period', only send period (no month/year)
      const m = filterMode === 'month' ? pdfMonth : null;
      const y = filterMode === 'month' ? pdfYear : null;
      const [ov, daily, questions, complaints] = await Promise.all([
        statsApi.getOverview(period, m, y),
        statsApi.getConversationsByDay(period, m, y),
        statsApi.getTopQuestions(10, period, m, y),
        statsApi.getTopComplaints(10, period, m, y),
      ]);
      if (ov?.success) setOverview(ov.overview);
      if (daily?.success) setDailyData(daily.data || []);
      if (questions?.success) setTopQuestions(questions.questions || []);
      if (complaints?.success) setTopComplaints(complaints.complaints || []);
    } catch (e) {
      console.error('Error loading stats:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPDF() {
    setDownloading(true);
    try {
      await statsApi.downloadMonthlyReport(pdfMonth, pdfYear, period);
    } catch (e) {
      alert('Error descargando el reporte: ' + e.message);
    } finally {
      setDownloading(false);
    }
  }

  const pieData = overview ? [
    { name: 'IA', value: overview.resolvedByIA },
    { name: 'Asesor', value: overview.advisorHandled },
    { name: 'Escaladas', value: Math.max(0, overview.escalated - overview.advisorHandled) },
    { name: 'Fuera horario', value: overview.outOfHours },
  ].filter(d => d.value > 0) : [];

  if (loading && !overview) {
    return (
      <div className="stats-loading">
        <div className="loading-spinner"></div>
        <p>Cargando estadísticas...</p>
      </div>
    );
  }

  return (
    <div className="stats-page">
      {/* Header */}
      <div className="stats-header">
        <div>
          <h2 className="stats-title">📊 Estadísticas</h2>
          <p className="stats-subtitle">Métricas de rendimiento del chatbot y atención al cliente</p>
        </div>
        <div className="stats-header-actions">
          {/* PDF Download Controls */}
          <div className="stats-pdf-inline">
            <select className="stats-select stats-select-sm" value={pdfMonth} onChange={e => handleMonthChange(Number(e.target.value))}>
              {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select className="stats-select stats-select-sm" value={pdfYear} onChange={e => handleYearChange(Number(e.target.value))}>
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button className="stats-pdf-btn stats-pdf-btn-sm" onClick={handleDownloadPDF} disabled={downloading}>
              {downloading ? '⏳ Generando...' : '📄 Descargar PDF'}
            </button>
          </div>
          {/* Period Selector */}
          <div className="stats-period-selector">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`stats-period-btn ${filterMode === 'period' && period === opt.value ? 'active' : ''}`}
                onClick={() => handlePeriodChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {overview && (
        <div className="stats-kpi-grid">
          <KPICard icon="💬" label="Total Conversaciones" value={overview.total} color="#3b82f6" />
          <KPICard icon="🤖" label="Resueltas por IA" value={overview.resolvedByIA} sub={`${overview.botEfficiency}%`} color="#10b981" />
          <KPICard icon="🧑‍💼" label="Escaladas a Asesor" value={overview.escalated} sub={`${overview.escalationRate}%`} color="#f59e0b" />
          <KPICard icon="🌙" label="Fuera de Horario" value={overview.outOfHours} color="#6366f1" />
          <KPICard icon="⚡" label="Eficiencia del Bot" value={`${overview.botEfficiency}%`} color="#14b8a6" />
          <KPICard icon="⏱️" label="Resp. Promedio" value={formatTime(overview.avgResponseTimeSec)} color="#8b5cf6" />
          <KPICard icon="📉" label="Tasa Abandono" value={`${overview.abandonRate}%`} color="#ef4444" />
          <KPICard icon="👨‍💼" label="Atendidas por Asesor" value={overview.advisorHandled} color="#f97316" />
        </div>
      )}

      {/* Charts Row */}
      <div className="stats-charts-row">
        {/* Bar Chart */}
        <div className="stats-chart-card">
          <h3 className="stats-chart-title">📈 Conversaciones por Día</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stats-grid-color, #333)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--stats-text-color, #aaa)', fontSize: 11 }}
                  tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: 'var(--stats-text-color, #aaa)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--stats-tooltip-bg, #1a1a2e)', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ia" name="IA" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="advisor" name="Asesor" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outOfHours" name="Fuera horario" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="stats-empty">Sin datos para el periodo seleccionado</div>
          )}
        </div>

        {/* Pie Chart */}
        <div className="stats-chart-card stats-chart-pie">
          <h3 className="stats-chart-title">🍩 Distribución de Atención</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--stats-tooltip-bg, #1a1a2e)', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="stats-empty">Sin datos para el periodo seleccionado</div>
          )}
        </div>
      </div>

      {/* Tables Row */}
      <div className="stats-tables-row">
        {/* Top Questions */}
        <div className="stats-table-card">
          <h3 className="stats-table-title">❓ Preguntas Más Frecuentes</h3>
          {topQuestions.length > 0 ? (
            <table className="stats-table">
              <thead>
                <tr><th>#</th><th>Pregunta</th><th>Veces</th></tr>
              </thead>
              <tbody>
                {topQuestions.map((q, i) => (
                  <tr key={i}>
                    <td className="stats-rank">{i + 1}</td>
                    <td className="stats-text">{q.text}</td>
                    <td className="stats-count">{q.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="stats-empty">No se detectaron preguntas aún</div>
          )}
        </div>

        {/* Top Complaints */}
        <div className="stats-table-card">
          <h3 className="stats-table-title">😤 Quejas Más Frecuentes</h3>
          {topComplaints.length > 0 ? (
            <table className="stats-table">
              <thead>
                <tr><th>#</th><th>Queja</th><th>Veces</th></tr>
              </thead>
              <tbody>
                {topComplaints.map((c, i) => (
                  <tr key={i}>
                    <td className="stats-rank">{i + 1}</td>
                    <td className="stats-text">{c.text}</td>
                    <td className="stats-count">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="stats-empty">No se detectaron quejas</div>
          )}
        </div>
      </div>


    </div>
  );
}

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div className="stats-kpi-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="stats-kpi-icon">{icon}</div>
      <div className="stats-kpi-value">{value}</div>
      <div className="stats-kpi-label">{label}</div>
      {sub && <div className="stats-kpi-sub">{sub}</div>}
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || seconds === 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
