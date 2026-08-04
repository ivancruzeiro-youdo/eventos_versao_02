'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import EventCard from '@/components/EventCard';
import AiChatWidget from '@/components/AiChatWidget';
import { eventsApi, authApi } from '@/lib/api';
import { AlertTriangle, Calendar, CheckCircle2, ListTodo } from 'lucide-react';

interface Event {
  id: string;
  name: string;
  clientName: string;
  status: string;
  startAt: string | null;
  setupAt: string | null;
  venues: { venue: { name: string } }[];
  _count?: { guests: number };
}

interface MyActivity {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: string;
  event: { id: string; name: string; startAt: string | null };
}

function sameLocalDay(iso: string | null, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

function fmtDue(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [activities, setActivities] = useState<MyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // O assistente de dados IA roda SQL livre no banco — só admin vê (o backend também
  // exige requireRole(['admin']), isso aqui é só pra não mostrar uma seção que daria 403).
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [evRes, actRes, meRes] = await Promise.allSettled([
        eventsApi.list(),
        fetch('/api/v2/my/activities', { credentials: 'include' }).then(r => r.ok ? r.json() : { activities: [] }),
        authApi.me(),
      ]);
      if (evRes.status === 'fulfilled') setEvents(evRes.value.events || []);
      else setError('Erro ao carregar eventos');
      if (actRes.status === 'fulfilled') setActivities(actRes.value.activities || []);
      if (meRes.status === 'fulfilled') setIsAdmin(meRes.value.user?.role === 'admin');
    } finally {
      setLoading(false);
    }
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const relevantDate = (e: Event) => e.startAt ?? e.setupAt;
  const eventsToday = events.filter(e => sameLocalDay(relevantDate(e), today));
  const eventsTomorrow = events.filter(e => sameLocalDay(relevantDate(e), tomorrow));

  const activeEvents = events.filter(e => ['confirmed', 'in_progress'].includes(e.status)).length;
  const now = new Date();
  const overdueCount = activities.filter(a => a.dueAt && new Date(a.dueAt) < now).length;

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Eventos de hoje e amanhã, e suas atividades pendentes</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Eventos Ativos" value={activeEvents} icon="calendar" />
        <StatCard title="Eventos Hoje" value={eventsToday.length} icon="calendar" />
        <StatCard title="Minhas Atividades Pendentes" value={activities.length} icon="briefcase" />
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-4">Carregando…</p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-destructive">{error}</p>
          <button onClick={load} className="mt-2 text-primary hover:underline">Tentar novamente</button>
        </div>
      ) : (
        <div className="space-y-8">

          {/* Assistente de Dados (IA) — só admin */}
          {isAdmin && <AiChatWidget />}

          {/* Minhas Atividades */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <ListTodo className="size-5 text-primary" />
              <h2 className="text-lg font-medium text-card-foreground">Minhas Atividades</h2>
              {overdueCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-destructive/10 text-destructive text-xs font-semibold rounded-full">
                  {overdueCount} atrasada{overdueCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="p-4">
              {activities.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                  <CheckCircle2 className="size-4 text-green-500" />
                  Nenhuma atividade pendente. Bom trabalho!
                </div>
              ) : (
                <div className="divide-y">
                  {activities.map(act => {
                    const overdue = act.dueAt && new Date(act.dueAt) < now;
                    return (
                      <Link
                        key={act.id}
                        href={`/events/${act.event.id}`}
                        className="flex items-center gap-3 py-3 px-2 hover:bg-muted/40 rounded-md transition"
                      >
                        {overdue
                          ? <AlertTriangle className="size-4 text-destructive flex-shrink-0" />
                          : <Calendar className="size-4 text-muted-foreground flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${overdue ? 'text-destructive' : ''}`}>{act.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{act.event.name}</p>
                        </div>
                        {act.dueAt && (
                          <span className={`text-xs flex-shrink-0 ${overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                            {fmtDue(act.dueAt)}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Eventos de Hoje */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-medium text-card-foreground">Eventos de Hoje</h2>
              <Link href="/events" className="text-sm text-primary hover:underline">Ver todos os eventos →</Link>
            </div>
            <div className="p-6">
              {eventsToday.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhum evento hoje.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {eventsToday.map(event => <EventCard key={event.id} event={event} />)}
                </div>
              )}
            </div>
          </div>

          {/* Eventos de Amanhã */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Eventos de Amanhã</h2>
            </div>
            <div className="p-6">
              {eventsTomorrow.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhum evento amanhã.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {eventsTomorrow.map(event => <EventCard key={event.id} event={event} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
