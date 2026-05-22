'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi, freelancerApi } from '@/lib/api';

interface Job {
  id: string;
  event: {
    id: string;
    name: string;
    startAt: string;
    venues: { venue: { name: string } }[];
    employer: { name: string };
  };
  slots: {
    id: string;
    serviceId: string;
    quantity: number;
    filledCount: number;
    eventName: string;
  }[];
}

interface Service {
  id: string;
  name: string;
  hourlyRate: number;
  description?: string;
}

export default function FreelancerDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null); // slotId being applied

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load user first — redirect to login if not authenticated as freelancer
      const userRes = await authApi.me().catch(() => null);
      if (!userRes?.user || userRes.user.role !== 'freelancer') {
        window.location.href = '/freelancer/login';
        return;
      }
      setUser(userRes.user);

      const [jobsRes, appsRes, profileRes] = await Promise.all([
        freelancerApi.jobs(),
        freelancerApi.applications(),
        freelancerApi.profile(),
      ]);
      setJobs(jobsRes.jobs || []);
      setApplications(appsRes.applications || []);

      // Get freelancer services from profile
      const freelancerData = profileRes?.profile || profileRes?.freelancer;
      if (freelancerData?.services) {
        setServices(freelancerData.services.map((s: any) => s.service));
      }
    } catch (err) {
      console.error(err);
      window.location.href = '/freelancer/login';
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(eventId: string, slotId: string, serviceName: string) {
    setApplying(slotId);
    try {
      await freelancerApi.apply(eventId, serviceName);
      await loadData();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setApplying(null);
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

        {/* My Services */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Meus Serviços Autorizados</h2>
          </div>
          <div className="p-6">
            {services.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhum serviço autorizado. Entre em contato com o administrador.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {services.map((service) => (
                  <span key={service.id} className="px-3 py-2 bg-primary-100 text-primary-800 rounded-lg text-sm font-medium">
                    {service.name}
                    {service.hourlyRate > 0 && ` (R$ ${service.hourlyRate}/h)`}
                  </span>
                ))}
              </div>
            )}
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
                Nenhuma vaga disponível no momento para os seus serviços.
              </p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{job.event.name}</h3>
                        <p className="text-sm text-gray-500">
                          📍 {job.event.venues[0]?.venue.name || 'Local a definir'}
                        </p>
                        <p className="text-sm text-gray-500">
                          📅 {new Date(job.event.startAt).toLocaleDateString('pt-BR')} às {new Date(job.event.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-sm text-gray-500">
                          🏢 {job.event.employer?.name}
                        </p>
                        <div className="mt-3 space-y-2">
                          <p className="text-sm font-medium text-gray-700">Vagas disponíveis:</p>
                          {job.slots.map((slot) => {
                            const alreadyApplied = applications.some(
                              a => a.eventId === job.event.id && a.role === slot.eventName
                            );
                            return (
                              <div key={slot.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                                <div>
                                  <span className="text-sm font-medium">{slot.eventName}</span>
                                  <span className="text-xs text-gray-500 ml-2">
                                    ({slot.filledCount}/{slot.quantity} preenchidas)
                                  </span>
                                </div>
                                {alreadyApplied ? (
                                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                    ✓ Candidatado
                                  </span>
                                ) : slot.filledCount < slot.quantity ? (
                                  <button
                                    onClick={() => handleApply(job.event.id, slot.id, slot.eventName)}
                                    disabled={applying === slot.id}
                                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium disabled:opacity-50 transition-colors"
                                  >
                                    {applying === slot.id ? 'Enviando...' : 'Candidatar-se'}
                                  </button>
                                ) : (
                                  <span className="px-3 py-1 bg-gray-200 text-gray-500 rounded text-xs">
                                    Vagas esgotadas
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                      <p className="font-medium">{app.event?.name || 'Evento'}</p>
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
