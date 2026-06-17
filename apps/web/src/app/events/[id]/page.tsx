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
import EventMaoDeObraTab from '@/components/EventMaoDeObraTab';
import EventKitchenTab from '@/components/EventKitchenTab';
import UserpStatusBanner from '@/components/UserpStatusBanner';
import { eventsApi, guestsApi } from '@/lib/api';
import { formatDateTime, getStatusColor, getStatusLabel, getEventDisplayStatus, formatPhone, formatCpf } from '@/lib/utils';
import {
  MessageCircle, FileText, Clock, CheckSquare, Users,
  ClipboardList, Briefcase, UtensilsCrossed, HardHat, Trash2, ChevronDown,
  Calendar, MapPin, Pencil, Check, X, Copy, UserCog, ChefHat, LogOut, Star
} from 'lucide-react';

interface Event {
  id: string;
  name: string;
  clientName: string;
  status: string;
  setupAt: string | null;
  startAt: string | null;
  teardownAt: string | null;
  notes: string | null;
  venues: { venue: { id: string; name: string; address: string | null } }[];
  guests: { id: string; name: string; phone: string | null; cpf: string | null; status: string }[];
  _count?: { guests: number };
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
  { id: 'files', label: 'Arquivos', icon: FileText },
  { id: 'schedule', label: 'Cronograma', icon: Clock },
  { id: 'checklists', label: 'Checklists', icon: CheckSquare },
  { id: 'guests', label: 'Convidados', icon: Users },
  { id: 'plan', label: 'Plano do Evento', icon: ClipboardList },
  { id: 'mao-de-obra', label: 'Mão de Obra', icon: Briefcase },
  { id: 'food', label: 'A&B', icon: UtensilsCrossed },
  { id: 'infra', label: 'Infraestrutura', icon: HardHat },
  { id: 'kitchen', label: 'Cozinha', icon: ChefHat },
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

  // Briefing state
  const [briefing, setBriefing] = useState<any>(null);
  const [briefingTemplates, setBriefingTemplates] = useState<{id: string; title: string}[]>([]);

  // Inline date editing
  const [editingDates, setEditingDates] = useState(false);
  const [dateForm, setDateForm] = useState({ startAt: '', teardownAt: '' });
  const [savingDates, setSavingDates] = useState(false);

  function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    // Convert UTC ISO to America/Sao_Paulo local datetime-local input value
    const d = new Date(iso);
    const tzOffset = -3 * 60; // BRT = UTC-3
    const local = new Date(d.getTime() + tzOffset * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function openDateEdit() {
    setDateForm({ startAt: toLocalInput(event!.startAt), teardownAt: toLocalInput(event!.teardownAt) });
    setEditingDates(true);
  }

  async function saveDates() {
    setSavingDates(true);
    try {
      const toUTC = (local: string) => local ? new Date(local + ':00-03:00').toISOString() : undefined;
      await fetch(`/api/v2/events/${eventId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: toUTC(dateForm.startAt),
          teardownAt: toUTC(dateForm.teardownAt),
        }),
      });
      await loadEvent();
      setEditingDates(false);
    } finally {
      setSavingDates(false);
    }
  }

  useEffect(() => {
    loadEvent();
    loadChecklist();
  }, [eventId]);

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

            {/* Informar NPS: visível após encerrado */}
            {event.status === 'encerrado' && (
              <Link
                href={`/events/${eventId}/closure`}
                className="px-3 py-1 border border-blue-400 rounded-lg text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1 font-medium"
              >
                <Star size={14} />
                Informar NPS
              </Link>
            )}
          </div>
        </div>

        {/* Info card */}
        <div className="mt-4 bg-card border rounded-xl px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-start gap-2">
              <Users size={15} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Contratante</p>
                <p className="font-semibold text-sm">{event.clientName}</p>
              </div>
            </div>

            {/* Início */}
            <div className="flex items-start gap-2">
              <Calendar size={15} className="text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Início</p>
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
              <Calendar size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Término</p>
                {editingDates ? (
                  <input type="datetime-local" value={dateForm.teardownAt}
                    onChange={e => setDateForm(f => ({ ...f, teardownAt: e.target.value }))}
                    className="w-full text-sm px-2 py-1 border rounded bg-background focus:ring-2 focus:ring-ring" />
                ) : (
                  <p className="font-semibold text-sm">{event.teardownAt ? formatDateTime(event.teardownAt) : <span className="italic text-muted-foreground">A definir</span>}</p>
                )}
              </div>
            </div>

            {/* Local */}
            <div className="flex items-start gap-2">
              <MapPin size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Local</p>
                {event.venues?.[0] ? (
                  <p className="font-semibold text-sm">{event.venues[0].venue.name}</p>
                ) : (
                  <p className="italic text-muted-foreground text-sm">A definir</p>
                )}
              </div>
            </div>
          </div>

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

      {/* Tabs Navigation */}
      <div className="border-b mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                  activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
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
                    <div className="flex items-center gap-4">
                      <div className="w-32">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all"
                            style={{ width: `${(checklist.items.filter((i: any) => i.done).length / checklist.items.length) * 100}%` }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChecklist(checklist.id);
                        }}
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
                          onClick={() => toggleChecklistItem(item.id, !item.done)}
                          className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition"
                        >
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={(e) => e.stopPropagation()}
                            className="mt-1"
                          />
                          <span className={item.done ? 'line-through text-muted-foreground' : ''}>{item.text}</span>
                        </div>
                      ))}
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
      {activeTab === 'mao-de-obra' && (
        <EventMaoDeObraTab eventId={eventId} eventStartAt={event.startAt} />
      )}
      {activeTab === 'food' && (
        <div>
          <h3 className="font-medium mb-4 flex items-center gap-2 text-sm">
            <UtensilsCrossed className="size-4" />
            A&B — Alimentação e Bebidas
          </h3>
          <EventItemsTab eventId={eventId} category="ab" />
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
    </Layout>
  );
}
