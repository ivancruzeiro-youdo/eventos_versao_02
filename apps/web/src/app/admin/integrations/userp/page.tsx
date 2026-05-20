'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { Save, RefreshCw, CheckCircle, XCircle, Globe, User, Lock, Eye, EyeOff } from 'lucide-react';

export default function UserpIntegrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({ userpBaseUrl: 'https://userpweb.youdobrasil.com.br', userpEmail: '', userpSenha: '' });

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/userp-config', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      if (data.config) {
        setForm(f => ({
          userpBaseUrl: data.config.userpBaseUrl || f.userpBaseUrl,
          userpEmail: data.config.userpEmail || '',
          userpSenha: '',
        }));
      }
    } finally { setLoading(false); }
  }

  async function saveConfig() {
    setSaving(true); setTestResult(null); setSaveOk(false);
    try {
      const body: any = { userpBaseUrl: form.userpBaseUrl, userpEmail: form.userpEmail };
      if (form.userpSenha) body.userpSenha = form.userpSenha;
      const res = await fetch('/api/v2/userp-config', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) setSaveOk(true);
    } finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/v2/userp-config/test', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      setTestResult({ ok: res.ok, message: data.message || data.error || 'Erro desconhecido' });
    } finally { setTesting(false); }
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Integração Userp-Satélite</h1>
        <p className="text-muted-foreground text-sm">Credenciais usadas automaticamente ao importar produtos e espaços.</p>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : (
        <div className="max-w-lg space-y-6">
          <div className="bg-card rounded-xl border shadow-sm p-6 space-y-5">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <Globe size={14} /> URL base do Userp
              </label>
              <input type="url" value={form.userpBaseUrl}
                onChange={e => setForm(f => ({ ...f, userpBaseUrl: e.target.value }))}
                placeholder="https://userpweb.youdobrasil.com.br"
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <User size={14} /> E-mail
              </label>
              <input type="email" value={form.userpEmail}
                onChange={e => setForm(f => ({ ...f, userpEmail: e.target.value }))}
                placeholder="usuario@empresa.com"
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <Lock size={14} /> Senha
              </label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={form.userpSenha}
                  onChange={e => setForm(f => ({ ...f, userpSenha: e.target.value }))}
                  placeholder="Deixe em branco para manter a senha atual"
                  className="w-full px-3 py-2 pr-10 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {saveOk && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded">
                <CheckCircle size={14} /> Configuração salva com sucesso.
              </div>
            )}

            {testResult && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded border ${testResult.ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-destructive bg-destructive/10 border-destructive/30'}`}>
                {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={testConnection} disabled={testing}
                className="flex-1 px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-muted transition disabled:opacity-50 flex items-center justify-center gap-2">
                {testing ? <><RefreshCw size={14} className="animate-spin" /> Testando...</> : 'Testar Conexão'}
              </button>
              <button onClick={saveConfig} disabled={saving}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          <div className="bg-muted/40 rounded-lg border p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como funciona</p>
            <p>Após salvar as credenciais aqui, as páginas de <strong>Produtos</strong> e <strong>Espaços</strong> vão importar do Userp automaticamente sem pedir acesso novamente.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
