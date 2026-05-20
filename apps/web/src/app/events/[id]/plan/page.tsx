'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { planTemplatesApi } from '@/lib/api';
import { Loader2, FileText, ChevronRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'number';

interface PlanQuestion {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options?: string[] | null;
  answers?: { textValue?: string; selectedOptions?: string[] }[];
  product?: { id: string; name: string; category: string };
}

interface Plan {
  id: string;
  title: string;
  status: string;
  template?: { id: string; title: string };
  questions: PlanQuestion[];
}

interface PlanTemplate {
  id: string;
  title: string;
  description?: string;
  _count: { questions: number };
  questions: { id: string; text: string; type: string; required: boolean }[];
}

// ── Template Selector ─────────────────────────────────────────────────────────

function TemplateSelector({
  eventId,
  onPlanCreated,
}: {
  eventId: string;
  onPlanCreated: (plan: Plan) => void;
}) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    planTemplatesApi.list().then((res) => {
      setTemplates(res.templates);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!selected) return;
    setCreating(true);
    setError('');
    try {
      const res = await planTemplatesApi.applyToEvent(eventId, selected);
      onPlanCreated(res.plan);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar plano');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <FileText className="size-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Selecione um template de plano</h2>
        <p className="text-muted-foreground text-sm">
          O template define as perguntas base que serão exigidas neste evento.
          Além delas, perguntas do local e dos produtos também aparecerão.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8 border rounded-lg bg-card">
          <p className="text-muted-foreground text-sm">
            Nenhum template cadastrado.{' '}
            <Link href="/admin/plan-templates" className="text-primary hover:underline">
              Criar template →
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition ${
                  selected === t.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t.title}</p>
                    {t.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                      {t._count.questions} {t._count.questions === 1 ? 'pergunta' : 'perguntas'}
                    </span>
                    <ChevronRight className={`size-4 transition ${selected === t.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </div>

                {/* Preview questions */}
                {selected === t.id && t.questions.length > 0 && (
                  <ul className="mt-3 pt-3 border-t space-y-1">
                    {t.questions.slice(0, 5).map((q, i) => (
                      <li key={q.id} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary font-medium">{i + 1}.</span>
                        {q.text}
                        {q.required && <span className="text-destructive">*</span>}
                      </li>
                    ))}
                    {t.questions.length > 5 && (
                      <li className="text-xs text-muted-foreground pl-5">
                        + {t.questions.length - 5} mais...
                      </li>
                    )}
                  </ul>
                )}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive mb-3">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={!selected || creating}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating && <Loader2 className="size-4 animate-spin" />}
            Criar plano com este template
          </button>
        </>
      )}
    </div>
  );
}

// ── Plan Form ─────────────────────────────────────────────────────────────────

function getInitialAnswer(q: PlanQuestion): string {
  const ans = q.answers?.[0];
  if (!ans) return '';
  if (ans.textValue) return ans.textValue;
  if (ans.selectedOptions?.length) return ans.selectedOptions.join('|||');
  return '';
}

function PlanForm({ plan, eventId }: { plan: Plan; eventId: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    plan.questions.forEach((q) => { init[q.id] = getInitialAnswer(q); });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  }

  function toggleMulti(id: string, option: string) {
    const current = answers[id] ? answers[id].split('|||') : [];
    const next = current.includes(option)
      ? current.filter((x) => x !== option)
      : [...current, option];
    setAnswer(id, next.join('|||'));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = plan.questions.map((q) => {
        const raw = answers[q.id] ?? '';
        if (q.type === 'multiselect') {
          return { questionId: q.id, selectedOptions: raw ? raw.split('|||') : [] };
        }
        return { questionId: q.id, textValue: raw };
      });

      await fetch(`/api/v2/events/${eventId}/plan/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answers: payload }),
      });
      setSaved(true);
    } catch {
      alert('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Plan header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{plan.title}</h1>
          {plan.template && (
            <p className="text-sm text-muted-foreground mt-1">
              Template: <span className="font-medium">{plan.template.title}</span>
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2 disabled:opacity-60"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saved ? 'Salvo ✓' : 'Salvar respostas'}
        </button>
      </div>

      {/* Questions */}
      <div className="bg-card rounded-lg border shadow-sm p-6 space-y-8">
        {plan.questions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhuma pergunta configurada para este plano.
          </p>
        ) : (
          plan.questions.map((q, i) => (
            <div key={q.id} className="border-b pb-6 last:border-0 last:pb-0">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-7 h-7 flex-shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-foreground">
                    {q.text}
                    {q.required && <span className="text-destructive ml-1">*</span>}
                  </p>
                  {q.product && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      📦 {q.product.name} · {q.product.category}
                    </p>
                  )}
                </div>
              </div>

              <div className="ml-10">
                {q.type === 'text' && (
                  <input
                    type="text"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Sua resposta..."
                    className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background focus:ring-2 focus:ring-ring"
                  />
                )}
                {q.type === 'textarea' && (
                  <textarea
                    rows={3}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Sua resposta..."
                    className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background focus:ring-2 focus:ring-ring resize-none"
                  />
                )}
                {q.type === 'number' && (
                  <input
                    type="number"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className="w-40 px-3 py-2 border border-input rounded-md text-sm bg-background focus:ring-2 focus:ring-ring"
                  />
                )}
                {q.type === 'date' && (
                  <input
                    type="date"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className="w-48 px-3 py-2 border border-input rounded-md text-sm bg-background focus:ring-2 focus:ring-ring"
                  />
                )}
                {q.type === 'checkbox' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={answers[q.id] === 'true'}
                      onChange={(e) => setAnswer(q.id, e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">Sim</span>
                  </label>
                )}
                {q.type === 'select' && q.options && (
                  <select
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione...</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {q.type === 'multiselect' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const selected = (answers[q.id] ?? '').split('|||').filter(Boolean);
                      return (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.includes(opt)}
                            onChange={() => toggleMulti(q.id, opt)}
                            className="w-4 h-4 accent-primary"
                          />
                          <span className="text-sm">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {plan.questions.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saved ? 'Salvo ✓' : 'Salvar respostas'}
          </button>
        </div>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventPlanPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [noPlan, setNoPlan] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPlan(); }, [eventId]);

  async function loadPlan() {
    try {
      const res = await fetch(`/api/v2/events/${eventId}/plan`, { credentials: 'include' });
      if (res.status === 404) { setNoPlan(true); return; }
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      }
    } catch {
      setNoPlan(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <span>/</span>
        <Link href={`/events/${eventId}`} className="hover:text-foreground">Evento</Link>
        <span>/</span>
        <span className="text-foreground">Plano</span>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground mx-auto" />
        </div>
      ) : noPlan ? (
        <TemplateSelector eventId={eventId} onPlanCreated={(p) => { setPlan(p); setNoPlan(false); }} />
      ) : plan ? (
        <PlanForm plan={plan} eventId={eventId} />
      ) : null}
    </Layout>
  );
}
