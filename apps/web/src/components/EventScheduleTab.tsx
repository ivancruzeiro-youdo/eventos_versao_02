'use client';

import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Edit2, FileText, Calendar, Users } from 'lucide-react';

interface Team {
  id: string;
  name: string;
}

interface Schedule {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  description: string | null;
  team: {
    id: string;
    name: string;
  } | null;
  file: {
    id: string;
    name: string;
    mimeType: string;
  } | null;
}

interface EventScheduleTabProps {
  eventId: string;
}

function utcToLocalInput(utcIso: string): string {
  const d = new Date(utcIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventScheduleTab({ eventId }: EventScheduleTabProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    teamId: '',
    startAt: '',
    endAt: '',
    description: '',
    fileId: '',
  });

  useEffect(() => {
    fetchSchedules();
    fetchTeams();
  }, [eventId]);

  const fetchTeams = async () => {
    try {
      const res = await fetch(`/api/v2/teams`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`/api/v2/events/${eventId}/schedules`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const sortedSchedules = (data.schedules || []).sort((a: Schedule, b: Schedule) => 
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        );
        setSchedules(sortedSchedules);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');

    try {
      const payload = {
        name: formData.name,
        teamId: formData.teamId,
        startAt: formData.startAt ? new Date(formData.startAt).toISOString() : '',
        endAt: formData.endAt ? new Date(formData.endAt).toISOString() : '',
        description: formData.description || null,
        fileId: formData.fileId || null,
      };

      const url = editingId
        ? `/api/v2/schedules/${editingId}`
        : `/api/v2/events/${eventId}/schedules`;

      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error || 'Erro ao salvar atividade');
        return;
      }

      const saved = data.schedule;
      const next = editingId
        ? schedules.map((s) => (s.id === saved.id ? saved : s))
        : [...schedules, saved];
      const sortedSchedules = next.sort((a: Schedule, b: Schedule) => 
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );
      setSchedules(sortedSchedules);
      setShowForm(false);
      setFormData({ name: '', teamId: '', startAt: '', endAt: '', description: '', fileId: '' });
      setEditingId(null);
    } catch (error) {
      console.error('Error saving schedule:', error);
      setFormError('Erro ao salvar atividade');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormError('');
    setFormData({
      name: schedule.name,
      teamId: schedule.team?.id || '',
      startAt: utcToLocalInput(schedule.startAt),
      endAt: utcToLocalInput(schedule.endAt),
      description: schedule.description || '',
      fileId: schedule.file?.id || '',
    });
    setEditingId(schedule.id);
    setShowForm(true);
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) return;

    try {
      const res = await fetch(`/api/v2/schedules/${scheduleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setSchedules(schedules.filter(s => s.id !== scheduleId));
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatTimeOnly = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="space-y-4">
      {/* Add Button */}
      {!showForm && (
        <button
          onClick={() => { setFormError(''); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
        >
          <Plus size={16} />
          Adicionar Atividade
        </button>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Clock className="size-4" />
            {editingId ? 'Editar Atividade' : 'Adicionar Atividade ao Cronograma'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Nome da Atividade</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time</label>
              <select
                value={formData.teamId}
                onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              >
                <option value="">Selecione um time</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Data e Hora de Início</label>
                <input
                  type="datetime-local"
                  value={formData.startAt}
                  onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data e Hora de Fim</label>
                <input
                  type="datetime-local"
                  value={formData.endAt}
                  min={formData.startAt || undefined}
                  onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Arquivo Relacionado (opcional)</label>
              <select
                value={formData.fileId}
                onChange={(e) => setFormData({ ...formData, fileId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Nenhum</option>
                {/* TODO: Load files from API */}
              </select>
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormError('');
                  setFormData({ name: '', teamId: '', startAt: '', endAt: '', description: '', fileId: '' });
                  setEditingId(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Schedule List */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Calendar className="size-4" />
          Cronograma do Evento
        </h3>
        {schedules.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhuma atividade cadastrada.</p>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="border-l-4 border-primary pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">{schedule.name}</span>
                      <button
                        onClick={() => handleEdit(schedule)}
                        className="p-1 text-muted-foreground hover:text-primary transition"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                    <div className="text-sm text-muted-foreground mb-1">
                      {formatDateOnly(schedule.startAt)} · {formatTimeOnly(schedule.startAt)} – {
                        formatDateOnly(schedule.startAt) === formatDateOnly(schedule.endAt)
                          ? formatTimeOnly(schedule.endAt)
                          : `${formatDateOnly(schedule.endAt)} ${formatTimeOnly(schedule.endAt)}`
                      }
                    </div>
                    {schedule.team && (
                      <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mb-1">
                        <Users size={12} />
                        {schedule.team.name}
                      </span>
                    )}
                    {schedule.description && (
                      <p className="text-sm text-foreground mt-2">{schedule.description}</p>
                    )}
                    {schedule.file && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <FileText size={14} />
                        <span>{schedule.file.name}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
