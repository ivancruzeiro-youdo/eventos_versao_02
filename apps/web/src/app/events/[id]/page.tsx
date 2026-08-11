'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import EventPlanTab from '@/components/EventPlanTab';
import EventGuestsTab from '@/components/EventGuestsTab';
import EventCommentsTab from '@/components/EventCommentsTab';
import EventFilesTab from '@/components/EventFilesTab';
import EventScheduleTab from '@/components/EventScheduleTab';
import EventItemsTab from '@/components/EventItemsTab';
import EventMediaTab from '@/components/EventMediaTab';
import EventMaoDeObraTab from '@/components/EventMaoDeObraTab';
import EventTaxasTab from '@/components/EventTaxasTab';
import EventActivitiesTab from '@/components/EventActivitiesTab';
import EventLayoutTab from '@/components/EventLayoutTab';
import EventKitchenTab from '@/components/EventKitchenTab';
import EventTeamTab from '@/components/EventTeamTab';
import EventProfessionalsTab from '@/components/EventProfessionalsTab';
import EventSpotifyPlaylist from '@/components/EventSpotifyPlaylist';
import UserpStatusBanner from '@/components/UserpStatusBanner';
import { eventsApi, guestsApi } from '@/lib/api';
import { formatDateTime, getStatusColor, getStatusLabel, getEventDisplayStatus, formatPhone, formatCpf } from '@/lib/utils';
import {
  MessageCircle, FileText, Clock, CheckSquare, Users,
  ClipboardList, Briefcase, UtensilsCrossed, HardHat, Trash2, ChevronDown,
  Calendar, MapPin, Pencil, Check, X, Copy, UserCog, ChefHat, LogOut, Star, Plus,
  GripVertical, Printer, Mail, Phone, CreditCard, FileSignature, Receipt, ListTodo, LayoutGrid, AlertTriangle, Camera, MonitorPlay, Music
} from 'lucide-react';

interface EventContract {
  id: string;
  externalId: string;
  rawJson: {
    cliente_info?: {
      razaosocial?: string;
      cnpj_cpf?: string;
      email?: string;
      enderecoemail?: string;
      fone?: string;
      numerotelefone?: string;
    };
    [key: string]: any;
  };
}

interface Event {
  id: string;
  name: string;
  publicName: string | null;
  clientName: string;
  status: string;
  setupAt: string | null;
  startAt: string | null;
  teardownAt: string | null;
  checkoutAt: string | null;
  notes: string | null;
  clientToken: string | null;
  reservationNumber: string | null;
  venues: { venue: { id: string; name: string; address: string | null } }[];
  guests: { id: string; name: string; phone: string | null; cpf: string | null; status: string }[];
  _count?: { guests: number };
  contracts?: EventContract[];
  npsOrganizador?: { submittedAt: string | null } | null;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  doneAt?: string;
  doneBy?: { name: string };
  order: number;
}

interface EventChecklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

