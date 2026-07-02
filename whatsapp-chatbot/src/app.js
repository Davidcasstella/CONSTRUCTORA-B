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
    'http://localhost:5174',
    'http://localhost:5175',
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

// Serve React frontend (production build) first so it takes precedence
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// Fallback to old public folder if needed
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

// Catch-all: serve React frontend for client-side routing
const fs = require('fs');
if (fs.existsSync(path.join(frontendDistPath, 'index.html'))) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

module.exports = app;

