'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Building2, Plus, Search, Users, Calendar, Edit2, Trash2 } from 'lucide-react';

interface Employer {
  id: string;
  name: string;
  cnpj: string | null;
  contactEmail: string | null;
  _count: { users: number; events: number };
  createdAt: string;
}

export default function AdminEmployersPage() {
  const router = useRouter();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadEmployers();
  }, []);

  async function loadEmployers() {
    try {
      setLoading(true);
      const response = await adminApi.employers();
      setEmployers(response.employers);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar employers');
    } finally {
      setLoading(false);
    }
  }

  const filteredEmployers = employers.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Empresas</h1>
          <p className="text-muted-foreground">Gerencie as empresas cadastradas</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2">
          <Plus className="size-4" />
          Nova Empresa
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar empresas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Employers List */}
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
          ) : filteredEmployers.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Building2 className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhuma empresa encontrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEmployers.map((employer) => (
                <div
                  key={employer.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">{employer.name}</p>
                      <p className="text-sm text-muted-foreground">{employer.cnpj}</p>
                      <p className="text-sm text-muted-foreground">{employer.contactEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="size-4" />
                        {employer._count.users} usuários
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-4" />
                        {employer._count.events} eventos
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Desde {formatDate(employer.createdAt)}
                    </span>
                    <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition">
                      <Edit2 className="size-4" />
                    </button>
                    <button className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition">
                      <Trash2 className="size-4" />
                    </button>
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
