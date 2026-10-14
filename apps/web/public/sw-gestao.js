// Service worker mínimo da gestão — só pra o Chrome considerar o app instalável. SEM cache e SÓ
// navegações passam por ele: requisições de API e uploads (XHR com barra de progresso, PUT pro
// S3) seguem direto pela rede, sem interceptação, pra nada do que já funciona mudar.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
});
