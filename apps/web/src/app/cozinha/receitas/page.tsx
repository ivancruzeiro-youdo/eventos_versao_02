'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  Plus, Search, Pencil, Trash2, X, ChefHat, Clock, Users, Minus, Layers, Package
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

interface RecipeStep {
  id: string;
  stepNumber: number;
  description: string;
}

interface SubRecipeLink {
  id: string;
  quantity: number;       // servingsUsed
  subRecipe: KitchenRecipe;
}

interface KitchenRecipe {
  id: string;
  name: string;
  category: string;
  recipeType: 'base' | 'final';
  servings: number;
  averagePerGuest: number;
  prepTimeMinutes: number;
  notes: string | null;
  recipeIngredients: {
    ingredient: KitchenIngredient;
    quantity: number;
    unit: string | null;
  }[];
  steps: RecipeStep[];
  subRecipes: SubRecipeLink[];
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
type TypeFilter = 'all' | 'base' | 'final';

interface FormState {
  name: string;
  category: string;
  recipeType: 'base' | 'final';
  servings: string;
  averagePerGuest: string;
  prepTime: string;
  notes: string;
  ingredients: { ingredientId: string; quantity: string; unit: string }[];
  steps: string[];
  bases: { subRecipeId: string; quantity: string }[];  // sub-recipes (Bases) for 'final' type
}

const EMPTY_FORM: FormState = {
  name: '',
  category: 'Prato principal',
  recipeType: 'final',
  servings: '',
  averagePerGuest: '',
  prepTime: '',
  notes: '',
  ingredients: [],
  steps: [],
  bases: [],
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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
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

  // Base recipes available for selection in 'final' recipes
  const baseRecipes = recipes.filter(r => r.recipeType === 'base');

  const filtered = useCallback(() => {
    let list = recipes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      list = list.filter(r => r.category === categoryFilter);
    }
    if (typeFilter !== 'all') {
      list = list.filter(r => r.recipeType === typeFilter);
    }
    return list;
  }, [recipes, search, categoryFilter, typeFilter]);

  function calcRecipeCost(recipe: KitchenRecipe): number {
    let cost = (recipe.recipeIngredients || []).reduce((sum, ri) => {
      return sum + ri.quantity * ri.ingredient.costPerUnit;
    }, 0);
    // Add cost from base recipes
    for (const sr of recipe.subRecipes || []) {
      cost += calcRecipeCost(sr.subRecipe) * sr.quantity;
    }
    return cost;
  }

