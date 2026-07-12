'use client';

import { useEffect, useState } from 'react';
import { HardHat, Plus, Pencil, Trash2, X, Check, User, Phone, ChevronDown, ChevronRight, Mail, AlertTriangle, UserCheck, UserX, Users, Paperclip, FileText, Download, ClipboardList, Link2, Link2Off } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface FreelancerService {
  id: string;
  name: string;
  hourlyRate: number;
}

interface FreelancerOption {
  id: string;
  name: string;
  phone: string | null;
  email: string;
}

interface ServiceFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface ServiceChecklist {
  id: string;
  title: string;
  items: { id: string; text: string; done: boolean; order: number }[];
}

interface EventService {
  id: string;
  serviceId: string;
  freelancerId: string | null;
  service: { id: string; name: string; hourlyRate: number };
  freelancer: { id: string; name: string; phone: string | null; email: string } | null;
  productName: string | null;
  maxSlots: number;
  valuePerHour: number;
  startAt: string | null;
  endAt: string | null;
  notes: string | null;
  status: string;
  files: ServiceFile[];
  linkedChecklists: { serviceId: string; checklistId: string; checklist: ServiceChecklist }[];
}

interface Application {
  id: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  freelancer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    strikeCount: number;
  };
}

interface Props {
  eventId: string;
  eventStartAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  filled: 'Preenchido',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-muted text-muted-foreground',
  filled: 'bg-blue-100 text-blue-800',
};

