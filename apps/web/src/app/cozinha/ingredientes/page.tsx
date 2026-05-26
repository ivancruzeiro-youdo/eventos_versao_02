'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  Plus, Search, Pencil, Trash2, X, AlertTriangle, Package
} from 'lucide-react';

interface KitchenIngredient {
  id: string;
  name: string;
  category: string;
  unit: string;
  costPerUnit: number;
  stockQuantity: number;
  minQuantity: number;
  storageType: 'dry' | 'frozen' | 'refrigerated';
}

const CATEGORIES = [
  'Laticínios',
  'Hortifrutis',
  'Peixes e Frutos do Mar',
  'Açougue',
  'Mercearia',
  'Bebidas',
  'Temperos e Condimentos',
  'Outros',
];

const STORAGE_LABELS: Record<string, string> = {
  dry: 'Estoque Seco',
  frozen: 'Estoque Congelado',
  refrigerated: 'Estoque em Geladeira',
};

const EMPTY_FORM = {
  name: '',
  category: 'Outros',
  unit: '',
  costPerUnit: '',
  stockQuantity: '',
  minQuantity: '',
  storageType: 'dry' as 'dry' | 'frozen' | 'refrigerated',
};

type ModalMode = 'create' | 'edit' | null;

export default function IngredientesPage() {
  const router = useRouter();
  const [items, setItems] = useState<KitchenIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [storageFilter, setStorageFilter] = useState('all');
  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<KitchenIngredient | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/kitchen/ingredients', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setItems(data.ingredients || data || []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = useCallback(() => {
    let list = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    if (storageFilter !== 'all') {
      list = list.filter(i => i.storageType === storageFilter);
    }
    return list;
  }, [items, search, storageFilter]);

  function openCreate() {
    setSelected(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setModal('create');
  }

  function openEdit(item: KitchenIngredient) {
    setSelected(item);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      costPerUnit: String(item.costPerUnit),
      stockQuantity: String(item.stockQuantity),
      minQuantity: String(item.minQuantity),
      storageType: item.storageType,
    });
    setFormError('');
    setModal('edit');
  }

  async function save() {
    if (!form.name.trim() || !form.unit.trim()) {
      setFormError('Nome e Unidade são obrigatórios.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit.trim(),
        costPerUnit: parseFloat(form.costPerUnit) || 0,
        stockQuantity: parseFloat(form.stockQuantity) || 0,
        minQuantity: parseFloat(form.minQuantity) || 0,
        storageType: form.storageType,
      };
      const url = selected ? `/api/v2/kitchen/ingredients/${selected.id}` : '/api/v2/kitchen/ingredients';
      const method = selected ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error || 'Erro ao salvar ingrediente.'); return; }
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function del(item: KitchenIngredient) {
    if (!confirm(`Excluir ingrediente "${item.name}"?`)) return;
    await fetch(`/api/v2/kitchen/ingredients/${item.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  const displayList = filtered();

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package size={24} /> Ingredientes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie os ingredientes e estoque da cozinha.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus size={15} /> Novo Ingrediente
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={storageFilter}
            onChange={e => setStorageFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos</option>
            <option value="dry">Estoque Seco</option>
            <option value="frozen">Estoque Congelado</option>
            <option value="refrigerated">Estoque em Geladeira</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum ingrediente encontrado.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unidade</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Custo/Un (R$)</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Mínimo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Armazenamento</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayList.map(item => {
                  const lowStock = item.stockQuantity <= item.minQuantity;
                  return (
                    <tr
                      key={item.id}
                      className={lowStock ? 'bg-orange-500/5' : ''}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {lowStock && (
                            <AlertTriangle size={14} className="text-orange-500 shrink-0" />
                          )}
                          <span className={`font-medium ${lowStock ? 'text-orange-600' : ''}`}>
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                      <td className="px-4 py-3 text-right">
                        {item.costPerUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${lowStock ? 'text-orange-600' : ''}`}>
                        {item.stockQuantity.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {item.minQuantity.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          {STORAGE_LABELS[item.storageType] || item.storageType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => del(item)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Summary */}
        {!loading && displayList.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {displayList.length} ingrediente{displayList.length !== 1 ? 's' : ''} •{' '}
            {displayList.filter(i => i.stockQuantity <= i.minQuantity).length} abaixo do mínimo
          </p>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">
                {modal === 'create' ? 'Novo Ingrediente' : 'Editar Ingrediente'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded hover:bg-muted">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {formError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Nome *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Queijo Mussarela"
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
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unidade *</label>
                  <input
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="Ex: kg, L, un"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Custo por Unidade (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.costPerUnit}
                    onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Armazenamento</label>
                  <select
                    value={form.storageType}
                    onChange={e => setForm(f => ({ ...f, storageType: e.target.value as 'dry' | 'frozen' | 'refrigerated' }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  >
                    <option value="dry">Estoque Seco</option>
                    <option value="frozen">Estoque Congelado</option>
                    <option value="refrigerated">Estoque em Geladeira</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Qtd. em Estoque</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.stockQuantity}
                    onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantidade Mínima</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.minQuantity}
                    onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
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
