'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const HUB_URL = 'https://hub.youdobrasil.com.br';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  // On mount: try to exchange youdo_token cookie for local session automatically
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
        router.replace('/dashboard');
        return;
      }
      // Show the actual API error so we can diagnose
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

        <a
          href={HUB_URL}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          Entrar via YouDO Hub
        </a>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Após o login no Hub, volte a esta página.
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
