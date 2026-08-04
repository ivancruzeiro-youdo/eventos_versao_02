'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import { Users, Plus, Edit2, Trash2, X, MessageCircle } from 'lucide-react';

interface TeamMember {
  user: { id: string; name: string; email: string; phone: string | null };
}

interface Team {
  id: string;
  name: string;
  active: boolean;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  members: TeamMember[];
  _count?: { schedules: number };
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
}

export default function AdminTeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [serviceId, setServiceId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      const [teamsRes, usersRes, servicesRes] = await Promise.all([
        adminApi.teams(),
        fetch('/api/v2/admin/users?limit=500', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/v2/services', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setTeams(teamsRes.teams);
      setUsers(usersRes.users || []);
      setServices(servicesRes.services || []);
    } catch (err: any) {
      if (err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar equipes');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setName('');
    setActive(true);
    setServiceId('');
    setMemberIds([]);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(team: Team) {
    setEditing(team);
    setName(team.name);
    setActive(team.active);
    setServiceId(team.serviceId || '');
    setMemberIds(team.members.map((m) => m.user.id));
    setFormError('');
    setShowForm(true);
  }

  function toggleMember(userId: string) {
    setMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = { name, active, serviceId: serviceId || null, memberIds };
      if (editing) {
        await adminApi.updateTeam(editing.id, payload);
      } else {
        await adminApi.createTeam(payload);
      }
      setShowForm(false);
      await loadAll();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar equipe');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(team: Team) {
    if (!confirm(`Tem certeza que deseja excluir a equipe "${team.name}"?`)) return;
    try {
      await adminApi.deleteTeam(team.id);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir equipe');
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Equipes</h1>
          <p className="text-muted-foreground">
            Equipes usadas nas atividades do cronograma (Operação, Cozinha, Técnico de Som...). Vincule usuários e um
            serviço — todo usuário da equipe recebe um aviso por WhatsApp quando uma atividade do cronograma dela é
            criada ou alterada.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2 shrink-0"
        >
          <Plus className="size-4" />
          Nova Equipe
        </button>
      </div>

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
          ) : teams.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Users className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhuma equipe cadastrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <div key={team.id} className="flex items-start justify-between p-4 border rounded-lg gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Users className="size-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-card-foreground">{team.name}</p>
                        {team.service && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{team.service.name}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {team._count?.schedules ?? 0} atividade(s) de cronograma
                      </p>
                      {team.members.length > 0 ? (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {team.members.map((m) => (
                            <span
                              key={m.user.id}
                              title={m.user.phone ? undefined : 'Sem telefone cadastrado — não recebe WhatsApp'}
                              className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                m.user.phone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              <MessageCircle className="size-3" />
                              {m.user.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1.5">Nenhum usuário vinculado ainda.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        team.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {team.active ? 'Ativa' : 'Inativa'}
                    </span>
                    <button
                      onClick={() => openEdit(team)}
                      className="p-2 text-muted-foreground hover:text-primary transition"
                      title="Editar"
                    >
                      <Edit2 className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(team)}
                      className="p-2 text-muted-foreground hover:text-red-500 transition"
                      title="Excluir"
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

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="font-medium">{editing ? 'Editar Equipe' : 'Nova Equipe'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-muted-foreground hover:text-foreground transition">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome da Equipe</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Ex.: Operação, Cozinha, Técnico de Som"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Serviço vinculado (opcional)</label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Nenhum</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Usuários vinculados ({memberIds.length} selecionado{memberIds.length !== 1 ? 's' : ''})
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Recebem um aviso por WhatsApp quando uma atividade do cronograma desta equipe é criada ou alterada
                  (precisam ter telefone cadastrado em Usuários).
                </p>
                <div className="border rounded-lg max-h-56 overflow-y-auto divide-y">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                        className="size-4"
                      />
                      <span className="flex-1">{u.name}</span>
                      {!u.phone && <span className="text-xs text-amber-600">sem telefone</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="team-active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="size-4"
                />
                <label htmlFor="team-active" className="text-sm">Ativa</label>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex gap-2 justify-end pt-2 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
