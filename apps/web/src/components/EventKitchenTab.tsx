'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, UtensilsCrossed, Users, ChefHat, X, ShoppingCart,
  DollarSign, AlertCircle, RefreshCw, CheckCircle2
} from 'lucide-react';

interface KitchenRecipe {
  id: string;
  name: string;
  category: string;
  servings: number;
  averagePerGuest: number;
  prepTimeMinutes: number;
}

interface KitchenLaborRole {
  id: string;
  name: string;
  dailyRate: number;
}

interface EventMenu {
  id: string;
  recipeId: string;
  menuType: 'guest' | 'staff';
  servingsNeeded: number | null;
  recipeCostPerServing: number;
  recipe: KitchenRecipe;
  eventItem?: { id: string; name: string; quantity: number } | null;
}

interface EventLabor {
  id: string;
  laborRoleId: string;
  quantity: number;
  days: number;
  laborRole: KitchenLaborRole;
}

interface CostSummary {
  ingredientCost: number;
  laborCost: number;
  totalCost: number;
  suggestedPrice: number;
  guestCount: number;
}

interface ProductionLog {
  id: string;
  recipeId: string;
  portionsProduced: number;
  notes: string | null;
  producedAt: string;
  recipe: { id: string; name: string; servings: number };
}

type SectionTab = 'cardapio' | 'mao-de-obra' | 'producao' | 'custos';

