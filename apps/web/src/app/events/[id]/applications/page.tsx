'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { eventsApi, applicationsApi } from '@/lib/api';
import { formatDate, getStatusColor } from '@/lib/utils';
import { User, CheckCircle, XCircle, ArrowLeft, Briefcase } from 'lucide-react';

interface Application {
  id: string;
  freelancer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    specialty: string | null;
    rating: number;
  };
  role: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
}

export default function EventApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [applications, setApplications] = useState<Application[]>([]);
  const [event, setEvent] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    try {
      setLoading(true);
      const [eventRes, appsRes] = await Promise.all([
        eventsApi.get(eventId),
        applicationsApi.list(eventId),
      ]);
      setEvent(eventRes.event);
      setApplications(appsRes.applications.map((app: any) => ({
        id: app.id,
        freelancer: {
          id: app.freelancer.id,
          name: app.freelancer.name,
          email: app.freelancer.email,
          phone: app.freelancer.phone,
          specialty: 'Freelancer', // Default until schema has specialty
          rating: 4.5, // Default until schema has rating
        },
        role: app.role,
        status: app.status,
        appliedAt: app.appliedAt,
      })));
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar candidaturas');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(applicationId: string, status: 'approved' | 'rejected') {
    try {
      await applicationsApi.updateStatus(applicationId, status);
      setApplications(applications.map(app => 
        app.id === applicationId ? { ...app, status } : app
      ));
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar status');
    }
  }

  const filteredApps = filter === 'all' 
    ? applications 
    : applications.filter(a => a.status === filter);

  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para evento
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
          Candidaturas
        </h1>
        <p className="text-muted-foreground">
          {event?.name} • Gerencie as candidaturas de freelancers
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

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendentes' : f === 'approved' ? 'Aprovadas' : 'Rejeitadas'}
          </button>
        ))}
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
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Briefcase className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhuma candidatura encontrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <User className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">{app.freelancer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.role} • {app.freelancer.specialty} • Nota: {app.freelancer.rating}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Candidatou em {formatDate(app.appliedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(app.status)}`}>
                      {app.status === 'pending' ? 'Pendente' : app.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                    </span>
                    {app.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'approved')}
                          className="p-2 text-success hover:bg-success/10 rounded-md transition"
                          title="Aprovar"
                        >
                          <CheckCircle className="size-5" />
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'rejected')}
                          className="p-2 text-destructive hover:bg-destructive/10 rounded-md transition"
                          title="Rejeitar"
                        >
                          <XCircle className="size-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
