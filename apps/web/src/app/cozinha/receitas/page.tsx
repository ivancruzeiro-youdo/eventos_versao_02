'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  Plus, Search, Pencil, Trash2, X, ChefHat, Clock, Users, Minus
} from 'lucide-react';

interface KitchenIngredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  category: string;
}

interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  unit: string;
}

interface KitchenRecipe {
  id: string;
  name: string;
  category: string;
  servings: number;
  averagePerGuest: number;
  prepTime: number;
  notes: string | null;
  ingredients: {
    ingredient: KitchenIngredient;
    quantity: number;
    unit: string;
  }[];
  steps: string[];
}

const RECIPE_CATEGORIES = [
  'Entrada',
  'Prato principal',
  'Acompanhamento',
  'Sobremesa',
  'Bebida',
  'Outros',
];

type ModalMode = 'create' | 'edit' | null;

interface FormState {
  name: string;
  category: string;
  servings: string;
  averagePerGuest: string;
  prepTime: string;
  notes: string;
  ingredients: { ingredientId: string; quantity: string; unit: string }[];
  steps: string[];
}

const EMPTY_FORM: FormState = {
  name: '',
  category: 'Prato principal',
  servings: '',
  averagePerGuest: '',
  prepTime: '',
  notes: '',
  ingredients: [],
  steps: [],
};

