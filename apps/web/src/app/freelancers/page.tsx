'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { User, Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, X, Check, AlertCircle, AlertTriangle, Camera } from 'lucide-react';

interface Service { id: string; name: string; hourlyRate: number; description?: string | null; startOffsetMinutes: number; endOffsetMinutes: number; }
interface FreelancerItem {
  id: string; name: string; email: string; cpf: string; phone: string | null;
  birthDate: string | null; status: 'active' | 'suspended';
  fotoBase64: string | null;
  services: { service: Service }[];
  _count: { penalties: number; applications: number };
}

type ModalMode = 'create' | 'edit' | 'services' | null;
type Tab = 'freelancers' | 'penalties' | 'services';

interface Penalty {
  id: string;
  freelancer: { id: string; name: string; email: string };
  eventId: string | null;
  reason: string;
  severity: 'light' | 'medium' | 'grave';
  createdAt: string;
}

const EMPTY_FORM = { name: '', email: '', cpf: '', phone: '', birthDate: '', status: 'active', fotoBase64: '' };

/** Reduz o frame pra um tamanho razoável de foto de identificação antes de virar base64 — sem
 *  isso um arquivo de câmera cru (facilmente 3-8MB) estoura o limite de corpo da requisição
 *  (1MB por padrão no Fastify) e o PATCH volta com um "FastifyError" cru pro operador. Mesmo
 *  helper já usado em freelancer/profile/page.tsx pro próprio freelancer trocar a foto. */
