'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import {
  BrainCircuit, RefreshCw, Check, Trash2, Pencil, X,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle,
  Calendar, Clock, Package, ShoppingCart, Loader2,
  SlidersHorizontal, Info, TrendingUp,
} from 'lucide-react';

interface Allocation {
  id: string; eventId: string; quantity: number; costShare: number;
  event: { id: string; name: string; startAt: string | null };
}
interface PlanItem {
  id: string; recipeId: string; quantity: number; scheduledDate: string;
  phase: 'pre_prep' | 'day_of'; estimatedCost: number; validityHours: number;
  reasoning: string | null; status: 'pending' | 'done'; notes: string | null;
  recipe: { id: string; name: string; recipeType: string; prepTime: number; validityHours: number };
  allocations: Allocation[];
}
interface Plan {
  id: string; status: 'draft' | 'approved' | 'in_progress' | 'done';
  windowDays: number; aiModel: string | null; aiNotes: string | null;
  createdAt: string; items: PlanItem[];
}
interface StockDeficit {
  ingredientId: string; ingredientName: string; unit: string;
  needed: number; have: number; deficit: number; costToRestock: number;
}

const PHASE_LABELS: Record<string,string> = { pre_prep: 'Pré-preparo', day_of: 'Produção do Dia' };
const PHASE_COLORS: Record<string,string> = { pre_prep: 'bg-violet-100 text-violet-800', day_of: 'bg-amber-100 text-amber-800' };
const STATUS_LABELS: Record<string,string> = { draft: 'Rascunho', approved: 'Aprovado', in_progress: 'Em Produção', done: 'Concluído' };
const STATUS_COLORS: Record<string,string> = { draft: 'bg-muted text-muted-foreground', approved: 'bg-blue-100 text-blue-800', in_progress: 'bg-amber-100 text-amber-800', done: 'bg-emerald-100 text-emerald-800' };

