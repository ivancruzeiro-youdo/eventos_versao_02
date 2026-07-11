'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { eventsApi, venuesApi } from '@/lib/api';

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    clientName: '',
    venueIds: [] as string[],
    setupAt: '',
    startAt: '',
    teardownAt: '',
    notes: '',
  });

  useEffect(() => {
    venuesApi.list().then(res => setVenues(res.venues || [])).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await eventsApi.create({
        ...formData,
        setupAt: formData.setupAt ? new Date(formData.setupAt).toISOString() : undefined,
        startAt: formData.startAt ? new Date(formData.startAt).toISOString() : undefined,
        teardownAt: formData.teardownAt ? new Date(formData.teardownAt).toISOString() : undefined,
      });
      
      router.push(`/events/${response.event.id}`);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar evento');
    } finally {
      setLoading(false);
    }
  }

  function handleVenueToggle(venueId: string) {
    setFormData(prev => ({
      ...prev,
      venueIds: prev.venueIds.includes(venueId)
        ? prev.venueIds.filter(id => id !== venueId)
        : [...prev.venueIds, venueId]
    }));
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
            <span>/</span>
            <span>Novo Evento</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Criar Novo Evento</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Evento *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="Ex: Conferência Anual 2026"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Cliente *
              </label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                placeholder="Ex: Empresa ABC"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Datas e Horários</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setup (Montagem)
                </label>
                <input
                  type="datetime-local"
                  value={formData.setupAt}
                  onChange={(e) => setFormData({ ...formData, setupAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Início do Evento *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.startAt}
                  onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Término/Desmontagem
                </label>
                <input
                  type="datetime-local"
                  value={formData.teardownAt}
                  onChange={(e) => setFormData({ ...formData, teardownAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>
          </div>

          {/* Venues */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Locais (Venues)</h3>
            {venues.length === 0 ? (
              <p className="text-gray-500">Carregando locais...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {venues.map((venue) => (
                  <label
                    key={venue.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                      formData.venueIds.includes(venue.id)
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.venueIds.includes(venue.id)}
                      onChange={() => handleVenueToggle(venue.id)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="font-medium">{venue.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              rows={4}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="Informações adicionais sobre o evento..."
            />
          </div>

          {/* Actions */}
          <div className="border-t pt-6 flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Evento'}
            </button>
            <Link
              href="/dashboard"
              className="px-6 py-3 border rounded-lg hover:bg-gray-50 transition"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}
