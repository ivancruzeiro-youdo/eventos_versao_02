'use client';

import { useEffect, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { Loader2, Save, ToggleLeft, ToggleRight, Trash2, Plus, Image as ImageIcon } from 'lucide-react';
import { ELEMENT_ICONS } from '@/components/layout-element-icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface ElementConfig {
  type: string;
  label: string;
  widthMeters: number;
  heightMeters: number;
  active: boolean;
  iconUrl?: string;
  iconS3Key?: string;
  photoUrl?: string;
  photoS3Key?: string;
}

// Combo/"kit": a core table (1 or more, joined in a row) + surrounding chairs. Expands into
// real, independent elements when dragged into an event's layout — see EventLayoutTab.tsx's
// computeComboPlacement. Never has its own widthMeters/heightMeters of its own; its footprint
// is derived from the referenced core/satellite element types at drop time.
interface ComboConfig {
  type: string;
  label: string;
  core: { elementType: string; qty: number; arrangement: 'single' | 'row' };
  satellite: { elementType: string; qty: number; variable?: boolean; shape: 'round' | 'rect' };
  iconUrl?: string;
  iconS3Key?: string;
  active: boolean;
}

async function fetchWithCreds(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const emptyCombo = (): ComboConfig => ({
  type: '', label: '',
  core: { elementType: '', qty: 1, arrangement: 'single' },
  satellite: { elementType: '', qty: 6, variable: true, shape: 'round' },
  active: true,
});

export default function AdminLayoutElementsPage() {
  const [elements, setElements] = useState<ElementConfig[]>([]);
  const [combos, setCombos] = useState<ComboConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newEl, setNewEl] = useState({ type: '', label: '', widthMeters: 1.0, heightMeters: 1.0 });
  const [addingCombo, setAddingCombo] = useState<ComboConfig | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [uploadingComboIcon, setUploadingComboIcon] = useState<string | null>(null);
  const iconRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const comboIconRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchWithCreds(`${API_URL}/api/v2/admin/layout-config`)
      .then(res => { setElements(res.elements ?? []); setCombos(res.combos ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(type: string, field: keyof ElementConfig, value: any) {
    setElements(prev => prev.map(e => e.type === type ? { ...e, [field]: value } : e));
  }

  function deleteElement(type: string) {
    setElements(prev => prev.filter(e => e.type !== type));
  }

  function addElement() {
    if (!newEl.type.trim() || !newEl.label.trim()) return;
    const slug = newEl.type.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!slug || elements.find(e => e.type === slug)) return;
    setElements(prev => [...prev, {
      type: slug,
      label: newEl.label,
      widthMeters: newEl.widthMeters,
      heightMeters: newEl.heightMeters,
      active: true,
    }]);
    setNewEl({ type: '', label: '', widthMeters: 1.0, heightMeters: 1.0 });
    setAddingNew(false);
  }

  async function uploadIcon(elementType: string, file: File) {
    setUploadingIcon(elementType);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/v2/admin/layout-element-icon/${elementType}`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await res.json();
      if (data.iconUrl) {
        setElements(prev => prev.map(e =>
          e.type === elementType ? { ...e, iconUrl: data.iconUrl, iconS3Key: data.iconS3Key } : e
        ));
      }
    } catch (e: any) {
      alert('Erro ao enviar ícone: ' + (e.message ?? ''));
    } finally {
      setUploadingIcon(null);
    }
  }

  async function uploadPhoto(elementType: string, file: File) {
    setUploadingPhoto(elementType);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/v2/admin/layout-element-photo/${elementType}`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await res.json();
      if (data.photoUrl) {
        setElements(prev => prev.map(e =>
          e.type === elementType ? { ...e, photoUrl: data.photoUrl, photoS3Key: data.photoS3Key } : e
        ));
      }
    } catch (e: any) {
      alert('Erro ao enviar foto: ' + (e.message ?? ''));
    } finally {
      setUploadingPhoto(null);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      let res = await fetch(`${API_URL}/api/v2/admin/layout-config`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements, combos }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({} as any));
        if (data.requiresConfirmation) {
          const ok = confirm(data.error || `Isso vai apagar ${data.existingCombosCount ?? ''} combo(s) já cadastrado(s). Continuar?`);
          if (!ok) { setMsg({ ok: false, text: 'Salvamento cancelado.' }); return; }
          res = await fetch(`${API_URL}/api/v2/admin/layout-config`, {
            method: 'PUT', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ elements, combos, confirmClearCombos: true }),
          });
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg({ ok: true, text: 'Configuração salva!' });
    } catch {
      setMsg({ ok: false, text: 'Erro ao salvar.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  // ── Combos ──────────────────────────────────────────────────────────────

  function updateCombo(type: string, updater: (c: ComboConfig) => ComboConfig) {
    setCombos(prev => prev.map(c => c.type === type ? updater(c) : c));
  }

  function deleteCombo(type: string) {
    setCombos(prev => prev.filter(c => c.type !== type));
  }

  function confirmAddCombo() {
    if (!addingCombo) return;
    const slug = addingCombo.label.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!slug || !addingCombo.core.elementType || !addingCombo.satellite.elementType || combos.find(c => c.type === slug)) return;
    setCombos(prev => [...prev, { ...addingCombo, type: `combo_${slug}` }]);
    setAddingCombo(null);
  }

  async function uploadComboIcon(comboType: string, file: File) {
    setUploadingComboIcon(comboType);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/v2/admin/layout-element-icon/${comboType}`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const data = await res.json();
      if (data.iconUrl) {
        setCombos(prev => prev.map(c =>
          c.type === comboType ? { ...c, iconUrl: data.iconUrl, iconS3Key: data.iconS3Key } : c
        ));
      }
    } catch (e: any) {
      alert('Erro ao enviar ícone: ' + (e.message ?? ''));
    } finally {
      setUploadingComboIcon(null);
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Elementos de Layout</h1>
          <p className="text-muted-foreground text-sm">Configure os elementos disponíveis no editor de planta baixa.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-green-600' : 'text-destructive'}`}>{msg.text}</span>
          )}
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-2 px-4 py-2 border border-input rounded-lg hover:bg-muted transition text-sm font-medium"
          >
            <Plus className="size-4" />
            Adicionar
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50 text-sm font-medium"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </button>
        </div>
      </div>

      {/* Add new element form */}
      {addingNew && (
        <div className="mb-4 bg-card border rounded-xl p-4">
          <p className="text-sm font-medium mb-3">Novo elemento</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tipo (slug único)</label>
              <input
                autoFocus
                type="text"
                placeholder="ex: mesa_alta"
                value={newEl.type}
                onChange={e => setNewEl(p => ({ ...p, type: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addElement()}
                className="w-36 text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Label</label>
              <input
                type="text"
                placeholder="ex: Mesa Alta"
                value={newEl.label}
                onChange={e => setNewEl(p => ({ ...p, label: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addElement()}
                className="w-44 text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Largura (m)</label>
              <input
                type="number" min={0.1} max={20} step={0.1}
                value={newEl.widthMeters}
                onChange={e => setNewEl(p => ({ ...p, widthMeters: parseFloat(e.target.value) }))}
                className="w-20 text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring text-right"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Altura (m)</label>
              <input
                type="number" min={0.1} max={20} step={0.1}
                value={newEl.heightMeters}
                onChange={e => setNewEl(p => ({ ...p, heightMeters: parseFloat(e.target.value) }))}
                className="w-20 text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring text-right"
              />
            </div>
            <button
              onClick={addElement}
              disabled={!newEl.type.trim() || !newEl.label.trim()}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition"
            >
              Adicionar
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewEl({ type: '', label: '', widthMeters: 1.0, heightMeters: 1.0 }); }}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-muted transition text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Ícone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Foto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Label</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Largura (m)</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Altura (m)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ativo</th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {elements.map(el => (
                <tr key={el.type} className={`transition ${!el.active ? 'opacity-50' : ''}`}>
                  {/* Icon upload */}
                  <td className="px-4 py-2">
                    <button
                      onClick={() => iconRefs.current[el.type]?.click()}
                      className="relative w-11 h-11 border-2 border-dashed border-input rounded-lg flex items-center justify-center hover:border-primary/60 hover:bg-muted/50 transition group overflow-hidden"
                      title="Clique para alterar ícone"
                    >
                      {uploadingIcon === el.type ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : el.iconUrl ? (
                        <img src={el.iconUrl} alt={el.label} className="w-full h-full object-contain p-1" />
                      ) : ELEMENT_ICONS[el.type] ? (
                        <div className="w-full h-full p-1">{ELEMENT_ICONS[el.type]}</div>
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground/50 group-hover:text-primary/70 transition" />
                      )}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      ref={r => { iconRefs.current[el.type] = r; }}
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadIcon(el.type, f);
                        e.target.value = '';
                      }}
                    />
                  </td>
                  {/* Photo upload */}
                  <td className="px-4 py-2">
                    <button
                      onClick={() => photoRefs.current[el.type]?.click()}
                      className="relative w-11 h-11 border-2 border-dashed border-input rounded-lg flex items-center justify-center hover:border-blue-400/60 hover:bg-muted/50 transition group overflow-hidden"
                      title="Clique para adicionar foto real do elemento"
                    >
                      {uploadingPhoto === el.type ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : el.photoUrl ? (
                        <img src={el.photoUrl} alt={el.label} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground/30 group-hover:text-blue-400/70 transition" />
                      )}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      ref={r => { photoRefs.current[el.type] = r; }}
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadPhoto(el.type, f);
                        e.target.value = '';
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{el.type}</code>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={el.label}
                      onChange={e => update(el.type, 'label', e.target.value)}
                      className="w-44 text-sm border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0.1} max={20} step={0.1}
                        value={el.widthMeters ?? ''}
                        onChange={e => update(el.type, 'widthMeters', parseFloat(e.target.value))}
                        className="w-20 text-sm border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring text-right"
                      />
                      <span className="text-muted-foreground text-xs">m</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0.1} max={20} step={0.1}
                        value={el.heightMeters ?? ''}
                        onChange={e => update(el.type, 'heightMeters', parseFloat(e.target.value))}
                        className="w-20 text-sm border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring text-right"
                      />
                      <span className="text-muted-foreground text-xs">m</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => update(el.type, 'active', !el.active)}
                      className="text-muted-foreground hover:text-primary transition"
                    >
                      {el.active
                        ? <ToggleRight className="size-6 text-primary" />
                        : <ToggleLeft className="size-6" />}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => { if (confirm(`Remover "${el.label}"?`)) deleteElement(el.type); }}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                      title="Remover elemento"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {elements.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum elemento cadastrado. Clique em "Adicionar" para criar o primeiro.
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Clique no ícone de cada elemento para carregar uma imagem personalizada (PNG, JPG, SVG). O ícone é salvo imediatamente ao ser enviado.
      </p>

      {/* ── Combos ("kits" mesa + cadeiras) ──────────────────────────────────── */}
      <div className="mt-10 mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground mb-1">Combos</h2>
          <p className="text-muted-foreground text-sm">
            "Kits" de mesa(s) + cadeiras. Ao serem arrastados no editor de layout, expandem em elementos
            reais e independentes — o estoque de cada peça é descontado normalmente, cada uma pode ser
            movida/removida depois.
          </p>
        </div>
        <button
          onClick={() => setAddingCombo(emptyCombo())}
          className="flex items-center gap-2 px-4 py-2 border border-input rounded-lg hover:bg-muted transition text-sm font-medium"
        >
          <Plus className="size-4" />
          Adicionar Combo
        </button>
      </div>

      {addingCombo && (
        <div className="mb-4 bg-card border rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium">Novo combo</p>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Label</label>
            <input
              type="text"
              placeholder="ex: Mesa redonda + Cadeiras"
              value={addingCombo.label}
              onChange={e => setAddingCombo(c => c && { ...c, label: e.target.value })}
              className="w-72 text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Núcleo (mesa)</p>
              <select
                value={addingCombo.core.elementType}
                onChange={e => setAddingCombo(c => c && { ...c, core: { ...c.core, elementType: e.target.value } })}
                className="w-full text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
              >
                <option value="">Selecione o tipo...</option>
                {elements.map(el => <option key={el.type} value={el.type}>{el.label}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Quantidade</label>
                <input
                  type="number" min={1} max={10}
                  value={addingCombo.core.qty}
                  onChange={e => setAddingCombo(c => c && { ...c, core: { ...c.core, qty: Math.max(1, parseInt(e.target.value) || 1) } })}
                  className="w-16 text-sm border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring text-right"
                />
              </div>
              {addingCombo.core.qty > 1 && (
                <select
                  value={addingCombo.core.arrangement}
                  onChange={e => setAddingCombo(c => c && { ...c, core: { ...c.core, arrangement: e.target.value as 'single' | 'row' } })}
                  className="w-full text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
                >
                  <option value="row">Coladas em fileira</option>
                  <option value="single">Isoladas (sobrepostas — não recomendado)</option>
                </select>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Satélite (cadeiras)</p>
              <select
                value={addingCombo.satellite.elementType}
                onChange={e => setAddingCombo(c => c && { ...c, satellite: { ...c.satellite, elementType: e.target.value } })}
                className="w-full text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
              >
                <option value="">Selecione o tipo...</option>
                {elements.map(el => <option key={el.type} value={el.type}>{el.label}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Qtd. default</label>
                <input
                  type="number" min={0} max={40}
                  value={addingCombo.satellite.qty}
                  onChange={e => setAddingCombo(c => c && { ...c, satellite: { ...c.satellite, qty: Math.max(0, parseInt(e.target.value) || 0) } })}
                  className="w-16 text-sm border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring text-right"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!addingCombo.satellite.variable}
                  onChange={e => setAddingCombo(c => c && { ...c, satellite: { ...c.satellite, variable: e.target.checked } })}
                  className="size-4"
                />
                Operador escolhe a quantidade ao arrastar
              </label>
              <select
                value={addingCombo.satellite.shape}
                onChange={e => setAddingCombo(c => c && { ...c, satellite: { ...c.satellite, shape: e.target.value as 'round' | 'rect' } })}
                className="w-full text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring"
              >
                <option value="round">Círculo ao redor (mesa redonda/quadrada isolada)</option>
                <option value="rect">Contorno retangular (mesa retangular ou fileira de mesas)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <button
              onClick={() => setAddingCombo(null)}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-muted transition text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={confirmAddCombo}
              disabled={!addingCombo.label.trim() || !addingCombo.core.elementType || !addingCombo.satellite.elementType}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 hover:bg-primary/90 transition"
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {combos.length > 0 && (
        <div className="space-y-3">
          {combos.map(combo => {
            const coreCfg = elements.find(el => el.type === combo.core.elementType);
            const satCfg = elements.find(el => el.type === combo.satellite.elementType);
            return (
              <div key={combo.type} className={`bg-card border rounded-xl p-4 flex items-start gap-4 ${!combo.active ? 'opacity-50' : ''}`}>
                <button
                  onClick={() => comboIconRefs.current[combo.type]?.click()}
                  className="relative w-11 h-11 border-2 border-dashed border-input rounded-lg flex items-center justify-center hover:border-primary/60 hover:bg-muted/50 transition group overflow-hidden flex-shrink-0"
                  title="Clique para alterar ícone"
                >
                  {uploadingComboIcon === combo.type ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : combo.iconUrl ? (
                    <img src={combo.iconUrl} alt={combo.label} className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="size-4 text-muted-foreground/50 group-hover:text-primary/70 transition" />
                  )}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={r => { comboIconRefs.current[combo.type] = r; }}
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadComboIcon(combo.type, f);
                    e.target.value = '';
                  }}
                />

                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={combo.label}
                    onChange={e => updateCombo(combo.type, c => ({ ...c, label: e.target.value }))}
                    className="w-full max-w-sm text-sm font-medium border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Núcleo: {combo.core.qty}× {coreCfg?.label ?? combo.core.elementType}
                    {combo.core.qty > 1 && ` (${combo.core.arrangement === 'row' ? 'em fileira' : 'isoladas'})`}
                    {' · '}
                    Satélite: {combo.satellite.qty} {satCfg?.label ?? combo.satellite.elementType}
                    {combo.satellite.variable && ' (variável)'}
                    {' · '}
                    Formato: {combo.satellite.shape === 'round' ? 'círculo' : 'contorno retangular'}
                  </p>
                </div>

                <button
                  onClick={() => updateCombo(combo.type, c => ({ ...c, active: !c.active }))}
                  className="text-muted-foreground hover:text-primary transition flex-shrink-0"
                  title={combo.active ? 'Desativar' : 'Ativar'}
                >
                  {combo.active ? <ToggleRight className="size-6 text-primary" /> : <ToggleLeft className="size-6" />}
                </button>
                <button
                  onClick={() => { if (confirm(`Remover o combo "${combo.label}"?`)) deleteCombo(combo.type); }}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition flex-shrink-0"
                  title="Remover combo"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {combos.length === 0 && !addingCombo && (
        <div className="text-center py-8 text-muted-foreground text-sm bg-card border rounded-xl">
          Nenhum combo cadastrado. Clique em "Adicionar Combo" para criar o primeiro.
        </div>
      )}
    </Layout>
  );
}
