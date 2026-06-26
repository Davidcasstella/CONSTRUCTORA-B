// Statistics API service
import { apiGet } from './api';

export async function getOverview(period = 'all', month = null, year = null) {
  let url = `/api/statistics/overview?period=${period}`;
  if (month && year) url += `&month=${month}&year=${year}`;
  return apiGet(url);
}

export async function getConversationsByDay(period = 'month', month = null, year = null) {
  let url = `/api/statistics/conversations-by-day?period=${period}`;
  if (month && year) url += `&month=${month}&year=${year}`;
  return apiGet(url);
}

export async function getTopQuestions(limit = 10, period = 'all', month = null, year = null) {
  let url = `/api/statistics/top-questions?limit=${limit}&period=${period}`;
  if (month && year) url += `&month=${month}&year=${year}`;
  return apiGet(url);
}

export async function getTopComplaints(limit = 10, period = 'all', month = null, year = null) {
  let url = `/api/statistics/top-complaints?limit=${limit}&period=${period}`;
  if (month && year) url += `&month=${month}&year=${year}`;
  return apiGet(url);
}

export async function downloadMonthlyReport(month, year, period = null) {
  const token = localStorage.getItem('authToken');
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = window.location.protocol === 'https:'
    ? ''
    : isLocal
      ? 'http://localhost:3001'
      : (import.meta.env.VITE_API_URL || '');
  let apiUrl = `${API_BASE}/api/statistics/monthly-report?month=${month}&year=${year}`;
  if (period) apiUrl += `&period=${period}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error('Error descargando reporte');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  a.href = url;
  a.download = `CONSTRUCTORA_GyA_Reporte_${monthNames[month - 1]}_${year}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
