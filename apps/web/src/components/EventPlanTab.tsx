'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle, AlertCircle,
  Plus, Trash2, MapPin, Package, History, X, Check,
  FileText, Loader2,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnswerHistory { id: string; before: any; after: any; createdAt: string; user: { name: string } | null }
interface ItemAnswer { questionId: string; answer: any; updatedAt: string; updatedBy: { name: string } | null; history: AnswerHistory[] }
interface ProductQuestion { id: string; text: string; type: string; required: boolean; options: any }
interface EventItem { id: string; name: string; category: string; product: { questions: ProductQuestion[] } | null; answers: ItemAnswer[] }
interface VenueQuestion { id: string; venueId: string; text: string; type: string; required: boolean; options: any; order: number }
interface EventVenue { id: string; venue: { id: string; name: string; questions: VenueQuestion[] } }
interface VenueAnswer { questionId: string; answer: any; updatedAt: string; updatedBy: { name: string } | null; history: AnswerHistory[] }
interface PlanAnswer { id: string; textValue?: string; selectedOptions?: string[] }
interface PlanQuestion { id: string; text: string; type: string; required: boolean; options?: string[] | null; answers: PlanAnswer[]; sourceTemplateId?: string | null }
interface AppliedTemplate { id: string; title: string }
interface EventPlan { id: string; title: string; questions: PlanQuestion[]; appliedTemplates: AppliedTemplate[] }
interface PlanTemplate { id: string; title: string; description?: string; _count: { questions: number } }

interface Props { eventId: string }

// ── Generic question row (item/venue answers) ─────────────────────────────────

