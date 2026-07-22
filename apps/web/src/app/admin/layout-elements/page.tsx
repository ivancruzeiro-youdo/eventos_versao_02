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

async function fetchWithCreds(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function AdminLayoutElementsPage() {
  const [elements, setElements] = useState<ElementConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newEl, setNewEl] = useState({ type: '', label: '', widthMeters: 1.0, heightMeters: 1.0 });
  const [uploadingIcon, setUploadingIcon] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const iconRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchWithCreds(`${API_URL}/api/v2/admin/layout-config`)
      .then(res => setElements(res.elements ?? []))
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
      await fetchWithCreds(`${API_URL}/api/v2/admin/layout-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements }),
      });
      setMsg({ ok: true, text: 'Configuração salva!' });
    } catch {
      setMsg({ ok: false, text: 'Erro ao salvar.' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
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
    </Layout>
  );
}
