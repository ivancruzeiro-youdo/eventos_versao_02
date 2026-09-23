'use client';

import { useEffect } from 'react';

// Registra o service worker do PWA do freelancer, escopado só a /freelancer/ — nunca deve
// controlar nenhuma outra rota do site.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-freelancer.js', { scope: '/freelancer/' }).catch(() => {
        // Falha silenciosa — sem SW o app continua funcionando normalmente como site comum,
        // só não fica instalável.
      });
    }
  }, []);

  return null;
}
