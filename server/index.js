import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

const PORT = Number(process.env.PORT) || 8000;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const indexHtml = path.join(publicDir, 'index.html');

const app = express();

app.disable('x-powered-by');

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