  function calcFormCost(): number {
    let cost = form.ingredients.reduce((sum, fi) => {
      const ing = allIngredients.find(i => i.id === fi.ingredientId);
      if (!ing) return sum;
      return sum + (parseFloat(fi.quantity) || 0) * ing.costPerUnit;
    }, 0);
    for (const b of form.bases) {
      const base = baseRecipes.find(r => r.id === b.subRecipeId);
      if (base) cost += calcRecipeCost(base) * (parseFloat(b.quantity) || 1);
    }
    return cost;
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
      recipeType: recipe.recipeType || 'final',
      servings: String(recipe.servings),
      averagePerGuest: String(recipe.averagePerGuest),
      prepTime: String(recipe.prepTimeMinutes),
      notes: recipe.notes || '',
      ingredients: (recipe.recipeIngredients || []).map(ri => ({
        ingredientId: ri.ingredient.id,
        quantity: String(ri.quantity),
        unit: ri.unit || ri.ingredient.unit,
      })),
      steps: (recipe.steps || []).map(s => s.description),
      bases: (recipe.subRecipes || []).map(sr => ({
        subRecipeId: sr.subRecipe.id,
        quantity: String(sr.quantity || 1),
      })),
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
        recipeType: form.recipeType,
        servings: parseInt(form.servings) || 1,
        averagePerGuest: parseFloat(form.averagePerGuest) || 1,
        prepTimeMinutes: parseInt(form.prepTime) || 0,
        notes: form.notes.trim() || null,
        ingredients: form.ingredients
          .filter(fi => fi.ingredientId)
          .map(fi => ({
            ingredientId: fi.ingredientId,
            quantity: parseFloat(fi.quantity) || 0,
            unit: fi.unit,
          })),
        steps: form.steps
          .filter(s => s.trim())
          .map((description, i) => ({ stepNumber: i + 1, description })),
        subRecipes: form.recipeType === 'final'
          ? form.bases
              .filter(b => b.subRecipeId)
              .map(b => ({ subRecipeId: b.subRecipeId, quantity: parseFloat(b.quantity) || 1 }))
          : [],
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
      ingredients: [...f.ingredients, { ingredientId: firstIng?.id || '', quantity: '', unit: firstIng?.unit || '' }],
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
    setForm(f => { const steps = [...f.steps]; steps[idx] = value; return { ...f, steps }; });
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

  function addBase() {
    const firstBase = baseRecipes[0];
    setForm(f => ({
      ...f,
      bases: [...f.bases, { subRecipeId: firstBase?.id || '', quantity: '1' }],
    }));
  }

  function removeBase(idx: number) {
    setForm(f => ({ ...f, bases: f.bases.filter((_, i) => i !== idx) }));
  }

  function updateBase(idx: number, field: string, value: string) {
    setForm(f => {
      const bases = [...f.bases];
      bases[idx] = { ...bases[idx], [field]: value };
      return { ...f, bases };
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
              Crie e gerencie receitas. <span className="font-medium">Base</span> serve para múltiplos produtos finais.{' '}
              <span className="font-medium">Produto Final</span> pode combinar Bases + ingredientes + preparo.
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
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos os tipos</option>
            <option value="base">Base</option>
            <option value="final">Produto Final</option>
          </select>
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

        {/* Counts summary */}
        {!loading && recipes.length > 0 && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers size={13} className="text-blue-500" />
              {recipes.filter(r => r.recipeType === 'base').length} base{recipes.filter(r => r.recipeType === 'base').length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Package size={13} className="text-emerald-500" />
              {recipes.filter(r => r.recipeType === 'final').length} produto{recipes.filter(r => r.recipeType === 'final').length !== 1 ? 's' : ''} finais
            </span>
          </div>
        )}

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
              const isBase = recipe.recipeType === 'base';
              return (
                <div key={recipe.id} className={`bg-card rounded-lg border p-5 space-y-3 ${isBase ? 'border-blue-200 dark:border-blue-900' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base leading-tight">{recipe.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          isBase
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}>
                          {isBase ? <Layers size={10} /> : <Package size={10} />}
                          {isBase ? 'Base' : 'Produto Final'}
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          {recipe.category}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(recipe)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => del(recipe)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users size={13} /> {recipe.servings} porções
                    </span>
                    {recipe.prepTimeMinutes > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock size={13} /> {recipe.prepTimeMinutes} min
                      </span>
                    )}
                    {cost > 0 && (
                      <span className="font-medium text-foreground">R$ {fmtCurrency(cost)}</span>
                    )}
                  </div>
                  {/* Sub-info */}
                  <p className="text-xs text-muted-foreground">
                    {(recipe.subRecipes || []).length > 0 && (
                      <span>{recipe.subRecipes.length} base{recipe.subRecipes.length !== 1 ? 's' : ''} • </span>
                    )}
                    {(recipe.recipeIngredients || []).length > 0 && (
                      <span>{recipe.recipeIngredients.length} ingrediente{recipe.recipeIngredients.length !== 1 ? 's' : ''}</span>
                    )}
                    {(recipe.steps || []).length > 0 && (
                      <span> • {recipe.steps.length} etapa{recipe.steps.length !== 1 ? 's' : ''}</span>
                    )}
                  </p>
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
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{formError}</p>
              )}

              {/* Type selector */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Tipo de Receita
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'base', label: 'Base', icon: Layers, desc: 'Massa, molho, recheio… usada em vários produtos finais', color: 'blue' },
                    { value: 'final', label: 'Produto Final', icon: Package, desc: 'Prato completo; pode combinar Bases + ingredientes', color: 'emerald' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, recipeType: opt.value }))}
                      className={`flex flex-col items-start gap-1 p-4 rounded-lg border-2 text-left transition ${
                        form.recipeType === opt.value
                          ? opt.color === 'blue'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                            : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                          : 'border-input hover:bg-muted/50'
                      }`}
                    >
                      <span className={`flex items-center gap-1.5 font-medium text-sm ${
                        form.recipeType === opt.value
                          ? opt.color === 'blue' ? 'text-blue-700 dark:text-blue-300' : 'text-emerald-700 dark:text-emerald-300'
                          : ''
                      }`}>
                        <opt.icon size={14} />
                        {opt.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

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
                      placeholder={form.recipeType === 'base' ? 'Ex: Massa de Quiche' : 'Ex: Quiche de Alho Poró'}
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
                      {RECIPE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tempo de preparo (min)</label>
                    <input type="number" min="0" value={form.prepTime}
                      onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Porções</label>
                    <input type="number" min="1" value={form.servings}
                      onChange={e => setForm(f => ({ ...f, servings: e.target.value }))}
                      placeholder="1"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Média por convidado</label>
                    <input type="number" step="0.1" min="0" value={form.averagePerGuest}
                      onChange={e => setForm(f => ({ ...f, averagePerGuest: e.target.value }))}
                      placeholder="1"
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Observações</label>
                    <textarea value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="Dicas, variações, alergênicos..."
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Bases section — only for 'final' type */}
              {form.recipeType === 'final' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Bases Utilizadas
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Receitas base que compõem este produto final (ex: massa, molho).
                      </p>
                    </div>
                    <button onClick={addBase} disabled={baseRecipes.length === 0}
                      className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted transition disabled:opacity-40">
                      <Plus size={12} /> Adicionar base
                    </button>
                  </div>
                  {baseRecipes.length === 0 ? (
                    <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                      Nenhuma receita do tipo <strong>Base</strong> cadastrada ainda.
                    </p>
                  ) : form.bases.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3 border rounded-md">
                      Nenhuma base adicionada.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {form.bases.map((b, idx) => {
                        const base = baseRecipes.find(r => r.id === b.subRecipeId);
                        const baseCost = base ? calcRecipeCost(base) * (parseFloat(b.quantity) || 1) : 0;
                        return (
                          <div key={idx} className="flex gap-2 items-center">
                            <select value={b.subRecipeId}
                              onChange={e => updateBase(idx, 'subRecipeId', e.target.value)}
                              className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring">
                              <option value="">Selecionar base...</option>
                              {baseRecipes.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                            <input type="number" step="0.1" min="0" value={b.quantity}
                              onChange={e => updateBase(idx, 'quantity', e.target.value)}
                              placeholder="Qtd"
                              className="w-20 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            />
                            {baseCost > 0 && (
                              <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                                R$ {fmtCurrency(baseCost)}
                              </span>
                            )}
                            <button onClick={() => removeBase(idx)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition shrink-0">
                              <Minus size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Ingredients */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {form.recipeType === 'final' ? 'Ingredientes Adicionais' : 'Ingredientes'}
                  </h3>
                  <button onClick={addIngredientRow}
                    className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted transition">
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
                          <select value={fi.ingredientId}
                            onChange={e => updateIngredientRow(idx, 'ingredientId', e.target.value)}
                            className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring">
                            <option value="">Selecionar...</option>
                            {allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                          <input type="number" step="0.001" min="0" value={fi.quantity}
                            onChange={e => updateIngredientRow(idx, 'quantity', e.target.value)}
                            placeholder="Qtd"
                            className="w-20 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                          />
                          <input value={fi.unit} onChange={e => updateIngredientRow(idx, 'unit', e.target.value)}
                            placeholder="un"
                            className="w-16 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                          />
                          {subtotal > 0 && (
                            <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                              R$ {fmtCurrency(subtotal)}
                            </span>
                          )}
                          <button onClick={() => removeIngredientRow(idx)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition shrink-0">
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
                  <button onClick={addStep}
                    className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted transition">
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
                        <textarea value={step} onChange={e => updateStep(idx, e.target.value)}
                          rows={2} placeholder={`Etapa ${idx + 1}...`}
                          className="flex-1 px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring resize-none"
                        />
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 transition">↑</button>
                          <button onClick={() => moveStep(idx, 1)} disabled={idx === form.steps.length - 1}
                            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 transition">↓</button>
                          <button onClick={() => removeStep(idx)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition">
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
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm rounded border hover:bg-muted transition">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
