'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { User, Plus, Search, Edit2, Trash2, Download, X, Check, Loader2, ChevronDown, Phone } from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'event_owner' | 'operator';
  userpCodigo?: string | null;
  phone?: string | null;
  employer?: { name: string };
  createdAt: string;
}

interface UserpUser {
  codigo: string;
  nome: string;
  email: string;
  alreadyImported: boolean;
  existingRole: string | null;
  existingId: string | null;
}

interface EmployerData {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  event_owner: 'Proprietário',
  operator: 'Operador',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-primary/10 text-primary',
  event_owner: 'bg-success/10 text-success',
  operator: 'bg-muted text-muted-foreground',
};

function RoleSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="text-xs border border-input rounded px-2 py-1 bg-background text-foreground focus:ring-1 focus:ring-ring disabled:opacity-50"
    >
      <option value="operator">Operador</option>
      <option value="event_owner">Proprietário</option>
      <option value="admin">Administrador</option>
    </select>
  );
}

function ImportModal({
  employers,
  onClose,
  onImported,
}: {
  employers: EmployerData[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userpUsers, setUserpUsers] = useState<UserpUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [employerId, setEmployerId] = useState(employers[0]?.id ?? '');
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminApi.userpUsuarios()
      .then((res: any) => {
        setUserpUsers(res.usuarios ?? []);
      })
      .catch((e: any) => setError(e.message ?? 'Erro ao carregar usuários do UERP'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = userpUsers.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(codigo: string, user: UserpUser) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else {
        next.add(codigo);
        if (!roles[codigo]) {
          setRoles(r => ({ ...r, [codigo]: user.existingRole ?? 'operator' }));
        }
      }
      return next;
    });
  }

  async function handleImport() {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const users = Array.from(selected).map(codigo => {
        const u = userpUsers.find(x => x.codigo === codigo)!;
        return { codigo, nome: u.nome, email: u.email, role: roles[codigo] ?? 'operator' };
      });
      await adminApi.importUserpUsers({ users, employerId: employerId || undefined });
      onImported();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Erro ao importar');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-card-foreground">Importar do UERP</h2>
            <p className="text-sm text-muted-foreground">Selecione os usuários e defina o nível de acesso</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition">
            <X className="size-4" />
          </button>
        </div>

        {/* Employer selector */}
        {employers.length > 1 && (
          <div className="px-6 py-3 border-b flex items-center gap-3">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Empresa:</label>
            <select
              value={employerId}
              onChange={e => setEmployerId(e.target.value)}
              className="flex-1 text-sm border border-input rounded px-3 py-1.5 bg-background text-foreground focus:ring-1 focus:ring-ring"
            >
              {employers.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar no UERP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-4">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum usuário encontrado.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(u => {
                const isSelected = selected.has(u.codigo);
                return (
                  <div
                    key={u.codigo}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${isSelected ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/50'}`}
                    onClick={() => toggle(u.codigo, u)}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                      {isSelected && <Check className="size-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{u.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {u.alreadyImported && (
                      <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full whitespace-nowrap">
                        já importado
                      </span>
                    )}
                    {isSelected && (
                      <div onClick={e => e.stopPropagation()}>
                        <RoleSelect
                          value={roles[u.codigo] ?? 'operator'}
                          onChange={v => setRoles(r => ({ ...r, [u.codigo]: v }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selecionado${selected.size > 1 ? 's' : ''}` : 'Nenhum selecionado'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition">
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              Importar selecionados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [employers, setEmployers] = useState<EmployerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [editingRole, setEditingRole] = useState<{ id: string; role: string } | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<{ id: string; phone: string } | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, employersRes] = await Promise.all([
        adminApi.users(),
        adminApi.employers(),
      ]);
      setUsers(usersRes.users ?? []);
      setEmployers(employersRes.employers ?? []);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) { router.push('/login'); return; }
      setError(err.message ?? 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleRoleSave(id: string, role: string) {
    setSavingRole(id);
    try {
      const res = await adminApi.updateUser(id, { role });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role: res.user.role } : u));
      setEditingRole(null);
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e.message ?? ''));
    } finally {
      setSavingRole(null);
    }
  }

  async function handlePhoneSave() {
    if (!editingPhone) return;
    setSavingPhone(true);
    try {
      const res = await adminApi.updateUser(editingPhone.id, { phone: editingPhone.phone || null });
      setUsers(prev => prev.map(u => u.id === editingPhone.id ? { ...u, phone: res.user.phone } : u));
      setEditingPhone(null);
    } catch (e: any) {
      alert('Erro ao salvar telefone: ' + (e.message ?? ''));
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(id);
    try {
      await adminApi.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (e: any) {
      alert('Erro ao remover: ' + (e.message ?? ''));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Layout>
      {showImport && (
        <ImportModal
          employers={employers}
          onClose={() => setShowImport(false)}
          onImported={loadData}
        />
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2"
        >
          <Download className="size-4" />
          Importar do UERP
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
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
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
            <div className="space-y-3">
              {filteredUsers.map((user) => {
                const isEditing = editingRole?.id === user.id;
                return (
                  <div key={user.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="size-5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-card-foreground truncate">{user.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {user.employer && (
                          <p className="text-xs text-muted-foreground">{user.employer.name}</p>
                        )}
                        {user.userpCodigo && (
                          <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                            UERP #{user.userpCodigo}
                          </span>
                        )}
                        {editingPhone?.id === user.id ? (
                          <span className="flex items-center gap-1">
                            <input
                              autoFocus
                              type="tel"
                              placeholder="(41) 99999-9999"
                              value={editingPhone.phone}
                              onChange={e => setEditingPhone({ id: user.id, phone: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') handlePhoneSave(); if (e.key === 'Escape') setEditingPhone(null); }}
                              className="w-36 px-1.5 py-0.5 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                            <button onClick={handlePhoneSave} disabled={savingPhone} className="p-0.5 text-success hover:bg-success/10 rounded">
                              {savingPhone ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            </button>
                            <button onClick={() => setEditingPhone(null)} className="p-0.5 text-muted-foreground hover:bg-muted rounded">
                              <X className="size-3" />
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setEditingPhone({ id: user.id, phone: user.phone ?? '' })}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
                            title="Editar telefone (usado nos alertas de atividade)"
                          >
                            <Phone className="size-3" />
                            {user.phone || 'sem telefone'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isEditing ? (
                        <>
                          <RoleSelect
                            value={editingRole.role}
                            onChange={v => setEditingRole({ id: user.id, role: v })}
                            disabled={savingRole === user.id}
                          />
                          <button
                            onClick={() => handleRoleSave(user.id, editingRole.role)}
                            disabled={savingRole === user.id}
                            className="p-1.5 text-success hover:bg-success/10 rounded transition disabled:opacity-50"
                          >
                            {savingRole === user.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                          </button>
                          <button
                            onClick={() => setEditingRole(null)}
                            className="p-1.5 text-muted-foreground hover:bg-muted rounded transition"
                          >
                            <X className="size-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${ROLE_COLORS[user.role] ?? 'bg-muted text-muted-foreground'}`}>
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {formatDate(user.createdAt)}
                          </span>
                          <button
                            onClick={() => setEditingRole({ id: user.id, role: user.role })}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                            title="Editar papel"
                          >
                            <Edit2 className="size-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id, user.name)}
                            disabled={deletingId === user.id}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition disabled:opacity-50"
                            title="Remover usuário"
                          >
                            {deletingId === user.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
