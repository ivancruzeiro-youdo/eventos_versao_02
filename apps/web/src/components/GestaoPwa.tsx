'use client';

import { useEffect } from 'react';
import InstallPwaPrompt from '@/components/InstallPwaPrompt';

const REFRESH_MIN_GAP_MS = 10 * 60 * 1000;
const REFRESH_EVERY_MS = 30 * 60 * 1000;

// PWA da área de gestão. Fica DENTRO do Layout das telas de gestão (e não no layout raiz) de
// propósito: o portal do cliente, check-in, RSVP e links públicos de degustação usam o mesmo
// layout raiz e não devem ficar instaláveis como "YouDO Gestão". Por isso manifest/tags entram
// no <head> daqui e saem quando a tela desmonta.
export default function GestaoPwa() {
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.setAttribute('data-gestao-pwa', '1');
      document.head.appendChild(el);
      added.push(el);
    };

    add('link', { rel: 'manifest', href: '/manifest-gestao.json' });
    add('link', { rel: 'apple-touch-icon', href: '/gestao-apple-icon.png' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'YouDO Gestão' });
    // 'default' (barra de status sólida, sem sobrepor o conteúdo) em vez de translucent: o
    // cabeçalho fixo da gestão não precisa de padding de área segura nenhum.
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    // Cor da barra do sistema = cor do cabeçalho (card), claro e escuro.
    add('meta', { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' });
    add('meta', { name: 'theme-color', content: '#181c25', media: '(prefers-color-scheme: dark)' });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-gestao.js', { scope: '/' }).catch(() => {
        // Sem SW o sistema segue funcionando como site comum, só não fica instalável.
      });
    }

    return () => {
      added.forEach(el => el.remove());
    };
  }, []);

  // Sessão renovada ao abrir/voltar pro app e a cada 30 min enquanto aberto: quem usa todo dia
  // não precisa logar de novo toda manhã (o cookie dura 24h a partir da ÚLTIMA renovação).
  // Quem passa mais de 24h sem abrir continua tendo que logar — não é sessão eterna.
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - last < REFRESH_MIN_GAP_MS) return;
      last = now;
      fetch('/api/v2/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => {});
    };
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(refresh, REFRESH_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, []);

  return <InstallPwaPrompt appName="YouDO Gestão" storagePrefix="gestao" />;
}
