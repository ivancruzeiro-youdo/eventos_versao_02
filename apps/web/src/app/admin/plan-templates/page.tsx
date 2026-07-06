'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const CATEGORIES = ['Geral', 'Alimentação', 'Bebidas', 'Decoração', 'Técnica', 'Logística', 'Equipe', 'Outros'];
const QUESTION_TYPES = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Seleção múltipla' },
  { value: 'checkbox', label: 'Sim / Não' },
  { value: 'date', label: 'Data' },
];

interface Question {
  id: string;
  text: string;
  type: string;
  required: boolean;
  category: string | null;
  order: number;
}

interface Template {
  id: string;
  title: string;
  description: string | null;
  questions: Question[];
}

const EMPTY_Q = { text: '', type: 'text', required: false, category: '' };

export default function AdminPlanTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // New template form
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // New question form (per template)
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newQ, setNewQ] = useState({ ...EMPTY_Q });
  const [savingQ, setSavingQ] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/plan-templates', { credentials: 'include' });
      const data = await res.json();
      setTemplates(data.templates || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/v2/plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || undefined }),
      });
      if (res.ok) {
        setNewTitle(''); setNewDesc(''); setShowNewTemplate(false);
        await load();
      }
    } finally { setSavingTemplate(false); }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Excluir este template?')) return;
    await fetch(`/api/v2/plan-templates/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  async function addQuestion(templateId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!newQ.text.trim()) return;
    setSavingQ(true);
    try {
      const res = await fetch(`/api/v2/plan-templates/${templateId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text: newQ.text.trim(),
          type: newQ.type,
          required: newQ.required,
          category: newQ.category || undefined,
        }),
      });
      if (res.ok) {
        setNewQ({ ...EMPTY_Q }); setAddingTo(null);
        await load();
      }
    } finally { setSavingQ(false); }
  }

  async function deleteQuestion(templateId: string, qid: string) {
    await fetch(`/api/v2/plan-templates/${templateId}/questions/${qid}`, {
      method: 'DELETE', credentials: 'include',
    });
    await load();
  }

  function toggleExpand(id: string) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Templates de Plano</h1>
        <button
          onClick={() => setShowNewTemplate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
        >
          <Plus size={16} /> Novo Template
        </button>
      </div>

      {/* New template form */}
      {showNewTemplate && (
        <form onSubmit={createTemplate} className="bg-white rounded-lg shadow p-4 mb-6 space-y-3">
          <h2 className="font-medium text-gray-900">Novo Template</h2>
          <input
            autoFocus
            type="text"
            placeholder="Título do template"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            required
          />
          <input
            type="text"
            placeholder="Descrição (opcional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={savingTemplate}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {savingTemplate ? 'Salvando...' : 'Criar'}
            </button>
            <button type="button" onClick={() => setShowNewTemplate(false)}
              className="px-4 py-2 border rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          Nenhum template cadastrado. Crie o primeiro clicando em "Novo Template".
        </div>
      )}

      <div className="space-y-4">
        {templates.map(tmpl => (
          <div key={tmpl.id} className="bg-white rounded-lg shadow">
            {/* Template header */}
            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => toggleExpand(tmpl.id)}>
              <div className="flex items-center gap-3">
                {expanded[tmpl.id] ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                <div>
                  <p className="font-medium text-gray-900">{tmpl.title}</p>
                  {tmpl.description && <p className="text-sm text-gray-500">{tmpl.description}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{tmpl.questions.length} pergunta{tmpl.questions.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteTemplate(tmpl.id); }}
                className="text-red-400 hover:text-red-600 p-1"
                title="Excluir template"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {expanded[tmpl.id] && (
              <div className="border-t px-4 pb-4">
                {/* Questions list */}
                <div className="space-y-2 mt-3">
                  {tmpl.questions.map((q, idx) => (
                    <div key={q.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{q.text}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {QUESTION_TYPES.find(t => t.value === q.type)?.label || q.type}
                          {q.required && ' • Obrigatória'}
                          {q.category && ` • ${q.category}`}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteQuestion(tmpl.id, q.id)}
                        className="text-red-400 hover:text-red-600 shrink-0"
                        title="Remover pergunta"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add question */}
                {addingTo === tmpl.id ? (
                  <form onSubmit={e => addQuestion(tmpl.id, e)} className="mt-3 space-y-3 border rounded-lg p-3 bg-gray-50">
                    <p className="text-sm font-medium text-gray-700">Nova pergunta</p>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Texto da pergunta"
                      value={newQ.text}
                      onChange={e => setNewQ(q => ({ ...q, text: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      required
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                        <select
                          value={newQ.type}
                          onChange={e => setNewQ(q => ({ ...q, type: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                        >
                          {QUESTION_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
                        <select
                          value={newQ.category}
                          onChange={e => setNewQ(q => ({ ...q, category: e.target.value }))}
                          className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                        >
                          <option value="">— sem categoria —</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newQ.required}
                        onChange={e => setNewQ(q => ({ ...q, required: e.target.checked }))}
                        className="w-4 h-4"
                      />
                      Pergunta obrigatória
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={savingQ}
                        className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                        <Plus size={14} /> {savingQ ? 'Salvando...' : 'Adicionar'}
                      </button>
                      <button type="button" onClick={() => { setAddingTo(null); setNewQ({ ...EMPTY_Q }); }}
                        className="px-3 py-2 border rounded-lg text-sm">
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => { setAddingTo(tmpl.id); setNewQ({ ...EMPTY_Q }); }}
                    className="mt-3 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <Plus size={16} /> Adicionar pergunta
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
