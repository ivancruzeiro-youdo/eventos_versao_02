'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { adminApi } from '@/lib/api';
import {
  Plus, Trash2, Edit2, X, Loader2, ChevronDown, ChevronRight, FileText,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'number';

interface TemplateQuestion {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options?: string[] | null;
  order: number;
}

interface PlanTemplate {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  _count?: { questions: number };
  questions?: TemplateQuestion[];
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Seleção múltipla' },
  { value: 'checkbox', label: 'Sim / Não' },
];

// ── Create Template Modal ─────────────────────────────────────────────────────

function CreateTemplateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: PlanTemplate) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!title.trim()) { setError('Título obrigatório'); return; }
    setSaving(true);
    try {
      const res = await adminApi.createPlanTemplate({ title, description });
      onCreated(res.template);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Novo Template de Plano</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-md">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nome do template *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Festa de 15 anos, Casamento, Corporativo..."
              autoFocus
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Descrição</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Para qual tipo de evento serve?"
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted">Cancelar</button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Question Modal ────────────────────────────────────────────────────────

function AddQuestionModal({
  templateId,
  nextOrder,
  onClose,
  onAdded,
}: {
  templateId: string;
  nextOrder: number;
  onClose: () => void;
  onAdded: (q: TemplateQuestion) => void;
}) {
  const [form, setForm] = useState<{
    text: string;
    type: QuestionType;
    required: boolean;
    optionsRaw: string;
  }>({ text: '', type: 'text', required: false, optionsRaw: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsOptions = form.type === 'select' || form.type === 'multiselect';

  async function handleAdd() {
    if (!form.text.trim()) { setError('Texto obrigatório'); return; }
    setSaving(true);
    try {
      const options = needsOptions
        ? form.optionsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const res = await adminApi.addPlanTemplateQuestion(templateId, {
        text: form.text,
        type: form.type,
        required: form.required,
        options,
        order: nextOrder,
      });
      onAdded(res.question);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao adicionar pergunta');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Adicionar Pergunta</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-md">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Pergunta *</label>
            <input
              type="text"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Ex: Quantidade de convidados esperada?"
              autoFocus
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Tipo de resposta</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as QuestionType })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring"
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(e) => setForm({ ...form, required: e.target.checked })}
                  className="w-4 h-4"
                />
                Obrigatória
              </label>
            </div>
          </div>
          {needsOptions && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Opções <span className="text-muted-foreground font-normal">(uma por linha)</span>
              </label>
              <textarea
                rows={4}
                value={form.optionsRaw}
                onChange={(e) => setForm({ ...form, optionsRaw: e.target.value })}
                placeholder={'Buffet completo\nSó doces\nSó salgados'}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-ring resize-none font-mono"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-input rounded-md hover:bg-muted">Cancelar</button>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template: initialTemplate,
  onDeleted,
}: {
  template: PlanTemplate;
  onDeleted: (id: string) => void;
}) {
  const [template, setTemplate] = useState(initialTemplate);
  const [expanded, setExpanded] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function expandAndLoad() {
    if (expanded) { setExpanded(false); return; }
    if (template.questions) { setExpanded(true); return; }
    setLoadingQuestions(true);
    try {
      const res = await adminApi.getPlanTemplate(template.id);
      setTemplate(res.template);
      setExpanded(true);
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    setDeletingId(questionId);
    try {
      await adminApi.deletePlanTemplateQuestion(questionId);
      setTemplate((t) => ({
        ...t,
        questions: t.questions?.filter((q) => q.id !== questionId),
        _count: { questions: (t._count?.questions ?? 1) - 1 },
      }));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteTemplate() {
    if (!confirm(`Excluir template "${template.title}"?`)) return;
    try {
      await adminApi.deletePlanTemplate(template.id);
      onDeleted(template.id);
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir');
    }
  }

  const questions = template.questions ?? [];
  const count = template._count?.questions ?? questions.length;

  return (
    <>
      {showAddQuestion && (
        <AddQuestionModal
          templateId={template.id}
          nextOrder={questions.length}
          onClose={() => setShowAddQuestion(false)}
          onAdded={(q) => {
            setTemplate((t) => ({
              ...t,
              questions: [...(t.questions ?? []), q],
              _count: { questions: (t._count?.questions ?? 0) + 1 },
            }));
          }}
        />
      )}

      <div className="bg-card rounded-lg border shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <button
            onClick={expandAndLoad}
            className="flex items-center gap-3 flex-1 text-left"
          >
            {loadingQuestions ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <div>
              <p className="font-semibold">{template.title}</p>
              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}
            </div>
          </button>
          <div className="flex items-center gap-3 ml-4">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
              {count} {count === 1 ? 'pergunta' : 'perguntas'}
            </span>
            <button
              onClick={() => setShowAddQuestion(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
              title="Adicionar pergunta"
            >
              <Plus className="size-4" />
            </button>
            <button
              onClick={handleDeleteTemplate}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition"
              title="Excluir template"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>

        {/* Questions list */}
        {expanded && (
          <div className="border-t">
            {questions.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                Nenhuma pergunta ainda.{' '}
                <button
                  onClick={() => setShowAddQuestion(true)}
                  className="text-primary hover:underline"
                >
                  Adicionar agora
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-6 h-6 flex-shrink-0 bg-muted rounded-full flex items-center justify-center text-xs font-medium text-muted-foreground mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {q.text}
                        {q.required && <span className="text-destructive ml-1">*</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {QUESTION_TYPES.find((t) => t.value === q.type)?.label ?? q.type}
                        {q.options && q.options.length > 0 && (
                          <> · {q.options.join(', ')}</>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      disabled={deletingId === q.id}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition disabled:opacity-50"
                    >
                      {deletingId === q.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="p-3 border-t">
              <button
                onClick={() => setShowAddQuestion(true)}
                className="w-full py-1.5 text-sm text-primary hover:bg-primary/5 rounded-md flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="size-3.5" />
                Adicionar pergunta
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPlanTemplatesPage() {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const res = await adminApi.planTemplates();
      setTemplates(res.templates);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={(t) => setTemplates((prev) => [t, ...prev])}
        />
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">
            Templates de Plano
          </h1>
          <p className="text-muted-foreground text-sm">
            Defina conjuntos de perguntas padrão para cada tipo de evento. Todo plano exige um template.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2"
        >
          <Plus className="size-4" />
          Novo Template
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground mx-auto" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">{error}</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-card">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">Nenhum template criado</p>
          <p className="text-sm text-muted-foreground mb-4">
            Crie templates com perguntas padrão para cada tipo de evento.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
          >
            Criar primeiro template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onDeleted={(id) => setTemplates((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