function QuestionRow({
  q, answer, onSave, onDelete,
}: {
  q: { id: string; text: string; type: string; required: boolean; options: any };
  answer: ItemAnswer | VenueAnswer | undefined;
  onSave: (qId: string, val: any) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<any>(undefined);
  const [showHist, setShowHist] = useState(false);
  const [saving, setSaving] = useState(false);
  const opts: string[] = Array.isArray(q.options) ? q.options : [];
  const current = draft !== undefined ? draft : (answer?.answer ?? null);
  const isDirty = draft !== undefined;
  const isAnswered = answer?.answer !== null && answer?.answer !== undefined && answer?.answer !== '';

  async function save() {
    if (draft === undefined) return;
    setSaving(true);
    try { await onSave(q.id, draft); setDraft(undefined); }
    finally { setSaving(false); }
  }

  return (
    <div className={`bg-background border rounded-lg p-3 transition ${isAnswered ? 'border-green-200' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 flex-1">
          <div className="mt-0.5 shrink-0">
            {isAnswered ? <CheckCircle size={14} className="text-green-500" />
              : q.required ? <AlertCircle size={14} className="text-amber-500" />
              : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted" />}
          </div>
          <p className="text-sm font-medium leading-snug">
            {q.required && <span className="text-destructive mr-1">*</span>}{q.text}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {answer && <button onClick={() => setShowHist(v => !v)} className="text-muted-foreground hover:text-foreground"><History size={11} /></button>}
          {onDelete && <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>}
        </div>
      </div>
      {answer && !isDirty && <p className="text-xs text-muted-foreground mb-1.5">{(answer as any).updatedBy?.name} · {formatDateTime(answer.updatedAt)}</p>}
      <QuestionInput type={q.type} opts={opts} current={current} onChange={setDraft} />
      {isDirty && <SaveCancel saving={saving} onSave={save} onCancel={() => setDraft(undefined)} />}
      {showHist && answer && (answer as any).history?.length > 0 && (
        <div className="mt-2 border-t pt-2 space-y-1">
          {(answer as any).history.map((h: AnswerHistory) => (
            <div key={h.id} className="text-xs text-muted-foreground border rounded px-2 py-1">
              <span className="font-medium text-foreground">{h.user?.name ?? 'Sistema'}</span> · {formatDateTime(h.createdAt)}<br />
              {String(h.before ?? '—')} → {String(h.after)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plan question row (PlanAnswer shape) ──────────────────────────────────────

function PlanQuestionRow({ q, eventId, onSaved }: { q: PlanQuestion; eventId: string; onSaved: () => void }) {
  const existing = q.answers?.[0];
  const rawValue = existing
    ? (existing.selectedOptions?.length ? existing.selectedOptions : existing.textValue ?? '')
    : (q.type === 'multiselect' ? [] : '');

  const [draft, setDraft] = useState<any>(undefined);
  const [saving, setSaving] = useState(false);
  const opts: string[] = Array.isArray(q.options) ? q.options : [];
  const current = draft !== undefined ? draft : rawValue;
  const isDirty = draft !== undefined;
  const isAnswered = existing && (
    (typeof existing.textValue === 'string' && existing.textValue !== '') ||
    (Array.isArray(existing.selectedOptions) && existing.selectedOptions.length > 0)
  );

  async function save() {
    if (draft === undefined) return;
    setSaving(true);
    try {
      const isMulti = q.type === 'multiselect';
      await fetch(`/api/v2/events/${eventId}/plan/answers`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: [{ questionId: q.id, ...(isMulti ? { selectedOptions: Array.isArray(draft) ? draft : [] } : { textValue: String(draft) }) }],
        }),
      });
      setDraft(undefined);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className={`bg-background border rounded-lg p-3 transition ${isAnswered ? 'border-green-200' : ''}`}>
      <div className="flex items-start gap-2 mb-2">
        <div className="mt-0.5 shrink-0">
          {isAnswered ? <CheckCircle size={14} className="text-green-500" />
            : q.required ? <AlertCircle size={14} className="text-amber-500" />
            : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted" />}
        </div>
        <p className="text-sm font-medium leading-snug">
          {q.required && <span className="text-destructive mr-1">*</span>}{q.text}
        </p>
      </div>
      <QuestionInput type={q.type} opts={opts} current={current} onChange={setDraft} />
      {isDirty && <SaveCancel saving={saving} onSave={save} onCancel={() => setDraft(undefined)} />}
    </div>
  );
}

// ── Shared input + save/cancel helpers ───────────────────────────────────────

function QuestionInput({ type, opts, current, onChange }: {
  type: string; opts: string[]; current: any; onChange: (v: any) => void;
}) {
  if (type === 'multiselect' && opts.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {opts.map(opt => {
          const sel: string[] = Array.isArray(current) ? current : [];
          const isSel = sel.includes(opt);
          return (
            <button key={opt} onClick={() => { const s = isSel ? sel.filter(x => x !== opt) : [...sel, opt]; onChange(s); }}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${isSel ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {opt}
            </button>
          );
        })}
      </div>
    );
  }
  if (type === 'select' && opts.length > 0) {
    return (
      <select value={current ?? ''} onChange={e => onChange(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded bg-background mb-2">
        <option value="">Selecionar...</option>
        {opts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  if (type === 'textarea') {
    return <textarea value={current ?? ''} onChange={e => onChange(e.target.value)} rows={2} className="w-full text-sm px-2 py-1.5 border rounded bg-background mb-2 resize-none" />;
  }
  if (type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input type="checkbox" checked={current === true || current === 'true'} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-primary" />
        <span className="text-sm">Sim</span>
      </label>
    );
  }
  return <input type={type === 'number' ? 'number' : 'text'} value={current ?? ''} onChange={e => onChange(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded bg-background mb-2" />;
}

function SaveCancel({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="text-xs px-2 py-1 rounded border hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
      <button onClick={onSave} disabled={saving} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50">
        <Check size={11} /> {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}

// ── Template selector modal ───────────────────────────────────────────────────

function TemplateSelectorModal({
  eventId,
  appliedIds,
  onClose,
  onApplied,
}: {
  eventId: string;
  appliedIds: string[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v2/plan-templates', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setTemplates(d.templates ?? []); setLoading(false); });
  }, []);

  const available = templates.filter(t => !appliedIds.includes(t.id));

  async function handleApply() {
    if (!selected) return;
    setApplying(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/events/${eventId}/plan/apply-template`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selected }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Erro'); return; }
      onApplied();
      onClose();
    } finally { setApplying(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2"><FileText size={16} /> Adicionar Template</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {templates.length === 0
              ? <>Nenhum template cadastrado. <a href="/admin/plan-templates" className="text-primary hover:underline">Criar →</a></>
              : 'Todos os templates já foram aplicados.'}
          </p>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {available.map(t => (
                <button key={t.id} onClick={() => setSelected(t.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition ${selected === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t._count.questions} perg.</span>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-destructive mb-2">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted">Cancelar</button>
              <button onClick={handleApply} disabled={!selected || applying}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50">
                {applying && <Loader2 size={14} className="animate-spin" />} Aplicar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── First template selector (when no plan at all) ─────────────────────────────

function FirstTemplateSelectorSection({ eventId, onPlanCreated }: { eventId: string; onPlanCreated: () => void }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {showModal && (
        <TemplateSelectorModal
          eventId={eventId}
          appliedIds={[]}
          onClose={() => setShowModal(false)}
          onApplied={onPlanCreated}
        />
      )}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 border-b">
          <FileText size={15} className="text-primary" />
          <span className="font-medium text-sm">Template do Plano</span>
          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-auto">Necessário</span>
        </div>
        <div className="px-4 py-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Selecione um template para definir as perguntas base deste plano.
          </p>
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition flex items-center gap-2 mx-auto">
            <Plus size={14} /> Selecionar template
          </button>
        </div>
      </div>
    </>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────

function Section({
  icon, title, badge, onRemove, removing, children,
}: {
  icon: React.ReactNode; title: string; badge?: string;
  onRemove?: () => void; removing?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="flex items-center px-4 py-3 hover:bg-muted/20 transition">
        <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setOpen(v => !v)}>
          {icon}
          <span className="font-medium text-sm">{title}</span>
          {badge && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{badge}</span>}
          {open ? <ChevronDown size={15} className="text-muted-foreground ml-auto" /> : <ChevronRight size={15} className="text-muted-foreground ml-auto" />}
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            disabled={removing}
            title="Remover template"
            className="ml-2 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition disabled:opacity-50 shrink-0"
          >
            {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EventPlanTab({ eventId }: Props) {
  const [plan, setPlan] = useState<EventPlan | null | undefined>(undefined);
  const [items, setItems] = useState<EventItem[]>([]);
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [venueAnswers, setVenueAnswers] = useState<VenueAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [removingTemplateId, setRemovingTemplateId] = useState<string | null>(null);
  const [addingQ, setAddingQ] = useState<Record<string, { text: string; type: string; required: boolean } | null>>({});

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/plan-overview`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan ?? null);
        setItems(data.items ?? []);
        setEventVenues(data.eventVenues ?? []);
        setVenueAnswers(data.venueAnswers ?? []);
      }
    } finally { setLoading(false); }
  }

  async function removeTemplate(templateId: string) {
    if (!confirm('Remover este template e suas perguntas do plano?')) return;
    setRemovingTemplateId(templateId);
    try {
      await fetch(`/api/v2/events/${eventId}/plan/templates/${templateId}`, {
        method: 'DELETE', credentials: 'include',
      });
      await load();
    } finally { setRemovingTemplateId(null); }
  }

  async function saveItemAnswer(itemId: string, questionId: string, answer: any) {
    await fetch(`/api/v2/events/${eventId}/items/${itemId}/answers/${questionId}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    await load();
  }

  async function saveVenueAnswer(questionId: string, answer: any) {
    await fetch(`/api/v2/events/${eventId}/venue-answers/${questionId}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    await load();
  }

  async function addVenueQuestion(venueId: string) {
    const form = addingQ[venueId];
    if (!form?.text.trim()) return;
    await fetch(`/api/v2/events/venues/${venueId}/questions`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setAddingQ(prev => ({ ...prev, [venueId]: null }));
    await load();
  }

  async function deleteVenueQuestion(venueId: string, qId: string) {
    await fetch(`/api/v2/events/venues/${venueId}/questions/${qId}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  // Progress bar
  const itemsWithQ = items.filter(i => (i.product?.questions?.length ?? 0) > 0);
  let totalQ = 0, answeredQ = 0;
  if (plan) {
    for (const q of plan.questions) {
      totalQ++;
      const ans = q.answers?.[0];
      if (ans && (ans.textValue || (ans.selectedOptions?.length ?? 0) > 0)) answeredQ++;
    }
  }
  for (const item of itemsWithQ) {
    for (const q of item.product!.questions) {
      totalQ++;
      const ans = item.answers.find(a => a.questionId === q.id);
      if (ans && ans.answer !== null && ans.answer !== '' && !(Array.isArray(ans.answer) && ans.answer.length === 0)) answeredQ++;
    }
  }
  for (const ev of eventVenues) {
    for (const q of ev.venue.questions) {
      totalQ++;
      const ans = venueAnswers.find(a => a.questionId === q.id);
      if (ans && ans.answer !== null && ans.answer !== '') answeredQ++;
    }
  }
  const pct = totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0;

  // Group plan questions by template
  const appliedTemplates = plan?.appliedTemplates ?? [];
  const questionsByTemplate = (templateId: string) =>
    plan?.questions.filter(q => q.sourceTemplateId === templateId) ?? [];
  const orphanQuestions = plan?.questions.filter(q => !q.sourceTemplateId) ?? [];

  return (
    <div className="space-y-4">
      {showAddTemplate && plan && (
        <TemplateSelectorModal
          eventId={eventId}
          appliedIds={appliedTemplates.map(t => t.id)}
          onClose={() => setShowAddTemplate(false)}
          onApplied={load}
        />
      )}

      {/* Progress */}
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm">Progresso do Plano</span>
          <span className="text-sm text-muted-foreground">{answeredQ}/{totalQ} respondidas</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Template sections ── */}
      {plan === null ? (
        <FirstTemplateSelectorSection eventId={eventId} onPlanCreated={load} />
      ) : plan ? (
        <>
          {appliedTemplates.map(tmpl => {
            const qs = questionsByTemplate(tmpl.id);
            return (
              <Section
                key={tmpl.id}
                icon={<FileText size={15} className="text-primary" />}
                title={tmpl.title}
                badge={`${qs.length} perg.`}
                onRemove={() => removeTemplate(tmpl.id)}
                removing={removingTemplateId === tmpl.id}
              >
                {qs.length === 0
                  ? <p className="text-xs text-muted-foreground italic">Nenhuma pergunta.</p>
                  : qs.map(q => <PlanQuestionRow key={q.id} q={q} eventId={eventId} onSaved={load} />)}
              </Section>
            );
          })}

          {/* Orphan questions (no sourceTemplateId — legacy) */}
          {orphanQuestions.length > 0 && (
            <Section icon={<FileText size={15} className="text-muted-foreground" />} title="Perguntas do plano" badge={`${orphanQuestions.length}`}>
              {orphanQuestions.map(q => <PlanQuestionRow key={q.id} q={q} eventId={eventId} onSaved={load} />)}
            </Section>
          )}

          {/* Add template button */}
          <button
            onClick={() => setShowAddTemplate(true)}
            className="w-full py-2.5 text-sm text-muted-foreground border border-dashed rounded-xl hover:bg-muted/40 hover:text-foreground flex items-center justify-center gap-2 transition"
          >
            <Plus size={14} /> Adicionar template
          </button>
        </>
      ) : null}

      {/* ── Product sections ── */}
      {itemsWithQ.map(item => (
        <Section key={item.id} icon={<Package size={15} className="text-muted-foreground" />} title={item.name} badge={`${item.product!.questions.length} perg.`}>
          {item.product!.questions.map(q => (
            <QuestionRow key={q.id} q={q} answer={item.answers.find(a => a.questionId === q.id)} onSave={(qId, val) => saveItemAnswer(item.id, qId, val)} />
          ))}
        </Section>
      ))}

      {/* ── Venue sections ── */}
      {eventVenues.map(ev => (
        <Section key={ev.id} icon={<MapPin size={15} className="text-muted-foreground" />} title={ev.venue.name} badge={ev.venue.questions.length > 0 ? `${ev.venue.questions.length} perg.` : undefined}>
          {ev.venue.questions.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma pergunta cadastrada para este local.</p>}
          {ev.venue.questions.map(q => (
            <QuestionRow key={q.id} q={q} answer={venueAnswers.find(a => a.questionId === q.id)} onSave={(qId, val) => saveVenueAnswer(qId, val)} onDelete={() => deleteVenueQuestion(ev.venue.id, q.id)} />
          ))}
          {addingQ[ev.venue.id] ? (
            <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
              <input autoFocus placeholder="Texto da pergunta..."
                value={addingQ[ev.venue.id]!.text}
                onChange={e => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { ...prev[ev.venue.id]!, text: e.target.value } }))}
                className="w-full text-sm px-2 py-1.5 border rounded bg-background" />
              <div className="flex items-center gap-2">
                <select value={addingQ[ev.venue.id]!.type}
                  onChange={e => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { ...prev[ev.venue.id]!, type: e.target.value } }))}
                  className="text-sm px-2 py-1.5 border rounded bg-background">
                  <option value="text">Texto</option><option value="textarea">Texto longo</option>
                  <option value="number">Número</option><option value="select">Seleção única</option>
                  <option value="multiselect">Múltipla escolha</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={addingQ[ev.venue.id]!.required}
                    onChange={e => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { ...prev[ev.venue.id]!, required: e.target.checked } }))} /> Obrigatória
                </label>
                <div className="flex-1" />
                <button onClick={() => setAddingQ(prev => ({ ...prev, [ev.venue.id]: null }))} className="text-xs px-2 py-1 rounded border hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                <button onClick={() => addVenueQuestion(ev.venue.id)} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1"><Check size={11} /> Criar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { text: '', type: 'text', required: false } }))}
              className="w-full text-xs text-muted-foreground border border-dashed rounded-lg py-2 hover:bg-muted/40 flex items-center justify-center gap-1 transition">
              <Plus size={12} /> Adicionar pergunta para este local
            </button>
          )}
        </Section>
      ))}
    </div>
  );
}
