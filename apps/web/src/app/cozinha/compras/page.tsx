'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import {
  ShoppingCart, Calendar, Check, ClipboardCopy, Loader2, RefreshCw
} from 'lucide-react';

interface Event {
  id: string;
  name: string;
  date: string;
  status: string;
}

interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalNeeded: number;
  inStock: number;
  toBuy: number;
  estimatedCost: number;
  usedInRecipes: string[];
}

interface ShoppingList {
  items: ShoppingItem[];
  totalCost: number;
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

export default function ComprasPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
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

  function toggleEvent(id: string) {
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Reset list when selection changes
    setShoppingList(null);
  }

  async function generateList() {
    if (selectedEventIds.size === 0) return;
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
      lines.push(`${item.ingredientName}`);
      lines.push(`  Necessário: ${item.totalNeeded} ${item.unit}`);
      lines.push(`  Em estoque: ${item.inStock} ${item.unit}`);
      lines.push(`  Comprar: ${item.toBuy} ${item.unit} — R$ ${fmtCurrency(item.estimatedCost)}`);
      if (item.usedInRecipes.length > 0) {
        lines.push(`  Receitas: ${item.usedInRecipes.join(', ')}`);
      }
      lines.push('');
    });
    lines.push(`TOTAL ESTIMADO: R$ ${fmtCurrency(shoppingList.totalCost)}`);
    return lines.join('\n');
  }

  async function copyToClipboard() {
    const text = buildTextExport();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }

  const itemsToBuy = shoppingList?.items.filter(i => i.toBuy > 0) || [];
  const itemsInStock = shoppingList?.items.filter(i => i.toBuy <= 0) || [];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart size={24} /> Lista de Compras
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione eventos para gerar uma lista de compras baseada nas receitas planejadas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Event selection */}
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
              <div className="divide-y max-h-[60vh] overflow-y-auto">
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
                    return (
                      <label
                        key={event.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition ${selected ? 'bg-primary/5' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${selected ? 'bg-primary border-primary' : 'border-input'}`}>
                          {selected && <Check size={10} className="text-primary-foreground" />}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selected}
                          onChange={() => toggleEvent(event.id)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">{event.name}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(event.date)}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <button
              onClick={generateList}
              disabled={selectedEventIds.size === 0 || listLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
            >
              {listLoading ? (
                <><Loader2 size={15} className="animate-spin" /> Gerando...</>
              ) : (
                <><RefreshCw size={15} /> Gerar Lista</>
              )}
            </button>
          </div>

          {/* Shopping list */}
          <div className="lg:col-span-2 space-y-4">
            {!shoppingList && !listLoading && (
              <div className="bg-card rounded-lg border text-center py-16 text-muted-foreground">
                <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  Selecione um ou mais eventos e clique em &ldquo;Gerar Lista&rdquo;.
                </p>
              </div>
            )}

            {listLoading && (
              <div className="bg-card rounded-lg border text-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Calculando necessidades...</p>
              </div>
            )}

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
                      <span className="text-muted-foreground">
                        {itemsInStock.length} já em estoque
                      </span>
                    )}
                    <span className="font-semibold text-base">
                      Total: R$ {fmtCurrency(shoppingList.totalCost)}
                    </span>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition shrink-0"
                  >
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
                            <td className="px-4 py-2.5">
                              <p className="font-medium">{item.ingredientName}</p>
                              {item.usedInRecipes.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {item.usedInRecipes.join(', ')}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              {item.totalNeeded} {item.unit}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              {item.inStock} {item.unit}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold">
                              {item.toBuy} {item.unit}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              R$ {fmtCurrency(item.estimatedCost)}
                            </td>
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
                          <span className="flex-1 font-medium">{item.ingredientName}</span>
                          <span className="text-muted-foreground text-xs">
                            {item.totalNeeded} {item.unit} necessário • {item.inStock} {item.unit} disponível
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
