'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import EventCard from '@/components/EventCard';
import { eventsApi } from '@/lib/api';

interface Event {
  id: string;
  name: string;
  clientName: string;
  status: string;
  startAt: string | null;
  venues: { venue: { name: string } }[];
  _count?: { guests: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      setLoading(true);
      const response = await eventsApi.list();
      setEvents(response.events || []);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Unauthorized') || err.message?.includes('Authentication')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar eventos');
    } finally {
      setLoading(false);
    }
  }

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.status === filter);

  const activeEvents = events.filter(e => ['confirmed', 'in_progress'].includes(e.status)).length;
  const confirmedGuests = events.reduce((acc, e) => acc + (e._count?.guests || 0), 0);

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral dos seus eventos</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          title="Eventos Ativos" 
          value={activeEvents} 
          icon="calendar" 
          trend="+2 este mês"
        />
        <StatCard 
          title="Convidados Confirmados" 
          value={confirmedGuests} 
          icon="users" 
        />
        <StatCard 
          title="Freelancers Ativos" 
          value={0} 
          icon="briefcase" 
        />
      </div>

      {/* Events Section */}
      <div className="bg-card rounded-lg border shadow-sm">
        <div className="px-6 py-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-medium text-card-foreground">Meus Eventos</h2>
          <div className="flex gap-2">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            >
              <option value="all">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="confirmed">Confirmados</option>
              <option value="in_progress">Em Andamento</option>
              <option value="completed">Concluídos</option>
            </select>
            <Link 
              href="/events/new"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition text-sm font-medium"
            >
              + Novo Evento
            </Link>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-4">Carregando eventos...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-destructive">{error}</p>
              <button 
                onClick={loadEvents}
                className="mt-2 text-primary hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhum evento encontrado.</p>
              <Link 
                href="/events/new"
                className="mt-2 inline-block text-primary hover:underline"
              >
                Criar primeiro evento →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
