'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { formatDate } from '@/lib/utils';
import { AlertTriangle, Plus, Search, User, Calendar, AlertCircle } from 'lucide-react';

interface Penalty {
  id: string;
  freelancer: { id: string; name: string; email: string };
  event: { id: string; name: string; startAt: string };
  reason: string;
  severity: 'low' | 'medium' | 'high';
  appliedBy: { name: string };
  appliedAt: string;
}

export default function AdminPenaltiesPage() {
  const router = useRouter();
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadPenalties();
  }, []);

  async function loadPenalties() {
    try {
      setLoading(true);
      // TODO: Add admin penalties API
      setPenalties([
        {
          id: '1',
          freelancer: { id: 'f1', name: 'João Silva', email: 'joao@freelancer.com' },
          event: { id: 'e1', name: 'Casamento Silva', startAt: '2024-01-15T00:00:00Z' },
          reason: 'Não compareceu ao evento sem aviso prévio',
          severity: 'high',
          appliedBy: { name: 'Admin' },
          appliedAt: '2024-01-16T10:00:00Z',
        },
        {
          id: '2',
          freelancer: { id: 'f2', name: 'Maria Souza', email: 'maria@freelancer.com' },
          event: { id: 'e2', name: 'Festa Corporativa', startAt: '2024-01-10T00:00:00Z' },
          reason: 'Chegou 2 horas atrasado',
          severity: 'medium',
          appliedBy: { name: 'Operador' },
          appliedAt: '2024-01-11T14:30:00Z',
        },
      ]);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar penalidades');
    } finally {
      setLoading(false);
    }
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'high': return 'bg-destructive/10 text-destructive';
      case 'medium': return 'bg-warning/10 text-warning';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  }

  function getSeverityLabel(severity: string) {
    switch (severity) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return severity;
    }
  }

  const filteredPenalties = penalties.filter(p =>
    p.freelancer.name.toLowerCase().includes(search.toLowerCase()) ||
    p.reason.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Penalidades</h1>
          <p className="text-muted-foreground">Gerencie penalidades aplicadas a freelancers</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2">
          <Plus className="size-4" />
          Nova Penalidade
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar penalidades..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Penalties List */}
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
          ) : filteredPenalties.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhuma penalidade registrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPenalties.map((penalty) => (
                <div
                  key={penalty.id}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="size-5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-card-foreground">
                        {penalty.freelancer.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(penalty.severity)}`}>
                        {getSeverityLabel(penalty.severity)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{penalty.reason}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        Evento: {penalty.event.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        Aplicado por: {penalty.appliedBy.name}
                      </span>
                      <span>{formatDate(penalty.appliedAt)}</span>
                    </div>
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
