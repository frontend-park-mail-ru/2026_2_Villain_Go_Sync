import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const indexHtml = path.join(publicDir, 'index.html');

// Настройки можно положить в файл .env в корне проекта. Переменные, уже заданные в окружении, он не перекрывает.
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}

const PORT = Number(process.env.PORT) || 8000;
const API_URL = (process.env.API_URL || 'http://localhost:8080/api').replace(/\/+$/, '');

const app = express();

app.disable('x-powered-by');

// Настройки, которые зависят от окружения, браузер получает отдельным модулем.
app.get('/env.js', (req, res) => {
  res
    .type('application/javascript')
    .set('Cache-Control', 'no-store')
    .send(`export const API_URL = ${JSON.stringify(API_URL)};\n`);
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
