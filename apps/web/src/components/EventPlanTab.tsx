'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle, AlertCircle,
  Plus, Trash2, MapPin, Package, History, X, Check
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import AbServiceTimeFields from './AbServiceTimeFields';

// ── Types ────────────────────────────────────────────────────────────────────

interface AnswerHistory { id: string; before: any; after: any; createdAt: string; user: { name: string } | null }
interface ItemAnswer { questionId: string; answer: any; updatedAt: string; updatedBy: { name: string } | null; history: AnswerHistory[] }
interface ProductQuestion { id: string; text: string; type: string; required: boolean; options: any }
interface EventItem { id: string; name: string; category: string; serviceStartAt?: string | null; serviceEndAt?: string | null; product: { questions: ProductQuestion[] } | null; answers: ItemAnswer[] }
interface VenueQuestion { id: string; venueId: string; text: string; type: string; required: boolean; options: any; order: number }
interface EventVenue { id: string; venue: { id: string; name: string; questions: VenueQuestion[] } }
interface VenueAnswer { questionId: string; answer: any; updatedAt: string; updatedBy: { name: string } | null; history: AnswerHistory[] }

interface Props { eventId: string }

// ── Reusable question row ─────────────────────────────────────────────────────

function QuestionRow({
  q, answer, onSave, onDelete, sourceLabel,
}: {
  q: ProductQuestion | VenueQuestion;
  answer: ItemAnswer | VenueAnswer | undefined;
  onSave: (qId: string, val: any) => Promise<void>;
  onDelete?: () => Promise<void>;
  sourceLabel?: string;
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
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="mt-0.5 shrink-0">
            {isAnswered
              ? <CheckCircle size={14} className="text-green-500" />
              : q.required
                ? <AlertCircle size={14} className="text-amber-500" />
                : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">
              {q.required && <span className="text-destructive mr-1">*</span>}
              {q.text}
            </p>
            {sourceLabel && <p className="text-xs text-muted-foreground mt-0.5">{sourceLabel}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {answer && (
            <button onClick={() => setShowHist(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <History size={11} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="text-xs text-muted-foreground hover:text-destructive">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Answer meta */}
      {answer && !isDirty && (
        <p className="text-xs text-muted-foreground mb-1.5">
          {answer.updatedBy?.name} · {formatDateTime(answer.updatedAt)}
        </p>
      )}

      {/* Input */}
      {q.type === 'multiselect' && opts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {opts.map((opt: string) => {
            const sel: string[] = Array.isArray(current) ? current : [];
            const isSelected = sel.includes(opt);
            return (
              <button key={opt}
                onClick={() => { const s: string[] = Array.isArray(current) ? [...current] : []; setDraft(isSelected ? s.filter(x => x !== opt) : [...s, opt]); }}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {opt}
              </button>
            );
          })}
        </div>
      ) : q.type === 'select' && opts.length > 0 ? (
        <select value={current ?? ''} onChange={e => setDraft(e.target.value)}
          className="w-full text-sm px-2 py-1.5 border rounded bg-background mb-2">
          <option value="">Selecionar...</option>
          {opts.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : q.type === 'textarea' ? (
        <textarea value={current ?? ''} onChange={e => setDraft(e.target.value)} rows={2}
          className="w-full text-sm px-2 py-1.5 border rounded bg-background mb-2 resize-none" />
      ) : (
        <input type={q.type === 'number' ? 'number' : 'text'} value={current ?? ''}
          onChange={e => setDraft(e.target.value)}
          className="w-full text-sm px-2 py-1.5 border rounded bg-background mb-2" />
      )}

      {isDirty && (
        <div className="flex justify-end gap-2">
          <button onClick={() => setDraft(undefined)} className="text-xs px-2 py-1 rounded border hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
          <button onClick={save} disabled={saving} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50">
            <Check size={11} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      )}

      {/* History */}
      {showHist && answer && answer.history.length > 0 && (
        <div className="mt-2 border-t pt-2 space-y-1">
          {answer.history.map(h => (
            <div key={h.id} className="text-xs text-muted-foreground border rounded px-2 py-1">
              <span className="font-medium text-foreground">{h.user?.name ?? 'Sistema'}</span> · {formatDateTime(h.createdAt)}<br />
              <span>{String(h.before ?? '—')} → {String(h.after)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────

function Section({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition text-left"
        onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          {badge && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{badge}</span>}
        </div>
        {open ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EventPlanTab({ eventId }: Props) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [venueAnswers, setVenueAnswers] = useState<VenueAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  // add venue question form state: venueId -> { text, type, required }
  const [addingQ, setAddingQ] = useState<Record<string, { text: string; type: string; required: boolean } | null>>({});

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/plan-overview`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setEventVenues(data.eventVenues ?? []);
        setVenueAnswers(data.venueAnswers ?? []);
      }
    } finally { setLoading(false); }
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
    if (!form || !form.text.trim()) return;
    await fetch(`/api/v2/events/venues/${venueId}/questions`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: form.text, type: form.type, required: form.required }),
    });
    setAddingQ(prev => ({ ...prev, [venueId]: null }));
    await load();
  }

  async function deleteVenueQuestion(venueId: string, qId: string) {
    await fetch(`/api/v2/events/venues/${venueId}/questions/${qId}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  // Group items that have product questions
  const itemsWithQuestions = items.filter(i => (i.product?.questions?.length ?? 0) > 0);

  // Count total / answered for progress bar
  let totalQ = 0, answeredQ = 0;
  for (const item of itemsWithQuestions) {
    for (const q of item.product!.questions) {
      totalQ++;
      const ans = item.answers.find(a => a.questionId === q.id);
      if (ans && ans.answer !== null && ans.answer !== '' && !(Array.isArray(ans.answer) && ans.answer.length === 0)) answeredQ++;
    }
  }
  for (const ev of eventVenues) {
    if (!ev.venue) continue;
    for (const q of ev.venue.questions) {
      totalQ++;
      const ans = venueAnswers.find(a => a.questionId === q.id);
      if (ans && ans.answer !== null && ans.answer !== '') answeredQ++;
    }
  }

  const pct = totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm">Progresso do Plano</span>
          <span className="text-sm text-muted-foreground">{answeredQ}/{totalQ} respondidas</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Product question sections — one per item */}
      {itemsWithQuestions.length === 0 && eventVenues.length === 0 && (
        <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground text-sm">
          Nenhuma pergunta de configuração neste evento.<br />
          Importe o evento ou adicione perguntas aos produtos/locais.
        </div>
      )}

      {itemsWithQuestions.map(item => (
        <Section
          key={item.id}
          icon={<Package size={15} className="text-muted-foreground" />}
          title={item.name}
          badge={`${item.product!.questions.length} perg.`}
        >
          {/* Horário de serviço — mesmo editor da aba A&B, uma implementação só */}
          {item.category === 'ab' && (
            <div className="mb-3">
              <AbServiceTimeFields
                eventId={eventId}
                itemId={item.id}
                serviceStartAt={item.serviceStartAt ?? null}
                serviceEndAt={item.serviceEndAt ?? null}
                onSaved={(times) =>
                  setItems(prev => prev.map(i => (i.id === item.id ? { ...i, ...times } : i)))
                }
              />
            </div>
          )}

          {item.product!.questions.map(q => (
            <QuestionRow
              key={q.id}
              q={q}
              answer={item.answers.find(a => a.questionId === q.id)}
              onSave={(qId, val) => saveItemAnswer(item.id, qId, val)}
            />
          ))}
        </Section>
      ))}

      {/* Venue question sections */}
      {eventVenues.filter(ev => ev.venue).map(ev => (
        <Section
          key={ev.id}
          icon={<MapPin size={15} className="text-muted-foreground" />}
          title={ev.venue.name}
          badge={ev.venue.questions.length > 0 ? `${ev.venue.questions.length} perg.` : undefined}
        >
          {ev.venue.questions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma pergunta cadastrada para este local.</p>
          )}
          {ev.venue.questions.map(q => (
            <QuestionRow
              key={q.id}
              q={q}
              answer={venueAnswers.find(a => a.questionId === q.id)}
              onSave={(qId, val) => saveVenueAnswer(qId, val)}
              onDelete={() => deleteVenueQuestion(ev.venue.id, q.id)}
            />
          ))}

          {/* Add question form */}
          {addingQ[ev.venue.id] ? (
            <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
              <input
                autoFocus
                placeholder="Texto da pergunta..."
                value={addingQ[ev.venue.id]!.text}
                onChange={e => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { ...prev[ev.venue.id]!, text: e.target.value } }))}
                className="w-full text-sm px-2 py-1.5 border rounded bg-background"
              />
              <div className="flex items-center gap-2">
                <select
                  value={addingQ[ev.venue.id]!.type}
                  onChange={e => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { ...prev[ev.venue.id]!, type: e.target.value } }))}
                  className="text-sm px-2 py-1.5 border rounded bg-background">
                  <option value="text">Texto</option>
                  <option value="textarea">Texto longo</option>
                  <option value="number">Número</option>
                  <option value="select">Seleção única</option>
                  <option value="multiselect">Múltipla escolha</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox"
                    checked={addingQ[ev.venue.id]!.required}
                    onChange={e => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { ...prev[ev.venue.id]!, required: e.target.checked } }))}
                  /> Obrigatória
                </label>
                <div className="flex-1" />
                <button onClick={() => setAddingQ(prev => ({ ...prev, [ev.venue.id]: null }))}
                  className="text-xs px-2 py-1 rounded border hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                <button onClick={() => addVenueQuestion(ev.venue.id)}
                  className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1"><Check size={11} /> Criar</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingQ(prev => ({ ...prev, [ev.venue.id]: { text: '', type: 'text', required: false } }))}
              className="w-full text-xs text-muted-foreground border border-dashed rounded-lg py-2 hover:bg-muted/40 flex items-center justify-center gap-1 transition">
              <Plus size={12} /> Adicionar pergunta para este local
            </button>
          )}
        </Section>
      ))}
    </div>
  );
}
