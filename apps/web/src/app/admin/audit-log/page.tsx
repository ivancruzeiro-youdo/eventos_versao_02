'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { formatDateTime } from '@/lib/utils';
import { History, Search, Filter, User, FileText, Edit, Trash2 } from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  user: { name: string; email: string };
  details: Record<string, any>;
  createdAt: string;
}

export default function AdminAuditLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      setLoading(true);
      // TODO: Add admin audit log API
      setLogs([
        { id: '1', action: 'CREATE', entityType: 'Event', entityId: 'evt-123', user: { name: 'João Silva', email: 'joao@empresa.com' }, details: { name: 'Evento Aniversário' }, createdAt: '2024-01-20T10:30:00Z' },
        { id: '2', action: 'UPDATE', entityType: 'Guest', entityId: 'gst-456', user: { name: 'Maria Souza', email: 'maria@empresa.com' }, details: { status: 'confirmed' }, createdAt: '2024-01-20T09:15:00Z' },
        { id: '3', action: 'DELETE', entityType: 'File', entityId: 'file-789', user: { name: 'Admin', email: 'admin@youdo.com' }, details: { filename: 'contrato.pdf' }, createdAt: '2024-01-19T16:45:00Z' },
      ]);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  }

  function getActionIcon(action: string) {
    switch (action) {
      case 'CREATE': return <FileText className="size-4 text-success" />;
      case 'UPDATE': return <Edit className="size-4 text-primary" />;
      case 'DELETE': return <Trash2 className="size-4 text-destructive" />;
      default: return <History className="size-4 text-muted-foreground" />;
    }
  }

  function getActionColor(action: string) {
    switch (action) {
      case 'CREATE': return 'bg-success/10 text-success';
      case 'UPDATE': return 'bg-primary/10 text-primary';
      case 'DELETE': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  }

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.user.name.toLowerCase().includes(search.toLowerCase()) ||
                         log.entityType.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || log.action === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Logs de Auditoria</h1>
        <p className="text-muted-foreground">Histórico de ações no sistema</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todas ações</option>
            <option value="CREATE">Criação</option>
            <option value="UPDATE">Atualização</option>
            <option value="DELETE">Exclusão</option>
          </select>
        </div>
      </div>

      {/* Logs List */}
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
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <History className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum log encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    {getActionIcon(log.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {log.entityType} #{log.entityId.slice(-6)}
                      </span>
                    </div>
                    <p className="text-sm text-card-foreground">
                      {log.user.name} ({log.user.email})
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(log.createdAt)}
                    </p>
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
