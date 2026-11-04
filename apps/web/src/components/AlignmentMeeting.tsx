'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Plus, Users, UtensilsCrossed, Wrench, MapPin, Music, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Step {
  id: string;
  kind: 'venue' | 'item';
  section: string;
  context: string;
  itemId?: string;
  question: { id: string; text: string; type: string; required: boolean; options: string[] | null };
  answer: any;
  answered: boolean;
}
interface Participant { personId: string; name: string; role: string }
interface Meeting { id: string; startedAt: string; currentStep: number; participants: Participant[] }
interface ContextItem { id: string; name: string; quantity: number | null; unit: string | null; notes: string | null }
interface Ctx { ab: ContextItem[]; infra: ContextItem[]; entretenimento: ContextItem[]; espacos: { id: string; name: string; capacity: number | null }[] }
interface Person { id: string; name: string; whatsapp: string | null }
interface Data {
  meeting: Meeting | null;
  lastFinished: { id: string; endedAt: string; summary: any } | null;
  steps: Step[];
  summary: { total: number; answered: number; pending: number; requiredPending: number };
  context: Ctx;
  members: Participant[];
}

const hasAnswer = (a: any) => a != null && a !== '' && !(Array.isArray(a) && a.length === 0);
const jsonHeaders = { 'Content-Type': 'application/json' };

