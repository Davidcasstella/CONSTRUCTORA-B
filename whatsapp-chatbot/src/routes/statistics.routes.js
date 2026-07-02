/**
 * ===========================================
 * STATISTICS ROUTES
 * ===========================================
 *
 * Endpoints for the dashboard statistics module.
 * All routes require authentication.
 */

const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const statisticsService = require('../services/statistics.service');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/statistics/overview
 * Returns overview metrics for the given period.
 * Query: ?period=day|week|month|all (default: all)
 */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const { period, month, year } = req.query;
    let overview;
    if (month && year) {
      // Month-based range filtering
      const m = parseInt(month);
      const y = parseInt(year);
      const startMs = new Date(y, m - 1, 1).getTime();
      const endMs = new Date(y, m, 0, 23, 59, 59, 999).getTime();
      overview = await statisticsService.getOverviewForRange(startMs, endMs);
    } else {
      overview = await statisticsService.getOverview(period || 'all');
    }
    res.json({ success: true, overview });
  } catch (error) {
    logger.error('Error getting statistics overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/statistics/conversations-by-day
 * Returns conversations grouped by day for charts.
 * Query: ?period=day|week|month|all (default: month)
 */
router.get('/conversations-by-day', requireAuth, (req, res) => {
  try {
    const { period, month, year } = req.query;
    let data;
    if (month && year) {
      // Get all data, then filter by month on server side
      data = statisticsService.getConversationsByDay('all');
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      data = data.filter(d => d.date.startsWith(monthStr));
    } else {
      data = statisticsService.getConversationsByDay(period || 'month');
    }
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error getting conversations by day:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/statistics/top-questions
 * Returns top frequently asked questions.
 * Query: ?limit=10
 */
router.get('/top-questions', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { period, month, year } = req.query;
    let questions;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startMs = new Date(y, m - 1, 1).getTime();
      const endMs = new Date(y, m, 0, 23, 59, 59, 999).getTime();
      questions = await statisticsService.getTopQuestionsForRange(limit, startMs, endMs);
    } else {
      questions = await statisticsService.getTopQuestions(limit, period || 'all');
    }
    res.json({ success: true, questions });
  } catch (error) {
    logger.error('Error getting top questions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/statistics/top-complaints
 * Returns top complaints detected by keywords.
 * Query: ?limit=10
 */
router.get('/top-complaints', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { period, month, year } = req.query;
    let complaints;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startMs = new Date(y, m - 1, 1).getTime();
      const endMs = new Date(y, m, 0, 23, 59, 59, 999).getTime();
      complaints = await statisticsService.getTopComplaintsForRange(limit, startMs, endMs);
    } else {
      complaints = await statisticsService.getTopComplaints(limit, period || 'all');
    }
    res.json({ success: true, complaints });
  } catch (error) {
    logger.error('Error getting top complaints:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/statistics/monthly-report
 * Generates and downloads a PDF report for the given month.
 * Query: ?month=3&year=2026
 */
router.get('/monthly-report', requireAuth, async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const period = req.query.period || null;

    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, error: 'Mes inválido (1-12)' });
    }

    logger.info(`📊 Generating monthly PDF report for ${month}/${year}`);
    const pdfBuffer = await statisticsService.generateMonthlyPDF(month, year, period);

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const filename = `ConstructoraGA_Reporte_${monthNames[month - 1]}_${year}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    logger.error('Error generating monthly report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
