'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import {
  ShoppingCart, Calendar, Check, ClipboardCopy, Loader2, RefreshCw,
  AlertTriangle, ChefHat, ExternalLink, X,
} from 'lucide-react';

interface Event {
  id: string;
  name: string;
  startAt: string | null;
  status: string;
}

interface FoodItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  product: { id: string; name: string; categoryName: string | null } | null;
  recipe: { id: string; name: string; recipeType: string } | null;
  hasRecipe: boolean;
}

interface EventFoodStatus {
  eventId: string;
  eventName: string;
  items: FoodItem[];
  loading: boolean;
}

interface ShoppingItem {
  ingredientId: string;
  name: string;
  unit: string;
  quantityNeeded: number;
  inStock: number;
  toBuy: number;
  estimatedCost: number;
}

interface ShoppingList {
  items: ShoppingItem[];
  totalCost: number;
}

function fmtDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return dateStr; }
}

function fmtCurrency(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ComprasPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [foodStatusMap, setFoodStatusMap] = useState<Map<string, EventFoodStatus>>(new Map());
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch('/api/v2/events?status=confirmed&limit=50', { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setEvents(data.events || data || []);
    } finally {
      setEventsLoading(false);
    }
  }, [router]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  async function fetchFoodStatus(eventId: string, eventName: string) {
    setFoodStatusMap(prev => {
      const next = new Map(prev);
      next.set(eventId, { eventId, eventName, items: [], loading: true });
      return next;
    });
    try {
      const res = await fetch(`/api/v2/kitchen/events/${eventId}/food-items`, { credentials: 'include' });
      if (!res.ok) { throw new Error('Erro ao carregar itens'); }
      const data = await res.json();
      setFoodStatusMap(prev => {
        const next = new Map(prev);
        next.set(eventId, { eventId, eventName, items: data.items || [], loading: false });
        return next;
      });
    } catch {
      setFoodStatusMap(prev => {
        const next = new Map(prev);
        next.set(eventId, { eventId, eventName, items: [], loading: false });
        return next;
      });
    }
  }

  function toggleEvent(id: string) {
    const event = events.find(e => e.id === id);
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setFoodStatusMap(m => { const n = new Map(m); n.delete(id); return n; });
      } else {
        next.add(id);
        if (event) fetchFoodStatus(id, event.name);
      }
      return next;
    });
    setShoppingList(null);
  }

  // Aggregate food status across all selected events
  const allFoodStatuses = Array.from(selectedEventIds)
    .map(id => foodStatusMap.get(id))
    .filter(Boolean) as EventFoodStatus[];

  const allItems = allFoodStatuses.flatMap(s => s.items);
  const missingRecipes = allItems.filter(i => !i.hasRecipe);
  const foodStatusLoading = allFoodStatuses.some(s => s.loading);
  const hasAnyFoodItems = allItems.length > 0;
  const canGenerate = selectedEventIds.size > 0 && !foodStatusLoading && missingRecipes.length === 0;

  async function generateList() {
    if (!canGenerate) return;
    setListLoading(true);
    try {
      const ids = Array.from(selectedEventIds).join(',');
      const res = await fetch(`/api/v2/kitchen/shopping-list?eventIds=${ids}`, { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setShoppingList(data);
    } finally {
      setListLoading(false);
    }
  }

  function buildTextExport(): string {
    if (!shoppingList) return '';
    const lines: string[] = ['=== LISTA DE COMPRAS ===', ''];
    shoppingList.items.forEach(item => {
      lines.push(`${item.name}`);
      lines.push(`  Necessário: ${item.quantityNeeded} ${item.unit}`);
      lines.push(`  Em estoque: ${item.inStock} ${item.unit}`);
      lines.push(`  Comprar: ${item.toBuy} ${item.unit} — R$ ${fmtCurrency(item.estimatedCost)}`);
      lines.push('');
    });
    lines.push(`TOTAL ESTIMADO: R$ ${fmtCurrency(shoppingList.totalCost)}`);
    return lines.join('\n');
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(buildTextExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }

  const itemsToBuy = shoppingList?.items.filter(i => i.toBuy > 0) || [];
  const itemsInStock = shoppingList?.items.filter(i => i.toBuy <= 0) || [];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart size={24} /> Lista de Compras
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecione eventos confirmados para gerar a lista de compras baseada nas receitas planejadas.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: Event selection ── */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-card rounded-lg border">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar size={15} /> Eventos
                </h2>
                <span className="text-xs text-muted-foreground">
                  {selectedEventIds.size} selecionado{selectedEventIds.size !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y max-h-[55vh] overflow-y-auto">
                {eventsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum evento confirmado.
                  </div>
                ) : (
                  events.map(event => {
                    const selected = selectedEventIds.has(event.id);
                    const status = foodStatusMap.get(event.id);
                    const missing = status ? status.items.filter(i => !i.hasRecipe).length : 0;
                    const total = status ? status.items.length : 0;
                    return (
                      <label key={event.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition ${selected ? 'bg-primary/5' : ''}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${selected ? 'bg-primary border-primary' : 'border-input'}`}>
                          {selected && <Check size={10} className="text-primary-foreground" />}
                        </div>
                        <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggleEvent(event.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight truncate">{event.name}</p>
                          <p className="text-xs text-muted-foreground">{event.startAt ? fmtDate(event.startAt) : '—'}</p>
                          {selected && status && !status.loading && total > 0 && (
                            <p className={`text-xs mt-0.5 ${missing > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {missing > 0
                                ? `${missing} item${missing !== 1 ? 's' : ''} sem receita`
                                : `${total} item${total !== 1 ? 's' : ''} com receita ✓`}
                            </p>
                          )}
                          {selected && status?.loading && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Loader2 size={10} className="animate-spin" /> verificando...
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={generateList}
              disabled={!canGenerate || listLoading}
              title={missingRecipes.length > 0 ? `${missingRecipes.length} item(s) sem receita vinculada` : ''}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
            >
              {listLoading ? (
                <><Loader2 size={15} className="animate-spin" /> Gerando...</>
              ) : foodStatusLoading && selectedEventIds.size > 0 ? (
                <><Loader2 size={15} className="animate-spin" /> Verificando cardápio...</>
              ) : (
                <><RefreshCw size={15} /> Gerar Lista de Compras</>
              )}
            </button>

            {/* Block reason */}
            {missingRecipes.length > 0 && !foodStatusLoading && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  {missingRecipes.length} item{missingRecipes.length !== 1 ? 's' : ''} sem receita vinculada.
                  Vincule as receitas no <strong>aba Cozinha</strong> do evento para liberar a geração.
                </span>
              </div>
            )}
          </div>

          {/* ── Right: Status + shopping list ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Food items status — shown when events selected and before/after generating */}
            {selectedEventIds.size > 0 && !listLoading && (
              <div className="space-y-3">
                {allFoodStatuses.map(status => (
                  <div key={status.eventId} className="bg-card rounded-lg border overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <ChefHat size={14} className="text-muted-foreground" />
                        {status.eventName}
                      </h3>
                      <Link
                        href={`/events/${status.eventId}?tab=kitchen`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Gerenciar cardápio <ExternalLink size={11} />
                      </Link>
                    </div>

                    {status.loading ? (
                      <div className="px-4 py-6 text-center">
                        <Loader2 size={18} className="animate-spin mx-auto text-muted-foreground" />
                      </div>
                    ) : status.items.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-muted-foreground text-center">
                        Nenhum item de Alimentação encontrado neste evento.
                        <br />
                        <Link href={`/events/${status.eventId}?tab=kitchen`}
                          className="text-primary hover:underline text-xs mt-1 inline-flex items-center gap-1">
                          Adicionar receitas ao cardápio <ExternalLink size={10} />
                        </Link>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {status.items.map(item => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                            {/* Status icon */}
                            <div className="shrink-0">
                              {item.hasRecipe ? (
                                <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                  <Check size={11} className="text-emerald-600 dark:text-emerald-400" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                                  <X size={11} className="text-amber-600 dark:text-amber-400" />
                                </div>
                              )}
                            </div>
                            {/* Item name */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              {item.hasRecipe ? (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <ChefHat size={10} />
                                  {item.recipe?.name}
                                  {item.recipe?.recipeType === 'base' && (
                                    <span className="text-muted-foreground">(base)</span>
                                  )}
                                </p>
                              ) : (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  Sem receita vinculada
                                </p>
                              )}
                            </div>
                            {/* Quantity */}
                            <span className="text-xs text-muted-foreground shrink-0">
                              {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Summary bar */}
                    {!status.loading && status.items.length > 0 && (
                      <div className={`px-4 py-2 text-xs flex items-center justify-between border-t ${
                        status.items.some(i => !i.hasRecipe)
                          ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                          : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        <span>
                          {status.items.filter(i => i.hasRecipe).length} / {status.items.length} itens com receita
                        </span>
                        {status.items.some(i => !i.hasRecipe) && (
                          <Link href={`/events/${status.eventId}?tab=kitchen`}
                            className="flex items-center gap-1 font-medium hover:underline">
                            Vincular receitas <ExternalLink size={10} />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Empty state — no events selected */}
            {selectedEventIds.size === 0 && !listLoading && (
              <div className="bg-card rounded-lg border text-center py-16 text-muted-foreground">
                <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecione um ou mais eventos para ver o status do cardápio.</p>
              </div>
            )}

            {/* Loading state */}
            {listLoading && (
              <div className="bg-card rounded-lg border text-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Calculando necessidades...</p>
              </div>
            )}

            {/* Shopping list results */}
            {shoppingList && !listLoading && (
              <>
                {/* Summary bar */}
                <div className="bg-card rounded-lg border px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-sm">
                    <span>
                      <span className="font-semibold">{itemsToBuy.length}</span>
                      <span className="text-muted-foreground ml-1">ite{itemsToBuy.length !== 1 ? 'ns' : 'm'} para comprar</span>
                    </span>
                    {itemsInStock.length > 0 && (
                      <span className="text-muted-foreground">{itemsInStock.length} já em estoque</span>
                    )}
                    <span className="font-semibold text-base">
                      Total: R$ {fmtCurrency(shoppingList.totalCost)}
                    </span>
                  </div>
                  <button onClick={copyToClipboard}
                    className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition shrink-0">
                    {copied ? (
                      <><Check size={13} className="text-green-600" /> Copiado!</>
                    ) : (
                      <><ClipboardCopy size={13} /> Copiar</>
                    )}
                  </button>
                </div>

                {/* Items to buy */}
                {itemsToBuy.length > 0 && (
                  <div className="bg-card rounded-lg border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/40">
                      <h3 className="text-sm font-semibold">Comprar</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Ingrediente</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Necessário</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Em estoque</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Comprar</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Custo est.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {itemsToBuy.map(item => (
                          <tr key={item.ingredientId}>
                            <td className="px-4 py-2.5 font-medium">{item.name}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{item.quantityNeeded} {item.unit}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">{item.inStock} {item.unit}</td>
                            <td className="px-4 py-2.5 text-right font-semibold">{item.toBuy} {item.unit}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">R$ {fmtCurrency(item.estimatedCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Items already in stock */}
                {itemsInStock.length > 0 && (
                  <div className="bg-card rounded-lg border overflow-hidden opacity-70">
                    <div className="px-4 py-3 border-b bg-muted/40">
                      <h3 className="text-sm font-semibold text-muted-foreground">Já em Estoque</h3>
                    </div>
                    <div className="divide-y">
                      {itemsInStock.map(item => (
                        <div key={item.ingredientId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <Check size={13} className="text-green-600 shrink-0" />
                          <span className="flex-1 font-medium">{item.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {item.quantityNeeded} {item.unit} necessário • {item.inStock} {item.unit} disponível
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {shoppingList.items.length === 0 && (
                  <div className="bg-card rounded-lg border text-center py-10 text-muted-foreground text-sm">
                    Nenhum ingrediente necessário para os eventos selecionados.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
