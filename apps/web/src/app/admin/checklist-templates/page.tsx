'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Plus, Trash2, Copy, CheckSquare, GripVertical, ListTodo, ChevronUp, ChevronDown } from 'lucide-react';

interface ChecklistTemplate {
  id: string;
  title: string;
  _count?: { items: number };
  createdAt: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  order: number;
}

export default function AdminChecklistTemplatesPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // New template form
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  
  // New item form
  const [newItemText, setNewItemText] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/checklist-templates', { credentials: 'include' });
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
      const response = await fetch(`/api/v2/checklist-templates/${id}`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        setSelectedTemplate(data.template);
        setItems(data.template.items || []);
      }
    } catch (err) {
      setError('Erro ao carregar template');
    }
  }

  async function createTemplate() {
    if (!newTemplateTitle.trim()) return;
    try {
      const response = await fetch('/api/v2/checklist-templates', {
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
        setItems([]);
      }
    } catch (err) {
      setError('Erro ao criar template');
    }
  }

  async function addItem() {
    if (!newItemText.trim() || !selectedTemplate) return;
    try {
      const response = await fetch(`/api/v2/checklist-templates/${selectedTemplate.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text: newItemText,
          order: items.length,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setItems([...items, data.item]);
        setNewItemText('');
        loadTemplates();
      }
    } catch (err) {
      setError('Erro ao adicionar item');
    }
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (!selectedTemplate) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setItems(reordered);
    try {
      await fetch(`/api/v2/checklist-templates/${selectedTemplate.id}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemIds: reordered.map((i) => i.id) }),
      });
    } catch (err) {
      setError('Erro ao reordenar itens');
      loadTemplateDetails(selectedTemplate.id);
    }
  }

  async function deleteItem(itemId: string) {
    try {
      await fetch(`/api/v2/checklist-template-items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setItems(items.filter(item => item.id !== itemId));
      loadTemplates();
    } catch (err) {
      setError('Erro ao remover item');
    }
  }

  async function duplicateTemplate(template: ChecklistTemplate) {
    try {
      const response = await fetch(`/api/v2/checklist-templates/${template.id}/duplicate`, {
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
      await fetch(`/api/v2/checklist-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setTemplates(templates.filter(t => t.id !== id));
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
        setItems([]);
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
        <h1 className="text-2xl font-bold text-foreground">Templates de Checklist</h1>
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
              placeholder="Nome do template (ex: Checklist de Montagem)"
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
              <ListTodo className="size-4" />
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
                        {template._count?.items || 0} itens
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

        {/* Template Details / Items */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <div className="space-y-4">
              {/* Template Header */}
              <div className="bg-card rounded-lg border p-4">
                <h2 className="font-medium text-lg">{selectedTemplate.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {items.length} item(s) no template
                </p>
              </div>

              {/* Add Item Form */}
              <div className="bg-card rounded-lg border p-4">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Plus className="size-4" />
                  Adicionar Item
                </h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    className="flex-1 px-3 py-2 bg-background border rounded-lg"
                    placeholder="Ex: Verificar som e iluminação"
                    onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  />
                  <button
                    onClick={addItem}
                    disabled={!newItemText.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="bg-card rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="font-medium">Itens do Checklist</h3>
                </div>
                <div className="p-4">
                  {items.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum item adicionado ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50"
                        >
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <GripVertical className="size-4" />
                            <span className="text-xs w-5 text-center">{index + 1}</span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm">{item.text}</p>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => moveItem(index, -1)}
                              disabled={index === 0}
                              className="p-1.5 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover para cima"
                            >
                              <ChevronUp className="size-4" />
                            </button>
                            <button
                              onClick={() => moveItem(index, 1)}
                              disabled={index === items.length - 1}
                              className="p-1.5 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Mover para baixo"
                            >
                              <ChevronDown className="size-4" />
                            </button>
                          </div>
                          <button
                            onClick={() => deleteItem(item.id)}
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
              <CheckSquare className="size-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                Selecione um template à esquerda para visualizar e editar seus itens.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
