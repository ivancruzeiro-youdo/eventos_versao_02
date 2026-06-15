'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import { Users, Plus, Edit2, Trash2, X } from 'lucide-react';

interface Team {
  id: string;
  name: string;
  active: boolean;
  _count?: { schedules: number };
}

export default function AdminTimesPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    try {
      setLoading(true);
      const response = await adminApi.teams();
      setTeams(response.teams);
    } catch (err: any) {
      if (err.status === 401) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar times');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setName('');
    setActive(true);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(team: Team) {
    setEditing(team);
    setName(team.name);
    setActive(team.active);
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await adminApi.updateTeam(editing.id, { name, active });
      } else {
        await adminApi.createTeam({ name, active });
      }
      setShowForm(false);
      await loadTeams();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar time');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(team: Team) {
    if (!confirm(`Tem certeza que deseja excluir o time "${team.name}"?`)) return;
    try {
      await adminApi.deleteTeam(team.id);
      await loadTeams();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir time');
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Times</h1>
          <p className="text-muted-foreground">Gerencie os times usados nas atividades do cronograma</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2"
        >
          <Plus className="size-4" />
          Novo Time
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
              <p className="text-muted-foreground">Nenhum time cadastrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Users className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">{team.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {team._count?.schedules ?? 0} atividade(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        team.active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {team.active ? 'Ativo' : 'Inativo'}
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
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-medium">{editing ? 'Editar Time' : 'Novo Time'}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-muted-foreground hover:text-foreground transition"
              >
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome do Time</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Ex.: Cozinha, Salão, Bar, Montagem"
                  required
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="team-active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="size-4"
                />
                <label htmlFor="team-active" className="text-sm">Ativo</label>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex gap-2 justify-end pt-2">
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
