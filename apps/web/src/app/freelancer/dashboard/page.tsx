'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, freelancerApi, ApiError } from '@/lib/api';

interface Slot {
  id: string;
  startAt: string | null;
  endAt: string | null;
  valuePerHour: number;
  maxSlots: number;
  notes: string | null;
  service: { id: string; name: string };
  filledSlots: number;
  myStatus: string | null;
  myApplicationId: string | null;
}

interface EventJob {
  id: string;
  name: string;
  startAt: string | null;
  venues: { venue: { name: string; city?: string } }[];
  employer: { name: string } | null;
  services: Slot[];
}

const PT_MONTHS = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function dateBadge(dt: string | null) {
  if (!dt) return { day: '—', month: '' };
  const d = new Date(dt);
  return { day: String(d.getDate()).padStart(2, '0'), month: PT_MONTHS[d.getMonth()] };
}

function fmtTime(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function calcTotal(valuePerHour: number, startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return `R$ ${valuePerHour.toFixed(2)}/h`;
  const hours = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3600000;
  return `R$ ${(valuePerHour * hours).toFixed(2)}`;
}

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<EventJob[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [userRes, jobsRes] = await Promise.all([authApi.me(), freelancerApi.jobs()]);
      setUser(userRes.user);
      setJobs(jobsRes.jobs || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/freelancer/login');
        return;
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    router.replace('/freelancer/login');
  }

  async function handleApply(slotId: string) {
    try {
      await freelancerApi.apply(slotId);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleCancel(applicationId: string, role: string) {
    if (!confirm(`Cancelar candidatura para ${role}?`)) return;
    try {
      await freelancerApi.cancelApplication(applicationId);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const filtered = jobs.filter(ev =>
    !search ||
    ev.name.toLowerCase().includes(search.toLowerCase()) ||
    ev.venues[0]?.venue.name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalApplied = jobs.reduce((n, ev) => n + ev.services.filter(s => s.myStatus).length, 0);
  const totalApproved = jobs.reduce((n, ev) => n + ev.services.filter(s => s.myStatus === 'approved').length, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Header — dark, YouDO brand */}
      <header className="bg-[#1a1f2e]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-lg tracking-tight">
              You<span className="text-orange-400">DO</span>
            </span>
            <div className="w-px h-5 bg-white/20" />
            <div>
              <p className="text-white/50 text-[10px] uppercase tracking-widest leading-none">Freelancer</p>
              <p className="text-white text-sm font-medium leading-tight">{user?.name ?? '—'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Sair"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-10">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Eventos', value: jobs.length, color: 'text-[#1a1f2e]' },
            { label: 'Candidaturas', value: totalApplied, color: 'text-orange-500' },
            { label: 'Confirmados', value: totalApproved, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar evento, local..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400/40 shadow-sm"
          />
        </div>

        {/* Event cards */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-400 text-sm">Nenhuma vaga disponível para seu perfil.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ev) => {
              const { day, month } = dateBadge(ev.startAt);
              const venue = ev.venues[0]?.venue;
              return (
                <div key={ev.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Event header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <div className="w-12 h-12 bg-orange-400 rounded-xl flex flex-col items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-white font-bold text-lg leading-none">{day}</span>
                      <span className="text-white/80 text-[9px] uppercase tracking-wide">{month}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1a1f2e] text-sm truncate">{ev.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>🕐 {fmtTime(ev.startAt)}</span>
                        {venue && <span>📍 {venue.name}</span>}
                        {ev.employer && <span>🏢 {ev.employer.name}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Slot rows */}
                  <div className="divide-y divide-gray-50">
                    {ev.services.map((slot) => {
                      const pct = slot.maxSlots > 0 ? Math.min((slot.filledSlots / slot.maxSlots) * 100, 100) : 0;
                      const isApplied = !!slot.myStatus;
                      const isApproved = slot.myStatus === 'approved';
                      const isPending = slot.myStatus === 'pending';
                      return (
                        <div key={slot.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium text-[#1a1f2e]">{slot.service.name}</p>
                                <span className="text-xs text-gray-400 font-semibold">{calcTotal(slot.valuePerHour, slot.startAt, slot.endAt)}</span>
                              </div>
                              <p className="text-xs text-gray-400 mb-1.5">{slot.filledSlots}/{slot.maxSlots} preenchidas</p>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-orange-400 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {isApproved ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold border border-green-200">
                                  ✓ Inscrito
                                </span>
                              ) : isPending ? (
                                <button
                                  onClick={() => slot.myApplicationId && handleCancel(slot.myApplicationId, slot.service.name)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full text-xs font-semibold border border-yellow-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                >
                                  ○ Pendente
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleApply(slot.id)}
                                  disabled={slot.filledSlots >= slot.maxSlots}
                                  className="px-4 py-1.5 bg-orange-400 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-full text-xs font-semibold transition-colors shadow-sm"
                                >
                                  {slot.filledSlots >= slot.maxSlots ? 'Lotado' : 'Candidatar-se'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
