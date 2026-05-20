'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { reportsApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Calendar, Users, TrendingUp, Download, FileText } from 'lucide-react';

interface ReportSummary {
  totalEvents: number;
  totalGuests: number;
  totalRevenue: number;
  eventsByStatus: Record<string, number>;
  eventsByMonth: { month: string; count: number }[];
}

export default function ReportsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('last30');

  useEffect(() => {
    loadReports();
  }, [dateRange]);

  async function loadReports() {
    try {
      setLoading(true);
      const response = await reportsApi.summary();
      setSummary({
        totalEvents: response.summary.totalEvents,
        totalGuests: response.summary.totalGuests,
        totalRevenue: 125000, // Mock until billing integration
        eventsByStatus: response.summary.eventsByStatus,
        eventsByMonth: [
          { month: 'Jan', count: 2 },
          { month: 'Fev', count: 3 },
          { month: 'Mar', count: 4 },
          { month: 'Abr', count: 3 },
          { month: 'Mai', count: 3 },
        ],
      });
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Relatórios</h1>
          <p className="text-muted-foreground">Análise e métricas dos eventos</p>
        </div>
        <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition text-sm font-medium flex items-center gap-2">
          <Download className="size-4" />
          Exportar CSV
        </button>
      </div>

      {/* Date Filter */}
      <div className="mb-6">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
        >
          <option value="last7">Últimos 7 dias</option>
          <option value="last30">Últimos 30 dias</option>
          <option value="last90">Últimos 90 dias</option>
          <option value="thisYear">Este ano</option>
        </select>
      </div>

      {/* Stats Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Eventos</p>
                <p className="text-3xl font-bold text-card-foreground mt-2">{summary.totalEvents}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="size-5 text-muted-foreground" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Convidados</p>
                <p className="text-3xl font-bold text-card-foreground mt-2">{summary.totalGuests}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Users className="size-5 text-muted-foreground" />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Receita Total</p>
                <p className="text-3xl font-bold text-card-foreground mt-2">
                  {formatCurrency(summary.totalRevenue)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <TrendingUp className="size-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events by Status */}
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-card-foreground">Eventos por Status</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : summary ? (
              <div className="space-y-3">
                {Object.entries(summary.eventsByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground capitalize">{status}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(count / summary.totalEvents) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-card-foreground">Eventos por Mês</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : summary ? (
              <div className="flex items-end justify-between h-40 gap-2">
                {summary.eventsByMonth.map((item) => (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-primary/20 rounded-t-md relative group"
                      style={{ height: `${(item.count / 4) * 100}%` }}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-md transition-all"
                        style={{ height: '100%' }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.month}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Available Reports */}
      <div className="mt-8 bg-card rounded-lg border shadow-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-card-foreground">Relatórios Disponíveis</h2>
        </div>
        <div className="divide-y">
          {[
            { name: 'Relatório de Eventos', desc: 'Lista completa de eventos com detalhes', icon: Calendar },
            { name: 'Relatório de Convidados', desc: 'Lista de convidados por evento', icon: Users },
            { name: 'Relatório Financeiro', desc: 'Receitas e despesas por evento', icon: TrendingUp },
            { name: 'Relatório de Freelancers', desc: 'Performance e avaliações', icon: FileText },
          ].map((report) => (
            <div key={report.name} className="px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <report.icon className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-card-foreground">{report.name}</p>
                  <p className="text-sm text-muted-foreground">{report.desc}</p>
                </div>
              </div>
              <button className="px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-md transition">
                Gerar
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
