'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Briefcase, 
  Calendar, 
  MapPin, 
  Clock, 
  DollarSign, 
  User,
  LogOut,
  Filter,
  Search,
  ChevronRight,
  AlertCircle
} from 'lucide-react';

interface Job {
  id: string;
  eventId: string;
  eventName: string;
  clientName: string;
  role: string;
  venue: string;
  startAt: string;
  endAt: string;
  hourlyRate: number;
  status: 'open' | 'filled' | 'closed';
  hasApplied: boolean;
}

interface FreelancerProfile {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone?: string;
  status: string;
  strikeCount: number;
}

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<FreelancerProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, applied, open
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProfile();
    loadJobs();
  }, []);

  async function loadProfile() {
    try {
      const response = await fetch('/api/v2/freelancers/me', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/freelancers/login');
          return;
        }
        throw new Error('Failed to load profile');
      }
      const data = await response.json();
      setProfile(data.freelancer);
    } catch (err) {
      setError('Erro ao carregar perfil');
    }
  }

  async function loadJobs() {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/freelancers/jobs', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      setError('Erro ao carregar vagas');
    } finally {
      setLoading(false);
    }
  }

  async function applyToJob(jobId: string) {
    try {
      const response = await fetch(`/api/v2/freelancers/jobs/${jobId}/apply`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        // Update local state
        setJobs(jobs.map(job => 
          job.id === jobId ? { ...job, hasApplied: true } : job
        ));
        alert('Candidatura enviada com sucesso!');
      } else {
        alert(data.error || 'Erro ao se candidatar');
      }
    } catch (err) {
      alert('Erro ao se candidatar. Tente novamente.');
    }
  }

  async function logout() {
    try {
      await fetch('/api/v2/freelancers/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      router.push('/freelancers/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  const filteredJobs = jobs.filter(job => {
    if (filter === 'applied') return job.hasApplied;
    if (filter === 'open') return !job.hasApplied && job.status === 'open';
    return true;
  }).filter(job => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      job.eventName.toLowerCase().includes(search) ||
      job.role.toLowerCase().includes(search) ||
      job.venue.toLowerCase().includes(search)
    );
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Briefcase className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">YOUDO Taxas</h1>
                <p className="text-xs text-muted-foreground">Portal do Freelancer</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/freelancers/profile" 
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <User className="size-4" />
                <span className="hidden sm:inline">{profile?.name}</span>
              </Link>
              <button 
                onClick={logout}
                className="p-2 hover:bg-accent rounded-lg text-muted-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
            <AlertCircle className="size-4" />
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Vagas Disponíveis</p>
            <p className="text-2xl font-bold">{jobs.filter(j => j.status === 'open' && !j.hasApplied).length}</p>
          </div>
          <div className="bg-card rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Minhas Candidaturas</p>
            <p className="text-2xl font-bold text-primary">{jobs.filter(j => j.hasApplied).length}</p>
          </div>
          <div className="bg-card rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Penalidades</p>
            <p className={`text-2xl font-bold ${profile?.strikeCount ? 'text-destructive' : 'text-green-500'}`}>
              {profile?.strikeCount || 0}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar vagas..."
              className="w-full pl-10 pr-4 py-2 bg-card border rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === 'all' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-card border hover:bg-accent'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilter('open')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === 'open' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-card border hover:bg-accent'
              }`}
            >
              Abertas
            </button>
            <button
              onClick={() => setFilter('applied')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === 'applied' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-card border hover:bg-accent'
              }`}
            >
              Candidatadas
            </button>
          </div>
        </div>

        {/* Jobs List */}
        <div className="space-y-4">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border">
              <Briefcase className="size-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm 
                  ? 'Nenhuma vaga encontrada para esta busca.' 
                  : filter === 'applied'
                  ? 'Você ainda não se candidatou a nenhuma vaga.'
                  : 'Não há vagas disponíveis no momento.'}
              </p>
            </div>
          ) : (
            filteredJobs.map((job) => (
              <div 
                key={job.id} 
                className={`bg-card rounded-lg border p-6 hover:border-primary/50 transition ${
                  job.hasApplied ? 'border-primary/30 bg-primary/5' : ''
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="size-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{job.role}</h3>
                        <p className="text-muted-foreground">{job.eventName}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="size-4" />
                        {formatDate(job.startAt)}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="size-4" />
                        {formatTime(job.startAt)} - {formatTime(job.endAt)}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="size-4" />
                        {job.venue}
                      </div>
                      <div className="flex items-center gap-2 text-green-600 font-medium">
                        <DollarSign className="size-4" />
                        R$ {job.hourlyRate.toFixed(2)}/h
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {job.hasApplied ? (
                      <span className="px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium flex items-center gap-2">
                        <ChevronRight className="size-4" />
                        Candidatado
                      </span>
                    ) : job.status === 'open' ? (
                      <button
                        onClick={() => applyToJob(job.id)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
                      >
                        Candidatar-se
                      </button>
                    ) : (
                      <span className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">
                        Vaga fechada
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
