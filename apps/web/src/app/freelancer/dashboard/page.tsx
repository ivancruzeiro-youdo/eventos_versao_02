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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">Portal do Freelancer</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm">Olá, {user?.name}</span>
              <button 
                onClick={handleLogout}
                className="text-sm bg-indigo-700 px-3 py-1 rounded hover:bg-indigo-800"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Vagas Disponíveis</p>
            <p className="text-2xl font-bold text-indigo-600">{jobs.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Minhas Candidaturas</p>
            <p className="text-2xl font-bold text-blue-600">{applications.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Trabalhos Confirmados</p>
            <p className="text-2xl font-bold text-green-600">
              {applications.filter(a => a.status === 'approved').length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Score</p>
            <p className="text-2xl font-bold text-purple-600">{user?.freelancer?.score || 100}</p>
          </div>
        </div>

        {/* Available Jobs */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Vagas Disponíveis</h2>
          </div>
          <div className="p-6">
            {jobs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Nenhuma vaga disponível no momento.</p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-800">{job.service.name}</p>
                        <p className="text-sm text-gray-500">📍 {job.event.venues[0]?.venue.name || 'Local a definir'}{job.event.venues[0]?.venue.city ? ` — ${job.event.venues[0].venue.city}` : ''}</p>
                        <p className="text-sm text-gray-500">� Início: {formatDateTime(job.startAt)}</p>
                        <p className="text-sm text-gray-500">🕔 Fim: {formatDateTime(job.endAt)}</p>
                        <p className="text-sm text-gray-500">⏱ Carga: {calcWorkload(job.startAt, job.endAt)}</p>
                        {job.notes && <p className="text-sm text-gray-400 italic">{job.notes}</p>}
                      </div>
                      <div className="flex flex-col items-end justify-between gap-3 min-w-[140px]">
                        <p className="text-xl font-bold text-green-600">{calcTotal(job.valuePerHour, job.startAt, job.endAt)}</p>
                        <button
                          onClick={() => handleApply(job.id)}
                          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                        >
                          Inscrever-se
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* My Applications */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Minhas Candidaturas</h2>
          </div>
          <div className="p-6">
            {applications.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Você ainda não se candidatou a nenhuma vaga.</p>
            ) : (
              <div className="space-y-4">
                {applications.map((app) => (
                  <div key={app.id} className="border rounded-lg p-4">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-800">{app.role}</p>
                        <p className="text-sm text-gray-500">📍 {app.event.venues[0]?.venue.name || 'Local a definir'}{app.event.venues[0]?.venue.city ? ` — ${app.event.venues[0].venue.city}` : ''}</p>
                        <p className="text-sm text-gray-500">🕐 Início: {formatDateTime(app.slot?.startAt ?? null)}</p>
                        <p className="text-sm text-gray-500">🕔 Fim: {formatDateTime(app.slot?.endAt ?? null)}</p>
                        <p className="text-sm text-gray-500">⏱ Carga: {calcWorkload(app.slot?.startAt ?? null, app.slot?.endAt ?? null)}</p>
                      </div>
                      <div className="flex flex-col items-end justify-between gap-3 min-w-[140px]">
                        <div className="flex flex-col items-end gap-1">
                          {app.slot && <p className="text-lg font-bold text-green-600">{calcTotal(app.slot.valuePerHour, app.slot.startAt, app.slot.endAt)}</p>}
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            app.status === 'approved' ? 'bg-green-100 text-green-800' :
                            app.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {app.status === 'approved' ? 'Aprovado' : app.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                        </div>
                        {app.status === 'pending' && (
                          <button
                            onClick={() => handleCancel(app.id)}
                            className="w-full px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 text-sm font-medium"
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
          </div>
        </div>
      </main>
    </div>
  );
}
