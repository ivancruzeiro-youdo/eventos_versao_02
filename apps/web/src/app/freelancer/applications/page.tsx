'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { freelancerApi } from '@/lib/api';
import { formatDate, getStatusColor } from '@/lib/utils';
import { Briefcase, Calendar, MapPin, ArrowLeft, User, Clock, X } from 'lucide-react';

interface Slot {
  startAt: string | null;
  endAt: string | null;
}

interface Application {
  id: string;
  event: {
    id: string;
    name: string;
    startAt: string | null;
    status: string;
    venues: { venue: { name: string; city: string } }[];
    employer: { name: string };
    npsOrganizador?: { score: number | null; submittedAt: string | null } | null;
  };
  slot?: Slot | null;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
}

function fmtSlotRange(startAt: string | null | undefined, endAt: string | null | undefined): string | null {
  if (!startAt && !endAt) return null;
  const fmt = (dt: string) =>
    new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = startAt
    ? new Date(startAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : '';
  return `${dateStr ? dateStr + ' ' : ''}${startAt ? fmt(startAt) : '—'}–${endAt ? fmt(endAt) : '—'}`;
}

function NpsBadge({ nps, eventStatus }: { nps?: { score: number | null; submittedAt: string | null } | null; eventStatus: string }) {
  if (!nps && eventStatus !== 'encerrado') return null;
  if (!nps || nps.score === null || !nps.submittedAt) {
    if (eventStatus === 'encerrado') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
          NPS pendente
        </span>
      );
    }
    return null;
  }
  const score = nps.score;
  let cls = 'bg-red-50 text-red-700 border-red-200';
  if (score >= 9) cls = 'bg-green-50 text-green-700 border-green-200';
  else if (score === 8) cls = 'bg-blue-50 text-blue-700 border-blue-200';
  else if (score === 7) cls = 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      NPS {score}/10
    </span>
  );
}

export default function FreelancerApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    try {
      setLoading(true);
      const response = await freelancerApi.applications();
      setApplications(response.applications || []);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/freelancer/login');
        return;
      }
      setError(err.message || 'Erro ao carregar candidaturas');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(applicationId: string, role: string) {
    if (!confirm(`Cancelar candidatura para ${role}?`)) return;
    try {
      await freelancerApi.cancelApplication(applicationId);
      loadApplications();
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar candidatura');
    }
  }

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b bg-card flex items-center px-4 sticky top-0 z-10">
        <div className="flex items-center justify-between w-full max-w-5xl mx-auto">
          <Link href="/freelancer/dashboard" className="text-lg font-semibold text-primary">
            YouDO Freelancer
          </Link>
          <Link
            href="/freelancer/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Minhas Candidaturas
          </h1>
          <p className="text-muted-foreground">
            Acompanhe o status das suas candidaturas
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-card-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-card rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-warning">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
          <div className="bg-card rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-success">{stats.approved}</p>
            <p className="text-xs text-muted-foreground">Aprovadas</p>
          </div>
          <div className="bg-card rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.rejected}</p>
            <p className="text-xs text-muted-foreground">Rejeitadas</p>
          </div>
        </div>

        {/* Applications List */}
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive">{error}</p>
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="size-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-2">Você ainda não se candidatou a nenhum evento.</p>
                <Link href="/freelancer/dashboard" className="text-primary hover:underline">
                  Ver vagas disponíveis →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-card-foreground">{app.event.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(app.status)}`}>
                          {app.status === 'pending' ? 'Pendente' : app.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                        </span>
                        <NpsBadge nps={app.event.npsOrganizador} eventStatus={app.event.status || ''} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="size-4" />
                          {app.event.employer.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="size-4" />
                          {app.event.startAt ? formatDate(app.event.startAt) : 'Data a definir'}
                        </span>
                        {app.event.venues[0] && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-4" />
                            {app.event.venues[0].venue.city}
                          </span>
                        )}
                        {fmtSlotRange(app.slot?.startAt, app.slot?.endAt) && (
                          <span className="flex items-center gap-1">
                            <Clock className="size-4" />
                            {fmtSlotRange(app.slot?.startAt, app.slot?.endAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-primary mt-2">
                        Função: {app.role}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Candidatou em {formatDate(app.appliedAt)}
                      </p>
                    </div>
                    {(app.status === 'pending' || app.status === 'approved') && (
                      <button
                        onClick={() => handleCancel(app.id, app.role)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-muted-foreground hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors self-start"
                      >
                        <X className="size-4" />
                        Cancelar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
