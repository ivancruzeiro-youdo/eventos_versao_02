import type { Metadata, Viewport } from 'next';
import InstallPwaPrompt from '@/components/InstallPwaPrompt';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

// PWA instalável — restrito a esta árvore de rotas (/freelancer/*), sem afetar o resto do site
// (staff/admin, checkin, cozinha, links públicos usam o layout raiz sem nenhum desses campos).
// O apple-touch-icon vem de convenção de arquivo (freelancer/apple-icon.png), não do campo
// metadata.icons — no Next 14.2 esse campo definido num layout aninhado (fora da raiz) não
// gera a tag <link>; a convenção de arquivo por segmento funciona corretamente.
export const metadata: Metadata = {
  manifest: '/manifest-freelancer.json',
  appleWebApp: {
    capable: true,
    title: 'YouDO Vagas',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1f2e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function FreelancerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      {children}
      <InstallPwaPrompt />
    </>
  );
}
