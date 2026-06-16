'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { Shield, Plus, Trash2, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  description?: string | null;
}

interface Mapping {
  id: string;
  serviceId: string;
  acessoId: string;
  acessoNome?: string | null;
}

interface AcessoExterno {
  id: string;
  nome: string;
  empreendimento: string;
}

export default function AdminAcessosPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({});
  const [acessosExternos, setAcessosExternos] = useState<AcessoExterno[]>([]);
  const [loadingAcessos, setLoadingAcessos] = useState(false);
  const [acessosError, setAcessosError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [selectedAcesso, setSelectedAcesso] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/services', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      const svcs: Service[] = data.services || [];
      setServices(svcs);

      const map: Record<string, Mapping[]> = {};
      await Promise.all(
        svcs.map(async (s) => {
          const r = await fetch(`/api/v2/services/${s.id}/acessos`, { credentials: 'include' });
          const d = await r.json();
          map[s.id] = d.mappings || [];
        })
      );
      setMappings(map);
    } finally {
      setLoading(false);
    }
  }

  async function loadAcessosExternos() {
    if (acessosExternos.length > 0) return;
    setLoadingAcessos(true);
    setAcessosError('');
    try {
      const res = await fetch('/api/v2/acessos/externos', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar acessos');
      setAcessosExternos(data.acessos || []);
    } catch (err: any) {
      setAcessosError(err.message);
    } finally {
      setLoadingAcessos(false);
    }
  }

  function toggleExpand(serviceId: string) {
    setExpanded(prev => prev === serviceId ? null : serviceId);
    if (expanded !== serviceId) {
      setAddingTo(null);
      setSelectedAcesso('');
    }
  }

  function openAdd(serviceId: string) {
    setAddingTo(serviceId);
    setSelectedAcesso('');
    loadAcessosExternos();
  }

  async function handleAdd(serviceId: string) {
    if (!selectedAcesso) return;
    const acesso = acessosExternos.find(a => a.id === selectedAcesso);
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/services/${serviceId}/acessos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acessoId: selectedAcesso, acessoNome: acesso?.nome }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro ao salvar'); return; }
      setAddingTo(null);
      setSelectedAcesso('');
      // refresh mappings for this service
      const r = await fetch(`/api/v2/services/${serviceId}/acessos`, { credentials: 'include' });
      const d = await r.json();
      setMappings(prev => ({ ...prev, [serviceId]: d.mappings || [] }));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(serviceId: string, acessoId: string) {
    if (!confirm('Remover este acesso do serviço?')) return;
    await fetch(`/api/v2/services/${serviceId}/acessos/${acessoId}`, {
      method: 'DELETE', credentials: 'include',
    });
    setMappings(prev => ({
      ...prev,
      [serviceId]: (prev[serviceId] || []).filter(m => m.acessoId !== acessoId),
    }));
  }

  const totalMappings = Object.values(mappings).reduce((acc, ms) => acc + ms.length, 0);

  return (
    <Layout>
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Acessos por Serviço</h1>
          <p className="text-muted-foreground text-sm">
            Configure quais portarias cada tipo de serviço libera automaticamente ao aprovar um freelancer.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="size-4" />
          <span>{totalMappings} mapeamento(s)</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : services.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="size-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum serviço cadastrado.</p>
          <p className="text-sm mt-1">Cadastre serviços na aba <strong>Serviços</strong> da página de Freelancers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => {
            const svcMappings = mappings[svc.id] || [];
            const isOpen = expanded === svc.id;
            return (
              <div key={svc.id} className="bg-card rounded-lg border shadow-sm overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => toggleExpand(svc.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="size-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{svc.name}</p>
                    {svc.description && <p className="text-xs text-muted-foreground line-clamp-1">{svc.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {svcMappings.length > 0 ? (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {svcMappings.slice(0, 3).map(m => (
                          <span key={m.id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {m.acessoNome || m.acessoId.slice(0, 8)}
                          </span>
                        ))}
                        {svcMappings.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{svcMappings.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Sem acessos configurados</span>
                    )}
                    {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t px-5 py-4 space-y-3">
                    {svcMappings.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Nenhuma portaria vinculada. Adicione abaixo.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {svcMappings.map(m => (
                          <div key={m.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-2.5">
                            <div>
                              <p className="text-sm font-medium">{m.acessoNome || '—'}</p>
                              <p className="text-xs text-muted-foreground font-mono">{m.acessoId}</p>
                            </div>
                            <button
                              onClick={() => handleRemove(svc.id, m.acessoId)}
                              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add form */}
                    {addingTo === svc.id ? (
                      <div className="flex items-center gap-2 pt-1">
                        {loadingAcessos ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <RefreshCw className="size-3.5 animate-spin" />
                            Carregando portarias...
                          </div>
                        ) : acessosError ? (
                          <p className="text-sm text-destructive">{acessosError}</p>
                        ) : (
                          <>
                            <select
                              value={selectedAcesso}
                              onChange={e => setSelectedAcesso(e.target.value)}
                              className="flex-1 px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            >
                              <option value="">Selecione uma portaria...</option>
                              {acessosExternos
                                .filter(a => !svcMappings.some(m => m.acessoId === a.id))
                                .map(a => (
                                  <option key={a.id} value={a.id}>
                                    {a.nome} {a.empreendimento ? `— ${a.empreendimento}` : ''}
                                  </option>
                                ))}
                            </select>
                            <button
                              onClick={() => handleAdd(svc.id)}
                              disabled={!selectedAcesso || saving}
                              className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
                            >
                              {saving ? 'Salvando...' : 'Adicionar'}
                            </button>
                            <button
                              onClick={() => setAddingTo(null)}
                              className="p-2 rounded hover:bg-muted text-muted-foreground transition"
                            >
                              <X className="size-4" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => openAdd(svc.id)}
                        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition font-medium"
                      >
                        <Plus className="size-4" />
                        Adicionar portaria
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
