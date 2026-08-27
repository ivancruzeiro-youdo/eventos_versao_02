'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import VenueColorPicker from '@/components/VenueColorPicker';
import { venuesApi } from '@/lib/api';
import { VENUE_COLOR_PRESETS } from '@/lib/venueColors';
import { MapPin, ArrowLeft } from 'lucide-react';

export default function NewVenuePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    capacity: '',
    contactName: '',
    contactPhone: '',
  });
  const [color, setColor] = useState<string>(VENUE_COLOR_PRESETS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await venuesApi.create({
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        color,
      });
      router.push('/venues');
    } catch (err: any) {
      setError(err.message || 'Erro ao criar local');
      setLoading(false);
    }
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href="/venues"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para locais
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
          Novo Local
        </h1>
        <p className="text-muted-foreground">Cadastre um novo local para eventos</p>
      </div>

      {/* Form */}
      <div className="bg-card rounded-lg border shadow-sm max-w-2xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2">
                Nome do Local <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                placeholder="Ex: Espaço Garden"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium mb-2">
                Endereço
              </label>
              <input
                type="text"
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                placeholder="Rua, número, bairro"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium mb-2">
                  Cidade
                </label>
                <input
                  type="text"
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  placeholder="São Paulo"
                />
              </div>
              <div>
                <label htmlFor="state" className="block text-sm font-medium mb-2">
                  Estado
                </label>
                <input
                  type="text"
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  placeholder="SP"
                  maxLength={2}
                />
              </div>
            </div>

            <div>
              <label htmlFor="capacity" className="block text-sm font-medium mb-2">
                Capacidade (pessoas)
              </label>
              <input
                type="number"
                id="capacity"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                placeholder="200"
                min={1}
              />
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium mb-2">
                Cor no Calendário
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Aparece como borda dos eventos deste local na visão de calendário.
              </p>
              <VenueColorPicker value={color} onChange={setColor} />
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-4">Contato do Local</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contactName" className="block text-sm font-medium mb-2">
                    Nome do Contato
                  </label>
                  <input
                    type="text"
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    placeholder="João da Silva"
                  />
                </div>
                <div>
                  <label htmlFor="contactPhone" className="block text-sm font-medium mb-2">
                    Telefone do Contato
                  </label>
                  <input
                    type="tel"
                    id="contactPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Link
              href="/venues"
              className="px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-muted transition"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Local'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
