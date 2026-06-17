'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { reportsApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Calendar, Users, TrendingUp, Download, FileText, Star, ChevronDown, ChevronUp } from 'lucide-react';

interface NpsEntry {
  id: string;
  score: number;
  comentario: string | null;
  respondenteName: string | null;
  submittedAt: string;
  event: { id: string; name: string; clientName: string; startAt: string | null };
}

interface NpsMonth {
  key: string;   // "2026-06"
  label: string; // "Junho 2026"
  avg: number;
  count: number;
  entries: NpsEntry[];
}

function npsScoreStyle(score: number) {
  if (score >= 9) return 'bg-green-100 text-green-700 border-green-300';
  if (score === 8) return 'bg-blue-100 text-blue-700 border-blue-300';
  if (score === 7) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
  return 'bg-red-100 text-red-700 border-red-300';
}

function npsBarColor(score: number) {
  if (score >= 9) return 'bg-green-500';
  if (score === 8) return 'bg-blue-500';
  if (score === 7) return 'bg-yellow-500';
  return 'bg-red-500';
}

const PT_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return `${PT_MONTHS[parseInt(m) - 1]} ${y}`;
}

function groupByMonth(entries: NpsEntry[]): NpsMonth[] {
  const map: Record<string, NpsEntry[]> = {};
  for (const e of entries) {
    const key = e.submittedAt.slice(0, 7);
    if (!map[key]) map[key] = [];
    map[key].push(e);
  }
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      label: monthLabel(key),
      avg: Math.round((items.reduce((s, i) => s + i.score, 0) / items.length) * 10) / 10,
      count: items.length,
      entries: items,
    }));
}

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
  const [npsMonths, setNpsMonths] = useState<NpsMonth[]>([]);
  const [npsLoading, setNpsLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
    loadNps();
  }, [dateRange]);

  async function loadReports() {
    try {
      setLoading(true);
      const response = await reportsApi.summary();
      setSummary({
        totalEvents: response.summary.totalEvents,
        totalGuests: response.summary.totalGuests,
        totalRevenue: 125000,
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

  async function loadNps() {
    try {
      setNpsLoading(true);
      const res = await reportsApi.nps();
      setNpsMonths(groupByMonth(res.entries || []));
    } catch {
      // NPS section fails silently
    } finally {
      setNpsLoading(false);
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

      {/* NPS por Mês */}
      <div className="mt-8 bg-card rounded-lg border shadow-sm">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <Star className="size-5 text-yellow-500" />
          <h2 className="text-lg font-medium text-card-foreground">NPS dos Organizadores por Mês</h2>
        </div>
        <div className="divide-y">
          {npsLoading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : npsMonths.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Nenhum NPS respondido ainda.
            </div>
          ) : (
            npsMonths.map((month) => (
              <div key={month.key}>
                {/* Month header row */}
                <button
                  onClick={() => setExpandedMonth(expandedMonth === month.key ? null : month.key)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/40 transition text-left"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-card-foreground w-40">{month.label}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-sm font-bold border ${npsScoreStyle(month.avg)}`}>
                      {month.avg.toFixed(1)} / 10
                    </span>
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${npsBarColor(month.avg)}`}
                          style={{ width: `${(month.avg / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">{month.count} {month.count === 1 ? 'resposta' : 'respostas'}</span>
                  </div>
                  {expandedMonth === month.key ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
                </button>

                {/* Expanded entries */}
                {expandedMonth === month.key && (
                  <div className="bg-muted/20 border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="px-6 py-2 font-medium">Evento</th>
                          <th className="px-4 py-2 font-medium">Contratante</th>
                          <th className="px-4 py-2 font-medium">Respondente</th>
                          <th className="px-4 py-2 font-medium">Nota</th>
                          <th className="px-4 py-2 font-medium">Comentário</th>
                          <th className="px-4 py-2 font-medium">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {month.entries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-muted/30">
                            <td className="px-6 py-3 font-medium">{entry.event.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{entry.event.clientName}</td>
                            <td className="px-4 py-3 text-muted-foreground">{entry.respondenteName || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${npsScoreStyle(entry.score)}`}>
                                {entry.score}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{entry.comentario || '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(entry.submittedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
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
