'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Plus, Pencil, Trash2, X, Check, UserPlus } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface FreelancerService {
  id: string;
  name: string;
  hourlyRate: number;
}

interface EventService {
  id: string;
  serviceId: string;
  service: { id: string; name: string; hourlyRate: number };
  productName: string | null;
  maxSlots: number;
  valuePerHour: number;
  startAt: string | null;
  endAt: string | null;
  notes: string | null;
  status: string;
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

const emptyForm = {
  serviceId: '',
  maxSlots: 1,
  valuePerHour: 0,
  startAt: '',
  endAt: '',
  notes: '',
  status: 'active',
};

export default function EventTaxasTab({ eventId, eventStartAt }: Props) {
  const [services, setServices] = useState<EventService[]>([]);
  const [allServices, setAllServices] = useState<FreelancerService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
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

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError('');
    setShowForm(true);
  }

  function openEdit(svc: EventService) {
    setEditingId(svc.id);
    setForm({
      serviceId: svc.serviceId,
      maxSlots: svc.maxSlots,
      valuePerHour: svc.valuePerHour,
      startAt: svc.startAt ? svc.startAt.slice(0, 16) : '',
      endAt: svc.endAt ? svc.endAt.slice(0, 16) : '',
      notes: svc.notes || '',
      status: svc.status,
    });
    setError('');
    setShowForm(true);
  }

  async function save() {
    if (!form.serviceId) { setError('Selecione um serviço.'); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        serviceId: form.serviceId,
        maxSlots: Number(form.maxSlots),
        valuePerHour: Number(form.valuePerHour),
        startAt: form.startAt || null,
        endAt: form.endAt || null,
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
    if (!confirm('Remover esta taxa do evento?')) return;
    await fetch(`/api/v2/events/${eventId}/services/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  function onServiceChange(serviceId: string) {
    const svc = allServices.find(s => s.id === serviceId);
    setForm(f => ({ ...f, serviceId, valuePerHour: svc ? svc.hourlyRate : f.valuePerHour }));
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Carregando taxas...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-base">
          <Briefcase size={16} /> Taxas ({services.length})
        </h3>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition">
          <Plus size={14} /> Adicionar Serviço
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-sm">{editingId ? 'Editar Serviço' : 'Adicionar Serviço ao Evento'}</p>
            <button onClick={() => setShowForm(false)}><X size={16} className="text-muted-foreground" /></button>
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Serviço *</label>
              <select value={form.serviceId} onChange={e => onServiceChange(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— Escolha um serviço —</option>
                {allServices.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Início</label>
              <input type="datetime-local" value={form.startAt}
                onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Término</label>
              <input type="datetime-local" value={form.endAt}
                onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Máximo de Vagas *</label>
              <input type="number" min={1} value={form.maxSlots}
                onChange={e => setForm(f => ({ ...f, maxSlots: Number(e.target.value) }))}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor/Hora (R$)</label>
              <input type="number" min={0} step={0.01} value={form.valuePerHour}
                onChange={e => setForm(f => ({ ...f, valuePerHour: Number(e.target.value) }))}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="filled">Preenchido</option>
              </select>
            </div>

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

      {/* List */}
      {services.length === 0 && !showForm && (
        <div className="bg-card rounded-xl border p-10 text-center">
          <Briefcase size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma taxa cadastrada para este evento.</p>
          <p className="text-xs text-muted-foreground mt-1">As taxas são criadas automaticamente ao importar contratos, ou manualmente pelo botão acima.</p>
        </div>
      )}

      <div className="space-y-3">
        {services.map(svc => {
          const hours = svc.startAt && svc.endAt
            ? ((new Date(svc.endAt).getTime() - new Date(svc.startAt).getTime()) / 3600000).toFixed(1)
            : null;
          const totalValue = hours ? (Number(hours) * svc.valuePerHour).toFixed(2) : null;

          return (
            <div key={svc.id} className="bg-card border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <Briefcase size={15} className="text-primary" />
                  <span className="font-medium text-sm">{svc.service.name}</span>
                  {svc.productName && svc.productName !== svc.service.name && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">via {svc.productName}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[svc.status] || 'bg-muted text-muted-foreground'}`}>
                    {STATUS_LABELS[svc.status] || svc.status}
                  </span>
                </div>
                <div className="flex items-center gap-1">
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

              <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Início</p>
                  <p className="font-medium">{svc.startAt ? formatDateTime(svc.startAt) : <span className="text-muted-foreground italic">A definir</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Término</p>
                  <p className="font-medium">{svc.endAt ? formatDateTime(svc.endAt) : <span className="text-muted-foreground italic">A definir</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor/Hora</p>
                  <p className="font-medium text-green-600">R$ {svc.valuePerHour.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vagas / Valor Total Est.</p>
                  <p className="font-medium">
                    {svc.maxSlots} vaga{svc.maxSlots !== 1 ? 's' : ''}
                    {totalValue && <span className="text-muted-foreground text-xs ml-1">(R$ {totalValue})</span>}
                  </p>
                </div>
              </div>

              {svc.notes && (
                <div className="px-4 pb-3 text-xs text-muted-foreground">{svc.notes}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
