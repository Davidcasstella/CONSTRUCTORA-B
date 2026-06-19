/**
 * ===========================================
 * STATISTICS SERVICE
 * ===========================================
 *
 * Calculates analytics metrics from conversations and messages.
 * Uses in-memory cache + DynamoDB for data.
 * Keyword-based classification for questions/complaints (no AI tokens).
 */

const logger = require('../utils/logger');
const conversationStateService = require('./conversation-state.service');
const conversationRepository = require('../repositories/conversation.repository');
const PDFDocument = require('pdfkit');

// ===========================================
// KEYWORD PATTERNS
// ===========================================

const QUESTION_PATTERNS = [
  '¿', '?', 'cómo', 'como', 'cuándo', 'cuando', 'dónde', 'donde',
  'qué es', 'que es', 'cuál', 'cual', 'por qué', 'por que',
  'puedo', 'pueden', 'necesito', 'quiero saber', 'información',
  'informacion', 'me pueden', 'tienen', 'ofrecen', 'horario',
  'precio', 'costo', 'requisitos', 'documentos', 'proceso'
];

const COMPLAINT_KEYWORDS = [
  'queja', 'reclamo', 'problema', 'error', 'no funciona', 'mal servicio',
  'molest', 'inconveniente', 'demora', 'tardaron', 'pésimo', 'pesimo',
  'insatisf', 'terrible', 'nunca', 'horrible', 'decepcion', 'decepción',
  'no me ayud', 'no sirve', 'fraude', 'estafa', 'abuso', 'falta de',
  'no responde', 'no contestan', 'urgente', 'grave'
];

// ===========================================
// MESSAGE LOADING HELPER (DynamoDB)
// ===========================================

// Cache to avoid repeated DynamoDB queries on every stats call
let _messagesCache = { data: null, ts: 0 };
const _MESSAGES_CACHE_TTL = 60000; // 60 seconds

/**
 * Load all user messages from DynamoDB for statistics analysis.
 * Queries messages per conversation and caches the result.
 * Returns an array of { text, sender, timestamp, conversationId } objects.
 */
async function _loadAllUserMessages() {
  const now = Date.now();
  if (_messagesCache.data && (now - _messagesCache.ts) < _MESSAGES_CACHE_TTL) {
    return _messagesCache.data;
  }

  const all = conversationStateService.getAllConversations();
  const allMessages = [];

  // Query DynamoDB for each conversation (batch of parallel requests)
  const batchSize = 10; // Avoid overwhelming DynamoDB
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const promises = batch.map(async (conv) => {
      try {
        const participantId = conv.userId || conv.participantId;
        if (!participantId) return [];

        const dbMessages = await conversationRepository.getHistory(participantId, { limit: 100 });
        return dbMessages.map(m => {
          const msgObj = m.toObject ? m.toObject() : m;
          return {
            text: msgObj.content?.text || msgObj.message || '',
            sender: msgObj.direction === 'incoming' ? 'user' : (msgObj.metadata?.sender || 'bot'),
            timestamp: msgObj.createdAt ? new Date(msgObj.createdAt).getTime() : (msgObj.timestamp || 0),
            conversationId: participantId
          };
        });
      } catch (err) {
        logger.warn(`⚠️ Error loading messages for ${conv.userId}: ${err.message}`);
        return [];
      }
    });

    const results = await Promise.all(promises);
    for (const msgs of results) {
      allMessages.push(...msgs);
    }
  }

  // Also include in-memory messages as fallback (for recently received messages not yet in DB)
  for (const conv of all) {
    const memMsgs = conv.messages || [];
    for (const msg of memMsgs) {
      // Avoid duplicates by checking if timestamp+conversationId already exists
      const exists = allMessages.some(
        m => m.conversationId === (conv.userId || conv.participantId) &&
             Math.abs(m.timestamp - (msg.timestamp || 0)) < 1000
      );
      if (!exists) {
        allMessages.push({
          text: msg.message || msg.text || '',
          sender: msg.sender || (msg.direction === 'incoming' ? 'user' : 'bot'),
          timestamp: msg.timestamp || 0,
          conversationId: conv.userId || conv.participantId
        });
      }
    }
  }

  _messagesCache = { data: allMessages, ts: Date.now() };
  logger.info(`📊 [STATS] Loaded ${allMessages.length} messages for statistics analysis`);
  return allMessages;
}

