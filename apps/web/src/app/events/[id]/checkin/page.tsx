'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { eventsApi, guestsApi } from '@/lib/api';
import { formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';

interface Guest {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  status: string;
  checkedInAt: string | null;
}

interface Event {
  id: string;
  name: string;
  startAt: string | null;
}

export default function CheckinPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    try {
      const [eventRes, guestsRes] = await Promise.all([
        eventsApi.get(eventId),
        guestsApi.list(eventId),
      ]);
      setEvent(eventRes.event);
      setGuests(guestsRes.guests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckin(guestId: string) {
    try {
      await guestsApi.checkin(guestId);
      loadData();
    } catch (err: any) {
      alert('Erro no check-in: ' + err.message);
    }
  }

  async function handleCpfCheckin(cpf: string) {
    try {
      await guestsApi.checkinByCpf(cpf);
      loadData();
      setSearch('');
    } catch (err: any) {
      alert('Erro no check-in: ' + err.message);
    }
  }

  const filteredGuests = guests.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.cpf?.includes(search)
  );

  const checkedInCount = guests.filter(g => g.status === 'checked_in').length;
  const totalGuests = guests.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Check-in</h1>
              <p className="text-sm text-gray-500">{event?.name}</p>
            </div>
            <Link 
              href={`/events/${eventId}`}
              className="text-gray-600 hover:text-gray-900"
            >
              ✕ Fechar
            </Link>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <span className="font-medium">
              {checkedInCount} de {totalGuests} confirmados
            </span>
            <span className="text-sm">
              {Math.round((checkedInCount / totalGuests) * 100) || 0}%
            </span>
          </div>
          <div className="mt-2 bg-primary-700 rounded-full h-2">
            <div 
              className="bg-white rounded-full h-2 transition-all"
              style={{ width: `${(checkedInCount / totalGuests) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Buscar por nome ou CPF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-3 border rounded-lg text-lg"
          />
          <button
            onClick={() => search.length >= 11 && handleCpfCheckin(search)}
            disabled={search.length < 3}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg disabled:opacity-50"
          >
            Check-in
          </button>
        </div>

        {/* QR Scanner Toggle */}
        <button
          onClick={() => setScanning(!scanning)}
          className="mt-2 w-full py-3 bg-gray-800 text-white rounded-lg"
        >
          {scanning ? 'Fechar Scanner QR' : '📷 Escanear QR Code'}
        </button>

        {scanning && (
          <div className="mt-4 p-8 bg-black rounded-lg text-center text-white">
            <p>QR Scanner placeholder</p>
            <p className="text-sm text-gray-400 mt-2">
              (Implementar react-qr-reader)
            </p>
          </div>
        )}
      </div>

      {/* Guest List */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        <div className="bg-white rounded-lg shadow">
          {filteredGuests.length === 0 ? (
            <p className="text-center py-8 text-gray-500">
              Nenhum convidado encontrado
            </p>
          ) : (
            <div className="divide-y">
              {filteredGuests.map((guest) => (
                <div 
                  key={guest.id}
                  className={`p-4 flex items-center justify-between ${
                    guest.status === 'checked_in' ? 'bg-green-50' : ''
                  }`}
                >
                  <div>
                    <p className="font-medium text-lg">{guest.name}</p>
                    <p className="text-sm text-gray-500">
                      CPF: {guest.cpf || '-'} • {guest.phone || '-'}
                    </p>
                    {guest.checkedInAt && (
                      <p className="text-sm text-green-600">
                        ✓ Check-in: {new Date(guest.checkedInAt).toLocaleTimeString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(guest.status)}`}>
                      {getStatusLabel(guest.status)}
                    </span>
                    {guest.status !== 'checked_in' && (
                      <button
                        onClick={() => handleCheckin(guest.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        Confirmar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
