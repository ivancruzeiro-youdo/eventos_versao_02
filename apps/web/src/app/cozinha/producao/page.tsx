'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import {
  Flame, Plus, X, Check, ChefHat, Calendar, Users, Layers,
  Loader2, RefreshCw, ExternalLink, Clock, CheckCircle2, AlertTriangle,
  Package, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanStatus = 'pending' | 'shopping_approved' | 'planned' | 'in_production' | 'done';
type BatchPhase = 'pre_prep' | 'day_of';
type BatchStatus = 'planned' | 'in_progress' | 'done';

interface EventOverview {
  id: string;
  name: string;
  startAt: string | null;
  planStatus: PlanStatus;
  totalFoodItems: number;
  itemsWithRecipe: number;
  allRecipesLinked: boolean;
}

interface BatchAllocation {
  id: string;
  eventId: string;
  quantity: number;
  event: { id: string; name: string; startAt: string | null };
}

interface ProductionBatch {
  id: string;
  recipeId: string;
  phase: BatchPhase;
  scheduledAt: string;
  targetQty: number;
  producedQty: number;
  status: BatchStatus;
  notes: string | null;
  recipe: { id: string; name: string; recipeType: string };
  allocations: BatchAllocation[];
}

interface RecipeNeed {
  recipe: { id: string; name: string; recipeType: string; servings: number };
  totalPortions: number;
  events: { eventId: string; eventName: string; startAt: string | null; servingsNeeded: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  pending: 'Sem planejamento',
  shopping_approved: 'Compras aprovadas',
  planned: 'Produção planejada',
  in_production: 'Em produção',
  done: 'Concluído',
};

const PLAN_STATUS_COLORS: Record<PlanStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  shopping_approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  planned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  in_production: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  planned: 'Planejado',
  in_progress: 'Em andamento',
  done: 'Concluído',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtDateFull(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProducaoPage() {
  const router = useRouter();

  const [events, setEvents] = useState<EventOverview[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [recipeNeeds, setRecipeNeeds] = useState<RecipeNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PlanStatus | 'all'>('all');

  // Batch creation modal state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState<{
    recipeId: string;
    phase: BatchPhase;
    scheduledAt: string;
    targetQty: string;
    notes: string;
    allocations: { eventId: string; quantity: string }[];
  }>({
    recipeId: '',
    phase: 'pre_prep',
    scheduledAt: new Date().toISOString().split('T')[0],
    targetQty: '',
    notes: '',
    allocations: [],
  });
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, batchesRes, needsRes] = await Promise.all([
        fetch('/api/v2/kitchen/planning/overview', { credentials: 'include' }),
        fetch('/api/v2/kitchen/production/batches', { credentials: 'include' }),
        fetch('/api/v2/kitchen/production/recipe-needs', { credentials: 'include' }),
      ]);
      if (overviewRes.status === 401) { router.push('/login'); return; }
      const [ov, bt, nd] = await Promise.all([overviewRes.json(), batchesRes.json(), needsRes.json()]);
      setEvents(ov.events || []);
      setBatches(bt.batches || []);
      setRecipeNeeds(nd.needs || []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function updatePlanStatus(eventId: string, status: PlanStatus) {
    await fetch(`/api/v2/kitchen/planning/${eventId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadAll();
  }

  async function updateBatchStatus(batchId: string, status: BatchStatus) {
    await fetch(`/api/v2/kitchen/production/batches/${batchId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadAll();
  }

  async function deleteBatch(batchId: string) {
    if (!confirm('Excluir este lote de produção?')) return;
    await fetch(`/api/v2/kitchen/production/batches/${batchId}`, { method: 'DELETE', credentials: 'include' });
    loadAll();
  }

  // Open batch modal pre-filled for a specific recipe
  function openBatchForRecipe(need: RecipeNeed) {
    setBatchForm({
      recipeId: need.recipe.id,
      phase: 'pre_prep',
      scheduledAt: new Date().toISOString().split('T')[0],
      targetQty: String(need.totalPortions),
      notes: '',
      allocations: need.events.map(e => ({
        eventId: e.eventId,
        quantity: String(e.servingsNeeded),
      })),
    });
    setBatchError('');
    setShowBatchModal(true);
  }

  function openEmptyBatch() {
    setBatchForm({
      recipeId: recipeNeeds[0]?.recipe.id || '',
      phase: 'pre_prep',
      scheduledAt: new Date().toISOString().split('T')[0],
      targetQty: '',
      notes: '',
      allocations: [],
    });
    setBatchError('');
    setShowBatchModal(true);
  }

  function selectRecipeForBatch(recipeId: string) {
    const need = recipeNeeds.find(n => n.recipe.id === recipeId);
    setBatchForm(f => ({
      ...f,
      recipeId,
      targetQty: need ? String(need.totalPortions) : f.targetQty,
      allocations: need ? need.events.map(e => ({ eventId: e.eventId, quantity: String(e.servingsNeeded) })) : f.allocations,
    }));
  }

  function toggleAllocation(eventId: string, eventName: string) {
    setBatchForm(f => {
      const has = f.allocations.some(a => a.eventId === eventId);
      if (has) return { ...f, allocations: f.allocations.filter(a => a.eventId !== eventId) };
      const need = recipeNeeds.find(n => n.recipe.id === f.recipeId);
      const eventNeed = need?.events.find(e => e.eventId === eventId);
      return { ...f, allocations: [...f.allocations, { eventId, quantity: String(eventNeed?.servingsNeeded || 0) }] };
    });
  }

  function updateAllocQty(eventId: string, qty: string) {
    setBatchForm(f => ({
      ...f,
      allocations: f.allocations.map(a => a.eventId === eventId ? { ...a, quantity: qty } : a),
    }));
  }

  async function saveBatch() {
    if (!batchForm.recipeId) { setBatchError('Selecione a receita.'); return; }
    if (!batchForm.scheduledAt) { setBatchError('Informe a data.'); return; }
    setBatchSaving(true);
    setBatchError('');
    try {
      const totalFromAllocs = batchForm.allocations.reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0);
      const body = {
        recipeId: batchForm.recipeId,
        phase: batchForm.phase,
        scheduledAt: batchForm.scheduledAt,
        targetQty: parseFloat(batchForm.targetQty) || totalFromAllocs,
        notes: batchForm.notes || null,
        allocations: batchForm.allocations
          .filter(a => parseFloat(a.quantity) > 0)
          .map(a => ({ eventId: a.eventId, quantity: parseFloat(a.quantity) })),
      };
      const res = await fetch('/api/v2/kitchen/production/batches', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setBatchError(d.error || 'Erro ao salvar.'); return; }
      setShowBatchModal(false);
      loadAll();
    } finally {
      setBatchSaving(false);
    }
  }

  // Filtered events
  const filteredEvents = activeFilter === 'all' ? events : events.filter(e => e.planStatus === activeFilter);

  // Group batches by phase
  const prePrepBatches = batches.filter(b => b.phase === 'pre_prep');
  const dayOfBatches = batches.filter(b => b.phase === 'day_of');

  // Status counts
  const statusCounts = {
    all: events.length,
    pending: events.filter(e => e.planStatus === 'pending').length,
    shopping_approved: events.filter(e => e.planStatus === 'shopping_approved').length,
    planned: events.filter(e => e.planStatus === 'planned').length,
    in_production: events.filter(e => e.planStatus === 'in_production').length,
    done: events.filter(e => e.planStatus === 'done').length,
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flame size={24} /> Linha de Produção
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pipeline de eventos — compras, pré-preparo unificado e produção do dia.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadAll} className="p-2 border rounded-lg hover:bg-muted transition" title="Atualizar">
              <RefreshCw size={15} />
            </button>
            <button onClick={openEmptyBatch}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
              <Plus size={15} /> Novo Lote de Produção
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 size={28} className="animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

            {/* ── Left: Event pipeline (3 cols) ── */}
            <div className="xl:col-span-3 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Eventos</h2>
                <span className="text-xs text-muted-foreground">{events.length} evento{events.length !== 1 ? 's' : ''} com itens de alimentação</span>
              </div>

              {/* Status filter tabs */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', 'Todos'],
                  ['pending', 'Sem plano'],
                  ['shopping_approved', 'Compras OK'],
                  ['planned', 'Planejado'],
                  ['in_production', 'Em produção'],
                  ['done', 'Concluído'],
                ] as const).map(([key, label]) => (
                  <button key={key}
                    onClick={() => setActiveFilter(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      activeFilter === key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}>
                    {label}
                    {statusCounts[key as keyof typeof statusCounts] > 0 && (
                      <span className="ml-1 opacity-70">({statusCounts[key as keyof typeof statusCounts]})</span>
                    )}
                  </button>
                ))}
              </div>

              {filteredEvents.length === 0 ? (
                <div className="text-center py-10 bg-card rounded-lg border text-muted-foreground text-sm">
                  Nenhum evento neste status.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEvents.map(ev => {
                    const status = ev.planStatus;
                    return (
                      <div key={ev.id} className="bg-card rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm truncate">{ev.name}</h3>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_STATUS_COLORS[status]}`}>
                                {PLAN_STATUS_LABELS[status]}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {ev.startAt && (
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} /> {fmtDateFull(ev.startAt)}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <ChefHat size={11} />
                                {ev.itemsWithRecipe}/{ev.totalFoodItems} receitas
                              </span>
                              {!ev.allRecipesLinked && (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle size={10} /> faltam receitas
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Link href={`/events/${ev.id}?tab=kitchen`}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition"
                              title="Abrir cardápio do evento">
                              <ExternalLink size={13} />
                            </Link>
                          </div>
                        </div>

                        {/* Status action buttons */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {status === 'pending' && ev.allRecipesLinked && (
                            <Link href="/cozinha/compras"
                              className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded hover:bg-muted transition">
                              <Package size={11} /> Ver lista de compras
                            </Link>
                          )}
                          {status === 'shopping_approved' && (
                            <button onClick={() => updatePlanStatus(ev.id, 'planned')}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded transition">
                              <Flame size={11} /> Iniciar planejamento de produção
                            </button>
                          )}
                          {status === 'planned' && (
                            <button onClick={() => updatePlanStatus(ev.id, 'in_production')}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded transition">
                              <Flame size={11} /> Iniciar produção
                            </button>
                          )}
                          {status === 'in_production' && (
                            <button onClick={() => updatePlanStatus(ev.id, 'done')}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition">
                              <CheckCircle2 size={11} /> Marcar como concluído
                            </button>
                          )}
                          {status !== 'pending' && (
                            <button onClick={() => updatePlanStatus(ev.id, 'pending')}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded hover:bg-muted transition text-muted-foreground">
                              <X size={11} /> Resetar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Right: Production batches (2 cols) ── */}
            <div className="xl:col-span-2 space-y-4">
              <h2 className="text-base font-semibold">Lotes de Produção</h2>

              {/* Recipe needs — call to action for creating batches */}
              {recipeNeeds.length > 0 && (
                <div className="bg-card rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/40">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Receitas necessárias · criar lote
                    </h3>
                  </div>
                  <div className="divide-y">
                    {recipeNeeds.map(need => (
                      <div key={need.recipe.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{need.recipe.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {need.totalPortions} porções · {need.events.length} evento{need.events.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <button onClick={() => openBatchForRecipe(need)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded hover:bg-muted transition shrink-0">
                          <Plus size={11} /> Criar lote
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pre-prep batches */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Clock size={12} /> Pré-preparo
                </h3>
                {prePrepBatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4 border rounded-lg bg-card">
                    Nenhum lote de pré-preparo planejado.
                  </p>
                ) : (
                  prePrepBatches.map(b => <BatchCard key={b.id} batch={b}
                    expanded={expandedBatch === b.id}
                    onToggle={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}
                    onStatusChange={s => updateBatchStatus(b.id, s)}
                    onDelete={() => deleteBatch(b.id)} />)
                )}
              </div>

              {/* Day-of batches */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Flame size={12} /> Produção do Dia
                </h3>
                {dayOfBatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4 border rounded-lg bg-card">
                    Nenhum lote de produção do dia.
                  </p>
                ) : (
                  dayOfBatches.map(b => <BatchCard key={b.id} batch={b}
                    expanded={expandedBatch === b.id}
                    onToggle={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}
                    onStatusChange={s => updateBatchStatus(b.id, s)}
                    onDelete={() => deleteBatch(b.id)} />)
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Batch creation modal ── */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Flame size={18} /> Novo Lote de Produção
              </h2>
              <button onClick={() => setShowBatchModal(false)} className="p-1.5 rounded hover:bg-muted">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {batchError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{batchError}</p>
              )}

              {/* Recipe */}
              <div>
                <label className="block text-sm font-medium mb-1">Receita *</label>
                <select value={batchForm.recipeId}
                  onChange={e => selectRecipeForBatch(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring">
                  <option value="">Selecionar receita...</option>
                  {recipeNeeds.map(n => (
                    <option key={n.recipe.id} value={n.recipe.id}>
                      {n.recipe.name} ({n.totalPortions} porções necessárias)
                    </option>
                  ))}
                </select>
              </div>

              {/* Phase */}
              <div>
                <label className="block text-sm font-medium mb-1">Fase</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'pre_prep', label: 'Pré-preparo', desc: 'Antes do evento; pode ser unificado', icon: Clock },
                    { value: 'day_of', label: 'Produção do Dia', desc: 'No dia do evento', icon: Flame },
                  ] as const).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setBatchForm(f => ({ ...f, phase: opt.value }))}
                      className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left transition ${
                        batchForm.phase === opt.value ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50'
                      }`}>
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <opt.icon size={13} /> {opt.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + qty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Data agendada *</label>
                  <input type="date" value={batchForm.scheduledAt}
                    onChange={e => setBatchForm(f => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Total de porções</label>
                  <input type="number" min="0" step="1" value={batchForm.targetQty}
                    onChange={e => setBatchForm(f => ({ ...f, targetQty: e.target.value }))}
                    placeholder="Auto (soma eventos)"
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Event allocations */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Distribuição por evento</label>
                  <span className="text-xs text-muted-foreground">
                    Total: {batchForm.allocations.reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0)} porções
                  </span>
                </div>
                {/* Events from recipeNeeds for selected recipe */}
                {(() => {
                  const need = recipeNeeds.find(n => n.recipe.id === batchForm.recipeId);
                  if (!need) {
                    return <p className="text-xs text-muted-foreground">Selecione uma receita para ver os eventos.</p>;
                  }
                  return (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {need.events.map(ev => {
                        const alloc = batchForm.allocations.find(a => a.eventId === ev.eventId);
                        const included = !!alloc;
                        return (
                          <div key={ev.eventId} className={`flex items-center gap-3 p-2.5 rounded-lg border ${included ? 'border-primary bg-primary/5' : 'border-input'}`}>
                            <input type="checkbox" checked={included}
                              onChange={() => toggleAllocation(ev.eventId, ev.eventName)}
                              className="rounded shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{ev.eventName}</p>
                              <p className="text-xs text-muted-foreground">{fmtDate(ev.startAt)} · {ev.servingsNeeded} porções</p>
                            </div>
                            {included && (
                              <input type="number" min="0" step="1"
                                value={alloc.quantity}
                                onChange={e => updateAllocQty(ev.eventId, e.target.value)}
                                className="w-20 px-2 py-1 bg-background border border-input rounded text-sm text-right"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea value={batchForm.notes}
                  onChange={e => setBatchForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Ex: usar sobra do evento anterior, temperatura..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
              <button onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 text-sm rounded border hover:bg-muted transition">
                Cancelar
              </button>
              <button onClick={saveBatch} disabled={batchSaving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2">
                {batchSaving && <Loader2 size={13} className="animate-spin" />}
                Criar Lote
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Batch Card Component ─────────────────────────────────────────────────────

function BatchCard({
  batch, expanded, onToggle, onStatusChange, onDelete,
}: {
  batch: ProductionBatch;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (s: BatchStatus) => void;
  onDelete: () => void;
}) {
  const statusColors: Record<BatchStatus, string> = {
    planned: 'bg-muted text-muted-foreground',
    in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  };

  return (
    <div className={`bg-card rounded-lg border overflow-hidden ${batch.status === 'done' ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition"
        onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{batch.recipe.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[batch.status]}`}>
              {BATCH_STATUS_LABELS[batch.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(batch.scheduledAt).toLocaleDateString('pt-BR')} ·{' '}
            {batch.targetQty} porções ·{' '}
            {batch.allocations.length} evento{batch.allocations.length !== 1 ? 's' : ''}
          </p>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {/* Event breakdown */}
          <div className="space-y-1.5">
            {batch.allocations.map(alloc => (
              <div key={alloc.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Calendar size={11} className="text-muted-foreground" />
                  <span className="truncate">{alloc.event.name}</span>
                  {alloc.event.startAt && (
                    <span className="text-xs text-muted-foreground">{fmtDate(alloc.event.startAt)}</span>
                  )}
                </div>
                <span className="font-medium text-sm shrink-0">{alloc.quantity} porções</span>
              </div>
            ))}
          </div>

          {batch.notes && (
            <p className="text-xs text-muted-foreground italic border-t pt-2">{batch.notes}</p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {batch.status === 'planned' && (
              <button onClick={() => onStatusChange('in_progress')}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded transition">
                <Flame size={11} /> Iniciar produção
              </button>
            )}
            {batch.status === 'in_progress' && (
              <button onClick={() => onStatusChange('done')}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition">
                <Check size={11} /> Concluir lote
              </button>
            )}
            <button onClick={onDelete}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded hover:bg-destructive/10 hover:text-destructive transition text-muted-foreground">
              <X size={11} /> Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
