/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { addRoute, createHandlerBoundToURL, precache } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precache(self.__WB_MANIFEST);
const offlinePage = createHandlerBoundToURL('/index.html');

// Регистрируем навигацию первой, чтобы / и /index.html тоже проверялись по сети.
registerRoute(new NavigationRoute(async (options) => {
  try {
    return await fetch(options.request, { cache: 'no-cache' });
  } catch {
    return offlinePage(options);
  }
}, { denylist: [/^\/api(?:\/|\?|$)/] }));
addRoute();

// Кэшируется только общий список вакансий. Ответы, зависящие от сессии (например, /api/me), всегда идут в сеть:
// устаревшая копия показала бы пользователя вошедшим после выхода.
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname === '/api/vacancies',
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 3 }),
);
