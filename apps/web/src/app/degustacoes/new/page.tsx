'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { degustacoesApi, venuesApi, uerpApi } from '@/lib/api';

export default function NewDegustacaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    venueIds: [] as string[],
    productId: '',
    visibility: 'publico' as 'publico' | 'contrato',
    maxGuests: 4,
    startAt: '',
    teardownAt: '',
    notes: '',
    recurrent: false,
    intervalDays: 15,
    count: 3,
  });

  useEffect(() => {
    venuesApi.list().then(res => setVenues(res.venues || [])).catch(() => {});
    uerpApi.products().then(res => setProducts(res.products || [])).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await degustacoesApi.create({
        name: formData.name || undefined,
        venueIds: formData.venueIds,
        productId: formData.productId || undefined,
        visibility: formData.visibility,
        maxGuests: formData.maxGuests,
        startAt: new Date(formData.startAt).toISOString(),
        teardownAt: formData.teardownAt ? new Date(formData.teardownAt).toISOString() : undefined,
        notes: formData.notes || undefined,
        recurrence: formData.recurrent
          ? { intervalDays: formData.intervalDays, count: formData.count }
          : undefined,
      });

      router.push(`/events/${response.events[0].id}`);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar degustação');
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
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/degustacoes" className="hover:text-gray-700">Degustações</Link>
            <span>/</span>
            <span>Nova</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Criar Degustação</h1>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome (opcional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="Se vazio, usa o nome do menu escolhido"
            />
          </div>

          {/* Visibility */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Visibilidade</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${formData.visibility === 'publico' ? 'border-primary bg-primary/5' : 'hover:bg-gray-50'}`}>
                <input type="radio" name="visibility" checked={formData.visibility === 'publico'}
                  onChange={() => setFormData({ ...formData, visibility: 'publico' })} className="mt-0.5" />
                <div>
                  <p className="font-medium">Pública</p>
                  <p className="text-xs text-gray-500">Aberta via link gerado a partir de um código de entidade do Userp</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${formData.visibility === 'contrato' ? 'border-primary bg-primary/5' : 'hover:bg-gray-50'}`}>
                <input type="radio" name="visibility" checked={formData.visibility === 'contrato'}
                  onChange={() => setFormData({ ...formData, visibility: 'contrato' })} className="mt-0.5" />
                <div>
                  <p className="font-medium">Exclusiva a contrato</p>
                  <p className="text-xs text-gray-500">Aparece na agenda do portal do cliente</p>
                </div>
              </label>
            </div>
          </div>

          {/* Menu */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Menu</h3>
            <select
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Sem menu vinculado</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Os itens do menu são escolhidos depois, na aba A&B do evento — igual em qualquer evento normal.
            </p>
          </div>

          {/* Guests */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Limite de convidados</label>
            <input
              type="number"
              min={1}
              max={50}
              value={formData.maxGuests}
              onChange={(e) => setFormData({ ...formData, maxGuests: parseInt(e.target.value) || 1 })}
              className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Contratante + convidados (padrão: 4 = contratante + 3)</p>
          </div>

          {/* Dates + recurrence */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Data e Recorrência</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.recurrent ? 'Data da primeira ocorrência *' : 'Data *'}
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.startAt}
                  onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Término (opcional)</label>
                <input
                  type="datetime-local"
                  value={formData.teardownAt}
                  onChange={(e) => setFormData({ ...formData, teardownAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" checked={formData.recurrent}
                onChange={(e) => setFormData({ ...formData, recurrent: e.target.checked })}
                className="w-4 h-4 accent-primary" />
              <span className="text-sm font-medium text-gray-700">Repetir (recorrência)</span>
            </label>

            {formData.recurrent && (
              <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-primary/20">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">A cada quantos dias</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.intervalDays}
                    onChange={(e) => setFormData({ ...formData, intervalDays: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de ocorrências</label>
                  <input
                    type="number"
                    min={2}
                    max={52}
                    value={formData.count}
                    onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 2 })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-500">
                  Cria {formData.count} eventos reais de uma vez, um a cada {formData.intervalDays} dias.
                </p>
              </div>
            )}
          </div>

          {/* Venues */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Local</h3>
            {venues.length === 0 ? (
              <p className="text-gray-500">Carregando locais...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {venues.map((venue) => (
                  <label key={venue.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${formData.venueIds.includes(venue.id) ? 'border-primary bg-primary/5' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={formData.venueIds.includes(venue.id)}
                      onChange={() => handleVenueToggle(venue.id)} className="w-4 h-4 accent-primary" />
                    <span className="font-medium">{venue.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          <div className="border-t pt-6 flex gap-3">
            <button type="submit" disabled={loading}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
              {loading ? 'Criando...' : formData.recurrent ? `Criar ${formData.count} Degustações` : 'Criar Degustação'}
            </button>
            <Link href="/degustacoes" className="px-6 py-3 border rounded-lg hover:bg-gray-50 transition">Cancelar</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}
