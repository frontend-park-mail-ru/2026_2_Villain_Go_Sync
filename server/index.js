import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

const PORT = Number(process.env.PORT) || 8000;
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8080';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const indexHtml = path.join(publicDir, 'index.html');

const app = express();

app.disable('x-powered-by');

// У бэкенда нет CORS, поэтому запросы к API идут через этот же сервер.
app.use('/api', (req, res) => {
  const target = new URL(req.originalUrl, API_ORIGIN);
  const client = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };

  const proxyReq = client.request(target, { method: req.method, headers }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    if (res.headersSent) {
      res.end();
      return;
    }

    res.status(502).type('text/plain').send('api unavailable');
  });

  req.pipe(proxyReq);
});

app.use(express.static(publicDir));

app.use((req, res, next) => {
  if (req.method !== 'GET' || path.extname(req.path)) {
    next();
    return;
  }
  res.sendFile(indexHtml);
});

app.listen(PORT, (error) => {
  if (error) {
    throw error;
  }

  console.log(`HireNoon: http://localhost:${PORT}`);
});
