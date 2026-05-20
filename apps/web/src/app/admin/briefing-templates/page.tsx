'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Plus, Trash2, Copy, ChevronDown, ChevronUp, FileText, GripVertical, Edit2 } from 'lucide-react';

interface BriefingTemplate {
  id: string;
  title: string;
  _count?: { questions: number };
  createdAt: string;
}

interface BriefingQuestion {
  id: string;
  text: string;
  type: string;
  required: boolean;
  order: number;
}

const questionTypes = [
  { value: 'text', label: 'Texto Curto' },
  { value: 'textarea', label: 'Texto Longo' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Seleção Única' },
  { value: 'multiselect', label: 'Seleção Múltipla' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Data' },
];

export default function AdminBriefingTemplatesPage() {
  const [templates, setTemplates] = useState<BriefingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<BriefingTemplate | null>(null);
  const [questions, setQuestions] = useState<BriefingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // New template form
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  
  // New question form
  const [newQuestion, setNewQuestion] = useState({ text: '', type: 'text', required: false });

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/briefing-templates', { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (err) {
      setError('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplateDetails(id: string) {
    try {
      const response = await fetch(`/api/v2/briefing-templates/${id}`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setSelectedTemplate(data.template);
        setQuestions(data.template.questions || []);
      }
    } catch (err) {
      setError('Erro ao carregar template');
    }
  }

  async function createTemplate() {
    if (!newTemplateTitle.trim()) return;
    try {
      const response = await fetch('/api/v2/briefing-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newTemplateTitle }),
      });
      const data = await response.json();
      if (data.success) {
        setTemplates([data.template, ...templates]);
        setNewTemplateTitle('');
        setShowNewTemplate(false);
        setSelectedTemplate(data.template);
        setQuestions([]);
      }
    } catch (err) {
      setError('Erro ao criar template');
    }
  }

  async function addQuestion() {
    if (!newQuestion.text.trim() || !selectedTemplate) return;
    try {
      const response = await fetch(`/api/v2/briefing-templates/${selectedTemplate.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newQuestion,
          order: questions.length,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setQuestions([...questions, data.question]);
        setNewQuestion({ text: '', type: 'text', required: false });
        // Update template count
        loadTemplates();
      }
    } catch (err) {
      setError('Erro ao adicionar pergunta');
    }
  }

  async function deleteQuestion(questionId: string) {
    try {
      await fetch(`/api/v2/briefing-template-questions/${questionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setQuestions(questions.filter(q => q.id !== questionId));
      loadTemplates();
    } catch (err) {
      setError('Erro ao remover pergunta');
    }
  }

  async function duplicateTemplate(template: BriefingTemplate) {
    try {
      const response = await fetch(`/api/v2/briefing-templates/${template.id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setTemplates([data.template, ...templates]);
      }
    } catch (err) {
      setError('Erro ao duplicar template');
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      await fetch(`/api/v2/briefing-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setTemplates(templates.filter(t => t.id !== id));
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
        setQuestions([]);
      }
    } catch (err) {
      setError('Erro ao excluir template');
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Templates de Briefing</h1>
        <button
          onClick={() => setShowNewTemplate(!showNewTemplate)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Novo Template
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {/* New Template Form */}
      {showNewTemplate && (
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Criar Novo Template</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={newTemplateTitle}
              onChange={(e) => setNewTemplateTitle(e.target.value)}
              className="flex-1 px-3 py-2 bg-background border rounded-lg"
              placeholder="Nome do template (ex: Briefing Corporativo)"
            />
            <button
              onClick={createTemplate}
              disabled={!newTemplateTitle.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates List */}
        <div className="lg:col-span-1 bg-card rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-medium flex items-center gap-2">
              <FileText className="size-4" />
              Templates ({templates.length})
            </h2>
          </div>
          <div className="p-2">
            {templates.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum template criado ainda.
              </p>
            ) : (
              <div className="space-y-1">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => loadTemplateDetails(template.id)}
                    className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition ${
                      selectedTemplate?.id === template.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-sm">{template.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {template._count?.questions || 0} perguntas
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateTemplate(template);
                        }}
                        className="p-1.5 hover:bg-accent rounded"
                        title="Duplicar"
                      >
                        <Copy className="size-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate(template.id);
                        }}
                        className="p-1.5 hover:bg-accent rounded text-destructive"
                        title="Excluir"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Template Details / Questions */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <div className="space-y-4">
              {/* Template Header */}
              <div className="bg-card rounded-lg border p-4">
                <h2 className="font-medium text-lg">{selectedTemplate.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {questions.length} pergunta(s) no template
                </p>
              </div>

              {/* Add Question Form */}
              <div className="bg-card rounded-lg border p-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Plus className="size-4" />
                  Adicionar Pergunta
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Texto da Pergunta</label>
                    <input
                      type="text"
                      value={newQuestion.text}
                      onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                      className="w-full px-3 py-2 bg-background border rounded-lg mt-1"
                      placeholder="Ex: Qual o objetivo do evento?"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Tipo de Resposta</label>
                      <select
                        value={newQuestion.type}
                        onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
                        className="w-full px-3 py-2 bg-background border rounded-lg mt-1"
                      >
                        {questionTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newQuestion.required}
                          onChange={(e) => setNewQuestion({ ...newQuestion, required: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Pergunta obrigatória</span>
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={addQuestion}
                    disabled={!newQuestion.text.trim()}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                  >
                    + Adicionar Pergunta
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="bg-card rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="font-medium">Perguntas do Template</h3>
                </div>
                <div className="p-4">
                  {questions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma pergunta adicionada ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {questions.map((question, index) => (
                        <div
                          key={question.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50"
                        >
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <GripVertical className="size-4" />
                            <span className="text-xs w-5 text-center">{index + 1}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{question.text}</p>
                            <p className="text-xs text-muted-foreground">
                              {questionTypes.find(t => t.value === question.type)?.label}
                              {question.required && ' • Obrigatória'}
                            </p>
                          </div>
                          <button
                            onClick={() => deleteQuestion(question.id)}
                            className="p-1.5 hover:bg-destructive/10 text-destructive rounded"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border p-12 text-center">
              <FileText className="size-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                Selecione um template à esquerda para visualizar e editar suas perguntas.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