export default function EventKitchenTab({ eventId, guestCount }: { eventId: string; guestCount: number }) {
  const [section, setSection] = useState<SectionTab>('cardapio');

  // Data
  const [menus, setMenus] = useState<EventMenu[]>([]);
  const [labor, setLabor] = useState<EventLabor[]>([]);
  const [recipes, setRecipes] = useState<KitchenRecipe[]>([]);
  const [laborRoles, setLaborRoles] = useState<KitchenLaborRole[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [productions, setProductions] = useState<ProductionLog[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Menu form
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [menuForm, setMenuForm] = useState({ recipeId: '', menuType: 'guest' as 'guest' | 'staff', servingsNeeded: '' });

  // Labor form
  const [showLaborForm, setShowLaborForm] = useState(false);
  const [laborForm, setLaborForm] = useState({ laborRoleId: '', quantity: '1', days: '1' });

  // Production form
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodForm, setProdForm] = useState({ recipeId: '', portionsProduced: '', notes: '' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [menusRes, laborRes, costRes, recipesRes, laborRolesRes, prodRes] = await Promise.all([
        fetch(`/api/v2/kitchen/events/${eventId}/menu`, { credentials: 'include' }),
        fetch(`/api/v2/kitchen/events/${eventId}/labor`, { credentials: 'include' }),
        fetch(`/api/v2/kitchen/events/${eventId}/cost-summary`, { credentials: 'include' }),
        fetch('/api/v2/kitchen/recipes', { credentials: 'include' }),
        fetch('/api/v2/kitchen/labor-roles', { credentials: 'include' }),
        fetch(`/api/v2/kitchen/events/${eventId}/production`, { credentials: 'include' }),
      ]);

      if (menusRes.ok) { const d = await menusRes.json(); setMenus(d.menus || []); }
      if (laborRes.ok) { const d = await laborRes.json(); setLabor(d.labor || []); }
      if (costRes.ok) { const d = await costRes.json(); setCost(d); }
      if (recipesRes.ok) { const d = await recipesRes.json(); setRecipes(d.recipes || []); }
      if (laborRolesRes.ok) { const d = await laborRolesRes.json(); setLaborRoles(d.roles || []); }
      if (prodRes.ok) { const d = await prodRes.json(); setProductions(d.logs || []); }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Menu actions
  async function addToMenu() {
    if (!menuForm.recipeId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/kitchen/events/${eventId}/menu`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: menuForm.recipeId,
          menuType: menuForm.menuType,
          servingsNeeded: menuForm.servingsNeeded ? parseFloat(menuForm.servingsNeeded) : undefined,
        }),
      });
      if (res.ok) {
        setShowMenuForm(false);
        setMenuForm({ recipeId: '', menuType: 'guest', servingsNeeded: '' });
        loadAll();
      }
    } finally { setSaving(false); }
  }

  async function removeFromMenu(menuId: string) {
    if (!confirm('Remover receita do cardápio?')) return;
    await fetch(`/api/v2/kitchen/events/${eventId}/menu/${menuId}`, { method: 'DELETE', credentials: 'include' });
    loadAll();
  }

  // ── Labor actions
  async function addLabor() {
    if (!laborForm.laborRoleId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/kitchen/events/${eventId}/labor`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laborRoleId: laborForm.laborRoleId,
          quantity: parseInt(laborForm.quantity) || 1,
          days: parseFloat(laborForm.days) || 1,
        }),
      });
      if (res.ok) {
        setShowLaborForm(false);
        setLaborForm({ laborRoleId: '', quantity: '1', days: '1' });
        loadAll();
      }
    } finally { setSaving(false); }
  }

  async function removeLabor(laborId: string) {
    if (!confirm('Remover mão de obra?')) return;
    await fetch(`/api/v2/kitchen/events/${eventId}/labor/${laborId}`, { method: 'DELETE', credentials: 'include' });
    loadAll();
  }

  // ── Production actions
  async function registerProduction() {
    if (!prodForm.recipeId || !prodForm.portionsProduced) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/kitchen/events/${eventId}/production`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: prodForm.recipeId,
          portionsProduced: parseFloat(prodForm.portionsProduced),
          notes: prodForm.notes || undefined,
        }),
      });
      if (res.ok) {
        setShowProdForm(false);
        setProdForm({ recipeId: '', portionsProduced: '', notes: '' });
        loadAll();
      }
    } finally { setSaving(false); }
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const sectionTabs: { id: SectionTab; label: string; icon: any }[] = [
    { id: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed },
    { id: 'mao-de-obra', label: 'Mão de Obra', icon: Users },
    { id: 'producao', label: 'Produção', icon: ChefHat },
    { id: 'custos', label: 'Custos', icon: DollarSign },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {sectionTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              section === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── CARDÁPIO ── */}
      {section === 'cardapio' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Receitas vinculadas a este evento ({guestCount} convidados)
            </p>
            <button
              onClick={() => setShowMenuForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition"
            >
              <Plus size={14} /> Adicionar Receita
            </button>
          </div>

          {/* Guest menu */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Cardápio dos Convidados
            </h3>
            {menus.filter(m => m.menuType === 'guest').length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhuma receita adicionada.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {menus.filter(m => m.menuType === 'guest').map(m => (
                  <MenuRow key={m.id} menu={m} guestCount={guestCount} onRemove={() => removeFromMenu(m.id)} fmt={fmt} />
                ))}
              </div>
            )}
          </div>

          {/* Staff menu */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Cardápio da Equipe
            </h3>
            {menus.filter(m => m.menuType === 'staff').length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhuma receita adicionada.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {menus.filter(m => m.menuType === 'staff').map(m => (
                  <MenuRow key={m.id} menu={m} guestCount={guestCount} onRemove={() => removeFromMenu(m.id)} fmt={fmt} />
                ))}
              </div>
            )}
          </div>

          {/* Add to menu form */}
          {showMenuForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold">Adicionar ao Cardápio</h3>
                  <button onClick={() => setShowMenuForm(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Receita</label>
                    <select
                      value={menuForm.recipeId}
                      onChange={e => setMenuForm(f => ({ ...f, recipeId: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    >
                      <option value="">Selecione...</option>
                      {recipes.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.category})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tipo</label>
                    <select
                      value={menuForm.menuType}
                      onChange={e => setMenuForm(f => ({ ...f, menuType: e.target.value as 'guest' | 'staff' }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    >
                      <option value="guest">Cardápio dos Convidados</option>
                      <option value="staff">Cardápio da Equipe</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Porções necessárias (deixe em branco para calcular)</label>
                    <input
                      type="number"
                      min="0"
                      value={menuForm.servingsNeeded}
                      onChange={e => setMenuForm(f => ({ ...f, servingsNeeded: e.target.value }))}
                      placeholder={`Auto: ${guestCount} convidados`}
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-4 py-3 border-t">
                  <button onClick={() => setShowMenuForm(false)} className="px-3 py-1.5 text-sm rounded border hover:bg-muted">Cancelar</button>
                  <button onClick={addToMenu} disabled={saving || !menuForm.recipeId} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MÃO DE OBRA ── */}
      {section === 'mao-de-obra' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Equipe de cozinha alocada para este evento</p>
            <button
              onClick={() => setShowLaborForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition"
            >
              <Plus size={14} /> Adicionar
            </button>
          </div>

          {labor.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhuma mão de obra alocada.</p>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {labor.map(l => {
                const total = l.quantity * l.days * l.laborRole.dailyRate;
                return (
                  <div key={l.id} className="flex items-center justify-between px-4 py-3 bg-card text-sm">
                    <div>
                      <span className="font-medium">{l.laborRole.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {l.quantity} pessoa{l.quantity !== 1 ? 's' : ''} × {l.days} dia{l.days !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{fmt(total)}</span>
                      <button
                        onClick={() => removeLabor(l.id)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/40 text-sm font-semibold">
                <span>Total Mão de Obra</span>
                <span>{fmt(labor.reduce((s, l) => s + l.quantity * l.days * l.laborRole.dailyRate, 0))}</span>
              </div>
            </div>
          )}

          {showLaborForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold">Adicionar Mão de Obra</h3>
                  <button onClick={() => setShowLaborForm(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Função</label>
                    <select
                      value={laborForm.laborRoleId}
                      onChange={e => setLaborForm(f => ({ ...f, laborRoleId: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    >
                      <option value="">Selecione...</option>
                      {laborRoles.map(r => (
                        <option key={r.id} value={r.id}>{r.name} — {fmt(r.dailyRate)}/dia</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Pessoas</label>
                      <input
                        type="number" min="1"
                        value={laborForm.quantity}
                        onChange={e => setLaborForm(f => ({ ...f, quantity: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Dias</label>
                      <input
                        type="number" min="0.5" step="0.5"
                        value={laborForm.days}
                        onChange={e => setLaborForm(f => ({ ...f, days: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 px-4 py-3 border-t">
                  <button onClick={() => setShowLaborForm(false)} className="px-3 py-1.5 text-sm rounded border hover:bg-muted">Cancelar</button>
                  <button onClick={addLabor} disabled={saving || !laborForm.laborRoleId} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PRODUÇÃO ── */}
      {section === 'producao' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Registre produções e baixe o estoque automaticamente</p>
            <button
              onClick={() => setShowProdForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition"
            >
              <Plus size={14} /> Registrar Produção
            </button>
          </div>

          {productions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nenhuma produção registrada.</p>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {productions.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 bg-card text-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <div>
                      <span className="font-medium">{p.recipe.name}</span>
                      <span className="text-muted-foreground ml-2">{p.portionsProduced} porções</span>
                      {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.producedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {showProdForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold">Registrar Produção</h3>
                  <button onClick={() => setShowProdForm(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Receita</label>
                    <select
                      value={prodForm.recipeId}
                      onChange={e => setProdForm(f => ({ ...f, recipeId: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    >
                      <option value="">Selecione...</option>
                      {menus.map(m => (
                        <option key={m.id} value={m.recipeId}>{m.recipe.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Porções produzidas</label>
                    <input
                      type="number" min="0"
                      value={prodForm.portionsProduced}
                      onChange={e => setProdForm(f => ({ ...f, portionsProduced: e.target.value }))}
                      placeholder="Ex: 50"
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Observações (opcional)</label>
                    <input
                      value={prodForm.notes}
                      onChange={e => setProdForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-input rounded text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle size={12} />
                    O estoque será deduzido automaticamente com base nos ingredientes da receita.
                  </p>
                </div>
                <div className="flex justify-end gap-2 px-4 py-3 border-t">
                  <button onClick={() => setShowProdForm(false)} className="px-3 py-1.5 text-sm rounded border hover:bg-muted">Cancelar</button>
                  <button onClick={registerProduction} disabled={saving || !prodForm.recipeId || !prodForm.portionsProduced} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {saving ? 'Registrando...' : 'Registrar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CUSTOS ── */}
      {section === 'custos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Previsão de custo baseada no cardápio e mão de obra</p>
            <button onClick={loadAll} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition">
              <RefreshCw size={14} />
            </button>
          </div>

          {cost ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <CostCard label="Insumos" value={fmt(cost.ingredientCost)} sub={`${cost.guestCount} convidados`} />
                <CostCard label="Mão de Obra" value={fmt(cost.laborCost)} />
              </div>

              <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Custo Total Previsto</span>
                  <span className="font-bold text-lg">{fmt(cost.totalCost)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">Preço Sugerido de Venda</span>
                    <p className="text-xs text-muted-foreground">(custo = 30% do preço)</p>
                  </div>
                  <span className="font-bold text-xl text-primary">{fmt(cost.suggestedPrice)}</span>
                </div>
                {cost.guestCount > 0 && (
                  <div className="border-t pt-3 flex justify-between text-sm text-muted-foreground">
                    <span>Por convidado</span>
                    <span>{fmt(cost.suggestedPrice / cost.guestCount)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Adicione receitas ao cardápio para ver o resumo de custos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuRow({ menu, guestCount, onRemove, fmt }: {
  menu: EventMenu;
  guestCount: number;
  onRemove: () => void;
  fmt: (v: number) => string;
}) {
  const servings = menu.servingsNeeded ?? Math.ceil(guestCount * menu.recipe.averagePerGuest);
  const totalCost = servings * menu.recipeCostPerServing;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card text-sm">
      <div>
        <span className="font-medium">{menu.recipe.name}</span>
        <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{menu.recipe.category}</span>
        {menu.eventItem && (
          <span className="ml-2 text-xs text-blue-600">⟵ A&B: {menu.eventItem.name}</span>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">
          {servings} porções · {menu.recipe.prepTimeMinutes}min preparo
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">{fmt(totalCost)}</span>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function CostCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3 bg-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
