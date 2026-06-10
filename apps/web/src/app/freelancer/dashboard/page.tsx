'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi, freelancerApi, ApiError } from '@/lib/api';

interface Job {
  id: string;
  role: string;
  shift: string;
  compensation: number;
  event: {
    id: string;
    name: string;
    startAt: string;
    venues: { venue: { name: string } }[];
  };
}

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
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

  async function handleApply(jobId: string, role: string) {
    try {
      await freelancerApi.apply(jobId, role);
      alert('Candidatura enviada com sucesso!');
      loadData();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">Portal do Freelancer</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm">Olá, {user?.name}</span>
              <button 
                onClick={() => authApi.logout()}
                className="text-sm bg-primary-700 px-3 py-1 rounded hover:bg-primary-800"
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
            <p className="text-2xl font-bold text-primary-600">{jobs.length}</p>
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
              <p className="text-gray-500 text-center py-8">
                Nenhuma vaga disponível no momento.
              </p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-gray-900">{job.event.name}</h3>
                        <p className="text-sm text-gray-500">
                          📍 {job.event.venues[0]?.venue.name || 'Local a definir'}
                        </p>
                        <p className="text-sm text-gray-500">
                          📅 {new Date(job.event.startAt).toLocaleDateString('pt-BR')}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            {job.role}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                            {job.shift}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="font-bold text-green-600">
                          R$ {job.compensation}
                        </p>
                        <button
                          onClick={() => handleApply(job.id, job.role)}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                        >
                          Candidatar-se
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
              <p className="text-gray-500 text-center py-8">
                Você ainda não se candidatou a nenhuma vaga.
              </p>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{app.job?.event?.name || 'Evento'}</p>
                      <p className="text-sm text-gray-500">{app.role}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      app.status === 'approved' ? 'bg-green-100 text-green-800' :
                      app.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {app.status === 'approved' ? 'Aprovado' :
                       app.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                    </span>
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
