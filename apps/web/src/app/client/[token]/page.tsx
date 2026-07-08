'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText, Users, Calendar, Clock, Download, Eye, EyeOff,
  Upload, Trash2, Plus, Search, CheckCircle, AlertCircle,
  FileImage, FileVideo, User, ChevronDown, ChevronRight, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventSummary {
  id: string;
  name: string;
  clientName: string;
  startAt: string | null;
  setupAt: string | null;
  teardownAt: string | null;
  status: string;
  venues: { id: string; name: string }[];
}

interface ClientFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  comment: string | null;
  createdAt: string;
}

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  status: string;
}

interface Schedule {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  description: string | null;
  team: { id: string; name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function statusLabel(s: string) {
  return { pending: 'Pendente', confirmed: 'Confirmado', declined: 'Recusou', checked_in: 'Check-in' }[s] || s;
}

function statusColor(s: string) {
  return {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    checked_in: 'bg-blue-100 text-blue-700',
  }[s] || 'bg-gray-100 text-gray-600';
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <FileImage size={20} className="text-blue-500" />;
  if (mimeType.startsWith('video/')) return <FileVideo size={20} className="text-purple-500" />;
  return <FileText size={20} className="text-gray-500" />;
}

// ── Auth screen ───────────────────────────────────────────────────────────────

function AuthScreen({ token, onAuth }: { token: string; onAuth: (jwt: string, event: EventSummary) => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/client/${token}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationNumber: code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao autenticar'); return; }
      sessionStorage.setItem(`client_jwt_${token}`, data.sessionToken);
      onAuth(data.sessionToken, data.event);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Calendar size={24} className="text-primary-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Portal do Cliente</h1>
          <p className="text-sm text-gray-500 mt-1">Digite o número de reserva para acessar o seu evento</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            autoFocus
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Número de reserva"
            className="w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium text-sm hover:bg-primary-700 disabled:opacity-50 transition"
          >
            {loading ? 'Verificando...' : 'Acessar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Files tab ─────────────────────────────────────────────────────────────────

function FilesTab({ token, jwt }: { token: string; jwt: string }) {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/client/${token}/files`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setFiles(d.files || []))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  async function download(file: ClientFile) {
    const res = await fetch(`/api/v2/client/${token}/files/${file.id}/download`, {
      headers: { 'x-client-auth': jwt },
    });
    if (res.ok) {
      const data = await res.json();
      window.open(data.downloadUrl, '_blank');
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando arquivos...</div>;

  if (files.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum arquivo disponível ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map(file => (
        <div key={file.id} className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
            {fileIcon(file.mimeType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate text-sm">{file.name}</p>
            <p className="text-xs text-gray-400">{formatSize(file.sizeBytes)} · {formatDate(file.createdAt)}</p>
            {file.comment && <p className="text-xs text-gray-500 mt-0.5">{file.comment}</p>}
          </div>
          <button
            onClick={() => download(file)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg text-sm font-medium transition shrink-0"
          >
            <Download size={14} /> VER
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Guests tab ────────────────────────────────────────────────────────────────

function GuestsTab({ token, jwt }: { token: string; jwt: string }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', cpf: '' });
  const [saving, setSaving] = useState(false);
  const [importAsConfirmed, setImportAsConfirmed] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (q) params.set('search', q);
    const res = await fetch(`/api/v2/client/${token}/guests?${params}`, { headers: { 'x-client-auth': jwt } });
    const data = await res.json();
    setGuests(data.guests || []);
    setTotal(data.pagination?.total || 0);
    setLoading(false);
  }, [token, jwt]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingGuest(null);
    setForm({ name: '', email: '', phone: '', cpf: '' });
    setShowForm(true);
  }

  function openEdit(g: Guest) {
    setEditingGuest(g);
    setForm({ name: g.name, email: g.email || '', phone: g.phone || '', cpf: g.cpf || '' });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editingGuest
        ? `/api/v2/client/${token}/guests/${editingGuest.id}`
        : `/api/v2/client/${token}/guests`;
      const res = await fetch(url, {
        method: editingGuest ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
        body: JSON.stringify(form),
      });
      if (res.ok) { setShowForm(false); load(search); }
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remover este convidado?')) return;
    await fetch(`/api/v2/client/${token}/guests/${id}`, {
      method: 'DELETE', headers: { 'x-client-auth': jwt },
    });
    load(search);
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const headers = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
    const isHeader = headers.some(h => ['nome', 'name', 'email', 'cpf'].includes(h));
    const dataLines = isHeader ? lines.slice(1) : lines;

    const guestList = dataLines.map(line => {
      const cols = line.split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (isHeader) {
        const row: any = {};
        headers.forEach((h, i) => { row[h] = cols[i] || ''; });
        return { name: row.nome || row.name || cols[0], email: row.email || '', phone: row.telefone || row.phone || '', cpf: row.cpf || '' };
      }
      return { name: cols[0], email: cols[1] || '', phone: cols[2] || '', cpf: cols[3] || '' };
    }).filter(g => g.name);

    if (guestList.length === 0) { alert('Nenhum convidado encontrado no arquivo.'); return; }

    const res = await fetch(`/api/v2/client/${token}/guests/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-auth': jwt },
      body: JSON.stringify({ guests: guestList, forceStatus: importAsConfirmed ? 'confirmed' : undefined }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`Importação concluída: ${data.results.created} criados, ${data.results.updated} atualizados, ${data.results.skipped} ignorados.`);
      load(search);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const confirmed = guests.filter(g => g.status === 'confirmed' || g.status === 'checked_in').length;
  const pending = guests.filter(g => g.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: total, color: 'bg-gray-100 text-gray-800' },
          { label: 'Confirmados', value: confirmed, color: 'bg-green-100 text-green-800' },
          { label: 'Pendentes', value: pending, color: 'bg-yellow-100 text-yellow-800' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar convidado..."
            value={search}
            onChange={e => { setSearch(e.target.value); load(e.target.value); }}
            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus size={14} /> Adicionar
        </button>
        <label className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">
          <Upload size={14} /> CSV
          <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={importCsv} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={importAsConfirmed}
            onChange={e => setImportAsConfirmed(e.target.checked)}
            className="w-4 h-4"
          />
          Importar como confirmado
        </label>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm text-blue-900">{editingGuest ? 'Editar convidado' : 'Novo convidado'}</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus placeholder="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="col-span-2 px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="Telefone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm bg-white" />
            <input placeholder="CPF" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm bg-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Salvando...' : editingGuest ? 'Salvar' : 'Adicionar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Guest list */}
      {loading ? (
        <p className="text-center text-gray-400 py-6">Carregando...</p>
      ) : guests.length === 0 ? (
        <div className="py-10 text-center">
          <Users size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-400 text-sm">Nenhum convidado cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {guests.map(g => (
            <div key={g.id} className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <User size={14} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{g.name}</p>
                {(g.email || g.phone) && (
                  <p className="text-xs text-gray-400 truncate">{[g.email, g.phone].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(g.status)}`}>
                {statusLabel(g.status)}
              </span>
              <button onClick={() => openEdit(g)} className="p-1 text-gray-400 hover:text-primary-600">
                <Plus size={14} className="rotate-45" />
              </button>
              <button onClick={() => remove(g.id)} className="p-1 text-gray-300 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plan tab (read-only) ───────────────────────────────────────────────────────

function PlanTab({ token, jwt }: { token: string; jwt: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/v2/client/${token}/plan`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setData(d.event))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando plano...</div>;
  if (!data) return <div className="py-8 text-center text-gray-400">Plano não disponível.</div>;

  const allItems = data.items || [];
  const venues = data.venues || [];

  // Collect all questions and answers
  const sections: { title: string; questions: { text: string; required: boolean; answered: boolean; answer: any }[] }[] = [];

  venues.forEach((v: any) => {
    const qs = v.venue?.questions || [];
    if (qs.length === 0) return;
    sections.push({
      title: `Local: ${v.venue.name}`,
      questions: qs.map((q: any) => {
        const ans = data.venueAnswers?.find((a: any) => a.questionId === q.id);
        return { text: q.text, required: q.required, answered: !!ans?.answer, answer: ans?.answer };
      }),
    });
  });

  allItems.forEach((item: any) => {
    const qs = item.product?.questions || [];
    if (qs.length === 0) return;
    sections.push({
      title: item.name,
      questions: qs.map((q: any) => {
        const ans = item.answers?.find((a: any) => a.questionId === q.id);
        return { text: q.text, required: q.required, answered: !!ans?.answer, answer: ans?.answer };
      }),
    });
  });

  if (sections.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Nenhum item de plano cadastrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, idx) => {
        const answered = section.questions.filter(q => q.answered).length;
        const total = section.questions.length;
        const isOpen = expanded[idx] !== false;
        return (
          <div key={idx} className="bg-white border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              onClick={() => setExpanded(e => ({ ...e, [idx]: !isOpen }))}
            >
              {isOpen ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
              <span className="font-medium text-sm flex-1">{section.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${answered === total ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {answered}/{total} definidos
              </span>
            </button>
            {isOpen && (
              <div className="border-t divide-y">
                {section.questions.map((q, qi) => (
                  <div key={qi} className="px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {q.answered
                        ? <CheckCircle size={14} className="text-green-500" />
                        : q.required
                          ? <AlertCircle size={14} className="text-amber-500" />
                          : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{q.text}</p>
                      {q.answered ? (
                        <p className="text-sm font-medium text-gray-900 mt-0.5">
                          {Array.isArray(q.answer) ? q.answer.join(', ') : String(q.answer)}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600 mt-0.5 italic">
                          {q.required ? 'A definir (obrigatório)' : 'A definir'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Schedule tab (read-only) ───────────────────────────────────────────────────

function ScheduleTab({ token, jwt }: { token: string; jwt: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/client/${token}/schedules`, { headers: { 'x-client-auth': jwt } })
      .then(r => r.json())
      .then(d => setSchedules(d.schedules || []))
      .finally(() => setLoading(false));
  }, [token, jwt]);

  if (loading) return <div className="py-8 text-center text-gray-400">Carregando cronograma...</div>;

  if (schedules.length === 0) {
    return (
      <div className="py-12 text-center">
        <Clock size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Cronograma ainda não definido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schedules.map(s => (
        <div key={s.id} className="bg-white border rounded-xl p-4 flex gap-4 items-start">
          <div className="shrink-0 text-center min-w-[56px]">
            <p className="text-xs text-gray-400">Início</p>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              {new Date(s.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
            </p>
            <p className="text-xs text-gray-400 mt-1">Fim</p>
            <p className="text-sm font-medium text-gray-600 leading-tight">
              {new Date(s.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
            </p>
          </div>
          <div className="border-l pl-4 flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900">{s.name}</p>
            {s.team && <p className="text-xs text-primary-600 mt-0.5">Equipe: {s.team.name}</p>}
            {s.description && <p className="text-sm text-gray-500 mt-1">{s.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'files', label: 'Arquivos', icon: FileText },
  { id: 'guests', label: 'Convidados', icon: Users },
  { id: 'plan', label: 'Plano', icon: CheckCircle },
  { id: 'schedule', label: 'Cronograma', icon: Clock },
];

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [jwt, setJwt] = useState<string | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [activeTab, setActiveTab] = useState('files');

  useEffect(() => {
    const stored = sessionStorage.getItem(`client_jwt_${token}`);
    if (stored) {
      // Try to restore session by fetching event data
      fetch(`/api/v2/client/${token}/event`, { headers: { 'x-client-auth': stored } })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setJwt(stored); setEvent(d.event); })
        .catch(() => sessionStorage.removeItem(`client_jwt_${token}`));
    }
  }, [token]);

  function onAuth(newJwt: string, ev: EventSummary) {
    setJwt(newJwt);
    setEvent(ev);
  }

  if (!jwt || !event) {
    return <AuthScreen token={token} onAuth={onAuth} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <p className="text-xs text-gray-400 mb-0.5">Portal do Cliente</p>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{event.name}</h1>
          <p className="text-sm text-gray-500">{event.clientName}</p>
          {event.startAt && (
            <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
              <Calendar size={11} /> {formatDate(event.startAt)}
            </p>
          )}
        </div>
        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex gap-1 overflow-x-auto pb-px">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {activeTab === 'files' && <FilesTab token={token} jwt={jwt} />}
        {activeTab === 'guests' && <GuestsTab token={token} jwt={jwt} />}
        {activeTab === 'plan' && <PlanTab token={token} jwt={jwt} />}
        {activeTab === 'schedule' && <ScheduleTab token={token} jwt={jwt} />}
      </div>
    </div>
  );
}
