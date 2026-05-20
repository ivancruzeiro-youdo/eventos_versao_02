'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { User, Plus, Search, Edit2, Trash2 } from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'event_owner' | 'operator';
  employer?: { name: string };
  createdAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const response = await adminApi.users();
      setUsers(response.users || []);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('403')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = (users || []).filter(u => 
    u?.name?.toLowerCase().includes(search.toLowerCase()) ||
    u?.email?.toLowerCase().includes(search.toLowerCase())
  );

  function getRoleLabel(role: string) {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      event_owner: 'Proprietário',
      operator: 'Operador',
    };
    return labels[role] || role;
  }

  function getRoleColor(role: string) {
    const colors: Record<string, string> = {
      admin: 'bg-primary/10 text-primary',
      event_owner: 'bg-success/10 text-success',
      operator: 'bg-muted text-muted-foreground',
    };
    return colors[role] || 'bg-muted text-muted-foreground';
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2">
          <Plus className="size-4" />
          Novo Usuário
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar usuários..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Users List */}
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
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <User className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      {user.employer && (
                        <p className="text-xs text-muted-foreground">{user.employer.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
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
