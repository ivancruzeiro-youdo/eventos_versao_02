'use client';

import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Edit2, FileText, Calendar } from 'lucide-react';

interface Schedule {
  id: string;
  name: string;
  scheduledAt: string;
  description: string | null;
  file: {
    id: string;
    name: string;
    mimeType: string;
  } | null;
}

interface EventScheduleTabProps {
  eventId: string;
}

export default function EventScheduleTab({ eventId }: EventScheduleTabProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    scheduledAt: '',
    description: '',
    fileId: '',
  });

  useEffect(() => {
    fetchSchedules();
  }, [eventId]);

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/v2/events/${eventId}/schedules`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const sortedSchedules = (data.schedules || []).sort((a: Schedule, b: Schedule) => 
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
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

    try {
      const payload = {
        name: formData.name,
        scheduledAt: formData.scheduledAt,
        description: formData.description || null,
        fileId: formData.fileId || null,
      };

      const url = editingId
        ? `http://localhost:3001/api/v2/schedules/${editingId}`
        : `http://localhost:3001/api/v2/events/${eventId}/schedules`;

      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const newSchedule = data.schedule;
        const sortedSchedules = [...schedules, newSchedule].sort((a: Schedule, b: Schedule) => 
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        );
        setSchedules(sortedSchedules);
        setShowForm(false);
        setFormData({ name: '', scheduledAt: '', description: '', fileId: '' });
        setEditingId(null);
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      name: schedule.name,
      scheduledAt: schedule.scheduledAt.slice(0, 16), // Format for datetime-local input
      description: schedule.description || '',
      fileId: schedule.file?.id || '',
    });
    setEditingId(schedule.id);
    setShowForm(true);
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) return;

    try {
      const res = await fetch(`http://localhost:3001/api/v2/schedules/${scheduleId}`, {
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
          onClick={() => setShowForm(true)}
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
              <label className="block text-sm font-medium mb-1">Horário</label>
              <input
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
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
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ name: '', scheduledAt: '', description: '', fileId: '' });
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
                      {formatTimeOnly(schedule.scheduledAt)} {formatDateOnly(schedule.scheduledAt)}
                    </div>
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
