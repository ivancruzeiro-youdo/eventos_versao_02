'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, LogOut, CheckCircle, XCircle, Clock, Car, Camera, X, User as UserIcon, MapPin, ChevronLeft, Users, ListChecks } from 'lucide-react';

interface TodayEvent {
  id: string;
  name: string;
  clientName: string;
  startAt: string;
  venues: string[];
  totalGuests: number;
  checkedInCount: number;
}

interface Guest {
  id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  checkedInAt: string | null;
}

interface GuestSearchResult {
  id: string;
  name: string;
  cpf: string | null;
  event: { id: string; name: string };
  hasVehicle?: boolean;
}

interface ParkingEntry {
  id: string;
  guestId: string;
  guestName: string;
  photoUrl: string;
  registeredByName: string | null;
  createdAt: string;
}

// ── Parking modal ──────────────────────────────────────────────────────────────

function ParkingModal({ onClose, onRegistered, presetGuest }: {
  onClose: () => void;
  onRegistered: (guestId: string) => void;
  presetGuest?: { id: string; name: string; eventName: string; hasVehicle?: boolean };
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GuestSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GuestSearchResult | null>(
    presetGuest ? { id: presetGuest.id, name: presetGuest.name, cpf: null, event: { id: '', name: presetGuest.eventName }, hasVehicle: presetGuest.hasVehicle } : null
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v2/checkin/guests/search?q=${encodeURIComponent(query.trim())}`, { credentials: 'include' });
        if (res.ok) { const data = await res.json(); setResults(data.guests || []); }
      } catch { /* silent */ } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleConfirm() {
    if (!selected || !photoFile) return;
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('guestId', selected.id);
      formData.append('photo', photoFile);
      const res = await fetch('/api/v2/parking-entries', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Erro ao registrar veículo');
        return;
      }
      onRegistered(selected.id);
      setDone(true);
    } catch {
      setError('Erro de conexão ao registrar veículo');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2"><Car size={20} /> Registrar Veículo</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-5">
          {done ? (
            <div className="text-center py-6">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900 mb-1">Veículo registrado!</p>
              <p className="text-sm text-gray-600 mb-5">{selected?.name}</p>
              <button onClick={onClose} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition">
                Fechar
              </button>
            </div>
          ) : !selected ? (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar convidado por nome ou CPF</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Digite o nome ou CPF..."
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {searching && <p className="text-xs text-gray-500 mt-2">Buscando...</p>}
              {results.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                  {results.map(g => (
                    <button
                      key={g.id}
                      onClick={() => !g.hasVehicle && setSelected(g)}
                      disabled={g.hasVehicle}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition ${
                        g.hasVehicle ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 hover:border-blue-300'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                        <UserIcon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <p className="text-xs text-gray-500 truncate">{g.event.name}</p>
                      </div>
                      {g.hasVehicle && (
                        <span className="text-[11px] text-gray-500 flex items-center gap-1 shrink-0">
                          <Car size={11} /> já registrado
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-sm text-gray-500 mt-3 text-center">Nenhum convidado encontrado.</p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2.5 mb-4">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                  <UserIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selected.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selected.event.name}</p>
                </div>
                {!presetGuest && (
                  <button onClick={() => { setSelected(null); setResults([]); setQuery(''); }} className="text-xs text-blue-600 hover:underline shrink-0">
                    Trocar
                  </button>
                )}
              </div>

              {selected.hasVehicle ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2.5 rounded-lg text-sm">
                  Este convidado já tem um veículo registrado.
                </div>
              ) : (
              <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Foto do carro</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Foto do carro" className="w-full h-56 object-cover rounded-lg" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 bg-white/90 px-3 py-1.5 rounded-lg text-xs font-medium shadow hover:bg-white transition"
                  >
                    Tirar outra
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-10 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
                >
                  <Camera size={28} />
                  <span className="text-sm font-medium">Tirar foto do carro</span>
                </button>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mt-3">
                  {error}
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={!photoFile || submitting}
                className="w-full mt-4 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} /> {submitting ? 'Registrando...' : 'Confirmar'}
              </button>
              </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'checked_in':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 shrink-0">
          <CheckCircle size={12} /> Check-in
        </span>
      );
    case 'confirmed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 shrink-0">
          <Clock size={12} /> Confirmado
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 shrink-0">
          <Clock size={12} /> Pendente
        </span>
      );
    case 'declined':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 shrink-0">
          <XCircle size={12} /> Recusado
        </span>
      );
    default:
      return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 shrink-0">{status}</span>;
  }
}

// ── Main dashboard ──────────────────────────────────────────────────────────────

export default function ReceptionistDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string } | null>(null);

  const [events, setEvents] = useState<TodayEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<TodayEvent | null>(null);

  const [guests, setGuests] = useState<Guest[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [guestQuery, setGuestQuery] = useState('');
  const [checkinLoadingId, setCheckinLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'guests' | 'vehicles'>('guests');

  const [parkingEntries, setParkingEntries] = useState<ParkingEntry[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const vehicleGuestIds = useMemo(() => new Set(parkingEntries.map(e => e.guestId)), [parkingEntries]);

  const [parkingTarget, setParkingTarget] = useState<{ id: string; name: string; eventName: string; hasVehicle?: boolean } | 'search' | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const res = await fetch('/api/v2/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const ALLOWED_ROLES = ['receptionist', 'checkin_staff', 'admin', 'operator', 'event_owner'];
        if (!ALLOWED_ROLES.includes(data.user.role)) {
          router.push('/checkin');
          return;
        }
        setUser(data.user);
        loadTodayEvents();
      } else {
        router.push('/checkin');
      }
    } catch {
      router.push('/checkin');
    }
  }

  async function loadTodayEvents() {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/v2/checkin/today-events', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list: TodayEvent[] = data.events || [];
        setEvents(list);
        if (list.length === 1) selectEvent(list[0]);
      }
    } catch { /* silent */ } finally {
      setLoadingEvents(false);
    }
  }

  async function selectEvent(ev: TodayEvent) {
    setSelectedEvent(ev);
    setGuestQuery('');
    setError('');
    setTab('guests');
    await Promise.all([loadGuests(ev.id), loadVehicles(ev.id)]);
  }

  async function loadGuests(eventId: string) {
    setLoadingGuests(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/guests?limit=1000`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGuests(data.guests || []);
      }
    } catch { /* silent */ } finally {
      setLoadingGuests(false);
    }
  }

  async function loadVehicles(eventId: string) {
    setLoadingVehicles(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/parking-entries`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setParkingEntries(data.entries || []);
      }
    } catch { /* silent */ } finally {
      setLoadingVehicles(false);
    }
  }

  async function handleCheckin(guestId: string) {
    setCheckinLoadingId(guestId);
    setError('');
    try {
      const res = await fetch(`/api/v2/guests/${guestId}/checkin`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Erro ao fazer check-in');
        return;
      }
      const data = await res.json();
      setGuests(prev => prev.map(g => g.id === guestId ? data.guest : g));
      setEvents(prev => prev.map(ev => ev.id === selectedEvent?.id ? { ...ev, checkedInCount: ev.checkedInCount + 1 } : ev));
    } catch {
      setError('Erro ao fazer check-in');
    } finally {
      setCheckinLoadingId(null);
    }
  }

  async function handleLogout() {
    await fetch('/api/v2/auth/logout', { method: 'DELETE', credentials: 'include' });
    router.push('/checkin');
  }

  function formatCPF(cpf: string | null) {
    if (!cpf) return null;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  // Busca prioriza nome; CPF (dígitos) entra como critério secundário
  const filteredGuests = useMemo(() => {
    const term = guestQuery.trim().toLowerCase();
    const digits = guestQuery.replace(/\D/g, '');
    const sorted = [...guests].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!term) return sorted;
    return sorted.filter(g =>
      g.name.toLowerCase().includes(term) ||
      (digits.length >= 3 && g.cpf?.includes(digits))
    );
  }, [guests, guestQuery]);

  const pendingCount = guests.filter(g => g.status !== 'checked_in').length;
  const checkedInCount = guests.filter(g => g.status === 'checked_in').length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Check-in de Eventos</h1>
            <p className="text-sm text-gray-600">Bem-vindo, {user.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {parkingTarget && (
          <ParkingModal
            onClose={() => setParkingTarget(null)}
            onRegistered={() => { if (selectedEvent) loadVehicles(selectedEvent.id); }}
            presetGuest={parkingTarget !== 'search' ? parkingTarget : undefined}
          />
        )}

        {!selectedEvent ? (
          /* ── Event picker ── */
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Qual evento está fazendo check-in?</h2>
            <p className="text-sm text-gray-600 mb-5">Eventos de hoje</p>

            {loadingEvents ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : events.length === 0 ? (
              <p className="text-center text-gray-500 py-10">Nenhum evento hoje.</p>
            ) : (
              <div className="space-y-3">
                {events.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => selectEvent(ev)}
                    className="w-full text-left flex items-center justify-between gap-4 border rounded-xl px-4 py-3.5 hover:border-blue-400 hover:bg-blue-50 transition"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{ev.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                        <span>{new Date(ev.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        {ev.venues.map((v, i) => (
                          <span key={i} className="flex items-center gap-1"><MapPin size={11} /> {v}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-700">{ev.checkedInCount}/{ev.totalGuests}</p>
                      <p className="text-[11px] text-gray-500">check-ins</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Guest list for selected event ── */
          <>
            <div className="bg-white rounded-2xl shadow-lg p-5 mb-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  {events.length > 1 && (
                    <button
                      onClick={() => { setSelectedEvent(null); setGuests([]); }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline mb-1.5"
                    >
                      <ChevronLeft size={13} /> Trocar evento
                    </button>
                  )}
                  <h2 className="font-bold text-gray-900 truncate">{selectedEvent.name}</h2>
                  <p className="text-xs text-gray-500">{selectedEvent.clientName}</p>
                </div>
                <button
                  onClick={() => setParkingTarget('search')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 transition shrink-0"
                >
                  <Car size={15} /> Veículo
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-green-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-xl font-bold text-green-700">{checkedInCount}</p>
                  <p className="text-[11px] text-green-700/80 flex items-center justify-center gap-1"><CheckCircle size={11} /> já entraram</p>
                </div>
                <div className="bg-amber-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-xl font-bold text-amber-700">{pendingCount}</p>
                  <p className="text-[11px] text-amber-700/80 flex items-center justify-center gap-1"><Users size={11} /> pendentes</p>
                </div>
              </div>

              {tab === 'guests' && (
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={guestQuery}
                    onChange={e => setGuestQuery(e.target.value)}
                    placeholder="Buscar convidado por nome..."
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex bg-white rounded-xl shadow-sm p-1 mb-4">
              <button
                onClick={() => setTab('guests')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
                  tab === 'guests' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ListChecks size={15} /> Convidados
              </button>
              <button
                onClick={() => setTab('vehicles')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
                  tab === 'vehicles' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Car size={15} /> Veículos {parkingEntries.length > 0 && `(${parkingEntries.length})`}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            {tab === 'guests' ? (
              loadingGuests ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredGuests.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center text-gray-500">
                  Nenhum convidado encontrado.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredGuests.map(g => {
                    const hasVehicle = vehicleGuestIds.has(g.id);
                    return (
                      <div key={g.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">{g.name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-500 mt-0.5">
                            {formatCPF(g.cpf) && <span>{formatCPF(g.cpf)}</span>}
                            {g.checkedInAt && <span>Check-in às {new Date(g.checkedInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                        </div>
                        <StatusBadge status={g.status} />
                        <button
                          onClick={() => !hasVehicle && setParkingTarget({ id: g.id, name: g.name, eventName: selectedEvent.name })}
                          disabled={hasVehicle}
                          title={hasVehicle ? 'Veículo já registrado' : 'Registrar veículo'}
                          className={`px-3 py-2 rounded-lg transition shrink-0 flex items-center justify-center ${
                            hasVehicle ? 'bg-green-50 text-green-600 cursor-default' : 'text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50'
                          }`}
                        >
                          <Car size={16} />
                        </button>
                        {g.status !== 'checked_in' && (
                          <button
                            onClick={() => handleCheckin(g.id)}
                            disabled={checkinLoadingId === g.id}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition disabled:opacity-50 shrink-0"
                          >
                            {checkinLoadingId === g.id ? '...' : 'Check-in'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              loadingVehicles ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : parkingEntries.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center text-gray-500">
                  Nenhum veículo registrado ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {parkingEntries.map(entry => (
                    <div key={entry.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
                      <img src={entry.photoUrl} alt="Foto do carro" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{entry.guestName}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {entry.registeredByName && ` · por ${entry.registeredByName}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
