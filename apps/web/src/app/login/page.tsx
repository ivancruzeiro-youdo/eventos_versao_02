'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { redirectToLogin, clearLoginRedirectGuard, HUB_LOGIN_URL } from '@/lib/sso';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  // On mount: try to exchange youdo_token cookie for a local session. If there
  // is no valid Hub session, send the user to the Hub login automatically.
  useEffect(() => {
    tryAutoLogin();
  }, []);

  async function tryAutoLogin() {
    try {
      const res = await fetch('/api/v2/auth/userp-sso', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        clearLoginRedirectGuard();
        router.replace('/dashboard');
        return;
      }

      // 401 = no/invalid Hub cookie → bounce to the Hub (guarded against loops).
      // The guard short-circuits if we just came back from the Hub, in which
      // case we fall through and show the manual login UI below.
      if (res.status === 401) {
        redirectToLogin();
        // Don't fall through to setError if we just navigated to the Hub.
      }

      try {
        const data = await res.json();
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        setError(msg);
      } catch {
        setError(`Falha no login (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message || 'Erro de rede');
    }
    setChecking(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-sm p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">YOUDO Experience</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de Eventos</p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          onClick={() => redirectToLogin(true)}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          Entrar via YouDO Hub
        </button>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Você será redirecionado para o {' '}
          <a href={HUB_LOGIN_URL} className="underline">YouDO Hub</a> para autenticar.
        </p>

        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-xs text-muted-foreground mb-2">Acesso para freelancers</p>
          <Link
            href="/freelancer/login"
            className="text-sm text-primary hover:underline"
          >
            Portal do Freelancer →
          </Link>
        </div>
      </div>
    </div>
  );
}