function fmtCurrency(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceitasPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<KitchenRecipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<KitchenIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<KitchenRecipe | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, ingRes] = await Promise.all([
        fetch('/api/v2/kitchen/recipes', { credentials: 'include' }),
        fetch('/api/v2/kitchen/ingredients', { credentials: 'include' }),
      ]);
      if (recRes.status === 401 || ingRes.status === 401) { router.push('/login'); return; }
      const recData = await recRes.json();
      const ingData = await ingRes.json();
      setRecipes(recData.recipes || recData || []);
      setAllIngredients(ingData.ingredients || ingData || []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = useCallback(() => {
    let list = recipes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      list = list.filter(r => r.category === categoryFilter);
    }
    return list;
  }, [recipes, search, categoryFilter]);

  function calcRecipeCost(recipe: KitchenRecipe): number {
    return recipe.ingredients.reduce((sum, ri) => {
      return sum + ri.quantity * ri.ingredient.costPerUnit;
    }, 0);
  }

  function calcFormCost(): number {
    return form.ingredients.reduce((sum, fi) => {
      const ing = allIngredients.find(i => i.id === fi.ingredientId);
      if (!ing) return sum;
      return sum + (parseFloat(fi.quantity) || 0) * ing.costPerUnit;
    }, 0);
  }

  function openCreate() {
    setSelected(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setModal('create');
  }

  function openEdit(recipe: KitchenRecipe) {
    setSelected(recipe);
    setForm({
      name: recipe.name,
      category: recipe.category,
      servings: String(recipe.servings),
      averagePerGuest: String(recipe.averagePerGuest),
      prepTime: String(recipe.prepTime),
      notes: recipe.notes || '',
      ingredients: recipe.ingredients.map(ri => ({
        ingredientId: ri.ingredient.id,
        quantity: String(ri.quantity),
        unit: ri.unit,
      })),
      steps: [...recipe.steps],
    });
    setFormError('');
    setModal('edit');
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError('O nome da receita é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        servings: parseInt(form.servings) || 1,
        averagePerGuest: parseFloat(form.averagePerGuest) || 1,
        prepTime: parseInt(form.prepTime) || 0,
        notes: form.notes.trim() || null,
        ingredients: form.ingredients
          .filter(fi => fi.ingredientId)
          .map(fi => ({
            ingredientId: fi.ingredientId,
            quantity: parseFloat(fi.quantity) || 0,
            unit: fi.unit,
          })),
        steps: form.steps.filter(s => s.trim()),
      };
      const url = selected ? `/api/v2/kitchen/recipes/${selected.id}` : '/api/v2/kitchen/recipes';
      const method = selected ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error || 'Erro ao salvar receita.'); return; }
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function del(recipe: KitchenRecipe) {
    if (!confirm(`Excluir receita "${recipe.name}"?`)) return;
    await fetch(`/api/v2/kitchen/recipes/${recipe.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  function addIngredientRow() {
    const firstIng = allIngredients[0];
    setForm(f => ({
      ...f,
      ingredients: [
        ...f.ingredients,
        { ingredientId: firstIng?.id || '', quantity: '', unit: firstIng?.unit || '' },
      ],
    }));
  }

  function removeIngredientRow(idx: number) {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  }

  function updateIngredientRow(idx: number, field: string, value: string) {
    setForm(f => {
      const updated = [...f.ingredients];
      if (field === 'ingredientId') {
        const ing = allIngredients.find(i => i.id === value);
        updated[idx] = { ...updated[idx], ingredientId: value, unit: ing?.unit || updated[idx].unit };
      } else {
        updated[idx] = { ...updated[idx], [field]: value };
      }
      return { ...f, ingredients: updated };
    });
  }

  function addStep() {
    setForm(f => ({ ...f, steps: [...f.steps, ''] }));
  }

  function removeStep(idx: number) {
    setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));
  }

  function updateStep(idx: number, value: string) {
    setForm(f => {
      const steps = [...f.steps];
      steps[idx] = value;
      return { ...f, steps };
    });
  }

  function moveStep(idx: number, dir: -1 | 1) {
    setForm(f => {
      const steps = [...f.steps];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= steps.length) return f;
      [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
      return { ...f, steps };
    });
  }

  const displayList = filtered();

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ChefHat size={24} /> Receitas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie e gerencie receitas com ingredientes e modo de preparo.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus size={15} /> Nova Receita
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar receita..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todas as categorias</option>
            {RECIPE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm bg-card rounded-lg border">
            Nenhuma receita encontrada.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayList.map(recipe => {
              const cost = calcRecipeCost(recipe);
              return (
                <div key={recipe.id} className="bg-card rounded-lg border p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base leading-tight">{recipe.name}</h3>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                        {recipe.category}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(recipe)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => del(recipe)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users size={13} /> {recipe.servings} porções
                    </span>
                    {recipe.prepTime > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock size={13} /> {recipe.prepTime} min
                      </span>
                    )}
                    {cost > 0 && (
                      <span className="font-medium text-foreground">
                        R$ {fmtCurrency(cost)}
                      </span>
                    )}
                  </div>
                  {recipe.ingredients.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {recipe.ingredients.length} ingrediente{recipe.ingredients.length !== 1 ? 's' : ''}
                      {recipe.steps.length > 0 && ` • ${recipe.steps.length} etapa${recipe.steps.length !== 1 ? 's' : ''}`}
                    </p>
                  )}
                  {recipe.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic">{recipe.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && displayList.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {displayList.length} receita{displayList.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b shrink-0">
              <h2 className="text-lg font-semibold">
                {modal === 'create' ? 'Nova Receita' : 'Editar Receita'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded hover:bg-muted">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {formError}
                </p>
              )}

              {/* Basic fields */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Informações Básicas
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Nome *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ex: Risoto de Camarão"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Categoria</label>
                    <select
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    >
                      {RECIPE_CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tempo de preparo (min)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.prepTime}
                      onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Porções</label>
                    <input
                      type="number"
                      min="1"
                      value={form.servings}
                      onChange={e => setForm(f => ({ ...f, servings: e.target.value }))}
                      placeholder="1"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Média por convidado</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.averagePerGuest}
                      onChange={e => setForm(f => ({ ...f, averagePerGuest: e.target.value }))}
                      placeholder="1"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Observações</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      placeholder="Dicas, variações, alergênicos..."
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Ingredients */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Ingredientes
                  </h3>
                  <button
                    onClick={addIngredientRow}
                    className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted transition"
                  >
                    <Plus size={12} /> Adicionar
                  </button>
                </div>
                {form.ingredients.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3 border rounded-md">
                    Nenhum ingrediente adicionado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.ingredients.map((fi, idx) => {
                      const ing = allIngredients.find(i => i.id === fi.ingredientId);
                      const subtotal = (parseFloat(fi.quantity) || 0) * (ing?.costPerUnit || 0);
                      return (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            value={fi.ingredientId}
                            onChange={e => updateIngredientRow(idx, 'ingredientId', e.target.value)}
                            className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Selecionar...</option>
                            {allIngredients.map(i => (
                              <option key={i.id} value={i.id}>{i.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={fi.quantity}
                            onChange={e => updateIngredientRow(idx, 'quantity', e.target.value)}
                            placeholder="Qtd"
                            className="w-20 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                          />
                          <input
                            value={fi.unit}
                            onChange={e => updateIngredientRow(idx, 'unit', e.target.value)}
                            placeholder="un"
                            className="w-16 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                          />
                          {subtotal > 0 && (
                            <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                              R$ {fmtCurrency(subtotal)}
                            </span>
                          )}
                          <button
                            onClick={() => removeIngredientRow(idx)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition shrink-0"
                          >
                            <Minus size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {form.ingredients.length > 0 && (
                  <div className="flex justify-end">
                    <p className="text-sm font-medium">
                      Custo total: R$ {fmtCurrency(calcFormCost())}
                    </p>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Modo de Preparo
                  </h3>
                  <button
                    onClick={addStep}
                    className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted transition"
                  >
                    <Plus size={12} /> Adicionar etapa
                  </button>
                </div>
                {form.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3 border rounded-md">
                    Nenhuma etapa adicionada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.steps.map((step, idx) => (
                      <div key={idx} className="flex gap-2 items-start">
                        <span className="text-xs font-medium text-muted-foreground w-6 pt-2 text-center shrink-0">
                          {idx + 1}.
                        </span>
                        <textarea
                          value={step}
                          onChange={e => updateStep(idx, e.target.value)}
                          rows={2}
                          placeholder={`Etapa ${idx + 1}...`}
                          className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring resize-none"
                        />
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 transition"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === form.steps.length - 1}
                            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 transition"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm rounded border hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
