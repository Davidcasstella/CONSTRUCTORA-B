/**
 * ===========================================
 * CONFIGURACIÓN DE EXPRESS - NORBOY CHATBOT
 * ===========================================
 */

const express = require('express');
const path = require('path');
const { router: routes } = require('./routes');
const errorMiddleware = require('./middlewares/error.middleware');
const { apiLimiter } = require('./middlewares/rate-limit.middleware');

const app = express();

// ===========================================
// MIDDLEWARES GLOBALES
// ===========================================

// CORS - Allow React frontend on different port/origin
app.use((req, res, next) => {
  // Load allowed origins from environment variable
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3001',
    ...envOrigins
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parsear JSON
app.use(express.json());

// Parsear URL-encoded
app.use(express.urlencoded({ extended: true }));

// ===========================================
// ARCHIVOS ESTÁTICOS (Interfaz Web)
// ===========================================
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded media (status images, etc.) as static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// ===========================================
// RUTAS
// ===========================================

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ✅ Rate limiting para todos los endpoints API (100 req/min por IP)
app.use('/api', apiLimiter);

// Rutas API
app.use('/api', routes);

// Ruta principal - Interfaz Web
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ===========================================
// MANEJO DE ERRORES
// ===========================================

// 404 solo para rutas /api que no existen
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

// Middleware de errores global
app.use(errorMiddleware);

module.exports = app;
