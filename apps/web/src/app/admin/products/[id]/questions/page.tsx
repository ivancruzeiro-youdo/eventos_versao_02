'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Sparkles } from 'lucide-react';

type QType = 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'date';

interface Question {
  id: string;
  text: string;
  type: QType;
  required: boolean;
  options?: string[] | null;
  order: number;
  isNew?: boolean;
}

interface ProductInfo {
  id: string;
  name: string;
  categoryName: string | null;
  subitems?: { group: string; items: string[] }[] | null;
}

const FOOD_CATEGORY_KEYWORDS = ['alimento', 'bebida', 'catering', 'buffet', 'gastronomia', 'alimentação', 'food'];

function isFoodCategory(cat: string | null) {
  if (!cat) return false;
  const l = cat.toLowerCase();
  return FOOD_CATEGORY_KEYWORDS.some(k => l.includes(k));
}

export default function ProductQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [productId]);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch(`/api/v2/products/${productId}/questions`, { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao carregar'); return; }
      setProduct(data.product);
      setQuestions(data.questions || []);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  function addQuestion() {
    setQuestions(prev => [...prev, {
      id: `new-${Date.now()}`,
      text: '',
      type: 'text',
      required: false,
      order: prev.length + 1,
      isNew: true,
    }]);
  }

  function updateQuestion(id: string, updates: Partial<Question>) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  }

  function removeQuestion(id: string) {
    setQuestions(prev => prev.filter(q => q.id !== id).map((q, i) => ({ ...q, order: i + 1 })));
  }

  function suggestFoodQuestions() {
    if (!product) return;
    const subitems = product.subitems || [];
    const suggested: Question[] = [];

    if (subitems.length > 0) {
      subitems.forEach((sub, i) => {
        suggested.push({
          id: `sug-${Date.now()}-${i}`,
          text: `${sub.group} — quais itens deseja servir?`,
          type: 'multiselect',
          required: true,
          options: sub.items,
          order: questions.length + suggested.length + 1,
          isNew: true,
        });
      });
    } else {
      suggested.push({
        id: `sug-${Date.now()}-0`,
        text: 'Quais itens deseja incluir no cardápio?',
        type: 'multiselect',
        required: true,
        options: [],
        order: questions.length + 1,
        isNew: true,
      });
    }

    setQuestions(prev => [...prev, ...suggested]);
  }

  async function saveQuestions() {
    setSaving(true);
    setSaveOk(false);
    setError('');
    try {
      const res = await fetch(`/api/v2/products/${productId}/questions`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map(q => ({
            text: q.text,
            type: q.type,
            required: q.required,
            options: (q.type === 'select' || q.type === 'multiselect') ? (q.options || []) : null,
            order: q.order,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao salvar'); return; }
      setQuestions(data.questions || []);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch {
      setError('Erro de conexão ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const isFood = isFoodCategory(product?.categoryName ?? null);

  return (
    <Layout>
      <div className="mb-8">
        <Link href="/admin/products" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" />
          Voltar para produtos
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Perguntas do Produto</h1>
            <p className="text-sm text-muted-foreground">
              {product?.name} {product?.categoryName ? `• ${product.categoryName}` : ''}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estas perguntas serão exibidas quando o produto for vinculado a um evento.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isFood && (
              <button onClick={suggestFoodQuestions}
                className="px-3 py-2 border border-input rounded-lg text-sm font-medium hover:bg-muted transition flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                Sugerir perguntas de cardápio
              </button>
            )}
            <button onClick={saveQuestions} disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2 disabled:opacity-50">
              <Save className="size-4" />
              {saving ? 'Salvando...' : saveOk ? '✓ Salvo!' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          </div>
        ) : (
          <>
            {questions.length === 0 && (
              <div className="text-center py-10 bg-muted/30 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground mb-2">Nenhuma pergunta configurada para este produto.</p>
                {isFood && (
                  <button onClick={suggestFoodQuestions}
                    className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto">
                    <Sparkles size={14} className="text-amber-500" />
                    Gerar sugestões de cardápio automaticamente
                  </button>
                )}
              </div>
            )}

            {questions.map((q, index) => (
              <div key={q.id} className="bg-card rounded-lg border p-4 flex items-start gap-3">
                <div className="flex items-center gap-2 pt-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground font-medium w-5 text-right">{index + 1}</span>
                  <GripVertical className="size-4 text-muted-foreground cursor-move" />
                </div>
                <div className="flex-1 space-y-2.5">
                  <input
                    type="text"
                    value={q.text}
                    onChange={e => updateQuestion(q.id, { text: e.target.value })}
                    placeholder="Texto da pergunta"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex flex-wrap gap-2 items-center">
                    <select value={q.type} onChange={e => updateQuestion(q.id, { type: e.target.value as QType })}
                      className="px-3 py-1.5 bg-background border border-input rounded-md text-sm">
                      <option value="text">Texto curto</option>
                      <option value="textarea">Texto longo</option>
                      <option value="number">Número</option>
                      <option value="select">Seleção única</option>
                      <option value="multiselect">Seleção múltipla</option>
                      <option value="checkbox">Sim / Não</option>
                      <option value="date">Data</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.id, { required: e.target.checked })} className="rounded" />
                      Obrigatória
                    </label>
                  </div>
                  {(q.type === 'select' || q.type === 'multiselect') && (
                    <div>
                      <input
                        type="text"
                        value={(q.options || []).join(', ')}
                        onChange={e => updateQuestion(q.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="Opções separadas por vírgula: Opção A, Opção B, Opção C"
                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                      />
                      {(q.options || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(q.options || []).map((opt, oi) => (
                            <span key={oi} className="text-xs bg-muted px-2 py-0.5 rounded-full">{opt}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => removeQuestion(q.id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition shrink-0 mt-0.5">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}

            <button onClick={addQuestion}
              className="w-full py-3 border border-dashed border-input rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition flex items-center justify-center gap-2">
              <Plus className="size-4" />
              Adicionar pergunta
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
