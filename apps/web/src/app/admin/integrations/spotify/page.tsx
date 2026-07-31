'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { Save, CheckCircle, KeyRound, Lock, Eye, EyeOff, ExternalLink, Copy } from 'lucide-react';

export default function SpotifyIntegrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState('');
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({ clientId: '', clientSecret: '' });

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/admin/spotify-config', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      if (data.config) {
        setForm(f => ({ ...f, clientId: data.config.clientId || '' }));
        setHasClientSecret(!!data.config.hasClientSecret);
        setRedirectUri(data.config.redirectUri || '');
      }
    } finally { setLoading(false); }
  }

  async function saveConfig() {
    setSaving(true); setSaveOk(false); setSaveError('');
    try {
      const body: any = { clientId: form.clientId };
      if (form.clientSecret) body.clientSecret = form.clientSecret;
      const res = await fetch('/api/v2/admin/spotify-config', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveOk(true);
        setForm(f => ({ ...f, clientSecret: '' }));
        loadConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Erro ao salvar.');
      }
    } finally { setSaving(false); }
  }

  function copyRedirectUri() {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Integração Spotify</h1>
        <p className="text-muted-foreground text-sm">
          Credenciais do app usado por todos os espaços pra conectar sua conta Spotify (painel de LED).
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : (
        <div className="max-w-lg space-y-6">
          <div className="bg-muted/40 rounded-lg border p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Onde conseguir essas credenciais</p>
            <p>
              Crie (ou abra) um app em{' '}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                developer.spotify.com/dashboard <ExternalLink size={12} />
              </a>{' '}
              — o Client ID e o Client Secret aparecem nas configurações do app. Antes de salvar aqui, cole o
              Redirect URI abaixo nas configurações do app no dashboard do Spotify.
            </p>
          </div>

          {redirectUri && (
            <div className="bg-card rounded-xl border shadow-sm p-4">
              <label className="text-sm font-medium mb-1.5 block">Redirect URI (cole no dashboard do Spotify)</label>
              <div className="flex gap-2">
                <input readOnly value={redirectUri} className="flex-1 px-3 py-2 bg-muted border border-input rounded-md text-sm font-mono" />
                <button onClick={copyRedirectUri} className="px-3 py-2 border border-input rounded-md text-sm hover:bg-muted transition flex items-center gap-1.5">
                  <Copy size={14} /> {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-card rounded-xl border shadow-sm p-6 space-y-5">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <KeyRound size={14} /> Client ID
              </label>
              <input type="text" value={form.clientId}
                onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
                placeholder="Client ID do app no dashboard do Spotify"
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring font-mono" />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <Lock size={14} /> Client Secret
              </label>
              <div className="relative">
                <input type={showSecret ? 'text' : 'password'} value={form.clientSecret}
                  onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))}
                  placeholder={hasClientSecret ? 'Deixe em branco para manter o atual' : 'Client Secret do app no dashboard do Spotify'}
                  className="w-full px-3 py-2 pr-10 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring font-mono" />
                <button type="button" onClick={() => setShowSecret(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {saveOk && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded">
                <CheckCircle size={14} /> Configuração salva com sucesso.
              </div>
            )}
            {saveError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded">
                {saveError}
              </div>
            )}

            <button onClick={saveConfig} disabled={saving || !form.clientId.trim()}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          <div className="bg-muted/40 rounded-lg border p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como funciona</p>
            <p>Depois de salvar aqui, qualquer espaço pode clicar em "Conectar com Spotify" na sua página (aba Espaços) — cada um autoriza a própria conta, mas todos usam este mesmo app.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
