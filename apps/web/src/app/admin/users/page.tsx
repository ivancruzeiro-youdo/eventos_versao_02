'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { User, Plus, Search, Edit2, Trash2, X, Loader2, KeyRound } from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'event_owner' | 'operator';
  employer?: { name: string };
  createdAt: string;
}

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'event_owner', label: 'Proprietário' },
  { value: 'operator', label: 'Operador' },
];

function getRoleLabel(role: string) {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

function getRoleColor(role: string) {
  const colors: Record<string, string> = {
    admin: 'bg-primary/10 text-primary',
    event_owner: 'bg-success/10 text-success',
    operator: 'bg-muted text-muted-foreground',
  };
  return colors[role] || 'bg-muted text-muted-foreground';
}

// ── Edit Modal ──────────────────────────────────────────────────────────────
interface EditModalProps {
  user: UserData;
  onClose: () => void;
  onSaved: (updated: UserData) => void;
}

function EditModal({ user, onClose, onSaved }: EditModalProps) {
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (role === user.role) { onClose(); return; }
    setSaving(true);
    setError('');
    try {
      const res = await adminApi.updateUserRole(user.id, role);
      onSaved({ ...user, role: res.user.role });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Editar Usuário</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-md transition">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Nome</p>
            <p className="font-medium">{user.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">E-mail</p>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Papel (Role)</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserData['role'])}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ────────────────────────────────────────────────────
interface DeleteModalProps {
  user: UserData;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

function DeleteModal({ user, onClose, onDeleted }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await adminApi.deleteUser(user.id);
      onDeleted(user.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold mb-2">Excluir Usuário</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Tem certeza que deseja excluir <strong>{user.name}</strong>? Esta ação não pode ser desfeita.
        </p>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition flex items-center gap-2 disabled:opacity-60"
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create User Modal ───────────────────────────────────────────────────────
interface CreateModalProps {
  onClose: () => void;
  onCreated: (user: UserData) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState({ name: '', email: '', role: 'operator' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nome e e-mail são obrigatórios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await adminApi.createUser(form);
      onCreated(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar usuário');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Novo Usuário</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-md transition">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nome</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
              placeholder="Nome completo"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
              placeholder="email@exemplo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Papel (Role)</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Password Modal ───────────────────────────────────────────────────
interface ChangePasswordModalProps {
  user: UserData;
  onClose: () => void;
}

function ChangePasswordModal({ user, onClose }: ChangePasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setError('');
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateUserPassword(user.id, password);
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar senha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <KeyRound className="size-5 text-muted-foreground" />
            Alterar Senha
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-md transition">
            <X className="size-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Definindo senha para <strong>{user.name}</strong> ({user.email})
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nova senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Confirmar senha</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600 font-medium">Senha alterada com sucesso!</p>}
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserData | null>(null);
  const [changingPasswordUser, setChangingPasswordUser] = useState<UserData | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  const filteredUsers = users.filter(
    (u) =>
      u?.name?.toLowerCase().includes(search.toLowerCase()) ||
      u?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      {/* Modals */}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) =>
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
          }
        />
      )}
      {deletingUser && (
        <DeleteModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onDeleted={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
        />
      )}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(user) => setUsers((prev) => [user, ...prev])}
        />
      )}
      {changingPasswordUser && (
        <ChangePasswordModal
          user={changingPasswordUser}
          onClose={() => setChangingPasswordUser(null)}
        />
      )}

      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários do sistema</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2"
        >
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
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
                    <button
                      onClick={() => setChangingPasswordUser(user)}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                      title="Alterar senha"
                    >
                      <KeyRound className="size-4" />
                    </button>
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                      title="Editar papel"
                    >
                      <Edit2 className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeletingUser(user)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition"
                      title="Excluir usuário"
                    >
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
