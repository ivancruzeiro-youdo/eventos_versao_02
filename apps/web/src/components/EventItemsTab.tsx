'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, CheckCircle2, Clock, History } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Question {
  id: string;
  text: string;
  type: string;
  required: boolean;
  options: string[] | null;
}

interface Choice {
  id: string;
  label: string;
  chosen: string[];
  maxChoices: number | null;
  confirmedAt: string | null;
  confirmedBy: { name: string } | null;
}

interface ChoiceHistoryEntry {
  id: string;
  before: string[];
  after: string[];
  createdAt: string;
  user: { name: string } | null;
}

interface Answer {
  questionId: string;
  answer: any;
  updatedBy: { name: string } | null;
  updatedAt: string;
  history: { id: string; before: any; after: any; createdAt: string; user: { name: string } | null }[];
}

interface EventItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  choices: Choice[];
  product: { id: string; name: string; subitems: any; questions: Question[] } | null;
}

interface Props {
  eventId: string;
  category: 'ab' | 'infra';
}

export default function EventItemsTab({ eventId, category }: Props) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // draft selections per choice id
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  // answers per item
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  // answer drafts: itemId -> questionId -> value
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, Record<string, any>>>({});
  // choice history per choiceId
  const [choiceHistory, setChoiceHistory] = useState<Record<string, ChoiceHistoryEntry[]>>({});
  const [showHistory, setShowHistory] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/items`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.items || []).filter((i: EventItem) => i.category === category);
        setItems(filtered);
        // init drafts from existing chosen
        const d: Record<string, string[]> = {};
        for (const item of filtered) for (const c of item.choices) d[c.id] = [...c.chosen];
        setDrafts(d);
        // load answers for each item
        for (const item of filtered) loadAnswers(item.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadAnswers(itemId: string) {
    const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/answers`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setAnswers(prev => ({ ...prev, [itemId]: data.answers || [] }));
    }
  }

  async function loadChoiceHistory(choiceId: string, itemId: string) {
    const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/choices/${choiceId}/history`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setChoiceHistory(prev => ({ ...prev, [choiceId]: data.history || [] }));
    }
  }

  function toggleHistory(choiceId: string, itemId: string) {
    setShowHistory(prev => {
      const next = new Set(prev);
      if (next.has(choiceId)) { next.delete(choiceId); }
      else { next.add(choiceId); loadChoiceHistory(choiceId, itemId); }
      return next;
    });
  }

  function toggleOption(choiceId: string, opt: string, maxChoices: number | null) {
    setDrafts(prev => {
      const cur = prev[choiceId] ?? [];
      if (cur.includes(opt)) return { ...prev, [choiceId]: cur.filter(x => x !== opt) };
      if (maxChoices && cur.length >= maxChoices) return prev;
      return { ...prev, [choiceId]: [...cur, opt] };
    });
  }

  async function saveChoices(item: EventItem) {
    setSaving(prev => ({ ...prev, [item.id]: true }));
    try {
      const choices = item.choices.map(c => ({ label: c.label, chosen: drafts[c.id] ?? c.chosen }));
      await fetch(`/api/v2/events/${eventId}/items/${item.id}/choices`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices }),
      });
      await load();
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: false }));
    }
  }

  async function confirmChoices(item: EventItem) {
    setConfirming(prev => ({ ...prev, [item.id]: true }));
    try {
      await fetch(`/api/v2/events/${eventId}/items/${item.id}/choices/confirm`, {
        method: 'POST', credentials: 'include',
      });
      await load();
    } finally {
      setConfirming(prev => ({ ...prev, [item.id]: false }));
    }
  }

  async function saveAnswer(itemId: string, questionId: string) {
    const val = answerDrafts[itemId]?.[questionId];
    if (val === undefined) return;
    await fetch(`/api/v2/events/${eventId}/items/${itemId}/answers/${questionId}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: val }),
    });
    await loadAnswers(itemId);
    setAnswerDrafts(prev => {
      const copy = { ...prev };
      if (copy[itemId]) { delete copy[itemId][questionId]; }
      return copy;
    });
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    });
  }

  const hasDetails = (item: EventItem) =>
    item.choices.length > 0 || (item.product?.questions?.length ?? 0) > 0;

  const allConfirmed = (item: EventItem) =>
    item.choices.length > 0 && item.choices.every(c => !!c.confirmedAt);

  const allRequiredAnswered = (item: EventItem, itemAnswers: Answer[]) => {
    const requiredQuestions = item.product?.questions?.filter(q => q.required) ?? [];
    if (requiredQuestions.length === 0) return true;
    return requiredQuestions.every(q => itemAnswers.some(a => a.questionId === q.id && a.answer !== null && a.answer !== undefined && a.answer !== ''));
  };

  const isDirty = (item: EventItem) =>
    item.choices.some(c => JSON.stringify(drafts[c.id] ?? c.chosen) !== JSON.stringify(c.chosen));

  if (loading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;
  if (items.length === 0) return (
    <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
      Nenhum item de {category === 'ab' ? 'A&B' : 'infraestrutura'} neste evento.
    </div>
  );

  return (
    <div className="space-y-3">
      {items.map(item => {
        const open = expanded.has(item.id);
        const confirmed = allConfirmed(item);
        const dirty = isDirty(item);
        const itemAnswers = answers[item.id] ?? [];
        const requiredAnswered = allRequiredAnswered(item, itemAnswers);

        return (
          <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
            {/* Header row */}
            <div
              className={`flex items-center justify-between px-4 py-3 ${hasDetails(item) ? 'cursor-pointer hover:bg-muted/40' : ''}`}
              onClick={() => hasDetails(item) && toggle(item.id)}
            >
              <div className="flex items-center gap-3">
                {hasDetails(item)
                  ? open ? <ChevronDown size={15} className="text-muted-foreground shrink-0" />
                         : <ChevronRight size={15} className="text-muted-foreground shrink-0" />
                  : <span className="w-[15px]" />}
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {confirmed ? (
                      <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={11} /> Confirmado</span>
                    ) : item.choices.length > 0 ? (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><Clock size={11} /> Pendente</span>
                    ) : requiredAnswered ? (
                      <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={11} /> Respondido</span>
                    ) : (item.product?.questions?.length ?? 0) > 0 ? (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><Clock size={11} /> Pendente</span>
                    ) : null}
                    {(item.product?.questions?.length ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><HelpCircle size={11} /> {item.product!.questions.length} perg.</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{item.quantity} {item.unit || 'un'}</div>
            </div>

            {open && (
              <div className="border-t px-4 py-4 space-y-4 bg-muted/20">

                {/* Choices — accordion text view */}
                {item.choices.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Opções / Cardápio</p>
                    <div className="border rounded-lg overflow-hidden divide-y">
                      {item.choices.map(choice => {
                        const subitems: any[] = item.product?.subitems ?? [];
                        const group = subitems.find((s: any) => s.group === choice.label);
                        const options: string[] = group?.items?.map((i: any) => i.name || i.description || String(i)) ?? [];
                        const openAcc = showHistory.has('acc_' + choice.id);

                        return (
                          <div key={choice.id} className="bg-background">
                            <button
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition text-left"
                              onClick={e => { e.stopPropagation(); toggleHistory('acc_' + choice.id, item.id); }}
                            >
                              <span className="text-sm font-medium">
                                {choice.label}
                                {choice.maxChoices && <span className="text-xs text-muted-foreground ml-1.5">(escolher {choice.maxChoices})</span>}
                              </span>
                              {openAcc ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                            </button>
                            {openAcc && (
                              <div className="px-4 pb-3">
                                {options.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {options.map((opt: string) => (
                                      <li key={opt} className="text-sm text-foreground/80 flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                                        {opt}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">Sem opções cadastradas</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Product Questions / Answers */}
                {(item.product?.questions?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Perguntas de configuração</p>
                    <div className="space-y-3">
                      {item.product!.questions.map(q => {
                        const existing = itemAnswers.find(a => a.questionId === q.id);
                        const draftVal = answerDrafts[item.id]?.[q.id];
                        const currentAnswer = draftVal !== undefined ? draftVal : (existing?.answer ?? null);
                        const opts: string[] = Array.isArray(q.options) ? q.options : [];

                        return (
                          <div key={q.id} className="bg-background border rounded-lg p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <p className="text-sm font-medium">
                                {q.required && <span className="text-destructive mr-1">*</span>}
                                {q.text}
                              </p>
                              {existing && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {existing.updatedBy?.name} · {formatDateTime(existing.updatedAt)}
                                </span>
                              )}
                            </div>

                            {/* Input by type */}
                            {q.type === 'multiselect' && opts.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {opts.map((opt: string) => {
                                  const sel: string[] = Array.isArray(currentAnswer) ? currentAnswer : [];
                                  const isSelected = sel.includes(opt);
                                  return (
                                    <button key={opt}
                                      onClick={e => {
                                        e.stopPropagation();
                                        const cur: string[] = Array.isArray(currentAnswer) ? currentAnswer : [];
                                        const next = isSelected ? cur.filter(x => x !== opt) : [...cur, opt];
                                        setAnswerDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), [q.id]: next } }));
                                      }}
                                      className={`text-xs px-2.5 py-1 rounded-full border transition ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : q.type === 'select' && opts.length > 0 ? (
                              <select value={currentAnswer ?? ''} onClick={e => e.stopPropagation()}
                                onChange={e => { e.stopPropagation(); setAnswerDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), [q.id]: e.target.value } })); }}
                                className="w-full text-sm px-2 py-1.5 border rounded bg-background focus:ring-2 focus:ring-ring">
                                <option value="">Selecionar...</option>
                                {opts.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              <input type={q.type === 'number' ? 'number' : 'text'}
                                value={currentAnswer ?? ''}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { e.stopPropagation(); setAnswerDrafts(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), [q.id]: e.target.value } })); }}
                                className="w-full text-sm px-2 py-1.5 border rounded bg-background focus:ring-2 focus:ring-ring" />
                            )}

                            {draftVal !== undefined && (
                              <div className="flex justify-end mt-2">
                                <button onClick={e => { e.stopPropagation(); saveAnswer(item.id, q.id); }}
                                  className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition">
                                  Salvar resposta
                                </button>
                              </div>
                            )}

                            {/* Answer history */}
                            {existing && existing.history.length > 0 && (
                              <div className="mt-2 border-t pt-2 space-y-1">
                                {existing.history.map(h => (
                                  <div key={h.id} className="text-xs text-muted-foreground border rounded px-2 py-1">
                                    <span className="font-medium text-foreground">{h.user?.name ?? 'Sistema'}</span>
                                    {' · '}{formatDateTime(h.createdAt)}<br />
                                    <span>{String(h.before ?? '—')} → {String(h.after)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