const applicationStatusConfig = {
  pending:  { label: 'Pendente',  color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Confirmado', color: 'bg-green-100 text-green-800'  },
  rejected: { label: 'Removido',  color: 'bg-red-100 text-red-800'      },
};

const emptyForm = {
  serviceId: '',
  freelancerId: '',
  maxSlots: 1,
  valuePerHour: 0,
  startAt: '',
  endAt: '',
  notes: '',
  status: 'active',
};

// Converts a UTC ISO string to a "YYYY-MM-DDTHH:mm" string in the browser's local timezone,
// so datetime-local inputs show the correct local time instead of UTC.
function utcToLocalInput(utcIso: string): string {
  const d = new Date(utcIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventMaoDeObraTab({ eventId, eventStartAt }: Props) {
  const [services, setServices] = useState<EventService[]>([]);
  const [allServices, setAllServices] = useState<FreelancerService[]>([]);
  const [serviceFreelancers, setServiceFreelancers] = useState<FreelancerOption[]>([]);
  const [loadingFreelancers, setLoadingFreelancers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Applications state
  const [applications, setApplications] = useState<Application[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);

  // Briefing state
  const [eventChecklists, setEventChecklists] = useState<{ id: string; title: string }[]>([]);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [notesEditing, setNotesEditing] = useState<Record<string, boolean>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});
  const [uploadingFile, setUploadingFile] = useState<Record<string, boolean>>({});
  const [selectedChecklist, setSelectedChecklist] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
    loadApplications();
    loadEventChecklists();
  }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const [svcsRes, allRes] = await Promise.all([
        fetch(`/api/v2/events/${eventId}/services`, { credentials: 'include' }).then(r => r.json()),
        fetch('/api/v2/services', { credentials: 'include' }).then(r => r.json()),
      ]);
      setServices(svcsRes.services || []);
      setAllServices(allRes.services || []);
    } catch { }
    setLoading(false);
  }

  async function loadApplications() {
    try {
      const res = await fetch(`/api/v2/events/${eventId}/applications`, { credentials: 'include' });
      const data = await res.json();
      setApplications(data.applications || []);
    } catch { }
  }

  async function loadEventChecklists() {
    try {
      const res = await fetch(`/api/v2/events/${eventId}/checklists`, { credentials: 'include' });
      const data = await res.json();
      setEventChecklists(data.checklists || []);
    } catch { }
  }

  async function saveNotes(svcId: string) {
    setNotesSaving(p => ({ ...p, [svcId]: true }));
    try {
      await fetch(`/api/v2/events/${eventId}/services/${svcId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft[svcId] || null }),
      });
      setNotesEditing(p => ({ ...p, [svcId]: false }));
      await load();
    } finally {
      setNotesSaving(p => ({ ...p, [svcId]: false }));
    }
  }

  async function uploadFile(svcId: string, file: File) {
    setUploadingFile(p => ({ ...p, [svcId]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/v2/services/${svcId}/files/upload`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      await load();
    } finally {
      setUploadingFile(p => ({ ...p, [svcId]: false }));
    }
  }

  async function deleteFile(fileId: string) {
    if (!confirm('Remover este anexo?')) return;
    await fetch(`/api/v2/files/${fileId}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  async function downloadFile(fileId: string) {
    const res = await fetch(`/api/v2/files/${fileId}/download`, { credentials: 'include' });
    const data = await res.json();
    if (data.downloadUrl) window.open(data.downloadUrl, '_blank');
  }

  async function linkChecklist(svcId: string) {
    const checklistId = selectedChecklist[svcId];
    if (!checklistId) return;
    await fetch(`/api/v2/services/${svcId}/checklists/${checklistId}`, {
      method: 'POST', credentials: 'include',
    });
    setSelectedChecklist(p => ({ ...p, [svcId]: '' }));
    await load();
  }

  async function unlinkChecklist(svcId: string, checklistId: string) {
    await fetch(`/api/v2/services/${svcId}/checklists/${checklistId}`, {
      method: 'DELETE', credentials: 'include',
    });
    await load();
  }

  async function loadFreelancersForService(serviceId: string) {
    if (!serviceId) { setServiceFreelancers([]); return; }
    setLoadingFreelancers(true);
    try {
      const res = await fetch(`/api/v2/services/${serviceId}/freelancers`, { credentials: 'include' });
      const data = await res.json();
      setServiceFreelancers(data.freelancers || []);
    } catch { setServiceFreelancers([]); }
    setLoadingFreelancers(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setServiceFreelancers([]);
    setError('');
    setShowForm(true);
  }

  function openEdit(svc: EventService) {
    setEditingId(svc.id);
    setForm({
      serviceId: svc.serviceId,
      freelancerId: svc.freelancerId || '',
      maxSlots: svc.maxSlots,
      valuePerHour: svc.valuePerHour,
      startAt: svc.startAt ? utcToLocalInput(svc.startAt) : '',
      endAt: svc.endAt ? utcToLocalInput(svc.endAt) : '',
      notes: svc.notes || '',
      status: svc.status,
    });
    setError('');
    setShowForm(true);
    loadFreelancersForService(svc.serviceId);
  }

  async function onServiceChange(serviceId: string) {
    const svc = allServices.find(s => s.id === serviceId);
    setForm(f => ({ ...f, serviceId, freelancerId: '', valuePerHour: svc ? svc.hourlyRate : f.valuePerHour }));
    await loadFreelancersForService(serviceId);
  }

  async function save() {
    if (!form.serviceId) { setError('Selecione uma função.'); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        serviceId: form.serviceId,
        freelancerId: form.freelancerId || null,
        maxSlots: Number(form.maxSlots),
        valuePerHour: Number(form.valuePerHour),
        startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
        endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
        notes: form.notes || null,
        status: form.status,
      };
      if (editingId) {
        await fetch(`/api/v2/events/${eventId}/services/${editingId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`/api/v2/events/${eventId}/services`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar.');
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Remover esta vaga do evento?')) return;
    await fetch(`/api/v2/events/${eventId}/services/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  async function updateStatus(appId: string, status: 'approved' | 'rejected') {
    setUpdating(appId);
    try {
      const res = await fetch(`/api/v2/applications/${appId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setApplications(prev =>
          prev.map(a => a.id === appId ? { ...a, status } : a)
        );
      } else {
        const d = await res.json();
        alert('Erro: ' + (d.error || 'Falha ao atualizar'));
      }
    } finally {
      setUpdating(null);
    }
  }

  // Calculate filled slots for each service
  function getFilledCount(serviceName: string): number {
    return applications.filter(app => 
      app.role === serviceName && app.status === 'approved'
    ).length;
  }

  // Group applications by role
  const applicationsByRole = applications.reduce<Record<string, Application[]>>((acc, app) => {
    (acc[app.role] ??= []).push(app);
    return acc;
  }, {});

  const confirmedApps = applications.filter(a => a.status === 'approved').length;
  const pendingApps = applications.filter(a => a.status === 'pending').length;
  const totalApps = applications.length;

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Carregando...</div>;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <HardHat size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Vagas</span>
          </div>
          <p className="text-2xl font-bold">{services.length}</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <UserCheck size={14} className="text-green-600" />
            <span className="text-xs text-muted-foreground font-medium">Confirmados</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{confirmedApps}</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <UserX size={14} className="text-yellow-600" />
            <span className="text-xs text-muted-foreground font-medium">Pendentes</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{pendingApps}</p>
        </div>
      </div>

      {/* Vagas Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2 text-base">
            <HardHat size={16} /> Mão de Obra ({services.length})
          </h3>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition">
            <Plus size={14} /> Adicionar
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-sm">{editingId ? 'Editar Vaga' : 'Adicionar Vaga'}</p>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-muted-foreground" /></button>
            </div>

            {error && <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Função */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Função *</label>
                <select value={form.serviceId} onChange={e => onServiceChange(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Escolha uma função —</option>
                  {allServices.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.hourlyRate > 0 ? ` (R$ ${s.hourlyRate.toFixed(2)}/h)` : ''}</option>
                  ))}
                </select>
                {allServices.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Nenhuma função cadastrada. <a href="/freelancers" className="underline">Acesse Freelancers</a> para criar serviços primeiro.
                  </p>
                )}
              </div>

              {/* Freelancer */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Freelancer {loadingFreelancers && <span className="text-muted-foreground">(carregando...)</span>}
                </label>
                <select value={form.freelancerId} onChange={e => setForm(f => ({ ...f, freelancerId: e.target.value }))}
                  disabled={!form.serviceId || loadingFreelancers}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
                  <option value="">— Sem atribuição (vaga aberta) —</option>
                  {serviceFreelancers.map(f => (
                    <option key={f.id} value={f.id}>{f.name}{f.phone ? ` · ${f.phone}` : ''}</option>
                  ))}
                </select>
                {form.serviceId && !loadingFreelancers && serviceFreelancers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Nenhum freelancer cadastrado para esta função.
                  </p>
                )}
              </div>

              {/* Início */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Início</label>
                <input type="datetime-local" value={form.startAt}
                  onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {/* Término */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Término</label>
                <input type="datetime-local" value={form.endAt}
                  onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {/* Vagas */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Vagas</label>
                <input type="number" min={1} value={form.maxSlots}
                  onChange={e => setForm(f => ({ ...f, maxSlots: Number(e.target.value) }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {/* Valor/Hora */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor/Hora (R$)</label>
                <input type="number" min={0} step={0.01} value={form.valuePerHour}
                  onChange={e => setForm(f => ({ ...f, valuePerHour: Number(e.target.value) }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="filled">Preenchido</option>
                </select>
              </div>

              {/* Observações */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Observações</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-input rounded-md text-sm hover:bg-muted transition">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50">
                <Check size={14} /> {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {services.length === 0 && !showForm && (
          <div className="bg-card rounded-xl border p-10 text-center">
            <HardHat size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma vaga cadastrada para este evento.</p>
          </div>
        )}

        {/* Services List */}
        <div className="space-y-3">
          {services.map(svc => {
            const hours = svc.startAt && svc.endAt
              ? ((new Date(svc.endAt).getTime() - new Date(svc.startAt).getTime()) / 3600000).toFixed(1)
              : null;
            const totalValue = hours ? (Number(hours) * svc.valuePerHour).toFixed(2) : null;
            const isExpanded = expandedId === svc.id;
            const filledCount = getFilledCount(svc.service.name);
            const remainingSlots = svc.maxSlots - filledCount;

            return (
              <div key={svc.id} className="bg-card border rounded-xl overflow-hidden">
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 cursor-pointer hover:bg-muted/50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : svc.id)}
                >
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                    <HardHat size={15} className="text-primary shrink-0" />
                    <span className="font-medium text-sm">{svc.service.name}</span>
                    
                    {/* Filled/Total counter badge */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      filledCount >= svc.maxSlots 
                        ? 'bg-green-100 text-green-800' 
                        : filledCount > 0 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-gray-100 text-gray-600'
                    }`}>
                      {filledCount}/{svc.maxSlots}
                    </span>
                    
                    {/* Remaining slots indicator */}
                    {remainingSlots > 0 && (
                      <span className="text-xs text-amber-600">
                        ({remainingSlots} vaga{remainingSlots !== 1 ? 's' : ''} em aberto)
                      </span>
                    )}
                    
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[svc.status] || 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABELS[svc.status] || svc.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(svc)}
                      className="p-1.5 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(svc.id)}
                      className="p-1.5 rounded hover:bg-destructive/10 transition text-muted-foreground hover:text-destructive">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Card details (expandable) */}
                {isExpanded && (
                  <div className="px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Início</p>
                        <p className="font-medium">{svc.startAt ? formatDateTime(svc.startAt) : <span className="text-muted-foreground italic text-xs">A definir</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Término</p>
                        <p className="font-medium">{svc.endAt ? formatDateTime(svc.endAt) : <span className="text-muted-foreground italic text-xs">A definir</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Valor/Hora</p>
                        <p className="font-medium text-green-600">R$ {svc.valuePerHour.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Vagas Preenchidas/Total</p>
                        <p className="font-medium">
                          <span className={filledCount >= svc.maxSlots ? 'text-green-600' : filledCount > 0 ? 'text-yellow-600' : 'text-gray-500'}>
                            {filledCount}/{svc.maxSlots}
                          </span>
                          {remainingSlots > 0 && (
                            <span className="text-muted-foreground text-xs ml-1">({remainingSlots} em aberto)</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Freelancers inscritos via candidatura */}
                    {(() => {
                      const approvedApps = (applicationsByRole[svc.service.name] || []).filter(a => a.status === 'approved');
                      const hasDirectFreelancer = !!svc.freelancer;
                      const hasAny = hasDirectFreelancer || approvedApps.length > 0;
                      return (
                        <div className="space-y-1.5">
                          {hasDirectFreelancer && (
                            <div className="flex items-center gap-3 bg-primary/5 rounded-lg px-3 py-2">
                              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                {svc.freelancer!.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{svc.freelancer!.name}</p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  {svc.freelancer!.phone && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Phone size={10} /> {svc.freelancer!.phone}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{svc.freelancer!.email}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {approvedApps.map(app => (
                            <div key={app.id} className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2">
                              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm shrink-0">
                                {app.freelancer.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{app.freelancer.name}</p>
                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                  {app.freelancer.phone && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Phone size={10} /> {app.freelancer.phone}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Mail size={10} /> {app.freelancer.email}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">Confirmado</span>
                              <button
                                onClick={() => { if (confirm(`Remover ${app.freelancer.name} desta vaga?`)) updateStatus(app.id, 'rejected'); }}
                                disabled={updating === app.id}
                                title="Remover"
                                className="p-1.5 rounded-full bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-40 transition shrink-0"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                          {!hasAny && (
                            <p className="text-xs text-muted-foreground italic">Nenhum freelancer inscrito (vaga aberta)</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Instruções (notes) ── */}
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <FileText size={12} /> Instruções
                        </span>
                        {!notesEditing[svc.id] && (
                          <button
                            onClick={() => { setNotesDraft(p => ({ ...p, [svc.id]: svc.notes || '' })); setNotesEditing(p => ({ ...p, [svc.id]: true })); }}
                            className="text-xs text-primary hover:underline"
                          >
                            {svc.notes ? 'Editar' : 'Adicionar'}
                          </button>
                        )}
                      </div>
                      {notesEditing[svc.id] ? (
                        <div className="space-y-2">
                          <textarea
                            value={notesDraft[svc.id] ?? ''}
                            onChange={e => setNotesDraft(p => ({ ...p, [svc.id]: e.target.value }))}
                            rows={3}
                            placeholder="Instruções para o freelancer no dia do evento..."
                            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveNotes(svc.id)}
                              disabled={notesSaving[svc.id]}
                              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50"
                            >
                              {notesSaving[svc.id] ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              onClick={() => setNotesEditing(p => ({ ...p, [svc.id]: false }))}
                              className="px-3 py-1.5 border rounded-md text-xs hover:bg-muted transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : svc.notes ? (
                        <p className="text-sm text-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{svc.notes}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Nenhuma instrução adicionada.</p>
                      )}
                    </div>

                    {/* ── Anexos ── */}
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <Paperclip size={12} /> Anexos
                        </span>
                        <label className="text-xs text-primary hover:underline cursor-pointer">
                          {uploadingFile[svc.id] ? 'Enviando...' : '+ Anexar'}
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingFile[svc.id]}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(svc.id, f); e.target.value = ''; }}
                          />
                        </label>
                      </div>
                      {svc.files.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum arquivo anexado.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {svc.files.map(f => (
                            <div key={f.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                              <FileText size={13} className="text-muted-foreground shrink-0" />
                              <span className="text-sm flex-1 truncate">{f.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{(f.sizeBytes / 1024).toFixed(0)} KB</span>
                              <button onClick={() => downloadFile(f.id)} title="Download" className="p-1 text-primary hover:text-primary/80 transition shrink-0">
                                <Download size={13} />
                              </button>
                              <button onClick={() => deleteFile(f.id)} title="Remover" className="p-1 text-muted-foreground hover:text-destructive transition shrink-0">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Checklists vinculados ── */}
                    <div className="border-t pt-3 space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <ClipboardList size={12} /> Checklists do Evento
                      </span>
                      <div className="flex gap-2">
                        <select
                          value={selectedChecklist[svc.id] || ''}
                          onChange={e => setSelectedChecklist(p => ({ ...p, [svc.id]: e.target.value }))}
                          className="flex-1 border border-input rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">— Selecionar checklist —</option>
                          {eventChecklists
                            .filter(cl => !svc.linkedChecklists.some(lc => lc.checklistId === cl.id))
                            .map(cl => <option key={cl.id} value={cl.id}>{cl.title}</option>)}
                        </select>
                        <button
                          onClick={() => linkChecklist(svc.id)}
                          disabled={!selectedChecklist[svc.id]}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition disabled:opacity-40"
                        >
                          <Link2 size={11} /> Vincular
                        </button>
                      </div>
                      {svc.linkedChecklists.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum checklist vinculado.</p>
                      ) : (
                        <div className="space-y-2">
                          {svc.linkedChecklists.map(lc => (
                            <div key={lc.checklistId} className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold">{lc.checklist.title}</span>
                                <button
                                  onClick={() => unlinkChecklist(svc.id, lc.checklistId)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition"
                                >
                                  <Link2Off size={11} /> Remover
                                </button>
                              </div>
                              <ul className="space-y-1">
                                {lc.checklist.items.map(item => (
                                  <li key={item.id} className={`flex items-start gap-2 text-xs ${item.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                    <span className={`mt-0.5 w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${item.done ? 'bg-primary border-primary' : 'border-input'}`}>
                                      {item.done && <Check size={8} className="text-primary-foreground" />}
                                    </span>
                                    {item.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Candidaturas Section */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-base">
          <Users size={16} /> Candidaturas Recebidas
        </h3>

        {applications.length === 0 ? (
          <div className="bg-card rounded-lg border p-12 text-center">
            <Users className="size-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium text-foreground mb-1">Nenhuma candidatura</h3>
            <p className="text-sm text-muted-foreground">
              Freelancers ainda não se candidataram a este evento.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(applicationsByRole).map(([role, apps]) => (
              <div key={role} className="bg-card border rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{role}</h3>
                  <span className="text-xs text-muted-foreground">
                    {apps.filter(a => a.status === 'approved').length} confirmado{apps.filter(a => a.status === 'approved').length !== 1 ? 's' : ''}
                    {' '}/ {apps.length} candidatura{apps.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y">
                  {apps.map(app => {
                    const cfg = applicationStatusConfig[app.status];
                    const busy = updating === app.id;
                    return (
                      <div key={app.id} className={`flex items-center gap-4 px-5 py-4 ${app.status === 'rejected' ? 'opacity-50' : ''}`}>
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary text-sm">
                          {app.freelancer.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{app.freelancer.name}</p>
                            {app.freelancer.strikeCount > 0 && (
                              <span title={`${app.freelancer.strikeCount} penalidade(s)`}
                                className="flex items-center gap-0.5 text-xs text-orange-600">
                                <AlertTriangle size={11} /> {app.freelancer.strikeCount}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail size={11} /> {app.freelancer.email}
                            </span>
                            {app.freelancer.phone && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone size={11} /> {app.freelancer.phone}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(app.appliedAt).toLocaleDateString('pt-BR', {
                                day: '2-digit', month: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Status badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
                          {cfg.label}
                        </span>

                        {/* Actions */}
                        {app.status === 'pending' && (
                          <button
                            onClick={() => {
                              if (confirm(`Aprovar ${app.freelancer.name} para esta vaga?`)) {
                                updateStatus(app.id, 'approved');
                              }
                            }}
                            disabled={busy}
                            title="Aprovar freelancer"
                            className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-40 transition shrink-0"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {app.status === 'approved' && (
                          <button
                            onClick={() => {
                              if (confirm(`Remover ${app.freelancer.name} desta vaga?`)) {
                                updateStatus(app.id, 'rejected');
                              }
                            }}
                            disabled={busy}
                            title="Remover freelancer"
                            className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 transition shrink-0"
                          >
                            <X size={14} />
                          </button>
                        )}
                        {app.status === 'rejected' && (
                          <button
                            onClick={() => updateStatus(app.id, 'approved')}
                            disabled={busy}
                            title="Restaurar"
                            className="px-2.5 py-1 rounded border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition shrink-0"
                          >
                            Restaurar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
