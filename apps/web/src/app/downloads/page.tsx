'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { authApi } from '@/lib/api';
import { Download, Trash2, Monitor, Clock } from 'lucide-react';

interface Release {
  id: string;
  version: string;
  sizeBytes: number;
  releaseNotes: string | null;
  createdAt: string;
}

function formatSize(bytes: number) {
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (!bytes) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function DownloadsPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    authApi.me().then((res: any) => setIsAdmin(res.user?.role === 'admin')).catch(() => {});
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/desktop-releases', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string, ver: string) {
    if (!confirm(`Remover a versão ${ver}? Isso não afeta quem já instalou.`)) return;
    await fetch(`/api/v2/desktop-releases/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  const latest = releases[0];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Monitor className="size-6 text-primary" /> Downloads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Instalável do app de painel de LED para Windows. Depois de instalado, o próprio app verifica e baixa
            atualizações automaticamente sempre que é iniciado — não é preciso reinstalar manualmente depois da
            primeira vez.
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Carregando...</div>
        ) : !latest ? (
          <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground text-sm">
            Nenhuma versão publicada ainda.
          </div>
        ) : (
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Versão atual</p>
                <p className="text-xl font-semibold">{latest.version}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatSize(latest.sizeBytes)}</p>
              </div>
              <button
                onClick={async () => {
                  const res = await fetch('/api/v2/devices/latest-version');
                  const data = await res.json();
                  if (data.downloadUrl) window.location.href = data.downloadUrl;
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition shrink-0"
              >
                <Download size={16} /> Baixar
              </button>
            </div>
            {latest.releaseNotes && (
              <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap border-t pt-3">{latest.releaseNotes}</p>
            )}
          </div>
        )}

        {releases.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Histórico de versões</p>
            <div className="space-y-2">
              {releases.map(r => (
                <div key={r.id} className="bg-card border rounded-xl px-4 py-3 flex items-center gap-3">
                  <Clock size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.version}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString('pt-BR')} · {formatSize(r.sizeBytes)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => remove(r.id, r.version)} className="p-1.5 text-muted-foreground hover:text-destructive rounded shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
