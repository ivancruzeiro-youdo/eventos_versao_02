'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, freelancerApi, ApiError } from '@/lib/api';

interface JobSlot {
  id: string;
  startAt: string | null;
  endAt: string | null;
  valuePerHour: number;
  maxSlots: number;
  notes: string | null;
  service: { id: string; name: string };
  event: {
    id: string;
    name: string;
    venues: { venue: { name: string; city?: string } }[];
  };
}

interface MyApplication {
  id: string;
  role: string;
  status: string;
  appliedAt: string;
  event: {
    id: string;
    name: string;
    venues: { venue: { name: string; city?: string } }[];
  };
  slot?: {
    startAt: string | null;
    endAt: string | null;
    valuePerHour: number;
    maxSlots: number;
  } | null;
}

function formatDateTime(dt: string | null) {
  if (!dt) return 'A definir';
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calcWorkload(startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return '—';
  const hours = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3600000;
  return `${hours.toFixed(1)}h`;
}

function calcTotal(valuePerHour: number, startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return `R$ ${valuePerHour.toFixed(2)}/h`;
  const hours = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3600000;
  return `R$ ${(valuePerHour * hours).toFixed(2)}`;
}

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<JobSlot[]>([]);
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [userRes, jobsRes, appsRes] = await Promise.all([
        authApi.me(),
        freelancerApi.jobs(),
        freelancerApi.applications(),
      ]);
      setUser(userRes.user);
      setJobs(jobsRes.jobs || []);
      setApplications(appsRes.applications || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/freelancer/login');
        return;
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    router.replace('/freelancer/login');
  }

  async function handleApply(jobId: string) {
    try {
      await freelancerApi.apply(jobId);
      alert('Candidatura enviada com sucesso!');
      loadData();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    }
  }

  async function handleCancel(appId: string) {
    if (!confirm('Cancelar esta candidatura?')) return;
    try {
      await freelancerApi.cancelApplication(appId);
      loadData();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-xs text-primary-foreground/70 leading-none">Portal do Freelancer</p>
              <p className="font-semibold leading-tight">{user?.name ?? '—'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 rounded-md bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Vagas para você</p>
            <p className="text-2xl font-bold text-primary">{jobs.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Candidaturas</p>
            <p className="text-2xl font-bold text-foreground">{applications.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Confirmados</p>
            <p className="text-2xl font-bold text-success">
              {applications.filter(a => a.status === 'approved').length}
            </p>
          </div>
        </div>

        {/* Available Jobs */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Vagas Disponíveis
          </h2>
          {jobs.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">Nenhuma vaga disponível para seu perfil no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="font-semibold text-foreground">{job.service.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <p className="text-sm text-muted-foreground">📍 {job.event.venues[0]?.venue.name || 'Local a definir'}{job.event.venues[0]?.venue.city ? `, ${job.event.venues[0].venue.city}` : ''}</p>
                        <p className="text-sm text-muted-foreground">⏱ Carga: <span className="font-medium text-foreground">{calcWorkload(job.startAt, job.endAt)}</span></p>
                        <p className="text-sm text-muted-foreground">� {formatDateTime(job.startAt)}</p>
                        <p className="text-sm text-muted-foreground">🕔 {formatDateTime(job.endAt)}</p>
                      </div>
                      {job.notes && <p className="text-xs text-muted-foreground italic">{job.notes}</p>}
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:min-w-[130px]">
                      <p className="text-lg font-bold text-success">{calcTotal(job.valuePerHour, job.startAt, job.endAt)}</p>
                      <button
                        onClick={() => handleApply(job.id)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors whitespace-nowrap"
                      >
                        Inscrever-se
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My Applications */}
        <section className="pb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Minhas Candidaturas
          </h2>
          {applications.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">Você ainda não se candidatou a nenhuma vaga.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div key={app.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="font-semibold text-foreground">{app.role}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <p className="text-sm text-muted-foreground">📍 {app.event.venues[0]?.venue.name || 'Local a definir'}{app.event.venues[0]?.venue.city ? `, ${app.event.venues[0].venue.city}` : ''}</p>
                        <p className="text-sm text-muted-foreground">⏱ Carga: <span className="font-medium text-foreground">{calcWorkload(app.slot?.startAt ?? null, app.slot?.endAt ?? null)}</span></p>
                        <p className="text-sm text-muted-foreground">� {formatDateTime(app.slot?.startAt ?? null)}</p>
                        <p className="text-sm text-muted-foreground">🕔 {formatDateTime(app.slot?.endAt ?? null)}</p>
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:min-w-[130px]">
                      {app.slot && (
                        <p className="text-lg font-bold text-success">{calcTotal(app.slot.valuePerHour, app.slot.startAt, app.slot.endAt)}</p>
                      )}
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        app.status === 'approved' ? 'bg-success/10 text-success' :
                        app.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                        'bg-warning/10 text-warning-foreground'
                      }`}>
                        {app.status === 'approved' ? '✓ Aprovado' : app.status === 'rejected' ? '✕ Rejeitado' : '○ Pendente'}
                      </span>
                      {app.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(app.id)}
                          className="text-sm px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