// ===========================================
// OVERVIEW METRICS
// ===========================================

/**
 * Get overview metrics for a given period
 * @param {string} period - 'day' | 'week' | 'month' | 'all'
 */
async function getOverview(period = 'all') {
  const all = conversationStateService.getAllConversations();
  const cutoff = getPeriodCutoff(period);
  const filtered = cutoff ? all.filter(c => (c.lastInteraction || 0) >= cutoff) : all;

  const total = filtered.length;
  const resolvedByIA = filtered.filter(c =>
    c.bot_active === true && !c.needsHuman && c.status !== 'pending_advisor' && c.status !== 'advisor_handled'
  ).length;
  const escalated = filtered.filter(c =>
    c.status === 'pending_advisor' || c.status === 'advisor_handled' || c.needsHuman
  ).length;
  const outOfHours = filtered.filter(c => c.status === 'out_of_hours').length;
  const advisorHandled = filtered.filter(c => c.status === 'advisor_handled').length;
  const abandoned = filtered.filter(c =>
    c.status === 'pending_advisor' && !c.assignedTo
  ).length;

  // Bot efficiency: conversations where IA handled without needing human
  const botEfficiency = total > 0 ? Math.round((resolvedByIA / total) * 100) : 0;
  const escalationRate = total > 0 ? Math.round((escalated / total) * 100) : 0;
  const abandonRate = escalated > 0 ? Math.round((abandoned / escalated) * 100) : 0;

  // Average response time from DynamoDB messages
  let avgResponseTimeMs = 0;
  let responseTimeSamples = 0;

  try {
    const allMessages = await _loadAllUserMessages();

    // Group messages by conversation for response time analysis
    const byConv = {};
    for (const msg of allMessages) {
      if (!byConv[msg.conversationId]) byConv[msg.conversationId] = [];
      byConv[msg.conversationId].push(msg);
    }

    for (const convId of Object.keys(byConv)) {
      const msgs = byConv[convId].sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 1; i < msgs.length; i++) {
        if (msgs[i - 1].sender === 'user' && msgs[i].sender !== 'user') {
          const diff = msgs[i].timestamp - msgs[i - 1].timestamp;
          if (diff > 0 && diff < 300000) { // Max 5 minutes reasonable
            avgResponseTimeMs += diff;
            responseTimeSamples++;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [STATS] Error calculating response time: ${err.message}`);
  }

  const avgResponseTimeSec = responseTimeSamples > 0
    ? Math.round((avgResponseTimeMs / responseTimeSamples) / 1000)
    : 0;

  return {
    total,
    resolvedByIA,
    escalated,
    outOfHours,
    advisorHandled,
    abandoned,
    botEfficiency,
    escalationRate,
    abandonRate,
    avgResponseTimeSec,
    period
  };
}

// ===========================================
// CONVERSATIONS BY DAY (for charts)
// ===========================================

function getConversationsByDay(period = 'month') {
  const all = conversationStateService.getAllConversations();
  const cutoff = getPeriodCutoff(period);
  const filtered = cutoff ? all.filter(c => (c.lastInteraction || 0) >= cutoff) : all;

  // Group by date
  const byDay = {};
  for (const conv of filtered) {
    const ts = conv.createdAt
      ? (conv.createdAt instanceof Date ? conv.createdAt : new Date(conv.createdAt))
      : new Date(conv.lastInteraction || Date.now());
    const dateStr = ts.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!byDay[dateStr]) {
      byDay[dateStr] = { date: dateStr, total: 0, ia: 0, advisor: 0, outOfHours: 0 };
    }
    byDay[dateStr].total++;

    if (conv.status === 'out_of_hours') {
      byDay[dateStr].outOfHours++;
    } else if (conv.status === 'advisor_handled' || conv.status === 'pending_advisor' || conv.needsHuman) {
      byDay[dateStr].advisor++;
    } else {
      byDay[dateStr].ia++;
    }
  }

  // Sort by date and return array
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}

// ===========================================
// TOP QUESTIONS (keyword-based, DynamoDB)
// ===========================================

async function getTopQuestions(limit = 10, period = 'all') {
  const questions = [];
  const cutoff = getPeriodCutoff(period);

  try {
    const allMessages = await _loadAllUserMessages();

    for (const msg of allMessages) {
      if (msg.sender !== 'user') continue;
      // Filter by period
      if (cutoff && msg.timestamp < cutoff) continue;
      const text = (msg.text || '').toLowerCase().trim();
      if (!text || text.length < 5) continue;

      const isQuestion = QUESTION_PATTERNS.some(p => text.includes(p));
      if (isQuestion) {
        questions.push(text.substring(0, 120)); // Truncate for grouping
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [STATS] Error loading messages for questions: ${err.message}`);
  }

  return groupAndRank(questions, limit);
}

// ===========================================
// TOP COMPLAINTS (keyword-based, DynamoDB)
// ===========================================

async function getTopComplaints(limit = 10, period = 'all') {
  const complaints = [];
  const cutoff = getPeriodCutoff(period);

  try {
    const allMessages = await _loadAllUserMessages();

    for (const msg of allMessages) {
      if (msg.sender !== 'user') continue;
      // Filter by period
      if (cutoff && msg.timestamp < cutoff) continue;
      const text = (msg.text || '').toLowerCase().trim();
      if (!text || text.length < 5) continue;

      const isComplaint = COMPLAINT_KEYWORDS.some(k => text.includes(k));
      if (isComplaint) {
        complaints.push(text.substring(0, 120));
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [STATS] Error loading messages for complaints: ${err.message}`);
  }

  return groupAndRank(complaints, limit);
}

// ===========================================
// PDF REPORT GENERATION (Professional Design)
// ===========================================

const path = require('path');
const fs = require('fs');

// Brand colors
const BRAND = {
  primary: '#1B5E3B',      // Dark green
  secondary: '#2E7D52',    // Medium green
  accent: '#8BC34A',       // Light green/lime
  dark: '#1a1a2e',         // Almost black
  text: '#333333',
  textLight: '#666666',
  textMuted: '#999999',
  border: '#e0e0e0',
  bgLight: '#f8faf8',
  bgAlt: '#f0f5f0',
  white: '#ffffff',
  red: '#e74c3c',
  orange: '#f39c12',
  blue: '#3498db',
};

/**
 * Draw a rounded rectangle (helper for PDFKit)
 */
function roundedRect(doc, x, y, w, h, r) {
  doc.moveTo(x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y);
}

/**
 * Ensure we have enough space on the page, adding a new page if needed
 */
function ensureSpace(doc, needed) {
  if (doc.y + needed > 710) {
    doc.addPage();
    return true;
  }
  return false;
}

async function generateMonthlyPDF(month, year, period = null) {
  // Calculate date range for the requested month
  const startOfMonth = new Date(year, month - 1, 1).getTime();
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();

  // Use period-based filtering if a specific period is provided,
  // otherwise filter by the exact month range
  let overviewData, questionsData, complaintsData;

  if (period && period !== 'all') {
    // Dashboard coherence: use the same period filter as dashboard
    overviewData = await getOverview(period);
    questionsData = await getTopQuestions(10, period);
    complaintsData = await getTopComplaints(10, period);
  } else {
    // Month-specific: filter by exact month range
    overviewData = await _getOverviewForRange(startOfMonth, endOfMonth);
    questionsData = await _getTopQuestionsForRange(10, startOfMonth, endOfMonth);
    complaintsData = await _getTopComplaintsForRange(10, startOfMonth, endOfMonth);
  }

  const overview = overviewData;
  const topQuestions = questionsData;
  const topComplaints = complaintsData;
  const dailyData = getConversationsByDay('all');

  // Filter daily data for the requested month
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyDays = dailyData.filter(d => d.date.startsWith(monthStr));

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthName = monthNames[month - 1] || 'Desconocido';

  // Resolve logo path
  const logoPath = path.resolve(__dirname, '../../public/LOGO.jpeg');
  const hasLogo = fs.existsSync(logoPath);

  const PAGE_LEFT = 50;
  const PAGE_RIGHT = 562;
  const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks = [];
      let currentPage = 1;

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Helper: draw footer on current page
      // IMPORTANT: y positions must be < 742 (LETTER 792 - 50pt margin) to avoid auto-pagination
      function drawFooter() {
        doc.save();
        doc.moveTo(PAGE_LEFT, 725).lineTo(PAGE_RIGHT, 725).lineWidth(0.5).stroke(BRAND.border);
        doc.fillColor(BRAND.textMuted).fontSize(7).font('Helvetica');
        drawText('Este reporte fue generado automaticamente por el sistema NORBOY.',
          PAGE_LEFT, 728, { width: PAGE_WIDTH * 0.7, align: 'left' });
        drawText(`Pagina ${currentPage}`,
          PAGE_LEFT, 728, { width: PAGE_WIDTH, align: 'right' });
        doc.restore();
      }

      // Helper: add a new page (draws footer on current page first)
      function addPageWithFooter() {
        drawFooter();
        doc.addPage();
        currentPage++;
      }

      // Helper: draw text at absolute position without auto-pagination
      // PDFKit's doc.text() with lineBreak:true auto-creates pages near bottom margin
      function drawText(text, x, y, opts = {}) {
        doc.text(text, x, y, { ...opts, lineBreak: false });
      }

      // =============================================
      // MANUAL CURSOR — we track Y ourselves, never rely on doc.y
      // =============================================
      let cursorY = 30;

      // =============================================
      // HEADER — Green gradient bar with logo
      // =============================================
      const headerHeight = 90;

      const grad = doc.linearGradient(PAGE_LEFT, cursorY, PAGE_RIGHT, cursorY);
      grad.stop(0, BRAND.primary).stop(1, BRAND.secondary);
      roundedRect(doc, PAGE_LEFT, cursorY, PAGE_WIDTH, headerHeight, 8);
      doc.fill(grad);

      if (hasLogo) {
        try { doc.image(logoPath, PAGE_LEFT + 15, cursorY + 10, { width: 68, height: 68 }); }
        catch (e) { logger.warn(`Could not embed logo in PDF: ${e.message}`); }
      }

      const titleX = hasLogo ? PAGE_LEFT + 95 : PAGE_LEFT + 20;
      doc.fillColor(BRAND.white).fontSize(22).font('Helvetica-Bold');
      drawText('NORBOY', titleX, cursorY + 15, { width: 400 });
      doc.fillColor('#d4edda').fontSize(11).font('Helvetica');
      drawText('Reporte Mensual de Estadisticas', titleX, cursorY + 42, { width: 400 });
      doc.fillColor('#a8d8b8').fontSize(10).font('Helvetica');
      drawText(`${monthName} ${year}`, titleX, cursorY + 58, { width: 400 });
      doc.fillColor('#a8d8b8').fontSize(8).font('Helvetica');
      drawText(`Generado: ${new Date().toLocaleString('es-CO')}`, PAGE_LEFT + 320, cursorY + 65, { width: 200, align: 'right' });

      cursorY += headerHeight + 20;

      // =============================================
      // RESUMEN GENERAL — KPI Cards
      // =============================================
      doc.fillColor(BRAND.primary).fontSize(14).font('Helvetica-Bold');
      drawText('Resumen General', PAGE_LEFT, cursorY);
      doc.moveTo(PAGE_LEFT, cursorY + 18).lineTo(PAGE_LEFT + 140, cursorY + 18).lineWidth(2).stroke(BRAND.accent);
      doc.lineWidth(1);
      cursorY += 28;

      const kpiData = [
        { label: 'Total Conversaciones', value: String(overview.total), color: BRAND.primary },
        { label: 'Resueltas por IA', value: `${overview.resolvedByIA} (${overview.botEfficiency}%)`, color: BRAND.secondary },
        { label: 'Escaladas a Asesor', value: `${overview.escalated} (${overview.escalationRate}%)`, color: BRAND.orange },
        { label: 'Fuera de Horario', value: String(overview.outOfHours), color: BRAND.blue },
        { label: 'Tasa de Abandono', value: `${overview.abandonRate}%`, color: BRAND.red },
        { label: 'Tiempo Resp. Promedio', value: `${overview.avgResponseTimeSec}s`, color: BRAND.primary },
      ];

      const cardW = (PAGE_WIDTH - 20) / 3;
      const cardH = 52;
      const cardGap = 10;

      kpiData.forEach((kpi, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const cx = PAGE_LEFT + col * (cardW + cardGap);
        const cy = cursorY + row * (cardH + cardGap);

        doc.save(); roundedRect(doc, cx, cy, cardW, cardH, 5); doc.fill(BRAND.bgLight); doc.restore();
        doc.save(); doc.rect(cx, cy + 4, 3, cardH - 8).fill(kpi.color); doc.restore();

        doc.fillColor(kpi.color).fontSize(16).font('Helvetica-Bold');
        drawText(kpi.value, cx + 12, cy + 8, { width: cardW - 20 });
        doc.fillColor(BRAND.textLight).fontSize(8).font('Helvetica');
        drawText(kpi.label, cx + 12, cy + 30, { width: cardW - 20 });
      });

      cursorY += 2 * (cardH + cardGap) + 15;

      // =============================================
      // CONVERSACIONES POR DÍA
      // =============================================
      if (monthlyDays.length > 0) {
        if (cursorY + 60 > 710) { addPageWithFooter(); cursorY = 50; }

        doc.fillColor(BRAND.primary).fontSize(14).font('Helvetica-Bold');
        drawText('Conversaciones por Dia', PAGE_LEFT, cursorY);
        doc.moveTo(PAGE_LEFT, cursorY + 18).lineTo(PAGE_LEFT + 170, cursorY + 18).lineWidth(2).stroke(BRAND.accent);
        doc.lineWidth(1);
        cursorY += 28;

        const cols = [
          { label: 'Fecha',         x: PAGE_LEFT,       w: 120 },
          { label: 'Total',         x: PAGE_LEFT + 130, w: 80 },
          { label: 'IA',            x: PAGE_LEFT + 220, w: 80 },
          { label: 'Asesor',        x: PAGE_LEFT + 310, w: 80 },
          { label: 'Fuera Horario', x: PAGE_LEFT + 400, w: 110 },
        ];
        const rowH = 18;

        // Table header
        doc.save(); doc.rect(PAGE_LEFT, cursorY, PAGE_WIDTH, rowH).fill(BRAND.primary); doc.restore();
        doc.fillColor(BRAND.white).fontSize(9).font('Helvetica-Bold');
        for (const col of cols) {
          drawText(col.label, col.x + 5, cursorY + 4, { width: col.w - 10, align: col.x === PAGE_LEFT ? 'left' : 'center' });
        }
        cursorY += rowH;

        doc.fillColor(BRAND.text).font('Helvetica').fontSize(9);
        for (let idx = 0; idx < monthlyDays.length && idx < 31; idx++) {
          const day = monthlyDays[idx];
          if (cursorY + rowH > 710) { addPageWithFooter(); cursorY = 50; }

          if (idx % 2 === 0) { doc.save(); doc.rect(PAGE_LEFT, cursorY, PAGE_WIDTH, rowH).fill(BRAND.bgAlt); doc.restore(); }

          doc.fillColor(BRAND.text);
          drawText(day.date, cols[0].x + 5, cursorY + 4, { width: cols[0].w - 10 });
          drawText(String(day.total), cols[1].x + 5, cursorY + 4, { width: cols[1].w - 10, align: 'center' });
          drawText(String(day.ia), cols[2].x + 5, cursorY + 4, { width: cols[2].w - 10, align: 'center' });
          drawText(String(day.advisor), cols[3].x + 5, cursorY + 4, { width: cols[3].w - 10, align: 'center' });
          drawText(String(day.outOfHours), cols[4].x + 5, cursorY + 4, { width: cols[4].w - 10, align: 'center' });
          cursorY += rowH;
        }

        doc.moveTo(PAGE_LEFT, cursorY).lineTo(PAGE_RIGHT, cursorY).stroke(BRAND.border);
        cursorY += 15;
      }

      // =============================================
      // TOP PREGUNTAS FRECUENTES
      // =============================================
      if (topQuestions.length > 0) {
        if (cursorY + 50 > 710) { addPageWithFooter(); cursorY = 50; }

        doc.fillColor(BRAND.primary).fontSize(14).font('Helvetica-Bold');
        drawText('Top Preguntas Frecuentes', PAGE_LEFT, cursorY);
        doc.moveTo(PAGE_LEFT, cursorY + 18).lineTo(PAGE_LEFT + 190, cursorY + 18).lineWidth(2).stroke(BRAND.accent);
        doc.lineWidth(1);
        cursorY += 28;

        const qCols = [
          { label: '#',        x: PAGE_LEFT,       w: 35 },
          { label: 'Pregunta', x: PAGE_LEFT + 40,  w: 390 },
          { label: 'Veces',    x: PAGE_LEFT + 440, w: 70 },
        ];
        const qRowH = 22;

        doc.save(); doc.rect(PAGE_LEFT, cursorY, PAGE_WIDTH, qRowH).fill(BRAND.primary); doc.restore();
        doc.fillColor(BRAND.white).fontSize(9).font('Helvetica-Bold');
        qCols.forEach(c => drawText(c.label, c.x + 5, cursorY + 6, { width: c.w - 10, align: c.x === PAGE_LEFT + 440 ? 'center' : 'left' }));
        cursorY += qRowH;

        doc.font('Helvetica').fontSize(9);
        topQuestions.forEach((q, i) => {
          if (cursorY + qRowH > 710) { addPageWithFooter(); cursorY = 50; }
          if (i % 2 === 0) { doc.save(); doc.rect(PAGE_LEFT, cursorY, PAGE_WIDTH, qRowH).fill(BRAND.bgAlt); doc.restore(); }

          doc.fillColor(BRAND.secondary).font('Helvetica-Bold');
          drawText(String(i + 1), qCols[0].x + 5, cursorY + 6, { width: qCols[0].w - 10 });
          doc.fillColor(BRAND.text).font('Helvetica');
          drawText(q.text, qCols[1].x + 5, cursorY + 6, { width: qCols[1].w - 10 });
          doc.fillColor(BRAND.primary).font('Helvetica-Bold');
          drawText(String(q.count), qCols[2].x + 5, cursorY + 6, { width: qCols[2].w - 10, align: 'center' });
          cursorY += qRowH;
        });

        doc.moveTo(PAGE_LEFT, cursorY).lineTo(PAGE_RIGHT, cursorY).stroke(BRAND.border);
        cursorY += 15;
      }

      // =============================================
      // TOP QUEJAS FRECUENTES
      // =============================================
      if (topComplaints.length > 0) {
        if (cursorY + 50 > 710) { addPageWithFooter(); cursorY = 50; }

        doc.fillColor(BRAND.red).fontSize(14).font('Helvetica-Bold');
        drawText('Top Quejas Frecuentes', PAGE_LEFT, cursorY);
        doc.moveTo(PAGE_LEFT, cursorY + 18).lineTo(PAGE_LEFT + 170, cursorY + 18).lineWidth(2).stroke(BRAND.red);
        doc.lineWidth(1);
        cursorY += 28;

        const cCols = [
          { label: '#',     x: PAGE_LEFT,       w: 35 },
          { label: 'Queja', x: PAGE_LEFT + 40,  w: 390 },
          { label: 'Veces', x: PAGE_LEFT + 440, w: 70 },
        ];
        const cRowH = 22;

        doc.save(); doc.rect(PAGE_LEFT, cursorY, PAGE_WIDTH, cRowH).fill(BRAND.red); doc.restore();
        doc.fillColor(BRAND.white).fontSize(9).font('Helvetica-Bold');
        cCols.forEach(c => drawText(c.label, c.x + 5, cursorY + 6, { width: c.w - 10, align: c.x === PAGE_LEFT + 440 ? 'center' : 'left' }));
        cursorY += cRowH;

        doc.font('Helvetica').fontSize(9);
        topComplaints.forEach((c, i) => {
          if (cursorY + cRowH > 710) { addPageWithFooter(); cursorY = 50; }
          if (i % 2 === 0) { doc.save(); doc.rect(PAGE_LEFT, cursorY, PAGE_WIDTH, cRowH).fill('#fef0ef'); doc.restore(); }

          doc.fillColor(BRAND.red).font('Helvetica-Bold');
          drawText(String(i + 1), cCols[0].x + 5, cursorY + 6, { width: cCols[0].w - 10 });
          doc.fillColor(BRAND.text).font('Helvetica');
          drawText(c.text, cCols[1].x + 5, cursorY + 6, { width: cCols[1].w - 10 });
          doc.fillColor(BRAND.red).font('Helvetica-Bold');
          drawText(String(c.count), cCols[2].x + 5, cursorY + 6, { width: cCols[2].w - 10, align: 'center' });
          cursorY += cRowH;
        });

        doc.moveTo(PAGE_LEFT, cursorY).lineTo(PAGE_RIGHT, cursorY).stroke(BRAND.border);
        cursorY += 15;
      }

      // =============================================
      // FOOTER on last page
      // =============================================
      drawFooter();

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ===========================================
// HELPERS
// ===========================================

function getPeriodCutoff(period) {
  const now = Date.now();
  switch (period) {
    case 'day': return now - 24 * 60 * 60 * 1000;
    case 'week': return now - 7 * 24 * 60 * 60 * 1000;
    case 'month': return now - 30 * 24 * 60 * 60 * 1000;
    case 'all':
    default: return null;
  }
}

/**
 * Get overview for a specific date range (used by PDF)
 */
async function _getOverviewForRange(startMs, endMs) {
  const all = conversationStateService.getAllConversations();
  const filtered = all.filter(c => {
    const ts = c.lastInteraction || 0;
    return ts >= startMs && ts <= endMs;
  });

  const total = filtered.length;
  const resolvedByIA = filtered.filter(c =>
    c.bot_active === true && !c.needsHuman && c.status !== 'pending_advisor' && c.status !== 'advisor_handled'
  ).length;
  const escalated = filtered.filter(c =>
    c.status === 'pending_advisor' || c.status === 'advisor_handled' || c.needsHuman
  ).length;
  const outOfHours = filtered.filter(c => c.status === 'out_of_hours').length;
  const advisorHandled = filtered.filter(c => c.status === 'advisor_handled').length;
  const abandoned = filtered.filter(c =>
    c.status === 'pending_advisor' && !c.assignedTo
  ).length;

  const botEfficiency = total > 0 ? Math.round((resolvedByIA / total) * 100) : 0;
  const escalationRate = total > 0 ? Math.round((escalated / total) * 100) : 0;
  const abandonRate = escalated > 0 ? Math.round((abandoned / escalated) * 100) : 0;

  // Average response time
  let avgResponseTimeMs = 0;
  let responseTimeSamples = 0;
  try {
    const allMessages = await _loadAllUserMessages();
    const byConv = {};
    for (const msg of allMessages) {
      if (msg.timestamp < startMs || msg.timestamp > endMs) continue;
      if (!byConv[msg.conversationId]) byConv[msg.conversationId] = [];
      byConv[msg.conversationId].push(msg);
    }
    for (const convId of Object.keys(byConv)) {
      const msgs = byConv[convId].sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 1; i < msgs.length; i++) {
        if (msgs[i - 1].sender === 'user' && msgs[i].sender !== 'user') {
          const diff = msgs[i].timestamp - msgs[i - 1].timestamp;
          if (diff > 0 && diff < 300000) {
            avgResponseTimeMs += diff;
            responseTimeSamples++;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [STATS] Error calculating response time for range: ${err.message}`);
  }

  const avgResponseTimeSec = responseTimeSamples > 0
    ? Math.round((avgResponseTimeMs / responseTimeSamples) / 1000)
    : 0;

  return {
    total, resolvedByIA, escalated, outOfHours, advisorHandled,
    abandoned, botEfficiency, escalationRate, abandonRate, avgResponseTimeSec
  };
}

/**
 * Get top questions for a specific date range (used by PDF)
 */
async function _getTopQuestionsForRange(limit, startMs, endMs) {
  const questions = [];
  try {
    const allMessages = await _loadAllUserMessages();
    for (const msg of allMessages) {
      if (msg.sender !== 'user') continue;
      if (msg.timestamp < startMs || msg.timestamp > endMs) continue;
      const text = (msg.text || '').toLowerCase().trim();
      if (!text || text.length < 5) continue;
      if (QUESTION_PATTERNS.some(p => text.includes(p))) {
        questions.push(text.substring(0, 120));
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [STATS] Error loading questions for range: ${err.message}`);
  }
  return groupAndRank(questions, limit);
}

/**
 * Get top complaints for a specific date range (used by PDF)
 */
async function _getTopComplaintsForRange(limit, startMs, endMs) {
  const complaints = [];
  try {
    const allMessages = await _loadAllUserMessages();
    for (const msg of allMessages) {
      if (msg.sender !== 'user') continue;
      if (msg.timestamp < startMs || msg.timestamp > endMs) continue;
      const text = (msg.text || '').toLowerCase().trim();
      if (!text || text.length < 5) continue;
      if (COMPLAINT_KEYWORDS.some(k => text.includes(k))) {
        complaints.push(text.substring(0, 120));
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [STATS] Error loading complaints for range: ${err.message}`);
  }
  return groupAndRank(complaints, limit);
}

/**
 * Groups similar strings and ranks by frequency.
 * Simple normalization: lowercase, trim, remove extra whitespace.
 */
function groupAndRank(items, limit) {
  const freq = {};
  for (const text of items) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    // Try to match with existing keys (simple substring match)
    let matched = false;
    for (const key of Object.keys(freq)) {
      if (key.includes(normalized.substring(0, 30)) || normalized.includes(key.substring(0, 30))) {
        freq[key].count++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      freq[normalized] = { text: normalized, count: 1 };
    }
  }

  return Object.values(freq)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

module.exports = {
  getOverview,
  getConversationsByDay,
  getTopQuestions,
  getTopComplaints,
  generateMonthlyPDF,
  getOverviewForRange: _getOverviewForRange,
  getTopQuestionsForRange: _getTopQuestionsForRange,
  getTopComplaintsForRange: _getTopComplaintsForRange
};