function fmt(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
function fmtCost(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function groupByDate(items: PlanItem[]) {
  const map = new Map<string, PlanItem[]>();
  for (const item of items) {
    const key = item.scheduledDate.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function PlanItemCard({ item, onUpdate, onDelete }: {
  item: PlanItem;
  onUpdate: (id: string, data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    quantity: item.quantity,
    scheduledDate: item.scheduledDate.slice(0, 10),
    phase: item.phase,
    notes: item.notes || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onUpdate(item.id, form);
    setEditing(false); setSaving(false);
  }

  async function toggleDone() {
    await onUpdate(item.id, { status: item.status === 'done' ? 'pending' : 'done' });
  }

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${item.status === 'done' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition" onClick={() => setOpen(v => !v)}>
        <button onClick={e => { e.stopPropagation(); toggleDone(); }}
          className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition ${item.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground hover:border-primary'}`}>
          {item.status === 'done' && <Check size={11} className="text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${item.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{item.recipe.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_COLORS[item.phase]}`}>{PHASE_LABELS[item.phase]}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Package size={10} /> {item.quantity} porções</span>
            {item.estimatedCost > 0 && <span className="text-green-600">{fmtCost(item.estimatedCost)}</span>}
            {item.allocations.length > 0 && <span>{item.allocations.length} evento{item.allocations.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => { setEditing(v => !v); setOpen(true); }} className="p-1.5 rounded hover:bg-muted transition text-muted-foreground"><Pencil size={13} /></button>
          <button onClick={() => onDelete(item.id)} className="p-1.5 rounded hover:bg-destructive/10 transition text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
          {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        </div>
      </div>
      {open && (
        <div className="border-t px-4 py-4 space-y-3 bg-muted/10">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Data</label>
                  <input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Porções</label>
                  <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} className="w-full border rounded px-2 py-1.5 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Fase</label>
                  <select value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value as any }))} className="w-full border rounded px-2 py-1.5 text-sm bg-background">
                    <option value="pre_prep">Pré-preparo</option>
                    <option value="day_of">Produção do Dia</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Observações</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm bg-background" placeholder="Opcional" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 border rounded hover:bg-muted transition">Cancelar</button>
                <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50">
                  <Check size={12} /> {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.reasoning && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-start gap-2">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  <p>{item.reasoning}</p>
                </div>
              )}
              {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock size={11} /> Preparo: {item.recipe.prepTime}min</span>
                <span className="flex items-center gap-1"><Clock size={11} /> Validade: {item.validityHours}h após produção</span>
              </div>
            </>
          )}
          {item.allocations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Distribuição por evento</p>
              <div className="space-y-1.5">
                {item.allocations.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-background border rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium">{a.event.name}</span>
                      {a.event.startAt && <span className="text-muted-foreground ml-2">{new Date(a.event.startAt).toLocaleDateString('pt-BR')}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{a.quantity} porções</span>
                      {a.costShare > 0 && <span className="text-green-600 font-medium">{fmtCost(a.costShare)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProducaoPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [deficits, setDeficits] = useState<StockDeficit[]>([]);
  const [loadingDeficits, setLoadingDeficits] = useState(false);
  const [error, setError] = useState('');
  const [hasConfig, setHasConfig] = useState(true);
  const [activeSection, setActiveSection] = useState<'plan' | 'stock' | 'events'>('plan');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [cfgRes, planRes] = await Promise.all([
        fetch('/api/v2/kitchen/config', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/v2/kitchen/production-plan', { credentials: 'include' }).then(r => r.json()),
      ]);
      setHasConfig(cfgRes.hasApiKey);
      setPlan(planRes.plan || null);
      if (planRes.plan) loadDeficits(planRes.plan.id);
    } catch { setError('Erro ao carregar dados'); }
    setLoading(false);
  }

  async function loadDeficits(planId: string) {
    setLoadingDeficits(true);
    try {
      const res = await fetch(`/api/v2/kitchen/production-plan/${planId}/stock-check`, { credentials: 'include' });
      const data = await res.json();
      setDeficits(data.missingItems || []);
    } catch { }
    setLoadingDeficits(false);
  }

  async function generate() {
    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/v2/kitchen/production-plan/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao gerar plano'); }
      else { setPlan(data.plan); setDeficits(data.stockDeficits || []); }
    } catch (e: any) { setError(e.message || 'Erro ao gerar plano'); }
    setGenerating(false);
  }

  async function updatePlanStatus(status: string) {
    if (!plan) return;
    await fetch(`/api/v2/kitchen/production-plan/${plan.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadAll();
  }

  async function updateItem(id: string, data: any) {
    await fetch(`/api/v2/kitchen/production-plan/items/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await loadAll();
  }

  async function deleteItem(id: string) {
    if (!confirm('Remover este item do plano?')) return;
    await fetch(`/api/v2/kitchen/production-plan/items/${id}`, { method: 'DELETE', credentials: 'include' });
    await loadAll();
  }

  async function deletePlan() {
    if (!plan) return;
    if (!confirm('Excluir o plano atual?')) return;
    await fetch(`/api/v2/kitchen/production-plan/${plan.id}`, { method: 'DELETE', credentials: 'include' });
    setPlan(null); setDeficits([]);
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  const grouped = plan ? groupByDate(plan.items) : new Map<string, PlanItem[]>();
  const totalCost = plan?.items.reduce((s, i) => s + i.estimatedCost, 0) ?? 0;
  const doneCount = plan?.items.filter(i => i.status === 'done').length ?? 0;
  const totalCount = plan?.items.length ?? 0;

  const eventCosts = new Map<string, { name: string; startAt: string | null; cost: number; items: number }>();
  if (plan) {
    for (const item of plan.items) {
      for (const alloc of item.allocations) {
        const prev = eventCosts.get(alloc.eventId) || { name: alloc.event.name, startAt: alloc.event.startAt, cost: 0, items: 0 };
        eventCosts.set(alloc.eventId, { ...prev, cost: prev.cost + alloc.costShare, items: prev.items + alloc.quantity });
      }
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BrainCircuit size={24} className="text-primary" /> Plano de Produção IA
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Gerado automaticamente com base nos eventos e estoque atual</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {plan && (
              <>
                {plan.status === 'draft' && (
                  <button onClick={() => updatePlanStatus('approved')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
                    <Check size={15} /> Aprovar Plano
                  </button>
                )}
                {plan.status === 'approved' && (
                  <button onClick={() => updatePlanStatus('in_progress')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition">
                    Iniciar Produção
                  </button>
                )}
                {plan.status === 'in_progress' && (
                  <button onClick={() => updatePlanStatus('done')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
                    Concluir Produção
                  </button>
                )}
                <button onClick={deletePlan}
                  className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition">
                  <Trash2 size={14} /> Excluir
                </button>
              </>
            )}
            <button onClick={generate} disabled={generating || !hasConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50">
              {generating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {generating ? 'Gerando...' : plan ? 'Regenerar com IA' : 'Gerar com IA'}
            </button>
          </div>
        </div>

        {!hasConfig && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 text-sm">OpenAI não configurado</p>
              <p className="text-xs text-amber-700 mt-0.5">Configure a chave de API em <a href="/cozinha/config" className="underline font-medium">Cozinha → Configurações</a> para usar o Plano de Produção IA.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-5 py-4 flex items-start gap-3">
            <X size={16} className="text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {generating && (
          <div className="bg-card border rounded-xl p-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <BrainCircuit size={32} className="text-primary animate-pulse" />
            </div>
            <h3 className="font-semibold text-lg mb-2">IA analisando...</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">Analisando eventos futuros, cardápios, tempos de preparo, validade e estoque atual. Isso pode levar alguns segundos.</p>
          </div>
        )}

        {!plan && !generating && (
          <div className="bg-card border rounded-xl p-16 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-5">
              <BrainCircuit size={40} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Nenhum plano de produção</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              Clique em "Gerar com IA" para criar automaticamente um plano de produção otimizado com base nos seus eventos confirmados, receitas e estoque.
            </p>
            {hasConfig ? (
              <button onClick={generate} disabled={generating}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition">
                <BrainCircuit size={18} /> Gerar Plano com IA
              </button>
            ) : (
              <a href="/cozinha/config" className="inline-flex items-center gap-2 px-6 py-3 border rounded-lg font-medium hover:bg-muted transition text-sm">
                <SlidersHorizontal size={16} /> Configurar OpenAI primeiro
              </a>
            )}
          </div>
        )}

        {plan && !generating && (
          <>
            <div className="bg-card border rounded-xl px-5 py-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[plan.status]}`}>{STATUS_LABELS[plan.status]}</span>
                <div className="text-sm text-muted-foreground">
                  Gerado em {new Date(plan.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  {plan.aiModel && <span className="ml-1">· {plan.aiModel}</span>}
                </div>
                <div className="ml-auto flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{doneCount}/{totalCount} itens concluídos</span>
                  {totalCost > 0 && <span className="font-medium text-green-600">{fmtCost(totalCost)} est.</span>}
                </div>
              </div>
              {totalCount > 0 && (
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
                </div>
              )}
              {plan.aiNotes && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground italic">
                  <Info size={13} className="inline mr-1" />{plan.aiNotes}
                </div>
              )}
            </div>

            <div className="flex gap-1 border-b">
              {([
                { id: 'plan' as const, label: 'Plano de Produção', count: totalCount },
                { id: 'stock' as const, label: 'Déficit de Estoque', count: deficits.length },
                { id: 'events' as const, label: 'Custo por Evento', count: eventCosts.size },
              ]).map(tab => (
                <button key={tab.id} onClick={() => setActiveSection(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeSection === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab.id === 'stock' && tab.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeSection === 'plan' && (
              <div className="space-y-6">
                {plan.items.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">Nenhum item no plano.</div>
                ) : (
                  Array.from(grouped.entries()).map(([date, items]) => (
                    <div key={date}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2 uppercase tracking-wide">
                        <Calendar size={14} />
                        {fmt(date + 'T12:00:00')}
                        <span className="text-xs font-normal normal-case">
                          — {items.length} item{items.length !== 1 ? 's' : ''} · {fmtCost(items.reduce((s, i) => s + i.estimatedCost, 0))} est.
                        </span>
                      </h3>
                      <div className="space-y-2">
                        {items.map(item => (
                          <PlanItemCard key={item.id} item={item} onUpdate={updateItem} onDelete={deleteItem} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSection === 'stock' && (
              <div className="space-y-3">
                {loadingDeficits ? (
                  <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
                ) : deficits.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
                    <CheckCircle size={32} className="text-emerald-500 mx-auto mb-3" />
                    <p className="font-medium text-emerald-800">Estoque suficiente!</p>
                    <p className="text-sm text-emerald-700 mt-1">Todos os ingredientes necessários estão disponíveis em estoque.</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-800">
                        <span className="font-medium">{deficits.length} ingrediente{deficits.length !== 1 ? 's' : ''} faltando.</span>
                        {' '}Custo estimado para reposição: <span className="font-bold">{fmtCost(deficits.reduce((s, d) => s + d.costToRestock, 0))}</span>
                      </p>
                      <a href="/cozinha/compras" className="ml-auto flex items-center gap-1 text-xs text-amber-700 hover:underline whitespace-nowrap">
                        <ShoppingCart size={12} /> Ver Compras
                      </a>
                    </div>
                    <div className="bg-card border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingrediente</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Necessário</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Em Estoque</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-amber-700">Falta</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custo Reposição</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {deficits.map(d => (
                            <tr key={d.ingredientId} className="hover:bg-muted/20">
                              <td className="px-4 py-3 font-medium">{d.ingredientName}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground">{d.needed} {d.unit}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground">{d.have} {d.unit}</td>
                              <td className="px-4 py-3 text-right font-semibold text-amber-700">{d.deficit} {d.unit}</td>
                              <td className="px-4 py-3 text-right text-green-600">{fmtCost(d.costToRestock)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeSection === 'events' && (
              <div className="space-y-3">
                {eventCosts.size === 0 ? (
                  <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground text-sm">Nenhum custo alocado por evento ainda.</div>
                ) : (
                  <div className="bg-card border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-2">
                      <TrendingUp size={15} className="text-primary" />
                      <span className="text-sm font-semibold">Custo de Produção por Evento</span>
                      <span className="ml-auto text-xs text-muted-foreground">Total: {fmtCost(Array.from(eventCosts.values()).reduce((s, e) => s + e.cost, 0))}</span>
                    </div>
                    <div className="divide-y">
                      {Array.from(eventCosts.entries())
                        .sort((a, b) => (a[1].startAt && b[1].startAt) ? new Date(a[1].startAt).getTime() - new Date(b[1].startAt).getTime() : 0)
                        .map(([eventId, ev]) => (
                          <div key={eventId} className="flex items-center gap-4 px-5 py-3.5">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{ev.name}</p>
                              {ev.startAt && <p className="text-xs text-muted-foreground">{new Date(ev.startAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-green-600">{fmtCost(ev.cost)}</p>
                              <p className="text-xs text-muted-foreground">{ev.items} porções produzidas</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
