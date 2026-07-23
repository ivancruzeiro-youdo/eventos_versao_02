'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, HelpCircle, CheckCircle2, Clock, History, MessageSquare, Send, Trash2, Printer, X, FileText, Grid3x3 } from 'lucide-react';
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

interface ItemComment {
  id: string;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  user: { id: string; name: string } | null;
  deletedBy: { id: string; name: string } | null;
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
  const router = useRouter();
  const [selectedForMenu, setSelectedForMenu] = useState<Set<string>>(new Set());
  const [showPrintFormatModal, setShowPrintFormatModal] = useState(false);
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
  // showHistory: keys are 'acc_<choiceId>' for accordion, 'hist_<choiceId>' for history panel
  const [showHistory, setShowHistory] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});
  // item comments: itemId -> list
  const [itemComments, setItemComments] = useState<Record<string, ItemComment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});

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
      else { next.add(choiceId); }
      return next;
    });
  }

  function toggleChoiceHistory(choiceId: string, itemId: string) {
    const key = 'hist_' + choiceId;
    setShowHistory(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); }
      else { next.add(key); loadChoiceHistory(choiceId, itemId); }
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

  // Selecting an option auto-saves and auto-confirms (no separate confirm step).
  async function selectOption(item: EventItem, choice: Choice, opt: string) {
    const cur = drafts[choice.id] ?? choice.chosen;
    let next: string[];
    if (cur.includes(opt)) {
      next = cur.filter(x => x !== opt);
    } else if (choice.maxChoices && cur.length >= choice.maxChoices) {
      return;
    } else {
      next = [...cur, opt];
    }
    setDrafts(prev => ({ ...prev, [choice.id]: next }));
    setSaving(prev => ({ ...prev, [item.id]: true }));
    try {
      const choices = item.choices.map(c => ({
        label: c.label,
        chosen: c.id === choice.id ? next : (drafts[c.id] ?? c.chosen),
      }));
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

  async function loadItemComments(itemId: string) {
    const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/comments`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setItemComments(prev => ({ ...prev, [itemId]: data.comments || [] }));
    }
  }

  async function sendComment(itemId: string) {
    const text = commentDraft[itemId]?.trim();
    if (!text) return;
    setSendingComment(prev => ({ ...prev, [itemId]: true }));
    try {
      const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/comments`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setItemComments(prev => ({ ...prev, [itemId]: [...(prev[itemId] ?? []), data.comment] }));
        setCommentDraft(prev => ({ ...prev, [itemId]: '' }));
      }
    } finally {
      setSendingComment(prev => ({ ...prev, [itemId]: false }));
    }
  }

  async function deleteItemComment(itemId: string, commentId: string) {
    const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/comments/${commentId}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      setItemComments(prev => ({
        ...prev,
        [itemId]: (prev[itemId] ?? []).map(c => c.id === commentId ? data.comment : c),
      }));
    }
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); loadItemComments(id); }
      return next;
    });
  }

  const hasDetails = (_item: EventItem) => true;

  const allRequiredAnswered = (item: EventItem, itemAnswers: Answer[]) => {
    const requiredQuestions = item.product?.questions?.filter(q => q.required) ?? [];
    if (requiredQuestions.length === 0) return true;
    return requiredQuestions.every(q => itemAnswers.some(a => a.questionId === q.id && a.answer !== null && a.answer !== undefined && a.answer !== ''));
  };

  const isDirty = (_item: EventItem) => false;

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
                    {(item.product?.questions?.length ?? 0) > 0 && (
                      requiredAnswered
                        ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={11} /> Respondido</span>
                        : <span className="text-xs text-amber-600 flex items-center gap-1"><Clock size={11} /> Pendente</span>
                    )}
                    {(item.product?.questions?.length ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><HelpCircle size={11} /> {item.product!.questions.length} perg.</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{item.quantity} {item.unit || 'un'}</span>
                {category === 'ab' && (
                  <label
                    className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
                    onClick={e => e.stopPropagation()}
                    title="Incluir no cardápio"
                  >
                    <input
                      type="checkbox"
                      checked={selectedForMenu.has(item.id)}
                      onChange={e => {
                        e.stopPropagation();
                        setSelectedForMenu(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                          return next;
                        });
                      }}
                      className="accent-primary"
                    />
                    Cardápio
                  </label>
                )}
              </div>
            </div>

            {open && (
              <div className="border-t px-4 py-4 space-y-4 bg-muted/20">

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

                {/* Item comments */}
                <div className="border rounded-lg bg-background overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b">
                    <MessageSquare size={12} className="text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comentários do item</span>
                  </div>

                  {/* Comment list */}
                  <div className="divide-y">
                    {(itemComments[item.id] ?? []).length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum comentário ainda.</p>
                    ) : (
                      (itemComments[item.id] ?? []).map(c => (
                        <div key={c.id} className={`px-3 py-2 ${c.deletedAt ? 'opacity-50' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{c.user?.name ?? '—'}</span>
                              <span>·</span>
                              <span>{formatDateTime(c.createdAt)}</span>
                              {c.deletedAt && (
                                <span className="text-destructive ml-1">
                                  · excluído por {c.deletedBy?.name ?? '—'} em {formatDateTime(c.deletedAt)}
                                </span>
                              )}
                            </div>
                            {!c.deletedAt && (
                              <button
                                onClick={e => { e.stopPropagation(); deleteItemComment(item.id, c.id); }}
                                className="p-1 text-muted-foreground hover:text-destructive transition rounded shrink-0"
                                title="Excluir"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          <p className={`text-sm mt-0.5 whitespace-pre-wrap ${c.deletedAt ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {c.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* New comment input */}
                  <div className="border-t px-3 py-2 flex gap-2 items-end">
                    <textarea
                      value={commentDraft[item.id] ?? ''}
                      onChange={e => setCommentDraft(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(item.id); } }}
                      rows={1}
                      placeholder="Adicionar comentário... (Enter para enviar)"
                      className="flex-1 text-sm px-2 py-1.5 border rounded bg-background focus:ring-2 focus:ring-ring resize-none"
                    />
                    <button
                      onClick={e => { e.stopPropagation(); sendComment(item.id); }}
                      disabled={sendingComment[item.id] || !commentDraft[item.id]?.trim()}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition shrink-0"
                    >
                      <Send size={11} /> Enviar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Cardápio print bar — only for A&B tab */}
      {category === 'ab' && items.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border rounded-xl">
          <p className="text-sm text-muted-foreground">
            {selectedForMenu.size === 0
              ? 'Selecione os itens acima para imprimir o cardápio'
              : `${selectedForMenu.size} item(s) selecionado(s)`}
          </p>
          <button
            disabled={selectedForMenu.size === 0}
            onClick={() => setShowPrintFormatModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Printer size={14} /> Imprimir Cardápio
          </button>
        </div>
      )}

      {/* Print format modal */}
      {showPrintFormatModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-sm">Escolha o formato de impressão</h3>
              <button onClick={() => setShowPrintFormatModal(false)} className="p-1 rounded hover:bg-muted transition">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <button
                onClick={() => {
                  const ids = Array.from(selectedForMenu).join(',');
                  window.open(`/events/${eventId}/cardapio?items=${ids}`, '_blank');
                  setShowPrintFormatModal(false);
                }}
                className="w-full flex items-start gap-3 p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition text-left"
              >
                <FileText size={20} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Cartão A6</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cartão de mesa frente/verso (comida e bebida), 4 por folha A4.</p>
                </div>
              </button>
              <button
                onClick={() => {
                  const ids = Array.from(selectedForMenu).join(',');
                  window.open(`/events/${eventId}/cardapio/placas?items=${ids}`, '_blank');
                  setShowPrintFormatModal(false);
                }}
                className="w-full flex items-start gap-3 p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition text-left"
              >
                <Grid3x3 size={20} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Placas de Buffet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Uma placa por prato/bebida, para identificar cada item no buffet.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
