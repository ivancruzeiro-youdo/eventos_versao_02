'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { degustacoesApi } from '@/lib/api';
import { Wine, Plus, MapPin, Users, Calendar } from 'lucide-react';

interface DegustacaoEvent {
  id: string;
  name: string;
  startAt: string | null;
  venues: { venue: { name: string } }[];
  degustacao: {
    visibility: string;
    maxGuests: number;
    seriesId: string | null;
    product: { id: string; name: string } | null;
    linksTotal: number;
    linksConfirmed: number;
    enrollmentsCount: number;
  } | null;
  _count?: { guests: number };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Sem data';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DegustacoesPage() {
  const router = useRouter();
  const [events, setEvents] = useState<DegustacaoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const res = await degustacoesApi.list();
      setEvents(res.degustacoes || []);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar degustações');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Degustações</h1>
          <p className="text-muted-foreground">Ocorrências de degustação — cada uma é um evento no calendário</p>
        </div>
        <Link href="/degustacoes/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2">
          <Plus className="size-4" />
          Nova Degustação
        </Link>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-4">Carregando degustações...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-destructive">{error}</p>
              <button onClick={load} className="mt-2 text-primary hover:underline">Tentar novamente</button>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Wine className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhuma degustação cadastrada.</p>
              <Link href="/degustacoes/new" className="mt-2 inline-block text-primary hover:underline">
                Criar primeira degustação →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => (
                <Link key={event.id} href={`/events/${event.id}`} className="block">
                  <div className="bg-card rounded-lg border hover:border-primary/50 transition p-6 cursor-pointer h-full">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Wine className="size-4 text-muted-foreground" />
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        event.degustacao?.visibility === 'publico'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {event.degustacao?.visibility === 'publico' ? 'Público' : 'Contrato'}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-card-foreground truncate">{event.name}</h3>
                    <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
                      <Calendar className="size-3.5 shrink-0" /> {formatDateTime(event.startAt)}
                    </p>
                    {event.venues[0] && (
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" /> {event.venues[0].venue.name}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                      <Users className="size-3.5 shrink-0" />
                      {event.degustacao?.visibility === 'publico'
                        ? `${event.degustacao.linksConfirmed} inscrito${event.degustacao.linksConfirmed !== 1 ? 's' : ''} · ${event.degustacao.linksTotal} link${event.degustacao.linksTotal !== 1 ? 's' : ''} gerado${event.degustacao.linksTotal !== 1 ? 's' : ''}`
                        : `${event.degustacao?.enrollmentsCount ?? 0} inscri${(event.degustacao?.enrollmentsCount ?? 0) !== 1 ? 'ções' : 'ção'}`}
                    </p>
                    {event.degustacao?.product && (
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">Menu: {event.degustacao.product.name}</p>
                    )}
                    {event.degustacao?.seriesId && (
                      <p className="text-xs text-muted-foreground mt-1">Parte de uma série recorrente</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
