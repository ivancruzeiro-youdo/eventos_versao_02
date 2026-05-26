'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  Plus, Trash2, X, ChevronDown, ChevronUp, Receipt, Camera, FileText, Minus
} from 'lucide-react';

interface KitchenIngredient {
  id: string;
  name: string;
  unit: string;
}

interface PurchaseItem {
  id?: string;
  name: string;
  ingredientId?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

interface KitchenPurchaseRecord {
  id: string;
  storeName: string;
  date: string;
  source: 'manual' | 'foto';
  total: number;
  items: PurchaseItem[];
}

interface FormPurchaseItem {
  name: string;
  ingredientId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

interface PurchaseForm {
  storeName: string;
  date: string;
  source: 'manual' | 'foto';
  items: FormPurchaseItem[];
}

function fmtDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function fmtCurrency(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcItemTotal(item: FormPurchaseItem): number {
  return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

const EMPTY_FORM: PurchaseForm = {
  storeName: '',
  date: todayStr(),
  source: 'manual',
  items: [],
};

const EMPTY_ITEM: FormPurchaseItem = {
  name: '',
  ingredientId: '',
  quantity: '',
  unit: '',
  unitPrice: '',
};

export default function RegistrosComprasPage() {
  const router = useRouter();
  const [records, setRecords] = useState<KitchenPurchaseRecord[]>([]);
  const [allIngredients, setAllIngredients] = useState<KitchenIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<PurchaseForm>({ ...EMPTY_FORM, date: todayStr() });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, ingRes] = await Promise.all([
        fetch('/api/v2/kitchen/purchases', { credentials: 'include' }),
        fetch('/api/v2/kitchen/ingredients', { credentials: 'include' }),
      ]);
      if (recRes.status === 401 || ingRes.status === 401) { router.push('/login'); return; }
      const recData = await recRes.json();
      const ingData = await ingRes.json();
      setRecords(recData.purchases || recData || []);
      setAllIngredients(ingData.ingredients || ingData || []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate() {
    setForm({ storeName: '', date: todayStr(), source: 'manual', items: [] });
    setFormError('');
    setModal(true);
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function updateItem(idx: number, field: keyof FormPurchaseItem, value: string) {
    setForm(f => {
      const items = [...f.items];
      if (field === 'ingredientId') {
        const ing = allIngredients.find(i => i.id === value);
        items[idx] = {
          ...items[idx],
          ingredientId: value,
          name: ing ? ing.name : items[idx].name,
          unit: ing ? ing.unit : items[idx].unit,
        };
      } else {
        items[idx] = { ...items[idx], [field]: value };
      }
      return { ...f, items };
    });
  }

  const formTotal = form.items.reduce((sum, item) => sum + calcItemTotal(item), 0);

  async function save() {
    if (!form.storeName.trim()) {
      setFormError('O nome do estabelecimento é obrigatório.');
      return;
    }
    if (form.items.length === 0) {
      setFormError('Adicione pelo menos um item à compra.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const body = {
        storeName: form.storeName.trim(),
        date: form.date,
        source: form.source,
        items: form.items.map(item => ({
          name: item.name.trim() || (allIngredients.find(i => i.id === item.ingredientId)?.name || 'Item'),
          ingredientId: item.ingredientId || null,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit.trim(),
          unitPrice: parseFloat(item.unitPrice) || 0,
          totalPrice: calcItemTotal(item),
        })),
      };
      const res = await fetch('/api/v2/kitchen/purchases', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error || 'Erro ao salvar registro.'); return; }
      setModal(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function del(record: KitchenPurchaseRecord) {
    if (!confirm(`Excluir compra de "${record.storeName}" em ${fmtDate(record.date)}?`)) return;
    await fetch(`/api/v2/kitchen/purchases/${record.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt size={24} /> Registros de Compras
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Histórico de compras realizadas para a cozinha.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus size={15} /> Nova Compra
          </button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum registro de compra encontrado.
            </div>
          ) : (
            <div className="divide-y">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 bg-muted/40 text-xs font-medium text-muted-foreground">
                <span>Estabelecimento</span>
                <span className="text-center">Data</span>
                <span className="text-center">Origem</span>
                <span className="text-right">Total</span>
                <span />
              </div>

              {records.map(record => {
                const expanded = expandedIds.has(record.id);
                return (
                  <div key={record.id}>
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 hover:bg-muted/30 transition">
                      <button
                        onClick={() => toggleExpand(record.id)}
                        className="flex items-center gap-2 text-left min-w-0"
                      >
                        {expanded
                          ? <ChevronUp size={14} className="text-muted-foreground shrink-0" />
                          : <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                        }
                        <span className="font-medium text-sm truncate">{record.storeName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({record.items?.length ?? 0} iten{(record.items?.length ?? 0) !== 1 ? 's' : ''})
                        </span>
                      </button>
                      <span className="text-sm text-muted-foreground text-center whitespace-nowrap">
                        {fmtDate(record.date)}
                      </span>
                      <span className="text-center">
                        {record.source === 'foto' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-600">
                            <Camera size={10} /> Foto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                            <FileText size={10} /> Manual
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold text-right">
                        R$ {fmtCurrency(record.total)}
                      </span>
                      <button
                        onClick={() => del(record)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {expanded && record.items && record.items.length > 0 && (
                      <div className="bg-muted/20 border-t px-8 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="text-left py-1.5 font-medium">Item</th>
                              <th className="text-right py-1.5 font-medium">Qtd</th>
                              <th className="text-right py-1.5 font-medium">Un</th>
                              <th className="text-right py-1.5 font-medium">Preço/Un</th>
                              <th className="text-right py-1.5 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {record.items.map((item, idx) => (
                              <tr key={item.id || idx}>
                                <td className="py-1.5">{item.name}</td>
                                <td className="py-1.5 text-right text-muted-foreground">{item.quantity}</td>
                                <td className="py-1.5 text-right text-muted-foreground">{item.unit}</td>
                                <td className="py-1.5 text-right text-muted-foreground">R$ {fmtCurrency(item.unitPrice)}</td>
                                <td className="py-1.5 text-right font-medium">R$ {fmtCurrency(item.totalPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!loading && records.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {records.length} registro{records.length !== 1 ? 's' : ''} •{' '}
            Total gasto: R$ {fmtCurrency(records.reduce((s, r) => s + r.total, 0))}
          </p>
        )}
      </div>

      {/* Create Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b shrink-0">
              <h2 className="text-lg font-semibold">Registrar Nova Compra</h2>
              <button onClick={() => setModal(false)} className="p-1.5 rounded hover:bg-muted">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {formError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {formError}
                </p>
              )}

              {/* Basic info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Informações da Compra
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Estabelecimento *</label>
                    <input
                      value={form.storeName}
                      onChange={e => setForm(f => ({ ...f, storeName: e.target.value }))}
                      placeholder="Ex: Atacadão, Mercado Local..."
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Data</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Origem</label>
                    <select
                      value={form.source}
                      onChange={e => setForm(f => ({ ...f, source: e.target.value as 'manual' | 'foto' }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                    >
                      <option value="manual">Manual</option>
                      <option value="foto">Foto</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Itens
                  </h3>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted transition"
                  >
                    <Plus size={12} /> Adicionar item
                  </button>
                </div>

                {form.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                    Nenhum item adicionado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Column headers */}
                    <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
                      <span>Item / Ingrediente</span>
                      <span>Nome</span>
                      <span>Qtd</span>
                      <span>Un</span>
                      <span>Preço/Un</span>
                      <span />
                    </div>

                    {form.items.map((item, idx) => {
                      const total = calcItemTotal(item);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-2 items-center">
                            <select
                              value={item.ingredientId}
                              onChange={e => updateItem(idx, 'ingredientId', e.target.value)}
                              className="px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            >
                              <option value="">Livre (digitar nome)</option>
                              {allIngredients.map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))}
                            </select>
                            <input
                              value={item.name}
                              onChange={e => updateItem(idx, 'name', e.target.value)}
                              placeholder={item.ingredientId ? allIngredients.find(i => i.id === item.ingredientId)?.name || 'Nome' : 'Nome do item'}
                              className="px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            />
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', e.target.value)}
                              placeholder="0"
                              className="px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            />
                            <input
                              value={item.unit}
                              onChange={e => updateItem(idx, 'unit', e.target.value)}
                              placeholder="un"
                              className="px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unitPrice}
                              onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                              placeholder="0,00"
                              className="px-2 py-1.5 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                            />
                            <button
                              onClick={() => removeItem(idx)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                            >
                              <Minus size={13} />
                            </button>
                          </div>
                          {total > 0 && (
                            <div className="text-right text-xs text-muted-foreground pr-8">
                              Subtotal: R$ {fmtCurrency(total)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {form.items.length > 0 && (
                  <div className="flex justify-end pt-1">
                    <p className="text-sm font-semibold">
                      Total: R$ {fmtCurrency(formTotal)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 text-sm rounded border hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Compra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
