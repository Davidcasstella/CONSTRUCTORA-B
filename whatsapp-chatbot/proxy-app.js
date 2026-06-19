/**
 * ===========================================
 * PASSENGER ENTRY POINT - REVERSE PROXY + STATIC FILES
 * ===========================================
 * 
 * This file is served by CloudLinux Passenger on port 80.
 * It does two things:
 * 1. Proxies /api/*, /socket.io/*, /logout, /clear-session, /health, /uploads
 *    to the backend running on port 3001
 * 2. Serves the frontend static files (Vite build) for everything else
 * 
 * This eliminates the need to expose port 3001 publicly.
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var BACKEND_PORT = 3001;
var STATIC_DIR = path.join(__dirname, 'AUTOMATIZACION', 'whatsapp-chatbot', 'public');

// MIME types for static file serving
var MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

/**
 * Proxy an HTTP request to the backend server on BACKEND_PORT
 */
function proxyRequest(req, res) {
  var options = {
    hostname: '127.0.0.1',
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: '127.0.0.1:' + BACKEND_PORT
    })
  };

  var proxyReq = http.request(options, function(proxyRes) {
    // Copy all headers from backend response
    var headers = proxyRes.headers;
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', function(err) {
    console.error('[Proxy] Backend error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Backend unavailable',
      message: 'The chatbot backend (port ' + BACKEND_PORT + ') is not running. Start it with: nohup node server.js > server.log 2>&1 &',
      timestamp: new Date().toISOString()
    }));
  });

  // Pipe the incoming request body to the backend
  req.pipe(proxyReq, { end: true });
}

/**
 * Serve a static file from STATIC_DIR, with SPA fallback to index.html
 */
function serveStatic(req, res) {
  var parsedUrl = url.parse(req.url);
  var pathname = decodeURIComponent(parsedUrl.pathname);

  // Prevent directory traversal
  if (pathname.indexOf('..') !== -1) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Default to index.html for root
  if (pathname === '/') pathname = '/index.html';

  var filePath = path.join(STATIC_DIR, pathname);
  var ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, function(err, stats) {
    if (!err && stats.isFile()) {
      // File exists, serve it
      var contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Cache static assets (js, css, images) for 1 year
      var cacheControl = (ext === '.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': cacheControl
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // File not found → SPA fallback: serve index.html
      var indexPath = path.join(STATIC_DIR, 'index.html');
      fs.stat(indexPath, function(err2, stats2) {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Frontend not deployed</h1><p>Upload the frontend build to: ' + STATIC_DIR + '</p>');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': stats2.size,
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(indexPath).pipe(res);
      });
    }
  });
}

/**
 * Check if a request path should be proxied to the backend
 */
function shouldProxy(pathname) {
  return (
    pathname.indexOf('/api') === 0 ||
    pathname.indexOf('/socket.io') === 0 ||
    pathname === '/logout' ||
    pathname === '/clear-session' ||
    pathname === '/health' ||
    pathname.indexOf('/uploads/') === 0
  );
}

// ===========================================
// CREATE SERVER
// ===========================================
var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url);
  var pathname = parsedUrl.pathname;

  if (shouldProxy(pathname)) {
    proxyRequest(req, res);
  } else {
    serveStatic(req, res);
  }
});

// ===========================================
// WEBSOCKET UPGRADE (for Socket.IO real-time)
// ===========================================
server.on('upgrade', function(req, socket, head) {
  var parsedUrl = url.parse(req.url);
  
  // Only proxy Socket.IO WebSocket upgrades
  if (parsedUrl.pathname.indexOf('/socket.io') !== 0) {
    socket.end();
    return;
  }

  var options = {
    hostname: '127.0.0.1',
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: '127.0.0.1:' + BACKEND_PORT
    })
  };

  var proxyReq = http.request(options);

  proxyReq.on('upgrade', function(proxyRes, proxySocket, proxyHead) {
    // Build the 101 Switching Protocols response
    var responseHeaders = 'HTTP/1.1 101 Switching Protocols\r\n';
    var headerKeys = Object.keys(proxyRes.headers);
    for (var i = 0; i < headerKeys.length; i++) {
      responseHeaders += headerKeys[i] + ': ' + proxyRes.headers[headerKeys[i]] + '\r\n';
    }
    responseHeaders += '\r\n';

    socket.write(responseHeaders);

    // Pipe data in both directions
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on('error', function() { socket.end(); });
    socket.on('error', function() { proxySocket.end(); });
  });

  proxyReq.on('error', function() {
    socket.end();
  });

  proxyReq.end();
});

// Passenger will handle the port assignment
server.listen();
