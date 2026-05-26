'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { authApi, freelancerApi } from '@/lib/api';
import {
  Briefcase, CheckCircle2, ClipboardList, Award,
  MapPin, Clock, Building2, Search, Bell,
  Sparkles, CheckCheck, Filter, X, Home, User, Camera,
  Copy, Check, Pencil, ShieldCheck, Mail, Phone,
  TrendingUp, DollarSign, AlertTriangle, Calendar,
  CreditCard, Wallet,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────
type Section = 'home' | 'servicos' | 'perfil';
type HomeTab = 'vagas' | 'candidaturas' | 'ganhos';

interface Job {
  id: string;
  event: { id: string; name: string; startAt: string; venues: any[]; employer: any };
  slots: { id: string; serviceId: string; quantity: number; filledCount: number; eventName: string }[];
}
interface Application {
  id: string;
  role: string;
  status: string;
  appliedAt: string;
  event: { id: string; name: string; startAt: string; venues: any[] };
}
interface Service { id: string; name: string; hourlyRate: number; description?: string }
interface EarningEntry {
  id: string; eventName: string; clientName: string; role: string;
  startAt: string | null; rate: number; hours: number; total: number; isPast: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── CSS tokens ───────────────────────────────────────────────────────────────
const G_HERO    = 'linear-gradient(135deg, #1a2035 0%, #141824 55%, #e07530 140%)';
const G_PRIMARY = 'linear-gradient(135deg, #e07530, #f09a50)';
const S_SOFT    = '0 1px 2px rgba(20,24,48,0.06), 0 2px 8px rgba(20,24,48,0.06)';
const S_GLOW    = '0 8px 24px rgba(224,117,48,0.35)';

// ─── page ─────────────────────────────────────────────────────────────────────
export default function FreelancerDashboardPage() {
  const [user, setUser]                 = useState<any>(null);
  const [jobs, setJobs]                 = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [services, setServices]         = useState<Service[]>([]);
  const [earnings, setEarnings]         = useState<any>(null);
  const [loading, setLoading]           = useState(true);

  const [section, setSection]   = useState<Section>('home');
  const [homeTab, setHomeTab]   = useState<HomeTab>('vagas');
  const [filter, setFilter]     = useState<'all' | 'available'>('all');
  const [search, setSearch]     = useState('');

  const [cancelTarget, setCancelTarget] = useState<Application | null>(null);
  const [cancelling, setCancelling]     = useState(false);
  const [applying, setApplying]         = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const userRes = await authApi.me().catch(() => null);
      if (!userRes?.user || userRes.user.role !== 'freelancer') {
        window.location.href = '/freelancer/login';
        return;
      }
      setUser(userRes.user);

      const [jobsRes, appsRes, profileRes, earningsRes] = await Promise.all([
        freelancerApi.jobs().catch(() => ({ jobs: [] })),
        freelancerApi.applications().catch(() => ({ applications: [] })),
        freelancerApi.profile().catch(() => null),
        freelancerApi.earnings().catch(() => null),
      ]);

      setJobs(jobsRes.jobs || []);
      setApplications((appsRes.applications || []).filter((a: Application) => a.status !== 'cancelled'));

      const fd = profileRes?.profile || profileRes?.freelancer;
      if (fd?.services) setServices(fd.services.map((s: any) => s.service));
      if (earningsRes?.success) setEarnings(earningsRes);
    } catch {
      window.location.href = '/freelancer/login';
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(eventId: string, slotId: string, role: string) {
    setApplying(slotId);
    try {
      await freelancerApi.apply(eventId, role);
      await loadAll();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setApplying(null);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await freelancerApi.cancelApplication(cancelTarget.id);
      setCancelTarget(null);
      await loadAll();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      setCancelling(false);
    }
  }

  const stats = useMemo(() => {
    const available = jobs.reduce((n, j) => n + j.slots.filter(s => s.filledCount < s.quantity).length, 0);
    const confirmed = applications.filter(a => a.status === 'approved').length;
    return { available, applied: applications.length, confirmed, score: user?.score ?? 100 };
  }, [jobs, applications, user]);

  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (filter === 'available') list = list.filter(j => j.slots.some(s => s.filledCount < s.quantity));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.event.name.toLowerCase().includes(q) ||
        (j.event.venues?.[0]?.venue?.name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, filter, search]);

  const appliedKeys = useMemo(
    () => new Set(applications.map(a => `${a.event.id}::${a.role}`)),
    [applications]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: G_HERO }}>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* ── Header ──────────────────────────────── */}
      <header className="sticky top-0 z-20 px-4 pb-5 pt-5 text-white" style={{ background: G_HERO }}>
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl font-extrabold tracking-tight">
              <span className="text-white/80">You</span>
              <span style={{ color: '#f0a060' }}>DO</span>
            </div>
            <span className="h-5 w-px bg-white/20" />
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-70">Freelancer</p>
              <h1 className="text-sm font-semibold tracking-tight">
                {section === 'home' ? user?.name
                  : section === 'servicos' ? 'Serviços Autorizados'
                  : 'Meu Perfil'}
              </h1>
            </div>
          </div>
          <button
            onClick={() => authApi.logout().then(() => { window.location.href = '/freelancer/login'; })}
            className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur transition active:scale-95"
            aria-label="Sair"
          >
            <Bell className="h-5 w-5" />
            {stats.applied > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-400" />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-4">

        {/* ══ HOME ═══════════════════════════════════ */}
        {section === 'home' && (
          <>
            {/* Stats */}
            <div className="-mt-8 grid grid-cols-2 gap-3">
              {[
                { label: 'Vagas Disponíveis',     value: stats.available,  Icon: Briefcase,    color: 'text-gray-800'   },
                { label: 'Minhas Candidaturas',   value: stats.applied,    Icon: ClipboardList, color: 'text-blue-600'  },
                { label: 'Trabalhos Confirmados', value: stats.confirmed,  Icon: CheckCircle2, color: 'text-green-600'  },
                { label: 'Score',                 value: stats.score,      Icon: Award,        color: 'text-orange-500' },
              ].map(c => (
                <div key={c.label} className="rounded-2xl border bg-white p-3" style={{ boxShadow: S_SOFT }}>
                  <div className="flex items-center gap-2 text-gray-400">
                    <c.Icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] leading-none">{c.label}</span>
                  </div>
                  <div className={cn('mt-2 text-2xl font-bold tracking-tight', c.color)}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="mt-5 grid grid-cols-3 rounded-full bg-gray-200 p-1">
              {([
                { id: 'vagas',        label: 'Vagas',        badge: stats.available },
                { id: 'candidaturas', label: 'Candidaturas', badge: stats.applied   },
                { id: 'ganhos',       label: 'Ganhos',       badge: null            },
              ] as { id: HomeTab; label: string; badge: number | null }[]).map(t => {
                const active = homeTab === t.id;
                return (
                  <button key={t.id} onClick={() => setHomeTab(t.id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition',
                      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    )}>
                    {t.label}
                    {t.badge !== null && (
                      <span className={cn(
                        'min-w-4 rounded-full px-1 text-[10px] font-semibold',
                        active ? 'text-white' : 'bg-gray-300 text-gray-500'
                      )} style={active ? { background: G_PRIMARY } : {}}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Vagas ── */}
            {homeTab === 'vagas' && (
              <>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-full border bg-white px-3 py-2">
                    <Search className="h-4 w-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar evento, local..."
                      className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400" />
                  </div>
                  <button
                    onClick={() => setFilter(f => f === 'all' ? 'available' : 'all')}
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-full border transition',
                      filter === 'available' ? 'text-white' : 'bg-white text-gray-500'
                    )}
                    style={filter === 'available' ? { background: G_PRIMARY } : {}}
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {filteredJobs.map(job => (
                    <JobCard key={job.id} job={job} appliedKeys={appliedKeys} applying={applying}
                      onApply={(slotId, role) => handleApply(job.event.id, slotId, role)} />
                  ))}
                  {filteredJobs.length === 0 && (
                    <EmptyState icon={Briefcase} text="Nenhuma vaga disponível no momento" />
                  )}
                </div>
              </>
            )}

            {/* ── Candidaturas ── */}
            {homeTab === 'candidaturas' && (
              <div className="mt-4 space-y-3">
                {applications.map(app => (
                  <ApplicationCard key={app.id} app={app} onCancel={() => setCancelTarget(app)} />
                ))}
                {applications.length === 0 && (
                  <EmptyState icon={ClipboardList} text="Você ainda não se candidatou a nenhuma vaga" />
                )}
              </div>
            )}

            {/* ── Ganhos ── */}
            {homeTab === 'ganhos' && <EarningsSection earnings={earnings} />}
          </>
        )}

        {/* ══ SERVIÇOS ════════════════════════════════ */}
        {section === 'servicos' && <ServicesSection services={services} />}

        {/* ══ PERFIL ══════════════════════════════════ */}
        {section === 'perfil' && <ProfileSection user={user} services={services} />}
      </main>

      {/* ── Bottom nav ─────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {([
            { id: 'home',     label: 'Início',   Icon: Home     },
            { id: 'servicos', label: 'Serviços', Icon: Sparkles },
            { id: 'perfil',   label: 'Perfil',   Icon: User     },
          ] as { id: Section; label: string; Icon: any }[]).map(it => (
            <button key={it.id} onClick={() => setSection(it.id)}
              className={cn(
                'flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition',
                section === it.id ? 'text-orange-500' : 'text-gray-400'
              )}>
              <span className={cn('grid h-9 w-9 place-items-center rounded-full transition', section === it.id && 'bg-orange-50')}>
                <it.Icon className="h-5 w-5" />
              </span>
              {it.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Cancel modal ───────────────────────────── */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6" style={{ boxShadow: S_SOFT }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Cancelar candidatura?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Você está cancelando sua confirmação como{' '}
                  <strong>{cancelTarget.role}</strong> no evento{' '}
                  <strong>{cancelTarget.event.name}</strong>.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 flex gap-2 mb-5">
              <ShieldCheck className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700">
                <strong>Atenção:</strong> cancelamentos de vagas confirmadas podem gerar penalidades no seu score.
                Cancelamentos frequentes reduzem sua prioridade em futuras vagas.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCancelTarget(null)}
                className="flex-1 rounded-full border py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                Manter vaga
              </button>
              <button onClick={confirmCancel} disabled={cancelling}
                className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: G_PRIMARY }}>
                {cancelling ? 'Cancelando...' : 'Cancelar mesmo assim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── JobCard ──────────────────────────────────────────────────────────────────
function JobCard({ job, appliedKeys, applying, onApply }: {
  job: Job;
  appliedKeys: Set<string>;
  applying: string | null;
  onApply: (slotId: string, role: string) => void;
}) {
  const d     = new Date(job.event.startAt);
  const day   = d.toLocaleDateString('pt-BR', { day: '2-digit' });
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  const time  = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <article className="overflow-hidden rounded-2xl border bg-white" style={{ boxShadow: S_SOFT }}>
      <div className="flex gap-3 p-4">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-white"
          style={{ background: G_PRIMARY }}>
          <span className="text-lg font-bold leading-none">{day}</span>
          <span className="text-[10px] uppercase tracking-wider opacity-90">{month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">{job.event.name}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {time}</span>
            {job.event.venues?.[0]?.venue?.name && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {job.event.venues[0].venue.name}
              </span>
            )}
            {job.event.employer?.name && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {job.event.employer.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t bg-gray-50 p-3">
        {job.slots.map(slot => {
          const key     = `${job.event.id}::${slot.eventName}`;
          const applied = appliedKeys.has(key);
          const full    = slot.filledCount >= slot.quantity;
          const pct     = slot.quantity > 0 ? (slot.filledCount / slot.quantity) * 100 : 0;
          const busy    = applying === slot.id;
          return (
            <div key={slot.id} className="rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-gray-900">{slot.eventName}</span>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {slot.filledCount}/{slot.quantity} preenchidas
                  </p>
                </div>
                {applied ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-600">
                    <Check className="h-3.5 w-3.5" /> Inscrito
                  </span>
                ) : full ? (
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400">
                    Vaga cheia
                  </span>
                ) : (
                  <button disabled={busy} onClick={() => onApply(slot.id, slot.eventName)}
                    className="rounded-full px-4 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-60"
                    style={{ background: G_PRIMARY, boxShadow: S_GLOW }}>
                    {busy ? '...' : 'Candidatar-se'}
                  </button>
                )}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: G_PRIMARY }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ─── ApplicationCard ──────────────────────────────────────────────────────────
function ApplicationCard({ app, onCancel }: { app: Application; onCancel: () => void }) {
  const d    = new Date(app.event.startAt);
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const time  = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const statusCfg = ({
    approved: { label: 'Confirmado', cls: 'bg-green-50 text-green-600 border-green-200'  },
    pending:  { label: 'Pendente',   cls: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
    rejected: { label: 'Rejeitado',  cls: 'bg-red-50 text-red-500 border-red-200'         },
  } as any)[app.status] ?? { label: app.status, cls: 'bg-gray-100 text-gray-500 border-gray-200' };

  return (
    <article className="flex items-center gap-3 rounded-2xl border bg-white p-3" style={{ boxShadow: S_SOFT }}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white" style={{ background: G_PRIMARY }}>
        <Calendar className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-gray-900">{app.event.name}</h3>
        <p className="text-xs text-gray-400">{app.role} • {label} • {time}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>
        {app.status === 'approved' && (
          <button onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-full border border-red-200 bg-red-50 text-red-500 transition active:scale-95"
            aria-label="Cancelar participação">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}

// ─── EarningsSection ──────────────────────────────────────────────────────────
function EarningsSection({ earnings }: { earnings: any }) {
  if (!earnings) return <EmptyState icon={DollarSign} text="Nenhum ganho registrado ainda" />;

  const { realized, upcoming, totalRealized, totalUpcoming } = earnings;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4" style={{ boxShadow: S_SOFT }}>
          <div className="flex items-center gap-1.5 text-gray-400 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-[11px]">Já realizados</span>
          </div>
          <p className="text-xl font-bold text-green-600">{fmtCurrency(totalRealized)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4" style={{ boxShadow: S_SOFT }}>
          <div className="flex items-center gap-1.5 text-gray-400 mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[11px]">A receber</span>
          </div>
          <p className="text-xl font-bold text-orange-500">{fmtCurrency(totalUpcoming)}</p>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden" style={{ boxShadow: S_SOFT }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-orange-50">
            <Wallet className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-900">A receber</h3>
          </div>
          <div className="divide-y">
            {upcoming.map((e: EarningEntry) => <EarningRow key={e.id} entry={e} />)}
          </div>
        </div>
      )}

      {realized.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden" style={{ boxShadow: S_SOFT }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <h3 className="text-sm font-semibold text-gray-900">Realizados</h3>
          </div>
          <div className="divide-y">
            {realized.map((e: EarningEntry) => <EarningRow key={e.id} entry={e} past />)}
          </div>
        </div>
      )}

      {realized.length === 0 && upcoming.length === 0 && (
        <EmptyState icon={DollarSign} text="Nenhum ganho registrado ainda" />
      )}

      <p className="text-center text-[11px] text-gray-400 pb-2">
        Valores estimados com base na taxa horária e duração dos eventos.
      </p>
    </div>
  );
}

function EarningRow({ entry, past = false }: { entry: EarningEntry; past?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
        style={{ background: past ? '#9ca3af' : G_PRIMARY }}>
        <DollarSign className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{entry.eventName}</p>
        <p className="text-xs text-gray-400">
          {entry.role}
          {entry.startAt && ` • ${fmtDate(entry.startAt)}`}
          {entry.hours > 0 && ` • ${entry.hours}h × R$ ${entry.rate}/h`}
        </p>
      </div>
      <span className={`text-sm font-bold shrink-0 ${past ? 'text-green-600' : 'text-orange-500'}`}>
        {fmtCurrency(entry.total)}
      </span>
    </div>
  );
}

// ─── ServicesSection ──────────────────────────────────────────────────────────
function ServicesSection({ services }: { services: Service[] }) {
  return (
    <section className="space-y-3 pt-2">
      <div className="rounded-2xl border bg-white p-4" style={{ boxShadow: S_SOFT }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold">Meus Serviços Autorizados</h2>
        </div>
        <p className="mt-1 text-xs text-gray-400">Você está autorizado a se candidatar nestas funções.</p>
      </div>
      <div className="space-y-2">
        {services.length === 0 ? (
          <EmptyState icon={Sparkles} text="Nenhum serviço autorizado. Entre em contato com o administrador." />
        ) : services.map(s => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl border bg-white p-4" style={{ boxShadow: S_SOFT }}>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: G_PRIMARY }}>
              <CheckCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{s.name}</h3>
              {s.description && <p className="text-[11px] text-gray-400 line-clamp-1">{s.description}</p>}
            </div>
            {s.hourlyRate > 0 && (
              <span className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-600 shrink-0">
                R$ {s.hourlyRate}/h
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-gray-50 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-orange-500 shrink-0" />
        <p className="text-xs text-gray-500">
          Para liberar novas funções, entre em contato com o gestor YOUDO. A equipe revisa e autoriza em até 48h.
        </p>
      </div>
    </section>
  );
}

// ─── ProfileSection ───────────────────────────────────────────────────────────
function ProfileSection({ user, services }: { user: any; services: Service[] }) {
  const [pix, setPix]            = useState(user?.pix || user?.email || '');
  const [editingPix, setEditPix] = useState(false);
  const [pixDraft, setPixDraft]  = useState(pix);
  const [copied, setCopied]      = useState(false);
  const [photo, setPhoto]        = useState<string | null>(null);
  const fileRef                  = useRef<HTMLInputElement>(null);

  const copyPix = async () => {
    await navigator.clipboard.writeText(pix);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const savePix = () => { setPix(pixDraft.trim()); setEditPix(false); };

  return (
    <section className="space-y-3 pt-2">
      {/* Photo card */}
      <div className="flex flex-col items-center rounded-2xl border bg-white p-5" style={{ boxShadow: S_SOFT }}>
        <div className="relative">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full text-white" style={{ background: G_PRIMARY }}>
            {photo
              ? <img src={photo} alt="Foto" className="h-full w-full object-cover" />
              : <User className="h-10 w-10" />}
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full text-white transition active:scale-95"
            style={{ background: G_PRIMARY, boxShadow: S_GLOW }}>
            <Camera className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)); }} />
        </div>
        <h2 className="mt-3 text-base font-semibold text-gray-900">{user?.name}</h2>
        <p className="text-xs text-gray-400">{photo ? 'Foto atualizada' : 'Toque na câmera para adicionar sua foto'}</p>
      </div>

      {/* Contact info */}
      <div className="rounded-2xl border bg-white" style={{ boxShadow: S_SOFT }}>
        <InfoRow icon={Mail}       label="E-mail"   value={user?.email || '—'} />
        <div className="mx-4 h-px bg-gray-100" />
        <InfoRow icon={Phone}      label="Telefone" value={user?.phone || '—'} />
        <div className="mx-4 h-px bg-gray-100" />
        <InfoRow icon={CreditCard} label="CPF"
          value={user?.cpf
            ? String(user.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            : '—'} />
      </div>

      {/* PIX */}
      <div className="rounded-2xl border bg-white p-4" style={{ boxShadow: S_SOFT }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: G_PRIMARY }}>
              <span className="text-[11px] font-bold">PIX</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Chave PIX</h3>
              <p className="text-[11px] text-gray-400">Usada para receber pagamentos</p>
            </div>
          </div>
          {!editingPix && (
            <button onClick={() => { setPixDraft(pix); setEditPix(true); }}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 transition active:scale-95">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
          )}
        </div>
        {editingPix ? (
          <div className="mt-3 space-y-2">
            <input autoFocus value={pixDraft} onChange={e => setPixDraft(e.target.value)}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              className="w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-orange-400" />
            <div className="flex gap-2">
              <button onClick={() => setEditPix(false)}
                className="flex-1 rounded-full border py-2 text-xs font-semibold text-gray-600">Cancelar</button>
              <button onClick={savePix} disabled={!pixDraft.trim()}
                className="flex-1 rounded-full py-2 text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: G_PRIMARY }}>
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className="flex-1 truncate text-sm font-medium text-gray-700">{pix || '—'}</span>
            {pix && (
              <button onClick={copyPix}
                className="grid h-8 w-8 place-items-center rounded-lg bg-white text-gray-400 transition active:scale-95">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Services summary */}
      {services.length > 0 && (
        <div className="rounded-2xl border bg-white p-4" style={{ boxShadow: S_SOFT }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold">Serviços autorizados</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {services.map(s => (
              <span key={s.id} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
                {s.name}{s.hourlyRate > 0 ? ` • R$ ${s.hourlyRate}/h` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={() => authApi.logout().then(() => { window.location.href = '/freelancer/login'; })}
        className="w-full rounded-2xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-100">
        Sair da conta
      </button>
    </section>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-gray-100 text-gray-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className="truncate text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed bg-white p-8 text-center">
      <Icon className="h-8 w-8 text-gray-300" />
      <p className="mt-3 text-sm text-gray-400">{text}</p>
    </div>
  );
}
