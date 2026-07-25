'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, LogOut, CheckCircle, XCircle, Clock, Car, Camera, X, User as UserIcon } from 'lucide-react';

interface Guest {
  id: string;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  checkedInAt: string | null;
  event: {
    id: string;
    name: string;
    startAt: string;
  };
}

interface GuestSearchResult {
  id: string;
  name: string;
  cpf: string | null;
  event: { id: string; name: string };
}

function ParkingModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GuestSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GuestSearchResult | null>(null);
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
                      onClick={() => setSelected(g)}
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border hover:bg-blue-50 hover:border-blue-300 transition"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                        <UserIcon size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <p className="text-xs text-gray-500 truncate">{g.event.name}</p>
                      </div>
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
                <button onClick={() => { setSelected(null); setResults([]); setQuery(''); }} className="text-xs text-blue-600 hover:underline shrink-0">
                  Trocar
                </button>
              </div>

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
        </div>
      </div>
    </div>
  );
}

export default function ReceptionistDashboard() {
  const router = useRouter();
  const [searchCpf, setSearchCpf] = useState('');
  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [parkingOpen, setParkingOpen] = useState(false);

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
      } else {
        router.push('/checkin');
      }
    } catch {
      router.push('/checkin');
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setGuest(null);

    try {
      const res = await fetch(`/api/v2/checkin/cpf/${searchCpf.replace(/\D/g, '')}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Convidado não encontrado');
        return;
      }

      const data = await res.json();
      setGuest(data.guest);
    } catch (err) {
      setError('Erro ao buscar convidado');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckin() {
    if (!guest) return;
    setCheckinLoading(true);

    try {
      const res = await fetch(`/api/v2/guests/${guest.id}/checkin`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erro ao fazer check-in');
        return;
      }

      const data = await res.json();
      setGuest(data.guest);
    } catch (err) {
      setError('Erro ao fazer check-in');
    } finally {
      setCheckinLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/v2/auth/logout', { method: 'DELETE', credentials: 'include' });
    router.push('/checkin');
  }

  function formatCPF(cpf: string | null) {
    if (!cpf) return 'Não informado';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function formatPhone(phone: string | null) {
    if (!phone) return 'Não informado';
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'checked_in':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle size={12} /> Check-in realizado
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock size={12} /> Confirmado
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock size={12} /> Pendente
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle size={12} /> Recusado
          </span>
        );
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  }

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
        {/* Parking button */}
        <button
          onClick={() => setParkingOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-white border-2 border-blue-200 text-blue-700 py-3 rounded-2xl font-medium hover:bg-blue-50 hover:border-blue-300 transition mb-6 shadow-sm"
        >
          <Car size={20} /> Registrar Veículo no Estacionamento
        </button>

        {parkingOpen && <ParkingModal onClose={() => setParkingOpen(false)} />}

        {/* Search Form */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
                Buscar convidado por CPF
              </label>
              <input
                id="cpf"
                type="text"
                value={searchCpf}
                onChange={(e) => setSearchCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                <Search size={18} /> {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Guest Card */}
        {guest && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{guest.name}</h2>
                <p className="text-gray-600">{guest.event.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(guest.event.startAt).toLocaleDateString('pt-BR')} às {new Date(guest.event.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div>{getStatusBadge(guest.status)}</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">CPF</p>
                <p className="font-medium">{formatCPF(guest.cpf)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Telefone</p>
                <p className="font-medium">{formatPhone(guest.phone)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Email</p>
                <p className="font-medium">{guest.email || 'Não informado'}</p>
              </div>
              {guest.checkedInAt && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Check-in realizado às</p>
                  <p className="font-medium">{new Date(guest.checkedInAt).toLocaleTimeString('pt-BR')}</p>
                </div>
              )}
            </div>

            {guest.status === 'confirmed' || guest.status === 'pending' ? (
              <button
                onClick={handleCheckin}
                disabled={checkinLoading}
                className="w-full bg-green-600 text-white py-4 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
              >
                <CheckCircle size={24} /> {checkinLoading ? 'Processando...' : 'Realizar Check-in'}
              </button>
            ) : guest.status === 'checked_in' ? (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-center font-medium">
                Check-in já realizado
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 text-gray-600 px-4 py-3 rounded-lg text-center">
                Status não permite check-in
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
