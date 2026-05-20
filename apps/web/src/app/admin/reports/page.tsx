'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Users, 
  DollarSign, 
  TrendingUp,
  FileText,
  Filter
} from 'lucide-react';

interface ReportData {
  totalEvents: number;
  totalGuests: number;
  totalRevenue: number;
  eventsByMonth: { month: string; count: number }[];
  guestsByStatus: { status: string; count: number }[];
  topClients: { name: string; events: number; guests: number }[];
}

export default function AdminReportsPage() {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  async function generateReport() {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock data
      setReportData({
        totalEvents: 45,
        totalGuests: 1250,
        totalRevenue: 125000,
        eventsByMonth: [
          { month: 'Jan', count: 5 },
          { month: 'Fev', count: 8 },
          { month: 'Mar', count: 12 },
          { month: 'Abr', count: 7 },
          { month: 'Mai', count: 9 },
          { month: 'Jun', count: 4 },
        ],
        guestsByStatus: [
          { status: 'Confirmado', count: 850 },
          { status: 'Pendente', count: 280 },
          { status: 'Check-in', count: 120 },
        ],
        topClients: [
          { name: 'Empresa ABC', events: 12, guests: 450 },
          { name: 'Corp XYZ', events: 8, guests: 320 },
          { name: 'Tech Solutions', events: 5, guests: 180 },
        ],
      });
    } catch (err) {
      console.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generateReport();
  }, []);

  function downloadCSV(data: any[], filename: string) {
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h]).join(',')),
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="px-3 py-2 bg-card border rounded-lg"
          />
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="px-3 py-2 bg-card border rounded-lg"
          />
          <button
            onClick={generateReport}
            disabled={loading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2"
          >
            <Filter className="size-4" />
            {loading ? 'Gerando...' : 'Gerar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'overview' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-card border hover:bg-accent'
          }`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'events' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-card border hover:bg-accent'
          }`}
        >
          Eventos
        </button>
        <button
          onClick={() => setActiveTab('guests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'guests' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-card border hover:bg-accent'
          }`}
        >
          Convidados
        </button>
        <button
          onClick={() => setActiveTab('financial')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'financial' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-card border hover:bg-accent'
          }`}
        >
          Financeiro
        </button>
      </div>

      {reportData && (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Calendar className="size-5 text-blue-600" />
                    </div>
                    <p className="text-sm text-muted-foreground">Total de Eventos</p>
                  </div>
                  <p className="text-3xl font-bold">{reportData.totalEvents}</p>
                </div>
                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Users className="size-5 text-green-600" />
                    </div>
                    <p className="text-sm text-muted-foreground">Total de Convidados</p>
                  </div>
                  <p className="text-3xl font-bold">{reportData.totalGuests}</p>
                </div>
                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="size-5 text-purple-600" />
                    </div>
                    <p className="text-sm text-muted-foreground">Receita Total</p>
                  </div>
                  <p className="text-3xl font-bold">
                    R$ {reportData.totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <BarChart3 className="size-4" />
                      Eventos por Mês
                    </h3>
                    <button 
                      onClick={() => downloadCSV(reportData.eventsByMonth.map(m => ({ mes: m.month, quantidade: m.count })), 'eventos-por-mes.csv')}
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Download className="size-3" />
                      Exportar
                    </button>
                  </div>
                  <div className="space-y-2">
                    {reportData.eventsByMonth.map((item) => (
                      <div key={item.month} className="flex items-center gap-3">
                        <span className="w-10 text-sm text-muted-foreground">{item.month}</span>
                        <div className="flex-1 h-8 bg-secondary rounded-lg overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-lg transition-all"
                            style={{ width: `${(item.count / 12) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-sm font-medium">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card rounded-lg border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <TrendingUp className="size-4" />
                      Status dos Convidados
                    </h3>
                    <button 
                      onClick={() => downloadCSV(reportData.guestsByStatus.map(s => ({ status: s.status, quantidade: s.count })), 'status-convidados.csv')}
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Download className="size-3" />
                      Exportar
                    </button>
                  </div>
                  <div className="space-y-3">
                    {reportData.guestsByStatus.map((item) => (
                      <div key={item.status} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                        <span className="text-sm">{item.status}</span>
                        <span className="font-semibold">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top Clients */}
              <div className="bg-card rounded-lg border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <FileText className="size-4" />
                    Top Clientes
                  </h3>
                  <button 
                    onClick={() => downloadCSV(reportData.topClients.map(c => ({ cliente: c.name, eventos: c.events, convidados: c.guests })), 'top-clientes.csv')}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <Download className="size-3" />
                    Exportar
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Cliente</th>
                        <th className="text-center py-2 px-3 text-sm font-medium text-muted-foreground">Eventos</th>
                        <th className="text-center py-2 px-3 text-sm font-medium text-muted-foreground">Convidados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topClients.map((client) => (
                        <tr key={client.name} className="border-b last:border-0">
                          <td className="py-3 px-3">{client.name}</td>
                          <td className="py-3 px-3 text-center">{client.events}</td>
                          <td className="py-3 px-3 text-center">{client.guests}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="bg-card rounded-lg border p-6">
              <h3 className="font-medium mb-4">Relatório de Eventos</h3>
              <p className="text-muted-foreground">Em desenvolvimento...</p>
            </div>
          )}

          {activeTab === 'guests' && (
            <div className="bg-card rounded-lg border p-6">
              <h3 className="font-medium mb-4">Relatório de Convidados</h3>
              <p className="text-muted-foreground">Em desenvolvimento...</p>
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="bg-card rounded-lg border p-6">
              <h3 className="font-medium mb-4">Relatório Financeiro</h3>
              <p className="text-muted-foreground">Em desenvolvimento...</p>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
