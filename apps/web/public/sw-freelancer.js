// Service worker mínimo — só pra satisfazer o critério de instalabilidade do Chrome
// (beforeinstallprompt exige um SW registrado com handler de fetch). De propósito SEM
// cache nenhum: a lista de vagas muda o tempo todo, servir uma resposta antiga seria pior
// do que não ter PWA nenhum.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