function drawToJpegDataUrl(source: CanvasImageSource, srcW: number, srcH: number, maxDim = 480): string {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function calcAge(birthDate: string | null) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

function fmtCpf(cpf: string) {
  const c = cpf.replace(/\D/g, '');
  return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function ServicesTabContent() {
  const [svcs, setSvcs] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [svcModal, setSvcModal] = useState(false);
  const [editSvc, setEditSvc] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: '', hourlyRate: '', description: '', startOffsetMinutes: '-60', endOffsetMinutes: '60' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/services', { credentials: 'include' });
      const d = await res.json();
      setSvcs(d.services || []);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditSvc(null); setForm({ name: '', hourlyRate: '', description: '', startOffsetMinutes: '-60', endOffsetMinutes: '60' }); setErr(''); setSvcModal(true); }
  function openEdit(s: Service) { setEditSvc(s); setForm({ name: s.name, hourlyRate: String(s.hourlyRate), description: s.description || '', startOffsetMinutes: String(s.startOffsetMinutes ?? -60), endOffsetMinutes: String(s.endOffsetMinutes ?? 60) }); setErr(''); setSvcModal(true); }

  async function save() {
    setSaving(true); setErr('');
    try {
      const url = editSvc ? `/api/v2/services/${editSvc.id}` : '/api/v2/services';
      const method = editSvc ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, hourlyRate: parseFloat(form.hourlyRate) || 0, description: form.description || null, startOffsetMinutes: parseInt(form.startOffsetMinutes) || -60, endOffsetMinutes: parseInt(form.endOffsetMinutes) || 60 }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || 'Erro ao salvar'); return; }
      setSvcModal(false); load();
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Excluir "${name}"?`)) return;
    await fetch(`/api/v2/services/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">Serviços disponíveis para vinculação com freelancers e produtos.</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
          <Plus size={15} /> Novo Serviço
        </button>
      </div>
      <div className="bg-card rounded-lg border divide-y">
        {loading ? (
          <div className="text-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
        ) : svcs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Nenhum serviço cadastrado.</div>
        ) : svcs.map(s => (
          <div key={s.id} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{s.name}</p>
              {s.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>}
            </div>
            <div className="flex flex-col items-end shrink-0 text-right">
              {s.hourlyRate > 0 && <span className="text-sm text-muted-foreground">R$ {s.hourlyRate.toFixed(2)}/h</span>}
              <span className="text-xs text-muted-foreground">
                {s.startOffsetMinutes > 0 ? '+' : ''}{s.startOffsetMinutes}min → +{s.endOffsetMinutes}min
              </span>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><Pencil size={14} /></button>
              <button onClick={() => del(s.id, s.name)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {svcModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editSvc ? 'Editar Serviço' : 'Novo Serviço'}</h2>
              <button onClick={() => setSvcModal(false)} className="p-1.5 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              {err && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{err}</p>}
              <div>
                <label className="block text-sm font-medium mb-1">Nome do Serviço *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Valet"
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor/Hora (R$) *</label>
                <input type="number" step="0.01" min="0" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="0,00"
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={250}
                  placeholder="Descreva o serviço..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring resize-none" />
                <p className="text-xs text-muted-foreground mt-1">{form.description.length}/250 caracteres</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Horário padrão relativo ao início do evento</label>
                <p className="text-xs text-muted-foreground mb-2">Define o início e fim deste serviço automaticamente ao importar contratos.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Início (min antes do evento, use negativo)</label>
                    <input type="number" value={form.startOffsetMinutes}
                      onChange={e => setForm(f => ({ ...f, startOffsetMinutes: e.target.value }))}
                      placeholder="-60"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Fim (min após o evento, use positivo)</label>
                    <input type="number" value={form.endOffsetMinutes}
                      onChange={e => setForm(f => ({ ...f, endOffsetMinutes: e.target.value }))}
                      placeholder="60"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setSvcModal(false)} className="px-4 py-2 text-sm rounded border hover:bg-muted transition">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FreelancersPage() {
  const router = useRouter();
  const [items, setItems] = useState<FreelancerItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [totalSuspended, setTotalSuspended] = useState(0);
  const limit = 20;

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<FreelancerItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [linkedServiceIds, setLinkedServiceIds] = useState<Set<string>>(new Set());
  const [savingServices, setSavingServices] = useState(false);
  const [tab, setTab] = useState<Tab>('freelancers');
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [penaltiesLoading, setPenaltiesLoading] = useState(false);
  const [penaltySearch, setPenaltySearch] = useState('');

  const load = useCallback(async (p = page, s = search, st = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit), status: st });
      if (s) params.set('search', s);
      const res = await fetch(`/api/v2/freelancers?${params}`, { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setItems(data.freelancers || []);
      setTotal(data.total || 0);
      setTotalActive(data.totalActive || 0);
      setTotalSuspended(data.totalSuspended || 0);
    } finally { setLoading(false); }
  }, [page, search, statusFilter, router]);

  useEffect(() => { load(page, search, statusFilter); }, [page, statusFilter]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1, search, statusFilter); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function loadPenalties() {
    setPenaltiesLoading(true);
    try {
      const res = await fetch('/api/v2/admin/penalties', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPenalties(data.penalties || []);
      }
    } finally { setPenaltiesLoading(false); }
  }

  useEffect(() => { if (tab === 'penalties') loadPenalties(); }, [tab]);

  async function loadServices() {
    const res = await fetch('/api/v2/services', { credentials: 'include' });
    const data = await res.json();
    setServices(data.services || []);
  }

  function openCreate() {
    setSelected(null); setForm({ ...EMPTY_FORM }); setFormError(''); setModal('create');
  }
  function openEdit(f: FreelancerItem) {
    setSelected(f);
    setForm({ name: f.name, email: f.email, cpf: fmtCpf(f.cpf), phone: f.phone || '', birthDate: f.birthDate ? f.birthDate.slice(0, 10) : '', status: f.status, fotoBase64: (f as any).fotoBase64 || '' });
    setFormError(''); setModal('edit');
  }
  async function openServices(f: FreelancerItem) {
    setSelected(f);
    await loadServices();
    setLinkedServiceIds(new Set(f.services.map(s => s.service.id)));
    setModal('services');
  }

  async function handleSave() {
    setSaving(true); setFormError('');
    try {
      const url = modal === 'edit' && selected ? `/api/v2/freelancers/${selected.id}` : '/api/v2/freelancers';
      const method = modal === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cpf: form.cpf.replace(/\D/g, '') }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Erros sem tratamento específico na API voltam como { error: error.name, message }
        // (server.ts) — "FastifyError"/"PrismaClientKnownRequestError" não diz nada pro
        // operador; prefere a mensagem descritiva quando o "error" é só o nome da exceção.
        const friendly = /Error$/.test(data.error) && data.message ? data.message : data.error;
        setFormError(friendly || 'Erro ao salvar');
        return;
      }
      setModal(null); load(page, search, statusFilter);
    } finally { setSaving(false); }
  }

  async function handleDelete(f: FreelancerItem) {
    if (!confirm(`Excluir "${f.name}"?`)) return;
    await fetch(`/api/v2/freelancers/${f.id}`, { method: 'DELETE', credentials: 'include' });
    load(page, search, statusFilter);
  }

  async function toggleService(serviceId: string) {
    if (!selected) return;
    const has = linkedServiceIds.has(serviceId);
    const next = new Set(linkedServiceIds);
    if (has) { next.delete(serviceId); } else { next.add(serviceId); }
    setLinkedServiceIds(next);

    const method = has ? 'DELETE' : 'POST';
    const url = has
      ? `/api/v2/freelancers/${selected.id}/services/${serviceId}`
      : `/api/v2/freelancers/${selected.id}/services`;
    await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: has ? undefined : JSON.stringify({ serviceId }),
    });
    // refresh item services
    const fresh = await fetch(`/api/v2/freelancers/${selected.id}`, { credentials: 'include' });
    const fdata = await fresh.json();
    if (fdata.freelancer) {
      setItems(prev => prev.map(i => i.id === selected.id ? { ...i, services: fdata.freelancer.services } : i));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const severityLabel = (s: string) => ({ light: 'Leve', medium: 'Médio', grave: 'Grave' }[s] || s);
  const severityColor = (s: string) => ({ light: 'bg-yellow-100 text-yellow-700', medium: 'bg-orange-100 text-orange-700', grave: 'bg-red-100 text-red-700' }[s] || 'bg-muted text-muted-foreground');
  const filteredPenalties = penalties.filter(p =>
    p.freelancer.name.toLowerCase().includes(penaltySearch.toLowerCase()) ||
    p.reason.toLowerCase().includes(penaltySearch.toLowerCase())
  );

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gerenciamento de Freelancers</h1>
        </div>
        {tab === 'freelancers' && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
            <Plus size={16} /> Novo Freelancer
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <nav className="flex gap-1">
          {(['freelancers', 'penalties', 'services'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {t === 'freelancers' ? 'Freelancers' : t === 'penalties' ? 'Penalidades' : 'Serviços'}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'freelancers' && <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total de Freelancers', value: total },
          { label: 'Ativos', value: totalActive },
          { label: 'Inativos', value: totalSuspended },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-lg border p-4">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, CPF, telefone ou e-mail..."
            className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-ring" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-background border border-input rounded-lg text-sm">
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="suspended">Inativos</option>
        </select>
        <span className="self-center text-sm text-muted-foreground whitespace-nowrap">{limit} por página</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                {['ID', 'Nome', 'E-mail', 'CPF', 'Telefone', 'Idade', 'Serviços', 'Status', 'Ações'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Nenhum freelancer encontrado.</td></tr>
              ) : items.map((f, idx) => {
                const age = calcAge(f.birthDate);
                const svcs = f.services?.map(s => s.service.name) || [];
                return (
                  <tr key={f.id} className="hover:bg-muted/30 transition">
                    <td className="px-4 py-3 text-muted-foreground text-xs">{(page - 1) * limit + idx + 1}</td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2.5">
                        {f.fotoBase64 ? (
                          <img src={f.fotoBase64} alt={f.name} className="w-8 h-8 rounded-full object-cover shrink-0 border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border">
                            <User size={14} className="text-muted-foreground" />
                          </div>
                        )}
                        <span>{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{f.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtCpf(f.cpf)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.phone || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{age != null ? `${age} anos` : '—'}</td>
                    <td className="px-4 py-3">
                      {svcs.length > 0
                        ? <div className="flex flex-wrap gap-1">{svcs.map(s => <span key={s} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{s}</span>)}</div>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${f.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {f.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(f)} title="Editar"
                          className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => openServices(f)} title="Serviços"
                          className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-primary">
                          <Check size={14} />
                        </button>
                        <button onClick={() => handleDelete(f)} title="Excluir"
                          className="p-1.5 rounded hover:bg-destructive/10 transition text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border disabled:opacity-40 hover:bg-muted transition">
              <ChevronLeft size={14} /> Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded text-sm ${page === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                    {p}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border disabled:opacity-40 hover:bg-muted transition">
              Próximo <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      </> }

      {/* Penalties Tab */}
      {tab === 'penalties' && (
        <div>
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={penaltySearch} onChange={e => setPenaltySearch(e.target.value)}
              placeholder="Buscar por freelancer ou motivo..."
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-ring" />
          </div>
          <div className="bg-card rounded-lg border">
            {penaltiesLoading ? (
              <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
            ) : filteredPenalties.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="mx-auto mb-3 text-muted-foreground" size={32} />
                <p className="text-muted-foreground text-sm">Nenhuma penalidade registrada.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredPenalties.map(p => (
                  <div key={p.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                      <AlertCircle size={16} className="text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{p.freelancer.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColor(p.severity)}`}>{severityLabel(p.severity)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Services Tab */}
      {tab === 'services' && (
        <ServicesTabContent />
      )}

      {/* Create/Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{modal === 'create' ? 'Novo Freelancer' : 'Editar Freelancer'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{formError}</p>}
              {[
                { label: 'Nome *', field: 'name', type: 'text', placeholder: 'Nome completo' },
                { label: 'E-mail *', field: 'email', type: 'email', placeholder: 'email@exemplo.com' },
                { label: 'CPF *', field: 'cpf', type: 'text', placeholder: '000.000.000-00' },
                { label: 'Telefone', field: 'phone', type: 'text', placeholder: '(41) 99999-9999' },
                { label: 'Data de Nascimento', field: 'birthDate', type: 'date', placeholder: '' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label className="block text-sm font-medium mb-1">{label}</label>
                  <input type={type} value={(form as any)[field]} placeholder={placeholder}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm">
                  <option value="active">Ativo</option>
                  <option value="suspended">Inativo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Foto (para sistema de acessos)</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-input flex items-center justify-center bg-muted/30 shrink-0 overflow-hidden">
                    {form.fotoBase64 ? (
                      <img src={form.fotoBase64} alt="Foto" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="foto-upload"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const img = new Image();
                        img.onload = () => {
                          const dataUrl = drawToJpegDataUrl(img, img.naturalWidth, img.naturalHeight);
                          if (dataUrl) setForm(f => ({ ...f, fotoBase64: dataUrl }));
                          URL.revokeObjectURL(img.src);
                        };
                        img.src = URL.createObjectURL(file);
                      }}
                    />
                    <label htmlFor="foto-upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border hover:bg-muted transition">
                      <Camera className="size-3.5" /> {form.fotoBase64 ? 'Trocar foto' : 'Selecionar foto'}
                    </label>
                    {form.fotoBase64 && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, fotoBase64: '' }))}
                        className="block text-xs text-destructive hover:underline">
                        Remover foto
                      </button>
                    )}
                    <p className="text-xs text-muted-foreground">JPG ou PNG. Usada no cadastro do sistema de acessos.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded border hover:bg-muted transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Services Modal */}
      {modal === 'services' && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-semibold">Serviços de {selected.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Marque os serviços autorizados</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto divide-y">
              {services.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum serviço cadastrado.</p>
                : services.map(svc => (
                  <label key={svc.id} className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 px-2 rounded transition">
                    <input type="checkbox" checked={linkedServiceIds.has(svc.id)} onChange={() => toggleService(svc.id)} className="rounded" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{svc.name}</p>
                      {svc.description && <p className="text-xs text-muted-foreground line-clamp-1">{svc.description}</p>}
                    </div>
                    {svc.hourlyRate > 0 && <span className="text-xs text-muted-foreground shrink-0">R$ {svc.hourlyRate.toFixed(2)}/h</span>}
                  </label>
                ))}
            </div>
            <div className="flex justify-end px-6 py-4 border-t">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
