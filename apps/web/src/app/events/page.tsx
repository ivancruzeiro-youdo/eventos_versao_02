'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { eventsApi } from '@/lib/api';
import { formatDate, formatDateTime, getStatusColor, getStatusLabel, getEventDisplayStatus } from '@/lib/utils';
import { 
  Calendar as CalendarIcon, 
  List, 
  Plus, 
  Search, 
  Filter,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  RefreshCw,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  Utensils,
  Wrench,
  UserCheck,
  Building2
} from 'lucide-react';

interface Event {
  id: string;
  name: string;
  clientName: string;
  status: string;
  startAt: string | null;
  setupAt: string | null;
  teardownAt: string | null;
  venues: { venue: { name: string } }[];
  _count?: { guests: number };
}

type ViewMode = 'list' | 'calendar';

interface SyncItem {
  name: string; qty: number; unit: string;
  category: string;
  productId: string | null; productName: string | null;
  venueId: string | null; venueName: string | null;
  subitems: { group: string; items: string[] }[];
  staffServices: { id: string; name: string }[];
  missing: boolean; missingReason: string;
}
interface SyncPreview {
  key: string; clientCode: string; startDate: string; clientName: string;
  existingEventId: string | null;
  action: 'create' | 'update' | 'no_change';
  contractIds: string[];
  items: SyncItem[];
  canImport: boolean;
  blockingReasons: string[];
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  // Sync modal
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncPreviews, setSyncPreviews] = useState<SyncPreview[]>([]);
  const [syncError, setSyncError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<{ key: string; action: string }[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [syncSearch, setSyncSearch] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadEvents();
  }, []);

  async function openSync() {
    setSyncOpen(true);
    setSyncPreviews([]);
    setSyncError('');
    setImportDone([]);
    setSelectedKeys(new Set());
    setExpandedKey(null);
    setSyncSearch('');
    setSyncLoading(true);
    try {
      const res = await fetch('/api/v2/events/sync-preview', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { setSyncError(data.error || 'Erro ao buscar contratos'); return; }
      const previews: SyncPreview[] = data.previews || [];
      setSyncPreviews(previews);
      // Pre-select importable non-no_change events
      setSelectedKeys(new Set(previews.filter(p => p.canImport && p.action !== 'no_change').map(p => p.key)));
    } catch (e: any) {
      setSyncError(e.message || 'Erro inesperado');
    } finally {
      setSyncLoading(false);
    }
  }

  async function doImport() {
    setImporting(true);
    try {
      const toImport = syncPreviews.filter(p => selectedKeys.has(p.key) && p.canImport);
      const res = await fetch('/api/v2/events/sync-import', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previews: toImport }),
      });
      const data = await res.json();
      if (!res.ok) { setSyncError(data.error || 'Erro ao importar'); return; }
      setImportDone(data.results || []);
      await loadEvents();
    } catch (e: any) {
      setSyncError(e.message || 'Erro inesperado');
    } finally {
      setImporting(false);
    }
  }

  async function loadEvents() {
    try {
      setLoading(true);
      const response = await eventsApi.list();
      setEvents(response.events || []);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar eventos');
    } finally {
      setLoading(false);
    }
  }

  const filteredEvents = events.filter(event => {
    const matchesSearch = 
      event.name.toLowerCase().includes(search.toLowerCase()) ||
      event.clientName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
    const matchesDate = (!dateFrom || !event.startAt || new Date(event.startAt) >= new Date(dateFrom)) &&
                       (!dateTo || !event.startAt || new Date(event.startAt) <= new Date(dateTo));
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const getEventsForDay = (day: Date) => {
    return filteredEvents.filter(event => {
      if (!event.startAt) return false;
      const eventDate = new Date(event.startAt);
      return eventDate.toDateString() === day.toDateString();
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Eventos</h1>
          <p className="text-muted-foreground">{filteredEvents.length} eventos encontrados</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${
                viewMode === 'list' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="size-4" />
              Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${
                viewMode === 'calendar' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CalendarIcon className="size-4" />
              Calendário
            </button>
          </div>
          
          <button
            onClick={openSync}
            className="px-4 py-2 border border-input rounded-lg hover:bg-muted transition text-sm font-medium flex items-center gap-2"
          >
            <RefreshCw className="size-4" />
            Sincronizar Userp
          </button>
          <Link
            href="/events/new"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2"
          >
            <Plus className="size-4" />
            Novo Evento
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar eventos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            >
              <option value="all">Todos status</option>
              <option value="draft">Rascunho</option>
              <option value="confirmed">Confirmado</option>
              <option value="in_progress">Em Andamento</option>
              <option value="completed">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">De:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">Até:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <div className="divide-y">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12">
                <CalendarIcon className="size-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum evento encontrado.</p>
                <Link href="/events/new" className="text-primary hover:underline mt-2 inline-block">
                  Criar primeiro evento →
                </Link>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block p-4 hover:bg-muted/50 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="font-semibold text-card-foreground">{event.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(getEventDisplayStatus(event))}`}>
                          {getStatusLabel(getEventDisplayStatus(event))}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                        <Users className="size-3.5 shrink-0" />
                        <span className="font-medium text-foreground">{event.clientName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="size-3.5 shrink-0" />
                          <span className="text-xs">
                            <span className="font-medium text-foreground/80">Início:</span>{' '}
                            {event.startAt ? formatDateTime(event.startAt) : <em>A definir</em>}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="size-3.5 shrink-0" />
                          <span className="text-xs">
                            <span className="font-medium text-foreground/80">Fim:</span>{' '}
                            {event.teardownAt ? formatDateTime(event.teardownAt) : <em>A definir</em>}
                          </span>
                        </span>
                        {event.venues.length > 0 && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="text-xs">{event.venues.filter(v => v.venue).map(v => v.venue.name).join(' + ')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-card rounded-lg border shadow-sm p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-card-foreground">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 hover:bg-muted rounded-md transition"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                onClick={() => setCurrentMonth(new Date())}
                className="px-3 py-1.5 text-sm hover:bg-muted rounded-md transition"
              >
                Hoje
              </button>
              <button
                onClick={() => navigateMonth('next')}
                className="p-2 hover:bg-muted rounded-md transition"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
              <div key={day} className="bg-muted p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}
            {getDaysInMonth(currentMonth).map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="bg-card p-2 min-h-[100px]" />;
              }
              
              const dayEvents = getEventsForDay(day);
              const isToday = day.toDateString() === new Date().toDateString();
              
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-card p-2 min-h-[100px] border-t border-l ${
                    isToday ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <Link
                        key={event.id}
                        href={`/events/${event.id}`}
                        className={`block text-xs p-1 rounded truncate ${getStatusColor(getEventDisplayStatus(event))}`}
                      >
                        {event.name}
                      </Link>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{dayEvents.length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Sync Modal */}
      {syncOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">Sincronizar Contratos Userp</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Família &quot;experience&quot; · apenas de hoje em diante</p>
              </div>
              <button onClick={() => setSyncOpen(false)} className="p-1.5 rounded hover:bg-muted"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4">
              {syncLoading && (
                <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Buscando contratos no Userp...</span>
                </div>
              )}

              {syncError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                  <AlertTriangle size={15} /> {syncError}
                </div>
              )}

              {importDone.length > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="font-medium text-green-800 mb-2 flex items-center gap-2"><CheckCircle size={16} /> Importação concluída</p>
                  {importDone.map(r => (
                    <p key={r.key} className="text-sm text-green-700">
                      {r.action === 'create' ? '✓ Criado' : '✓ Atualizado'}: {r.key.replace('__', ' — ')}
                    </p>
                  ))}
                </div>
              )}

              {!syncLoading && syncPreviews.length === 0 && !syncError && (
                <p className="text-center text-muted-foreground py-8">Nenhum contrato encontrado a partir de hoje.</p>
              )}

              {syncPreviews.length > 0 && (
                <>
                  {/* Search + select all toolbar */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar por nome do cliente..."
                        value={syncSearch}
                        onChange={e => setSyncSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const visible = syncPreviews.filter(p =>
                          p.clientName.toLowerCase().includes(syncSearch.toLowerCase())
                        );
                        const importable = visible.filter(p => p.canImport && p.action !== 'no_change');
                        const allSelected = importable.every(p => selectedKeys.has(p.key));
                        setSelectedKeys(s => {
                          const n = new Set(s);
                          if (allSelected) { importable.forEach(p => n.delete(p.key)); }
                          else { importable.forEach(p => n.add(p.key)); }
                          return n;
                        });
                      }}
                      className="text-xs px-3 py-1.5 border border-input rounded-md hover:bg-muted transition shrink-0"
                    >
                      {(() => {
                        const visible = syncPreviews.filter(p =>
                          p.clientName.toLowerCase().includes(syncSearch.toLowerCase())
                        );
                        const importable = visible.filter(p => p.canImport && p.action !== 'no_change');
                        const allSelected = importable.length > 0 && importable.every(p => selectedKeys.has(p.key));
                        return allSelected ? 'Desmarcar todos' : 'Selecionar todos';
                      })()}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {syncPreviews.filter(p => p.clientName.toLowerCase().includes(syncSearch.toLowerCase())).length} de {syncPreviews.length} evento(s)
                    </p>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-green-100 text-green-800">● Novo</span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">● Atualização</span>
                      <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">● Sem mudança</span>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                    {syncPreviews.filter(p =>
                      p.clientName.toLowerCase().includes(syncSearch.toLowerCase())
                    ).map(prev => (
                      <div key={prev.key}
                        className={`border rounded-lg overflow-hidden ${
                          !prev.canImport ? 'border-destructive/40 bg-destructive/5' :
                          prev.action === 'create' ? 'border-green-300' :
                          prev.action === 'update' ? 'border-blue-300' :
                          'border-border opacity-60'
                        }`}>
                        {/* Row */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          {prev.canImport && (
                            <input type="checkbox" className="w-4 h-4 accent-primary shrink-0"
                              checked={selectedKeys.has(prev.key)}
                              onChange={() => setSelectedKeys(s => {
                                const n = new Set(s); n.has(prev.key) ? n.delete(prev.key) : n.add(prev.key); return n;
                              })} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{prev.clientName}</span>
                              <span className="text-xs text-muted-foreground">{prev.startDate}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                prev.action === 'create' ? 'bg-green-100 text-green-800' :
                                prev.action === 'update' ? 'bg-blue-100 text-blue-800' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {prev.action === 'create' ? 'Novo' : prev.action === 'update' ? 'Atualização' : selectedKeys.has(prev.key) ? 'Reimportar' : 'Sem mudança'}
                              </span>
                              {!prev.canImport && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">Bloqueado</span>
                              )}
                            </div>
                            {prev.blockingReasons.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {prev.blockingReasons.map((r, i) => (
                                  <p key={i} className="text-xs text-destructive flex items-center gap-1"><AlertTriangle size={11} /> {r}</p>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => setExpandedKey(expandedKey === prev.key ? null : prev.key)}
                            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border rounded shrink-0">
                            {expandedKey === prev.key ? 'Ocultar' : `${prev.items.length} item(s)`}
                          </button>
                        </div>

                        {/* Expanded items */}
                        {expandedKey === prev.key && (
                          <div className="border-t px-4 py-3 space-y-2 bg-muted/30">
                            {prev.items.map((item, idx) => (
                              <div key={idx} className={`flex gap-3 text-sm p-2 rounded ${
                                item.missing ? 'bg-destructive/10 border border-destructive/30' : 'bg-background border'
                              }`}>
                                <span className="mt-0.5 shrink-0">
                                  {item.category === 'ab' ? <Utensils size={14} className="text-orange-500" /> :
                                   item.category === 'staff' ? <UserCheck size={14} className="text-blue-500" /> :
                                   item.category === 'infra' ? <Wrench size={14} className="text-purple-500" /> :
                                   item.category === 'venue' ? <Building2 size={14} className="text-green-600" /> :
                                   <Info size={14} className="text-muted-foreground" />}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{item.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Qtd: {item.qty} {item.unit}
                                    {item.productName && ` · Produto: ${item.productName}`}
                                    {item.venueName && ` · Espaço: ${item.venueName}`}
                                  </p>
                                  {item.missing && <p className="text-xs text-destructive mt-0.5">{item.missingReason}</p>}
                                  {item.category === 'ab' && item.subitems.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {item.subitems.map((s, si) => (
                                        <p key={si} className="text-xs text-muted-foreground">
                                          <span className="font-medium">{s.group}:</span> {s.items.slice(0, 4).join(', ')}{s.items.length > 4 ? '...' : ''}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {item.category === 'staff' && item.staffServices.length > 0 && (
                                    <div className="flex gap-1 mt-1 flex-wrap">
                                      {item.staffServices.map(s => (
                                        <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{s.name}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer actions */}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      {selectedKeys.size} evento(s) selecionado(s) para importar
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setSyncOpen(false)}
                        className="px-4 py-2 border border-input rounded-md text-sm hover:bg-muted transition">Fechar</button>
                      <button onClick={doImport}
                        disabled={importing || selectedKeys.size === 0 || importDone.length > 0}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2">
                        {importing ? <><RefreshCw size={14} className="animate-spin" /> Importando...</> : 'Importar Selecionados'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