const tabs = [
  { id: 'comments', label: 'Comentários', icon: MessageCircle },
  { id: 'atividades', label: 'Atividades', icon: ListTodo },
  { id: 'files', label: 'Arquivos', icon: FileText },
  { id: 'schedule', label: 'Cronograma', icon: Clock },
  { id: 'checklists', label: 'Checklists', icon: CheckSquare },
  { id: 'guests', label: 'Convidados', icon: Users },
  { id: 'plan', label: 'Plano do Evento', icon: ClipboardList },
  { id: 'mao-de-obra', label: 'Mão de Obra', icon: Briefcase },
  { id: 'food', label: 'A&B', icon: UtensilsCrossed },
  { id: 'infra', label: 'Infraestrutura', icon: HardHat },
  { id: 'kitchen', label: 'Cozinha', icon: ChefHat },
  { id: 'team', label: 'Pessoas', icon: UserCog },
  { id: 'professionals', label: 'Profissionais', icon: Camera },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
  { id: 'media', label: 'Mídia', icon: MonitorPlay },
  { id: 'spotify', label: 'Spotify', icon: Music },
];

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('comments');

  // Checklist state
  const [checklists, setChecklists] = useState<EventChecklist[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [templates, setTemplates] = useState<{id: string; title: string}[]>([]);
  const [expandedChecklistId, setExpandedChecklistId] = useState<string | null>(null);
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [editingItem, setEditingItem] = useState<{ id: string; text: string } | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  // Briefing state
  const [briefing, setBriefing] = useState<any>(null);
  const [briefingTemplates, setBriefingTemplates] = useState<{id: string; title: string}[]>([]);

  // Tab badges (pending indicators)
  const [tabBadges, setTabBadges] = useState<Record<string, boolean>>({});
  const [contractHealth, setContractHealth] = useState<Record<string, { missing: boolean; unlinkedInUerp: boolean }>>({});
  const [pendingRemovals, setPendingRemovals] = useState<{
    contractId: string; externalId: string; clientCode: string; startDate: string;
    items: { id: string; name: string; category: string; quantity: number }[];
  }[]>([]);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(null);

  // Inline date editing
  const [editingDates, setEditingDates] = useState(false);
  const [dateForm, setDateForm] = useState({ setupAt: '', startAt: '', teardownAt: '', checkoutAt: '' });
  const [savingDates, setSavingDates] = useState(false);

  // Inline public name editing
  const [editingPublicName, setEditingPublicName] = useState(false);
  const [publicNameForm, setPublicNameForm] = useState('');
  const [savingPublicName, setSavingPublicName] = useState(false);

  // Client portal
  const [showClientPanel, setShowClientPanel] = useState(false);
  const [reservationInput, setReservationInput] = useState('');
  const [savingReservation, setSavingReservation] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);

  function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    // Convert UTC ISO to America/Sao_Paulo local datetime-local input value
    const d = new Date(iso);
    const tzOffset = -3 * 60; // BRT = UTC-3
    const local = new Date(d.getTime() + tzOffset * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function openDateEdit() {
    setDateForm({
      setupAt: toLocalInput(event!.setupAt),
      startAt: toLocalInput(event!.startAt),
      teardownAt: toLocalInput(event!.teardownAt),
      checkoutAt: toLocalInput(event!.checkoutAt),
    });
    setEditingDates(true);
  }

  function openPublicNameEdit() {
    setPublicNameForm(event!.publicName || '');
    setEditingPublicName(true);
  }

  async function savePublicName() {
    if (!publicNameForm.trim()) { alert('Campo obrigatório.'); return; }
    setSavingPublicName(true);
    try {
      const response = await fetch(`/api/v2/events/${eventId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicName: publicNameForm.trim() }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.error || 'Erro ao salvar o nome de divulgação.');
        return;
      }
      await loadEvent();
      setEditingPublicName(false);
    } catch (err) {
      alert('Erro ao salvar o nome de divulgação.');
    } finally {
      setSavingPublicName(false);
    }
  }

  async function saveDates() {
    setSavingDates(true);
    try {
      const toUTC = (local: string) => local ? new Date(local + ':00-03:00').toISOString() : undefined;
      const response = await fetch(`/api/v2/events/${eventId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupAt: toUTC(dateForm.setupAt),
          startAt: toUTC(dateForm.startAt),
          teardownAt: toUTC(dateForm.teardownAt),
          checkoutAt: toUTC(dateForm.checkoutAt),
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.error || 'Erro ao salvar as datas do evento.');
        return;
      }
      await loadEvent();
      setEditingDates(false);
    } catch (err) {
      alert('Erro ao salvar as datas do evento.');
    } finally {
      setSavingDates(false);
    }
  }

  useEffect(() => {
    loadEvent();
    loadChecklist();
    loadTabBadges();
    loadContractHealth();
  }, [eventId]);

  async function loadTabBadges() {
    try {
      const r = await fetch(`/api/v2/events/${eventId}/tab-badges`, { credentials: 'include' });
      if (r.ok) setTabBadges(await r.json());
    } catch { /* silent */ }
  }

  async function loadContractHealth() {
    try {
      const r = await fetch(`/api/v2/events/${eventId}/userp-status`, { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      const map: Record<string, { missing: boolean; unlinkedInUerp: boolean }> = {};
      for (const h of data.contractHealth ?? []) map[h.id] = { missing: h.missing, unlinkedInUerp: h.unlinkedInUerp };
      setContractHealth(map);
      setPendingRemovals(data.pendingRemovals ?? []);
    } catch { /* silent */ }
  }

  async function confirmRemoval(contractId: string) {
    setConfirmingRemovalId(contractId);
    try {
      const r = await fetch(`/api/v2/events/${eventId}/contracts/${contractId}/confirm-removal`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error || 'Erro ao remover o contrato.');
        return;
      }
      await Promise.all([loadEvent(), loadContractHealth()]);
    } catch {
      alert('Erro ao remover o contrato.');
    } finally {
      setConfirmingRemovalId(null);
    }
  }

  async function loadChecklist() {
    try {
      setChecklistLoading(true);
      const response = await fetch(`/api/v2/events/${eventId}/checklists`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setChecklists(data.checklists || []);
      }
    } catch (err) {
      // Silently fail - checklist might not exist yet
    } finally {
      setChecklistLoading(false);
    }
  }

  async function loadChecklistTemplates() {
    try {
      const response = await fetch('/api/v2/checklist-templates', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('Failed to load templates');
    }
  }

  async function applyTemplate(templateId: string) {
    try {
      const response = await fetch(`/api/v2/events/${eventId}/checklist/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId }),
      });
      const data = await response.json();
      if (data.success) {
        loadChecklist();
      }
    } catch (err) {
      alert('Erro ao aplicar template');
    }
  }

  async function deleteChecklist(checklistId: string) {
    if (!confirm('Tem certeza que deseja excluir este checklist?')) return;
    
    try {
      const response = await fetch(`/api/v2/checklists/${checklistId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        loadChecklist();
      }
    } catch (err) {
      alert('Erro ao excluir checklist');
    }
  }

  async function toggleChecklistItem(itemId: string, done: boolean) {
    try {
      await fetch(`/api/v2/checklist-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ done }),
      });
      loadChecklist();
    } catch (err) {
      alert('Erro ao atualizar item');
    }
  }

  async function addChecklistItem(checklistId: string) {
    const text = (newItemTexts[checklistId] || '').trim();
    if (!text) return;
    try {
      await fetch(`/api/v2/checklists/${checklistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });
      setNewItemTexts((prev) => ({ ...prev, [checklistId]: '' }));
      loadChecklist();
    } catch (err) {
      alert('Erro ao adicionar item');
    }
  }

  async function saveChecklistItemText(itemId: string, text: string) {
    if (!text.trim()) return;
    try {
      await fetch(`/api/v2/checklist-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: text.trim() }),
      });
      setEditingItem(null);
      loadChecklist();
    } catch (err) {
      alert('Erro ao editar item');
    }
  }

  async function deleteChecklistItem(itemId: string) {
    if (!confirm('Remover este item?')) return;
    try {
      await fetch(`/api/v2/checklist-items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      loadChecklist();
    } catch (err) {
      alert('Erro ao remover item');
    }
  }

  async function handleDrop(checklistId: string) {
    if (!dragItemId || !dragOverItemId || dragItemId === dragOverItemId) {
      setDragItemId(null);
      setDragOverItemId(null);
      return;
    }
    const checklist = checklists.find(c => c.id === checklistId);
    if (!checklist) return;

    const items = [...checklist.items];
    const fromIdx = items.findIndex(i => i.id === dragItemId);
    const toIdx   = items.findIndex(i => i.id === dragOverItemId);
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    const reordered = items.map((item, idx) => ({ ...item, order: idx }));

    setChecklists(prev => prev.map(c => c.id === checklistId ? { ...c, items: reordered } : c));
    setDragItemId(null);
    setDragOverItemId(null);

    await fetch(`/api/v2/checklists/${checklistId}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: reordered.map(i => ({ id: i.id, order: i.order })) }),
    });
  }

  function printChecklist(checklist: EventChecklist) {
    const done  = checklist.items.filter(i => i.done).length;
    const total = checklist.items.length;
    const rows  = checklist.items.map((item, i) => `
      <div class="item ${item.done ? 'done' : ''}">
        <span class="num">${i + 1}.</span>
        <span class="box">${item.done ? '✓' : ''}</span>
        <div class="text">
          ${item.text}
          ${item.done && (item as any).doneAt
            ? `<div class="by">Concluído por ${(item as any).doneBy?.name || '—'} em ${new Date((item as any).doneAt).toLocaleString('pt-BR')}</div>`
            : ''}
        </div>
      </div>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${checklist.title}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#111}
        h1{font-size:18px;font-weight:bold;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:4px}
        .meta{color:#666;font-size:12px;margin-bottom:16px}
        .item{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #eee}
        .num{min-width:22px;color:#888;font-size:12px;padding-top:1px}
        .box{min-width:16px;height:16px;border:1.5px solid #999;display:inline-flex;align-items:center;justify-content:center;font-size:11px;margin-top:1px;font-weight:bold;color:#16a34a}
        .text{flex:1;font-size:13px;line-height:1.4}
        .done .text{text-decoration:line-through;color:#999}
        .by{font-size:10px;color:#2563eb;margin-top:2px}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${checklist.title}</h1>
      <p class="meta">${done} de ${total} itens concluídos &nbsp;·&nbsp; Impresso em ${new Date().toLocaleString('pt-BR')}</p>
      ${rows}
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.focus(); win.print(); }
  }

  async function loadEvent() {
    try {
      setLoading(true);
      const response = await eventsApi.get(eventId);
      setEvent(response.event);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar evento');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    try {
      await eventsApi.updateStatus(eventId, newStatus);
      loadEvent();
    } catch (err: any) {
      alert('Erro ao alterar status: ' + err.message);
    }
  }

  function copyReceptionistUrl() {
    const url = `${window.location.origin}/checkin`;
    navigator.clipboard.writeText(url);
    alert('URL da recepcionista copiada: ' + url);
  }

  async function generateClientToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/generate-client-token`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) await loadEvent();
    } finally { setGeneratingToken(false); }
  }

  async function saveReservationNumber() {
    if (!reservationInput.trim()) return;
    setSavingReservation(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/reservation-number`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationNumber: reservationInput.trim() }),
      });
      if (res.ok) { await loadEvent(); setReservationInput(''); }
    } finally { setSavingReservation(false); }
  }

  function copyClientUrl() {
    if (!event?.clientToken) return;
    const url = `${window.location.origin}/client/${event.clientToken}`;
    navigator.clipboard.writeText(url);
    alert('Link do cliente copiado!');
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-4">Carregando...</p>
        </div>
      </Layout>
    );
  }

  if (error || !event) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-destructive">{error || 'Evento não encontrado'}</p>
          <Link href="/events" className="mt-4 text-primary hover:underline block">Voltar aos Eventos</Link>
        </div>
      </Layout>
    );
  }

  const confirmedGuests = event.guests?.filter((g: any) => g.status === 'confirmed').length || 0;
  const checkedInGuests = event.guests?.filter((g: any) => g.status === 'checked_in').length || 0;
  const pendingGuests = event.guests?.filter((g: any) => g.status === 'pending').length || 0;
  const declinedGuests = event.guests?.filter((g: any) => g.status === 'declined').length || 0;

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/events" className="hover:text-foreground">Eventos</Link>
          <span>/</span>
          <span className="text-foreground">{event.name}</span>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{event.name}</h1>
            {editingPublicName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={publicNameForm}
                  onChange={e => setPublicNameForm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePublicName(); if (e.key === 'Escape') setEditingPublicName(false); }}
                  placeholder="Nome do evento (como cliente divulga)"
                  className="px-2 py-1 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-72 max-w-full"
                />
                <button onClick={savePublicName} disabled={savingPublicName}
                  className="p-1.5 text-success hover:bg-success/10 rounded transition disabled:opacity-50">
                  <Check size={14} />
                </button>
                <button onClick={() => setEditingPublicName(false)}
                  className="p-1.5 text-muted-foreground hover:bg-muted rounded transition">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={openPublicNameEdit} className="flex items-center gap-1.5 mt-1 group">
                {event.publicName ? (
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition">{event.publicName}</span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-destructive font-medium">
                    <AlertTriangle size={12} /> Preencher nome de divulgação (obrigatório)
                  </span>
                )}
                <Pencil size={11} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition shrink-0" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(getEventDisplayStatus(event))}`}>
              {getStatusLabel(getEventDisplayStatus(event))}
            </span>
            <button
              onClick={copyReceptionistUrl}
              className="px-3 py-1 border rounded-lg text-sm bg-background hover:bg-accent flex items-center gap-1"
              title="Copiar URL da recepcionista"
            >
              <Copy size={14} />
              <span className="hidden sm:inline">Recepcionista</span>
            </button>
            <button
              onClick={() => { setShowClientPanel(v => !v); setReservationInput(event?.reservationNumber || ''); }}
              className="px-3 py-1 border rounded-lg text-sm bg-background hover:bg-accent flex items-center gap-1"
              title="Portal do cliente"
            >
              <UserCog size={14} />
              <span className="hidden sm:inline">Cliente</span>
            </button>

            {/* Iniciar Evento: visível em draft e confirmed */}
            {(event.status === 'draft' || event.status === 'confirmed') && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="px-3 py-1 border border-green-500 rounded-lg text-sm bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1 font-medium"
              >
                <Check size={14} />
                Iniciar Evento
              </button>
            )}

            {/* Encerrar Evento: visível em in_progress e completed */}
            {(event.status === 'in_progress' || event.status === 'completed') && (
              <Link
                href={`/events/${eventId}/encerrar`}
                className="px-3 py-1 border border-orange-400 rounded-lg text-sm bg-orange-50 text-orange-700 hover:bg-orange-100 flex items-center gap-1 font-medium"
              >
                <LogOut size={14} />
                Encerrar Evento
              </Link>
            )}

            {/* Informar NPS / Ver relatório: visível após encerrado */}
            {event.status === 'encerrado' && (
              <Link
                href={`/events/${eventId}/closure`}
                className="px-3 py-1 border border-blue-400 rounded-lg text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1 font-medium"
              >
                <Star size={14} />
                {event.npsOrganizador?.submittedAt ? 'Ver relatório do evento' : 'Informar NPS'}
              </Link>
            )}
          </div>
        </div>

        {/* Client portal panel */}
        {showClientPanel && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <UserCog size={15} /> Portal do Cliente
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Reservation number */}
              <div>
                <p className="text-xs font-medium text-blue-700 mb-1">Número de Reserva (senha do cliente)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reservationInput}
                    onChange={e => setReservationInput(e.target.value)}
                    placeholder={event.reservationNumber || 'Ex: RES-2024-001'}
                    className="flex-1 px-3 py-1.5 border rounded-lg text-sm bg-white"
                  />
                  <button
                    onClick={saveReservationNumber}
                    disabled={savingReservation || !reservationInput.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {savingReservation ? '...' : 'Salvar'}
                  </button>
                </div>
                {event.reservationNumber && (
                  <p className="text-xs text-blue-600 mt-1">Atual: <strong>{event.reservationNumber}</strong></p>
                )}
              </div>
              {/* Link */}
              <div>
                <p className="text-xs font-medium text-blue-700 mb-1">Link único do cliente</p>
                {event.clientToken ? (
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/client/${event.clientToken}`}
                      className="flex-1 px-3 py-1.5 border rounded-lg text-xs bg-white text-gray-600"
                    />
                    <button
                      onClick={copyClientUrl}
                      className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50"
                      title="Copiar link"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={generateClientToken}
                      disabled={generatingToken}
                      className="px-3 py-1.5 bg-white border border-blue-300 text-blue-600 rounded-lg text-xs hover:bg-blue-50 disabled:opacity-50"
                      title="Gerar novo link (invalida o anterior)"
                    >
                      {generatingToken ? '...' : 'Novo'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={generateClientToken}
                    disabled={generatingToken}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {generatingToken ? 'Gerando...' : 'Gerar Link'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info card */}
        <div className="mt-4 bg-card border rounded-xl px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-start gap-2">
              <Users size={15} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Contratante</p>
                <p className="font-semibold text-sm">{event.clientName}</p>
              </div>
            </div>

            {/* Local */}
            <div className="flex items-start gap-2">
              <MapPin size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Local</p>
                {event.venues?.length > 0 ? (
                  event.venues.filter(v => v.venue).map((v, i) => (
                    <p key={i} className="font-semibold text-sm">{v.venue.name}</p>
                  ))
                ) : (
                  <p className="italic text-muted-foreground text-sm">A definir</p>
                )}
              </div>
            </div>

            <div className="hidden lg:block" />

            {/* Checkin / Montagem */}
            <div className="flex items-start gap-2">
              <Calendar size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Checkin (montagem)</p>
                {editingDates ? (
                  <input type="datetime-local" value={dateForm.setupAt}
                    onChange={e => setDateForm(f => ({ ...f, setupAt: e.target.value }))}
                    className="w-full text-sm px-2 py-1 border rounded bg-background focus:ring-2 focus:ring-ring" />
                ) : (
                  <p className="font-semibold text-sm">{event.setupAt ? formatDateTime(event.setupAt) : <span className="italic text-muted-foreground">A definir</span>}</p>
                )}
              </div>
            </div>

            {/* Início */}
            <div className="flex items-start gap-2">
              <Calendar size={15} className="text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Início do evento</p>
                {editingDates ? (
                  <input type="datetime-local" value={dateForm.startAt}
                    onChange={e => setDateForm(f => ({ ...f, startAt: e.target.value }))}
                    className="w-full text-sm px-2 py-1 border rounded bg-background focus:ring-2 focus:ring-ring" />
                ) : (
                  <p className="font-semibold text-sm">{event.startAt ? formatDateTime(event.startAt) : <span className="italic text-muted-foreground">A definir</span>}</p>
                )}
              </div>
            </div>

            {/* Término */}
            <div className="flex items-start gap-2">
              <Calendar size={15} className="text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Fim do evento</p>
                {editingDates ? (
                  <input type="datetime-local" value={dateForm.teardownAt}
                    onChange={e => setDateForm(f => ({ ...f, teardownAt: e.target.value }))}
                    className="w-full text-sm px-2 py-1 border rounded bg-background focus:ring-2 focus:ring-ring" />
                ) : (
                  <p className="font-semibold text-sm">{event.teardownAt ? formatDateTime(event.teardownAt) : <span className="italic text-muted-foreground">A definir</span>}</p>
                )}
              </div>
            </div>

            {/* Checkout / Desmontagem */}
            <div className="flex items-start gap-2">
              <Calendar size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Checkout (desmontagem)</p>
                {editingDates ? (
                  <input type="datetime-local" value={dateForm.checkoutAt}
                    onChange={e => setDateForm(f => ({ ...f, checkoutAt: e.target.value }))}
                    className="w-full text-sm px-2 py-1 border rounded bg-background focus:ring-2 focus:ring-ring" />
                ) : (
                  <p className="font-semibold text-sm">{event.checkoutAt ? formatDateTime(event.checkoutAt) : <span className="italic text-muted-foreground">A definir</span>}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contract client info + contract numbers */}
          {event.contracts && event.contracts.length > 0 && (() => {
            const info = event.contracts![0].rawJson?.cliente_info;
            const email = info?.email || info?.enderecoemail;
            const phone = info?.fone || info?.numerotelefone;
            const doc = info?.cnpj_cpf;
            const hasClientInfo = email || phone || doc;
            return (
              <div className="mt-4 pt-4 border-t space-y-2">
                {hasClientInfo && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                    {email && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail size={12} className="shrink-0" />
                        <span>{email}</span>
                      </span>
                    )}
                    {phone && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone size={12} className="shrink-0" />
                        <span>{formatPhone(phone)}</span>
                      </span>
                    )}
                    {doc && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CreditCard size={12} className="shrink-0" />
                        <span>{doc.length === 11 ? formatCpf(doc) : doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</span>
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileSignature size={12} className="shrink-0" />
                    <span className="font-medium">Contrato{event.contracts!.length > 1 ? 's' : ''}:</span>
                  </span>
                  {event.contracts!.map((c, i) => {
                    const health = contractHealth[c.id];
                    const warning = health?.missing
                      ? 'Contrato não encontrado no UERP'
                      : health?.unlinkedInUerp
                        ? 'Este contrato não está mais vinculado como secundário no UERP'
                        : null;
                    return (
                      <span key={c.id} className="flex items-center gap-1 text-xs font-mono bg-muted px-2 py-0.5 rounded border">
                        {warning && (
                          <span title={warning} className="shrink-0">
                            <AlertTriangle size={11} className="text-amber-500" />
                          </span>
                        )}
                        {c.externalId}
                        {i === 0 && event.contracts!.length > 1 && <span className="ml-1 text-muted-foreground">(principal)</span>}
                        {i > 0 && <span className="ml-1 text-muted-foreground">(secundário)</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Edit actions */}
          <div className="mt-3 flex justify-end gap-2">
            {editingDates ? (
              <>
                <button onClick={() => setEditingDates(false)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border hover:bg-muted transition">
                  <X size={12} /> Cancelar
                </button>
                <button onClick={saveDates} disabled={savingDates}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
                  <Check size={12} /> {savingDates ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            ) : (
              <button onClick={openDateEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border hover:bg-muted text-muted-foreground hover:text-foreground transition">
                <Pencil size={12} /> Editar datas
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contract removal proposals */}
      {pendingRemovals.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendingRemovals.map(pr => (
            <div key={pr.contractId} className="border border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">
                    Contrato {pr.externalId} não foi mais encontrado no UERP.
                  </p>
                  {pr.items.length > 0 ? (
                    <>
                      <p className="text-xs text-amber-800 mt-1">Confirmar a remoção vai apagar estes itens do evento:</p>
                      <ul className="text-xs text-amber-800 mt-1 list-disc list-inside">
                        {pr.items.map(i => (
                          <li key={i.id}>{i.name} ({i.category}) — qtd. {i.quantity}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-amber-800 mt-1">Nenhum item vinculado a esse contrato.</p>
                  )}
                  <button
                    onClick={() => confirmRemoval(pr.contractId)}
                    disabled={confirmingRemovalId === pr.contractId}
                    className="mt-2 flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
                  >
                    {confirmingRemovalId === pr.contractId ? 'Removendo...' : 'Confirmar remoção'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* USERP sync status */}
      <div className="mb-4">
        <UserpStatusBanner eventId={event.id} />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{event._count?.guests || 0}</p>
        </div>
        <div className="bg-card rounded-lg border p-4 border-green-500/30">
          <p className="text-sm text-muted-foreground">Confirmados</p>
          <p className="text-2xl font-bold text-green-500">{confirmedGuests}</p>
        </div>
        <div className="bg-card rounded-lg border p-4 border-blue-500/30">
          <p className="text-sm text-muted-foreground">Checked In</p>
          <p className="text-2xl font-bold text-blue-500">{checkedInGuests}</p>
        </div>
        <div className="bg-card rounded-lg border p-4 border-yellow-500/30">
          <p className="text-sm text-muted-foreground">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-500">{pendingGuests}</p>
        </div>
        <div className="bg-card rounded-lg border p-4 border-red-500/30">
          <p className="text-sm text-muted-foreground">Recusados</p>
          <p className="text-2xl font-bold text-red-500">{declinedGuests}</p>
        </div>
      </div>

      {/* Tabs Navigation — wraps to 2 rows, no horizontal scroll */}
      <div className="border-b mb-6">
        <nav className="flex flex-wrap gap-x-0 gap-y-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            // Derive badge from API badges + local data
            const hasBadge = (() => {
              if (tab.id === 'checklists') return checklists.some(c => c.items.some(i => !i.done));
              if (tab.id === 'guests') return pendingGuests > 0;
              return tabBadges[tab.id === 'food' ? 'food' : tab.id === 'infra' ? 'infra' : tab.id === 'mao-de-obra' ? 'maoDeObra' : tab.id === 'team' ? 'team' : tab.id === 'plan' ? 'plan' : tab.id === 'atividades' ? 'atividades' : ''] === true;
            })();
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                  isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
              >
                <Icon className="size-3.5 shrink-0" />
                {tab.label}
                {hasBadge && (
                  <span className="ml-0.5 inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Pendências" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content Placeholders */}
      {activeTab === 'comments' && (
        <EventCommentsTab eventId={eventId} />
      )}
      {activeTab === 'files' && (
        <EventFilesTab eventId={eventId} />
      )}
      {activeTab === 'schedule' && (
        <EventScheduleTab eventId={eventId} />
      )}
      {activeTab === 'checklists' && (
        <div className="space-y-4">
          <button
            onClick={() => {
              loadChecklistTemplates();
              const modal = document.getElementById('checklist-template-modal');
              if (modal) modal.classList.remove('hidden');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
          >
            <CheckSquare size={16} />
            Adicionar Checklist
          </button>
          
          {/* Template Selection Modal */}
          <div id="checklist-template-modal" className="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border p-6 max-w-md w-full mx-4">
              <h3 className="font-medium mb-4">Selecionar Template</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {templates.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum template disponível. Crie um em Admin &gt; Templates de Checklist.
                  </p>
                ) : (
                  templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        applyTemplate(template.id);
                        document.getElementById('checklist-template-modal')?.classList.add('hidden');
                      }}
                      className="w-full text-left p-3 border rounded-lg hover:bg-accent"
                    >
                      <p className="font-medium text-sm">{template.title}</p>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => document.getElementById('checklist-template-modal')?.classList.add('hidden')}
                className="mt-4 w-full py-2 border rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>

          {checklists.length === 0 ? (
            <div className="bg-card rounded-lg border p-8 text-center">
              <CheckSquare className="size-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">Nenhum checklist criado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Aplique um template de checklist para este evento
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {checklists.map((checklist) => (
                <div key={checklist.id} className="bg-card rounded-lg border">
                  <div 
                    className="p-4 border-b flex justify-between items-center cursor-pointer hover:bg-accent/50 transition"
                    onClick={() => setExpandedChecklistId(expandedChecklistId === checklist.id ? null : checklist.id)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <ChevronDown 
                        size={16} 
                        className={`transition-transform ${expandedChecklistId === checklist.id ? 'rotate-180' : ''}`} 
                      />
                      <div>
                        <h3 className="font-medium">{checklist.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {checklist.items.filter((i: any) => i.done).length} de {checklist.items.length} concluídos
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 hidden sm:block">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${checklist.items.length ? (checklist.items.filter((i: any) => i.done).length / checklist.items.length) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); printChecklist(checklist); }}
                        className="p-2 text-muted-foreground hover:text-foreground transition"
                        title="Imprimir checklist"
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteChecklist(checklist.id); }}
                        className="p-2 text-muted-foreground hover:text-red-500 transition"
                        title="Excluir Checklist"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {expandedChecklistId === checklist.id && (
                    <div className="p-4 space-y-2">
                      {checklist.items.map((item: any) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDragItemId(item.id)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverItemId(item.id); }}
                          onDrop={() => handleDrop(checklist.id)}
                          onDragEnd={() => { setDragItemId(null); setDragOverItemId(null); }}
                          className={`flex items-center gap-2 p-3 border rounded-lg transition group
                            ${dragItemId === item.id ? 'opacity-40' : ''}
                            ${dragOverItemId === item.id && dragItemId !== item.id ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'}`}
                        >
                          <span className="cursor-grab text-muted-foreground hover:text-foreground touch-none shrink-0" title="Arrastar para reordenar">
                            <GripVertical size={14} />
                          </span>
                          {editingItem && editingItem.id === item.id ? (
                            <>
                              <input
                                type="text"
                                value={editingItem.text}
                                onChange={(e) => setEditingItem({ id: item.id, text: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveChecklistItemText(item.id, editingItem.text);
                                  if (e.key === 'Escape') setEditingItem(null);
                                }}
                                autoFocus
                                className="flex-1 px-2 py-1 border rounded bg-background text-sm"
                              />
                              <button onClick={() => saveChecklistItemText(item.id, editingItem.text)} className="p-1 text-green-600 hover:bg-green-100 rounded" title="Salvar">
                                <Check size={15} />
                              </button>
                              <button onClick={() => setEditingItem(null)} className="p-1 text-muted-foreground hover:bg-accent rounded" title="Cancelar">
                                <X size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                type="checkbox"
                                checked={item.done}
                                onChange={() => toggleChecklistItem(item.id, !item.done)}
                                className="cursor-pointer shrink-0"
                              />
                              <span
                                onClick={() => toggleChecklistItem(item.id, !item.done)}
                                className={`flex-1 cursor-pointer text-sm ${item.done ? 'line-through text-muted-foreground' : ''}`}
                              >
                                {item.text}
                              </span>
                              <button
                                onClick={() => setEditingItem({ id: item.id, text: item.text })}
                                className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
                                title="Editar"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => deleteChecklistItem(item.id)}
                                className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                title="Remover"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add new item */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          value={newItemTexts[checklist.id] || ''}
                          onChange={(e) => setNewItemTexts((prev) => ({ ...prev, [checklist.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(checklist.id); }}
                          placeholder="Adicionar item específico deste evento..."
                          className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm"
                        />
                        <button
                          onClick={() => addChecklistItem(checklist.id)}
                          className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition"
                        >
                          <Plus size={16} />
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab === 'guests' && (
        <EventGuestsTab eventId={eventId} />
      )}
      {activeTab === 'plan' && (
        <EventPlanTab eventId={eventId} />
      )}
      {activeTab === 'atividades' && (
        <EventActivitiesTab eventId={eventId} />
      )}
      {activeTab === 'mao-de-obra' && (
        <EventMaoDeObraTab eventId={eventId} eventStartAt={event.startAt} />
      )}
      {activeTab === 'food' && (
        <div>
          <h3 className="font-medium mb-4 flex items-center gap-2 text-sm">
            <UtensilsCrossed className="size-4" />
            A&B — Alimentação e Bebidas
          </h3>
          <EventItemsTab eventId={eventId} category="ab" eventStartAt={event?.startAt ?? null} />
        </div>
      )}
      {activeTab === 'infra' && (
        <div>
          <h3 className="font-medium mb-4 flex items-center gap-2 text-sm">
            <HardHat className="size-4" />
            Infraestrutura
          </h3>
          <EventItemsTab eventId={eventId} category="infra" />
        </div>
      )}
      {activeTab === 'kitchen' && (
        <EventKitchenTab eventId={eventId} guestCount={event._count?.guests ?? 0} />
      )}
      {activeTab === 'team' && (
        <EventTeamTab eventId={eventId} />
      )}
      {activeTab === 'professionals' && (
        <EventProfessionalsTab eventId={eventId} />
      )}
      {activeTab === 'layout' && (
        <EventLayoutTab eventId={eventId} />
      )}
      {activeTab === 'media' && (
        <EventMediaTab eventId={eventId} />
      )}
      {activeTab === 'spotify' && (
        <div className="space-y-4">
          {(event?.venues || []).filter(v => v.venue).length === 0 ? (
            <div className="bg-card rounded-lg border shadow-sm p-6 text-sm text-muted-foreground">
              Este evento ainda não tem espaço vinculado.
            </div>
          ) : (
            event.venues.filter(v => v.venue).map(v => (
              <EventSpotifyPlaylist key={v.venue.id} eventId={eventId} venue={v.venue} />
            ))
          )}
        </div>
      )}
    </Layout>
  );
}