async function api(url: string, method = 'GET', body?: unknown) {
  const res = await fetch(url, { method, credentials: 'include', headers: body ? jsonHeaders : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

// Reunião padrão de alinhamento do plano do evento: informa os participantes (viram pessoas do
// evento), percorre as perguntas do plano na ordem do roteiro gravando as respostas no plano e
// mantém, ao lado, o que foi contratado (A&B, Infraestrutura, Espaços, Entretenimento).
export default function AlignmentMeeting({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [panel, setPanel] = useState<'ab' | 'infra' | 'espacos' | 'entretenimento'>('ab');
  const [addingPerson, setAddingPerson] = useState(false);

  const load = useCallback(async () => {
    try {
      const d: Data = await api(`/api/v2/events/${eventId}/alignment`);
      setData(d);
      setError('');
      return d;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }, [eventId]);

  useEffect(() => { load().then(d => { if (d?.meeting) setStep(Math.min(d.meeting.currentStep, Math.max(d.steps.length - 1, 0))); }); }, [load]);

  if (error && !data) return <Shell onClose={onClose}><p className="p-8 text-center text-destructive">{error}</p></Shell>;
  if (!data) return <Shell onClose={onClose}><p className="p-8 text-center text-muted-foreground">Carregando roteiro...</p></Shell>;

  if (!data.meeting) {
    return (
      <Shell onClose={onClose}>
        <StartScreen eventId={eventId} data={data} onStarted={async () => { setStep(0); await load(); }} />
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <Running eventId={eventId} data={data} meeting={data.meeting} step={step} setStep={setStep} panel={panel} setPanel={setPanel}
        reload={load} addingPerson={addingPerson} setAddingPerson={setAddingPerson} onClose={onClose} />
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-center sm:p-4">
      <div className="bg-background w-full max-w-6xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="font-semibold">Reunião de alinhamento do plano</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      </div>
    </div>
  );
}

// ── Participantes (usado ao iniciar e durante a reunião) ─────────────────────

function PeoplePicker({ eventId, existingIds, onAdd, onCancel }: {
  eventId: string; existingIds: string[]; onAdd: (p: Participant) => Promise<void>; onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [role, setRole] = useState('Participante');
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [form, setForm] = useState({ name: '', whatsapp: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (mode !== 'search' || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/v2/people?q=${encodeURIComponent(q)}`, { credentials: 'include' }).then(r => r.json()).then(d => setResults(d.people ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  // Vincula a pessoa às "pessoas do evento" (mesmo vínculo da aba Pessoas) e devolve como participante.
  async function link(person: Person) {
    setBusy(true); setErr('');
    try {
      await api(`/api/v2/events/${eventId}/members`, 'POST', { personId: person.id, role: role.trim() || 'Participante' });
      await onAdd({ personId: person.id, name: person.name, role: role.trim() || 'Participante' });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function createAndLink() {
    if (!form.name.trim()) return;
    setBusy(true); setErr('');
    try {
      const d = await api('/api/v2/people', 'POST', { name: form.name.trim(), whatsapp: form.whatsapp.trim() || null });
      await link(d.person);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
      <div className="flex items-center gap-2">
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Função na reunião (ex.: Cliente, Cerimonial)" className="flex-1 text-sm px-2 py-1.5 border rounded bg-background" />
        <button onClick={() => setMode(mode === 'search' ? 'new' : 'search')} className="text-xs underline text-muted-foreground whitespace-nowrap">
          {mode === 'search' ? 'Pessoa nova' : 'Buscar cadastro'}
        </button>
      </div>
      {mode === 'search' ? (
        <>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou CPF…" className="w-full text-sm px-2 py-1.5 border rounded bg-background" />
          <div className="max-h-40 overflow-y-auto divide-y">
            {results.filter(p => !existingIds.includes(p.id)).map(p => (
              <button key={p.id} disabled={busy} onClick={() => link(p)} className="w-full text-left text-sm px-2 py-1.5 hover:bg-muted flex justify-between disabled:opacity-50">
                <span>{p.name}</span><span className="text-xs text-muted-foreground">{p.whatsapp ?? ''}</span>
              </button>
            ))}
            {q.trim().length >= 2 && results.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">Nenhum cadastro encontrado — use "Pessoa nova".</p>}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome *" className="text-sm px-2 py-1.5 border rounded bg-background" />
          <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="WhatsApp" className="text-sm px-2 py-1.5 border rounded bg-background" />
          <button disabled={busy || !form.name.trim()} onClick={createAndLink} className="col-span-2 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Salvando…' : 'Cadastrar e adicionar'}</button>
        </div>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end"><button onClick={onCancel} className="text-xs px-2 py-1 border rounded hover:bg-muted">Fechar</button></div>
    </div>
  );
}

function StartScreen({ eventId, data, onStarted }: { eventId: string; data: Data; onStarted: () => Promise<void> }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const addable = data.members.filter(m => !participants.some(p => p.personId === m.personId));

  async function start() {
    setBusy(true); setErr('');
    try {
      await api(`/api/v2/events/${eventId}/alignment/start`, 'POST', { participants: participants.map(p => ({ personId: p.personId, role: p.role })) });
      await onStarted();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Quem está participando da reunião?</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Quem for adicionado aqui fica vinculado às pessoas do evento. O roteiro tem <strong>{data.summary.total}</strong> perguntas
          ({data.summary.answered} já respondidas, {data.summary.pending} pendentes), na ordem: espaços → A&B → infraestrutura → entretenimento.
        </p>
        {data.lastFinished && <p className="text-xs text-muted-foreground mt-1">Última reunião finalizada em {new Date(data.lastFinished.endedAt).toLocaleString('pt-BR')}.</p>}
      </div>

      {data.members.length > 0 && addable.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Já são pessoas do evento — toque para incluir</p>
          <div className="flex flex-wrap gap-2">
            {addable.map(m => (
              <button key={m.personId} onClick={() => setParticipants(p => [...p, m])} className="text-sm px-3 py-1.5 border rounded-full hover:bg-muted flex items-center gap-1">
                <Plus size={12} /> {m.name} <span className="text-xs text-muted-foreground">· {m.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Participantes ({participants.length})</p>
        <div className="space-y-1.5">
          {participants.map(p => (
            <div key={p.personId} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <span><Users size={13} className="inline mr-1.5 text-muted-foreground" />{p.name} <span className="text-xs text-muted-foreground">· {p.role}</span></span>
              <button onClick={() => setParticipants(list => list.filter(x => x.personId !== p.personId))} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>
            </div>
          ))}
          {participants.length === 0 && <p className="text-sm text-muted-foreground italic">Nenhum participante ainda.</p>}
        </div>
        <div className="mt-2">
          {adding
            ? <PeoplePicker eventId={eventId} existingIds={participants.map(p => p.personId)} onAdd={async p => { setParticipants(l => [...l, p]); }} onCancel={() => setAdding(false)} />
            : <button onClick={() => setAdding(true)} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-muted flex items-center gap-1"><Plus size={14} /> Adicionar pessoa</button>}
        </div>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}
      <button onClick={start} disabled={busy || participants.length === 0 || data.steps.length === 0}
        className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50">
        {busy ? 'Iniciando…' : data.steps.length === 0 ? 'Este evento não tem perguntas no plano' : 'Iniciar reunião'}
      </button>
    </div>
  );
}

// ── Reunião em andamento ─────────────────────────────────────────────────────

function Running({ eventId, data, meeting, step, setStep, panel, setPanel, reload, addingPerson, setAddingPerson, onClose }: {
  eventId: string; data: Data; meeting: Meeting; step: number; setStep: (n: number) => void;
  panel: 'ab' | 'infra' | 'espacos' | 'entretenimento'; setPanel: (p: any) => void; reload: () => Promise<Data | null>;
  addingPerson: boolean; setAddingPerson: (b: boolean) => void; onClose: () => void;
}) {
  const steps = data.steps;
  const cur = steps[Math.min(step, steps.length - 1)];
  const [draft, setDraft] = useState<any>(undefined);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const lastSavedStep = useRef(-1);

  useEffect(() => { setDraft(undefined); setErr(''); }, [cur?.id]);

  useEffect(() => {
    const tick = () => {
      const mins = Math.floor((Date.now() - new Date(meeting.startedAt).getTime()) / 60000);
      setElapsed(mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : `${mins} min`);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [meeting.startedAt]);

  const sections = useMemo(() => {
    const out: { name: string; first: number; total: number; done: number }[] = [];
    steps.forEach((s, i) => {
      let sec = out.find(o => o.name === s.section);
      if (!sec) { sec = { name: s.section, first: i, total: 0, done: 0 }; out.push(sec); }
      sec.total++; if (s.answered) sec.done++;
    });
    return out;
  }, [steps]);

  async function persistAnswer(): Promise<boolean> {
    if (!cur || draft === undefined) return true;
    setSaving(true); setErr('');
    try {
      const url = cur.kind === 'venue'
        ? `/api/v2/events/${eventId}/venue-answers/${cur.question.id}`
        : `/api/v2/events/${eventId}/items/${cur.itemId}/answers/${cur.question.id}`;
      await api(url, 'PUT', { answer: draft });
      await reload();
      setDraft(undefined);
      return true;
    } catch (e: any) { setErr(e.message); return false; } finally { setSaving(false); }
  }

  async function go(next: number) {
    if (next < 0 || next >= steps.length) return;
    if (!(await persistAnswer())) return; // não avança se não conseguiu salvar
    setStep(next);
    if (lastSavedStep.current !== next) {
      lastSavedStep.current = next;
      api(`/api/v2/events/${eventId}/alignment/${meeting.id}`, 'PATCH', { currentStep: next }).catch(() => {});
    }
  }

  async function addParticipant(p: Participant) {
    const list = [...meeting.participants, p].map(x => ({ personId: x.personId, role: x.role }));
    await api(`/api/v2/events/${eventId}/alignment/${meeting.id}`, 'PATCH', { participants: list });
    await reload();
  }

  async function finish() {
    if (!(await persistAnswer())) return;
    const pend = data.summary.requiredPending;
    const msg = pend > 0
      ? `Ainda há ${pend} pergunta(s) obrigatória(s) sem resposta (${data.summary.pending} pendentes no total). Finalizar mesmo assim?`
      : `Finalizar a reunião? ${data.summary.answered}/${data.summary.total} perguntas respondidas.`;
    if (!confirm(msg)) return;
    setFinishing(true);
    try {
      await api(`/api/v2/events/${eventId}/alignment/${meeting.id}/finish`, 'POST');
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setFinishing(false); }
  }

  if (!cur) return <p className="p-8 text-center text-muted-foreground">Este evento não tem perguntas no plano.</p>;

  const current = draft !== undefined ? draft : (cur.answer ?? null);
  const dirty = draft !== undefined;

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      {/* Coluna principal */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="px-5 py-3 border-b space-y-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-muted-foreground"><Clock size={12} /> {elapsed}</span>
            {meeting.participants.map(p => <span key={p.personId} className="px-2 py-0.5 bg-muted rounded-full">{p.name}<span className="text-muted-foreground"> · {p.role}</span></span>)}
            <button onClick={() => setAddingPerson(!addingPerson)} className="px-2 py-0.5 border rounded-full hover:bg-muted flex items-center gap-1"><Plus size={11} /> pessoa</button>
          </div>
          {addingPerson && <PeoplePicker eventId={eventId} existingIds={meeting.participants.map(p => p.personId)} onAdd={async p => { await addParticipant(p); }} onCancel={() => setAddingPerson(false)} />}
          <div className="flex flex-wrap gap-1.5">
            {sections.map(sec => (
              <button key={sec.name} onClick={() => go(sec.first)} className={`text-xs px-2.5 py-1 rounded-full border ${cur.section === sec.name ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>
                {sec.name} {sec.done}/{sec.total}
              </button>
            ))}
          </div>
          <div className="h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(data.summary.answered / Math.max(data.summary.total, 1)) * 100}%` }} /></div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="text-xs text-muted-foreground">
              Pergunta {step + 1} de {steps.length} · <strong>{cur.section}</strong> · {cur.context}
            </div>
            <h3 className="text-xl font-semibold leading-snug">
              {cur.question.required && <span className="text-destructive mr-1">*</span>}{cur.question.text}
            </h3>
            <AnswerInput q={cur.question} value={current} onChange={setDraft} />
            <div className="flex items-center gap-2 text-xs">
              {saving ? <span className="text-muted-foreground">Salvando…</span>
                : dirty ? <span className="text-amber-600">Alteração não salva — ela é gravada ao avançar.</span>
                : cur.answered ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Respondida</span>
                : cur.question.required ? <span className="text-amber-600 flex items-center gap-1"><AlertCircle size={12} /> Obrigatória</span> : null}
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-2 shrink-0">
          <button onClick={() => go(step - 1)} disabled={step === 0 || saving} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={14} /> Anterior</button>
          <button onClick={finish} disabled={finishing || saving} className="px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 flex items-center gap-1"><Check size={14} /> {finishing ? 'Finalizando…' : 'Finalizar reunião'}</button>
          <button onClick={() => go(step + 1)} disabled={step >= steps.length - 1 || saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-1 disabled:opacity-40">{dirty ? 'Salvar e próxima' : 'Próxima'} <ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Painel lateral: o que está contratado */}
      <aside className="lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col min-h-0 max-h-[40vh] lg:max-h-none shrink-0 bg-muted/20">
        <div className="flex border-b shrink-0">
          {([['ab', 'A&B', UtensilsCrossed], ['infra', 'Infra', Wrench], ['espacos', 'Espaços', MapPin], ['entretenimento', 'Entret.', Music]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setPanel(id)} className={`flex-1 py-2 text-xs flex flex-col items-center gap-0.5 border-b-2 ${panel === id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {panel === 'espacos'
            ? (data.context.espacos.length === 0 ? <Empty /> : data.context.espacos.map(e => (
                <div key={e.id} className="text-sm border rounded-lg px-3 py-2 bg-background"><p className="font-medium">{e.name}</p>{e.capacity ? <p className="text-xs text-muted-foreground">Capacidade {e.capacity}</p> : null}</div>
              )))
            : (data.context[panel].length === 0 ? <Empty /> : data.context[panel].map(i => (
                <div key={i.id} className="text-sm border rounded-lg px-3 py-2 bg-background">
                  <p className="font-medium leading-snug">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.quantity ?? ''}{i.unit ? ` ${i.unit}` : ''}</p>
                  {i.notes && <p className="text-xs text-muted-foreground mt-0.5">{i.notes}</p>}
                </div>
              )))}
        </div>
      </aside>
    </div>
  );
}

const Empty = () => <p className="text-sm text-muted-foreground italic text-center py-6">Nada contratado nesta categoria.</p>;

function AnswerInput({ q, value, onChange }: { q: Step['question']; value: any; onChange: (v: any) => void }) {
  const opts = q.options ?? [];
  const base = 'w-full text-base px-3 py-2 border rounded-lg bg-background';
  if (q.type === 'select') {
    return (
      <div className="grid gap-2">
        {opts.map(o => (
          <button key={o} onClick={() => onChange(o)} className={`text-left px-3 py-2.5 border rounded-lg text-sm ${value === o ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{o}</button>
        ))}
      </div>
    );
  }
  if (q.type === 'multiselect') {
    const sel: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2">
        {opts.map(o => {
          const on = sel.includes(o);
          return <button key={o} onClick={() => onChange(on ? sel.filter(x => x !== o) : [...sel, o])} className={`text-left px-3 py-2.5 border rounded-lg text-sm ${on ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{on ? '✓ ' : ''}{o}</button>;
        })}
      </div>
    );
  }
  if (q.type === 'textarea') return <textarea rows={5} value={value ?? ''} onChange={e => onChange(e.target.value)} className={`${base} resize-none`} />;
  if (q.type === 'number') return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)} className={base} />;
  return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} className={base} />;
}
