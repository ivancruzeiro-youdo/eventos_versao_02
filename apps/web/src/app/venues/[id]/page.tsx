'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { venuesApiExtended } from '@/lib/api';
import { MapPin, Users, Phone, User, ArrowLeft, Edit2, Trash2, Plus, HelpCircle, X, Check, GripVertical, Upload, Image, Package, Save, Loader2, LayoutGrid, RotateCw, AlertCircle } from 'lucide-react';
import { ELEMENT_ICONS } from '@/components/layout-element-icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface VenueQuestion {
  id: string;
  text: string;
  type: string;
  required: boolean;
  options: string[] | null;
  order: number;
}

interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  capacity: number | null;
  contactName: string | null;
  contactPhone: string | null;
  floorPlanWidthMeters: number | null;
  floorPlanHeightMeters: number | null;
  layoutStock: Record<string, number> | null;
  createdAt: string;
  questions: VenueQuestion[];
  _count?: { events: number };
}

interface LayoutElementConfig {
  type: string;
  label: string;
  widthMeters: number;
  heightMeters: number;
  active: boolean;
  iconUrl?: string;
}

interface PlacedElement {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
}

interface LayoutTemplate {
  id: string;
  name: string;
  elements: PlacedElement[];
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

const QUESTION_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Seleção única' },
  { value: 'multiselect', label: 'Múltipla escolha' },
];

export default function VenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);

  // Stock state
  const [layoutStock, setLayoutStock] = useState<Record<string, number>>({});
  const [stockElements, setStockElements] = useState<LayoutElementConfig[]>([]);
  const [savingStock, setSavingStock] = useState(false);
  const [stockMsg, setStockMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Calibration state
  const [calMode, setCalMode] = useState<'off' | 'p1' | 'p2' | 'confirm'>('off');
  const [calP1, setCalP1] = useState<{ x: number; y: number } | null>(null);
  const [calP2, setCalP2] = useState<{ x: number; y: number } | null>(null);
  const [calMeters, setCalMeters] = useState('');
  const [calSaving, setCalSaving] = useState(false);
  const [imgNatSize, setImgNatSize] = useState<{ w: number; h: number } | null>(null);

  // Layout template state
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<LayoutTemplate | null>(null);
  const [templateElements, setTemplateElements] = useState<PlacedElement[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tplDraggingId, setTplDraggingId] = useState<string | null>(null);
  const [tplDragOffset, setTplDragOffset] = useState({ ox: 0, oy: 0 });
  const [tplOverTrash, setTplOverTrash] = useState(false);
  const [tplSelectedId, setTplSelectedId] = useState<string | null>(null);
  const tplCanvasRef = useRef<HTMLDivElement>(null);
  const tplTrashRef = useRef<HTMLDivElement>(null);

  // Question form state
  const [addingQ, setAddingQ] = useState(false);
  const [newQ, setNewQ] = useState({ text: '', type: 'text', required: false, options: '' });
  const [savingQ, setSavingQ] = useState(false);
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState({ text: '', type: 'text', required: false, options: '' });

  useEffect(() => {
    loadVenue();
  }, [venueId]);

  async function loadVenue() {
    try {
      setLoading(true);
      const [venueRes, planRes, configRes, tplRes] = await Promise.allSettled([
        venuesApiExtended.get(venueId),
        fetch(`${API_URL}/api/v2/venues/${venueId}/floorplan-url`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API_URL}/api/v2/admin/layout-config`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API_URL}/api/v2/venues/${venueId}/layout-templates`, { credentials: 'include' }).then(r => r.json()),
      ]);
      if (venueRes.status === 'fulfilled') {
        const v = venueRes.value.venue;
        setVenue(v);
        setLayoutStock(v.layoutStock ?? {});
      }
      if (planRes.status === 'fulfilled') setFloorPlanUrl(planRes.value.url ?? null);
      if (configRes.status === 'fulfilled') {
        setStockElements((configRes.value.elements ?? []).filter((e: LayoutElementConfig) => e.active));
      }
      if (tplRes.status === 'fulfilled') setTemplates(tplRes.value.templates ?? []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar local');
    } finally {
      setLoading(false);
    }
  }

  async function saveStock() {
    setSavingStock(true);
    setStockMsg(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/venues/${venueId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutStock }),
      });
      if (!res.ok) throw new Error();
      setStockMsg({ ok: true, text: 'Estoque salvo!' });
    } catch {
      setStockMsg({ ok: false, text: 'Erro ao salvar.' });
    } finally {
      setSavingStock(false);
      setTimeout(() => setStockMsg(null), 3000);
    }
  }

  // ── Template functions ──────────────────────────────────────────────────────

  function openNewTemplate() {
    const tpl: LayoutTemplate = { id: '', name: 'Novo Modelo', elements: [] };
    setEditingTemplate(tpl);
    setTemplateElements([]);
    setTemplateName('Novo Modelo');
    setTplSelectedId(null);
  }

  function openEditTemplate(tpl: LayoutTemplate) {
    setEditingTemplate(tpl);
    setTemplateElements(tpl.elements ?? []);
    setTemplateName(tpl.name);
    setTplSelectedId(null);
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true); setTemplateMsg(null);
    try {
      if (editingTemplate?.id) {
        const res = await fetch(`${API_URL}/api/v2/venues/${venueId}/layout-templates/${editingTemplate.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: templateName, elements: templateElements }),
        });
        const data = await res.json();
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? data.template : t));
      } else {
        const res = await fetch(`${API_URL}/api/v2/venues/${venueId}/layout-templates`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: templateName, elements: templateElements }),
        });
        const data = await res.json();
        setTemplates(prev => [...prev, data.template]);
        setEditingTemplate(data.template);
      }
      setTemplateMsg({ ok: true, text: 'Salvo!' });
    } catch {
      setTemplateMsg({ ok: false, text: 'Erro ao salvar.' });
    } finally {
      setSavingTemplate(false);
      setTimeout(() => setTemplateMsg(null), 3000);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Excluir este modelo?')) return;
    await fetch(`${API_URL}/api/v2/venues/${venueId}/layout-templates/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (editingTemplate?.id === id) setEditingTemplate(null);
  }

  function tplHandleSidebarDrag(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('elementType', type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function tplHandleDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData('elementType');
    if (!type || !tplCanvasRef.current) return;
    const rect = tplCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTemplateElements(prev => [...prev, { id: uid(), type, x, y, rotation: 0 }]);
  }

  function tplHandleElementMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setTplSelectedId(id);
    if (!tplCanvasRef.current) return;
    const rect = tplCanvasRef.current.getBoundingClientRect();
    const el = templateElements.find(x => x.id === id)!;
    setTplDragOffset({
      ox: (e.clientX - rect.left) / rect.width - el.x,
      oy: (e.clientY - rect.top) / rect.height - el.y,
    });
    setTplDraggingId(id);
  }

  // Window-level drag for template canvas
  useEffect(() => {
    if (!tplDraggingId) return;
    const onMove = (e: MouseEvent) => {
      if (!tplCanvasRef.current) return;
      const rect = tplCanvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width - tplDragOffset.ox));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height - tplDragOffset.oy));
      setTemplateElements(prev => prev.map(el => el.id === tplDraggingId ? { ...el, x, y } : el));
      if (tplTrashRef.current) {
        const tr = tplTrashRef.current.getBoundingClientRect();
        setTplOverTrash(e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (tplTrashRef.current) {
        const tr = tplTrashRef.current.getBoundingClientRect();
        if (e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
          setTemplateElements(prev => prev.filter(el => el.id !== tplDraggingId));
          if (tplSelectedId === tplDraggingId) setTplSelectedId(null);
        }
      }
      setTplDraggingId(null); setTplOverTrash(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [tplDraggingId, tplDragOffset, tplSelectedId]);

  function tplRotate(id: string) {
    setTemplateElements(prev => prev.map(el => el.id === id ? { ...el, rotation: (el.rotation + 45) % 360 } : el));
  }

  function tplRemove(id: string) {
    setTemplateElements(prev => prev.filter(el => el.id !== id));
    if (tplSelectedId === id) setTplSelectedId(null);
  }

  function tplElementStyle(el: PlacedElement): React.CSSProperties {
    const cfg = stockElements.find(c => c.type === el.type);
    const base: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x * 100}%`,
      top: `${el.y * 100}%`,
      transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
      zIndex: tplSelectedId === el.id ? 20 : 10,
      cursor: tplDraggingId === el.id ? 'grabbing' : 'grab',
    };
    const w = venue?.floorPlanWidthMeters;
    const h = venue?.floorPlanHeightMeters;
    if (w && h && cfg?.widthMeters && cfg?.heightMeters) {
      return { ...base, width: `${(cfg.widthMeters / w) * 100}%`, height: `${(cfg.heightMeters / h) * 100}%` };
    }
    return { ...base, width: '6%', aspectRatio: '1' };
  }

  async function handleFloorPlanUpload(file: File) {
    setUploadingPlan(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/v2/venues/${venueId}/floorplan`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (data.url) setFloorPlanUrl(data.url);
    } catch (e: any) {
      alert('Erro ao enviar planta: ' + (e.message ?? ''));
    } finally {
      setUploadingPlan(false);
    }
  }

  function handleCalClick(e: React.MouseEvent<SVGSVGElement>) {
    if (calMode !== 'p1' && calMode !== 'p2') return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (calMode === 'p1') {
      setCalP1({ x, y });
      setCalP2(null);
      setCalMode('p2');
    } else {
      setCalP2({ x, y });
      setCalMode('confirm');
    }
  }

  async function confirmCal() {
    if (!calP1 || !calP2 || !calMeters || !imgNatSize) return;
    const realM = parseFloat(calMeters);
    if (!realM || realM <= 0) return;
    setCalSaving(true);
    try {
      const dx_px = (calP2.x - calP1.x) * imgNatSize.w;
      const dy_px = (calP2.y - calP1.y) * imgNatSize.h;
      const linePx = Math.sqrt(dx_px * dx_px + dy_px * dy_px);
      const mPerPx = realM / linePx;
      const totalW = Math.round(imgNatSize.w * mPerPx * 10) / 10;
      const totalH = Math.round(imgNatSize.h * mPerPx * 10) / 10;
      await fetch(`${API_URL}/api/v2/venues/${venueId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorPlanWidthMeters: totalW, floorPlanHeightMeters: totalH }),
      });
      setVenue(prev => prev ? { ...prev, floorPlanWidthMeters: totalW, floorPlanHeightMeters: totalH } : prev);
      setCalMode('off');
      setCalP1(null);
      setCalP2(null);
      setCalMeters('');
    } catch (e: any) {
      alert('Erro ao salvar escala: ' + (e.message ?? ''));
    } finally {
      setCalSaving(false);
    }
  }

  function cancelCal() {
    setCalMode('off');
    setCalP1(null);
    setCalP2(null);
    setCalMeters('');
  }

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja excluir este local?')) return;
    try {
      await venuesApiExtended.delete(venueId);
      router.push('/venues');
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir local');
    }
  }

  function parseOptions(raw: string): string[] | null {
    const opts = raw.split('\n').map(s => s.trim()).filter(Boolean);
    return opts.length > 0 ? opts : null;
  }

  async function createQuestion() {
    if (!newQ.text.trim()) return;
    setSavingQ(true);
    try {
      await fetch(`/api/v2/venues/${venueId}/questions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newQ.text,
          type: newQ.type,
          required: newQ.required,
          options: ['select', 'multiselect'].includes(newQ.type) ? parseOptions(newQ.options) : null,
        }),
      });
      setNewQ({ text: '', type: 'text', required: false, options: '' });
      setAddingQ(false);
      await loadVenue();
    } finally { setSavingQ(false); }
  }

  async function updateQuestion(qId: string) {
    await fetch(`/api/v2/venues/${venueId}/questions/${qId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: editQ.text,
        type: editQ.type,
        required: editQ.required,
        options: ['select', 'multiselect'].includes(editQ.type) ? parseOptions(editQ.options) : null,
      }),
    });
    setEditingQId(null);
    await loadVenue();
  }

  async function deleteQuestion(qId: string) {
    if (!confirm('Excluir esta pergunta?')) return;
    await fetch(`/api/v2/venues/${venueId}/questions/${qId}`, { method: 'DELETE', credentials: 'include' });
    await loadVenue();
  }

  function startEdit(q: VenueQuestion) {
    setEditingQId(q.id);
    setEditQ({
      text: q.text, type: q.type, required: q.required,
      options: Array.isArray(q.options) ? q.options.join('\n') : '',
    });
  }

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      </Layout>
    );
  }

  if (!venue) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Local não encontrado.</p>
          <Link href="/venues" className="mt-2 inline-block text-primary hover:underline">
            Voltar para locais
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href="/venues"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para locais
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
              {venue.name}
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <MapPin className="size-4" />
              {venue.city && venue.state
                ? `${venue.city}, ${venue.state}`
                : venue.address || 'Endereço não definido'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-3 py-2 border border-input rounded-md text-sm font-medium hover:bg-muted transition flex items-center gap-2"
            >
              <Edit2 className="size-4" />
              Editar
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-2 border border-destructive text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition flex items-center gap-2"
            >
              <Trash2 className="size-4" />
              Excluir
            </button>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Informações do Local</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <MapPin className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Endereço</p>
                    <p className="text-sm text-muted-foreground">{venue.address || 'Não definido'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Users className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Capacidade</p>
                    <p className="text-sm text-muted-foreground">{venue.capacity ? `${venue.capacity} pessoas` : 'Não definida'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Informações de Contato</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Nome do Contato</p>
                    <p className="text-sm text-muted-foreground">{venue.contactName || 'Não definido'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Phone className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Telefone</p>
                    <p className="text-sm text-muted-foreground">{venue.contactPhone || 'Não definido'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Perguntas Padrão ─────────────────────────────────────────── */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-medium text-card-foreground">Perguntas Padrão</h2>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {venue.questions?.length ?? 0} pergunta{(venue.questions?.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setAddingQ(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition"
              >
                <Plus className="size-3.5" /> Adicionar
              </button>
            </div>

            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Estas perguntas serão carregadas automaticamente no <strong>Plano do Evento</strong> sempre que este local for usado.
              </p>

              {/* Question list */}
              {(venue.questions ?? []).length === 0 && !addingQ && (
                <p className="text-sm text-muted-foreground text-center py-4 italic">
                  Nenhuma pergunta padrão cadastrada.
                </p>
              )}

              {(venue.questions ?? []).map(q => (
                <div key={q.id} className="border rounded-lg overflow-hidden">
                  {editingQId === q.id ? (
                    /* Edit form */
                    <div className="p-3 space-y-2 bg-muted/20">
                      <input
                        autoFocus
                        value={editQ.text}
                        onChange={e => setEditQ(p => ({ ...p, text: e.target.value }))}
                        className="w-full text-sm px-2 py-1.5 border rounded bg-background"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <select value={editQ.type} onChange={e => setEditQ(p => ({ ...p, type: e.target.value }))}
                          className="text-sm px-2 py-1.5 border rounded bg-background">
                          {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={editQ.required} onChange={e => setEditQ(p => ({ ...p, required: e.target.checked }))} />
                          Obrigatória
                        </label>
                      </div>
                      {['select', 'multiselect'].includes(editQ.type) && (
                        <textarea
                          value={editQ.options}
                          onChange={e => setEditQ(p => ({ ...p, options: e.target.value }))}
                          rows={3} placeholder="Uma opção por linha..."
                          className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none"
                        />
                      )}
                      <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setEditingQId(null)} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                        <button onClick={() => updateQuestion(q.id)} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1"><Check size={11} /> Salvar</button>
                      </div>
                    </div>
                  ) : (
                    /* View row */
                    <div className="flex items-start justify-between px-3 py-2.5 hover:bg-muted/30 transition">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <GripVertical size={14} className="text-muted-foreground/40 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">
                            {q.required && <span className="text-destructive mr-1">*</span>}
                            {q.text}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {QUESTION_TYPES.find(t => t.value === q.type)?.label ?? q.type}
                            {Array.isArray(q.options) && q.options.length > 0 && (
                              <span className="ml-1.5">· {q.options.join(', ')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button onClick={() => startEdit(q)} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => deleteQuestion(q.id)} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-destructive">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add question form */}
              {addingQ && (
                <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                  <input
                    autoFocus
                    placeholder="Texto da pergunta..."
                    value={newQ.text}
                    onChange={e => setNewQ(p => ({ ...p, text: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && createQuestion()}
                    className="w-full text-sm px-2 py-1.5 border rounded bg-background"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={newQ.type} onChange={e => setNewQ(p => ({ ...p, type: e.target.value }))}
                      className="text-sm px-2 py-1.5 border rounded bg-background">
                      {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={newQ.required} onChange={e => setNewQ(p => ({ ...p, required: e.target.checked }))} />
                      Obrigatória
                    </label>
                  </div>
                  {['select', 'multiselect'].includes(newQ.type) && (
                    <textarea
                      value={newQ.options}
                      onChange={e => setNewQ(p => ({ ...p, options: e.target.value }))}
                      rows={3} placeholder="Uma opção por linha..."
                      className="w-full text-sm px-2 py-1.5 border rounded bg-background resize-none"
                    />
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setAddingQ(false)} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                    <button onClick={createQuestion} disabled={savingQ} className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50">
                      <Check size={11} /> {savingQ ? 'Salvando...' : 'Criar pergunta'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-medium text-card-foreground">Estatísticas</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-card-foreground">{venue._count?.events ?? 0}</p>
                <p className="text-sm text-muted-foreground">Eventos realizados</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground text-center">
                  Cadastrado em {new Date(venue.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          {/* Floor Plan */}
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-medium text-card-foreground flex items-center gap-2">
                <Image className="size-4" />
                Planta Baixa
              </h2>
              <button
                onClick={() => floorPlanInputRef.current?.click()}
                disabled={uploadingPlan}
                className="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Upload className="size-3" />
                {floorPlanUrl ? 'Substituir' : 'Enviar'}
              </button>
              <input
                ref={floorPlanInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFloorPlanUpload(f);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="p-4 space-y-3">
              {uploadingPlan ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <svg className="animate-spin size-6" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                </div>
              ) : floorPlanUrl ? (
                <>
                  {/* Floor plan image with calibration overlay */}
                  <div className="relative rounded border overflow-hidden">
                    <img
                      src={floorPlanUrl}
                      alt="Planta baixa"
                      className="w-full block"
                      style={{ maxHeight: calMode !== 'off' ? '340px' : '200px', objectFit: 'contain' }}
                      onLoad={e => {
                        const img = e.target as HTMLImageElement;
                        setImgNatSize({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                    />
                    {/* Calibration SVG overlay */}
                    {calMode !== 'off' && (
                      <svg
                        className="absolute inset-0 w-full h-full"
                        style={{ cursor: calMode === 'confirm' ? 'default' : 'crosshair' }}
                        onClick={handleCalClick}
                      >
                        {calP1 && (
                          <circle cx={`${calP1.x * 100}%`} cy={`${calP1.y * 100}%`} r="5" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                        )}
                        {calP1 && calP2 && (
                          <>
                            <line
                              x1={`${calP1.x * 100}%`} y1={`${calP1.y * 100}%`}
                              x2={`${calP2.x * 100}%`} y2={`${calP2.y * 100}%`}
                              stroke="#ef4444" strokeWidth="2" strokeDasharray="6,3"
                            />
                            <circle cx={`${calP2.x * 100}%`} cy={`${calP2.y * 100}%`} r="5" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                          </>
                        )}
                      </svg>
                    )}
                  </div>

                  {/* Calibration controls */}
                  {calMode === 'off' && (
                    <div className="flex items-center justify-between border-t pt-2">
                      <span className="text-xs text-muted-foreground">
                        {venue.floorPlanWidthMeters && venue.floorPlanHeightMeters
                          ? `Escala: ${venue.floorPlanWidthMeters}m × ${venue.floorPlanHeightMeters}m`
                          : 'Escala não calibrada'}
                      </span>
                      <button
                        onClick={() => setCalMode('p1')}
                        className="text-xs text-primary hover:underline"
                      >
                        {venue.floorPlanWidthMeters ? 'Recalibrar escala' : '+ Calibrar escala'}
                      </button>
                    </div>
                  )}

                  {calMode === 'p1' && (
                    <div className="flex items-center gap-2 border-t pt-2">
                      <span className="text-xs text-muted-foreground flex-1">Clique no <strong>ponto inicial</strong> da linha de referência</span>
                      <button onClick={cancelCal} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><X size={11} /> Cancelar</button>
                    </div>
                  )}

                  {calMode === 'p2' && (
                    <div className="flex items-center gap-2 border-t pt-2">
                      <span className="text-xs text-muted-foreground flex-1">Clique no <strong>ponto final</strong> da linha de referência</span>
                      <button onClick={cancelCal} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><X size={11} /> Cancelar</button>
                    </div>
                  )}

                  {calMode === 'confirm' && (
                    <div className="flex items-center gap-2 border-t pt-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Esta linha mede</span>
                      <input
                        autoFocus
                        type="number"
                        min={0.1}
                        step={0.1}
                        placeholder="0"
                        value={calMeters}
                        onChange={e => setCalMeters(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && confirmCal()}
                        className="w-20 text-sm border border-input rounded px-2 py-1 bg-background focus:ring-1 focus:ring-ring text-right"
                      />
                      <span className="text-xs text-muted-foreground">metros</span>
                      <div className="ml-auto flex gap-2">
                        <button onClick={cancelCal} className="text-xs px-2 py-1 border rounded hover:bg-muted transition flex items-center gap-1"><X size={11} /> Cancelar</button>
                        <button
                          onClick={confirmCal}
                          disabled={calSaving || !calMeters}
                          className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          {calSaving ? <svg className="animate-spin size-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <Check size={11} />}
                          Confirmar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Image className="size-8" />
                  <p className="text-sm text-center">Nenhuma planta cadastrada.<br />Clique em "Enviar" para adicionar.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Estoque de Elementos ──────────────────────────────────────── */}
        {stockElements.length > 0 && (
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-medium text-card-foreground flex items-center gap-2">
                <Package className="size-4" />
                Estoque de Elementos
              </h2>
              <div className="flex items-center gap-3">
                {stockMsg && (
                  <span className={`text-xs ${stockMsg.ok ? 'text-green-600' : 'text-destructive'}`}>{stockMsg.text}</span>
                )}
                <button
                  onClick={saveStock}
                  disabled={savingStock}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {savingStock ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                  Salvar
                </button>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-4">
                Defina quantas unidades de cada elemento este espaço possui. O editor de layout bloqueará ao atingir o limite.
                Deixe 0 para bloquear o uso ou vazio para ilimitado.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {stockElements.map(el => (
                  <div key={el.type} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/20">
                    <div className="w-9 h-9 flex-shrink-0 bg-card rounded border p-0.5">
                      {el.iconUrl
                        ? <img src={el.iconUrl} alt={el.label} className="w-full h-full object-contain" />
                        : (ELEMENT_ICONS[el.type] ?? <div className="w-full h-full bg-muted rounded" />)
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight truncate">{el.label}</p>
                      <p className="text-[10px] text-muted-foreground">{el.widthMeters}m × {el.heightMeters}m</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={layoutStock[el.type] ?? ''}
                      placeholder="∞"
                      onChange={e => {
                        const v = e.target.value;
                        setLayoutStock(prev => {
                          if (v === '') {
                            const next = { ...prev };
                            delete next[el.type];
                            return next;
                          }
                          return { ...prev, [el.type]: parseInt(v) };
                        });
                      }}
                      className="w-14 text-sm text-center border border-input rounded px-1 py-1 bg-background focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Layouts Modelo ────────────────────────────────────────────── */}
        {floorPlanUrl && (
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-medium text-card-foreground flex items-center gap-2">
                <LayoutGrid className="size-4" />
                Layouts Modelo
              </h2>
              <button
                onClick={openNewTemplate}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-input hover:bg-muted transition"
              >
                <Plus className="size-3" />
                Novo Modelo
              </button>
            </div>

            {/* Template list */}
            {templates.length > 0 && (
              <div className="px-6 py-3 border-b flex flex-wrap gap-2">
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition ${
                      editingTemplate?.id === tpl.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/30 border-input hover:bg-muted/60'
                    }`}
                    onClick={() => openEditTemplate(tpl)}
                  >
                    <span className="font-medium">{tpl.name}</span>
                    <span className="text-xs opacity-60">({(tpl.elements ?? []).length} el.)</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                      className="ml-1 opacity-50 hover:opacity-100 transition"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {templates.length === 0 && !editingTemplate && (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                Nenhum modelo criado. Clique em "Novo Modelo" para criar um layout reutilizável.
              </div>
            )}

            {/* Template editor */}
            {editingTemplate !== null && (
              <div className="p-4 flex flex-col gap-3">
                {/* Name + actions */}
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="text"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="Nome do modelo (ex: Jantar 120 Pessoas)"
                    className="flex-1 min-w-48 text-sm border border-input rounded-lg px-3 py-2 bg-background focus:ring-1 focus:ring-ring"
                  />
                  {templateMsg && (
                    <span className={`text-xs ${templateMsg.ok ? 'text-green-600' : 'text-destructive'}`}>{templateMsg.text}</span>
                  )}
                  <button
                    onClick={saveTemplate}
                    disabled={savingTemplate || !templateName.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    {savingTemplate ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Salvar Modelo
                  </button>
                  <button
                    onClick={() => setEditingTemplate(null)}
                    className="px-3 py-2 text-xs border border-input rounded-lg hover:bg-muted transition text-muted-foreground"
                  >
                    Fechar
                  </button>
                </div>

                {/* Canvas + sidebar */}
                <div className="flex gap-3" style={{ height: 'calc(100vh - 360px)', minHeight: '580px' }}>

                  {/* Sidebar */}
                  <div className="w-36 flex-shrink-0 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Elementos</p>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 min-h-0">
                      {stockElements.map(cfg => (
                        <div
                          key={cfg.type}
                          draggable
                          onDragStart={e => tplHandleSidebarDrag(e, cfg.type)}
                          className="flex items-center gap-1.5 p-1.5 border rounded-lg bg-card cursor-grab hover:bg-muted/50 hover:border-primary/40 select-none active:cursor-grabbing"
                        >
                          <div className="w-7 h-7 flex-shrink-0">
                            {cfg.iconUrl
                              ? <img src={cfg.iconUrl} alt={cfg.label} className="w-full h-full object-contain" />
                              : (ELEMENT_ICONS[cfg.type] ?? <div className="w-full h-full bg-muted rounded" />)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium leading-tight truncate">{cfg.label}</p>
                            <p className="text-[10px] text-muted-foreground">{cfg.widthMeters}×{cfg.heightMeters}m</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Trash */}
                    <div
                      ref={tplTrashRef}
                      className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border-2 border-dashed transition-all flex-shrink-0 ${
                        tplOverTrash ? 'border-destructive bg-destructive/10 text-destructive scale-105'
                          : tplDraggingId ? 'border-destructive/40 bg-destructive/5 text-destructive/50'
                          : 'border-muted-foreground/20 text-muted-foreground/25'
                      }`}
                    >
                      <Trash2 className={`size-4 ${tplOverTrash ? 'scale-125' : ''} transition-transform`} />
                      <span className="text-[10px]">Arraste aqui</span>
                    </div>
                  </div>

                  {/* Canvas — fills all remaining space; inner div uses max-width + max-height to fit proportionally */}
                  <div className="flex-1 border rounded-xl bg-muted/30 flex items-center justify-center overflow-hidden relative">
                    {!venue?.floorPlanWidthMeters && (
                      <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 z-40 pointer-events-none">
                        <AlertCircle className="size-3 flex-shrink-0" />
                        Calibre a escala da planta para ver proporções reais
                      </div>
                    )}
                    <div
                      ref={tplCanvasRef}
                      className="relative select-none"
                      onDragOver={e => e.preventDefault()}
                      onDrop={tplHandleDrop}
                      onClick={() => setTplSelectedId(null)}
                      style={{
                        cursor: tplDraggingId ? 'grabbing' : 'default',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        aspectRatio: venue?.floorPlanWidthMeters && venue?.floorPlanHeightMeters
                          ? `${venue.floorPlanWidthMeters}/${venue.floorPlanHeightMeters}`
                          : '4/3',
                      }}
                    >
                      <img
                        src={floorPlanUrl}
                        alt="Planta baixa"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        style={{ objectFit: 'fill' }}
                        draggable={false}
                      />

                      {/* Elements */}
                      {templateElements.map(el => {
                        const isSel = tplSelectedId === el.id;
                        return (
                          <div key={el.id} style={tplElementStyle(el)} onMouseDown={e => tplHandleElementMouseDown(e, el.id)}>
                            <div className={`w-full h-full drop-shadow-md ${isSel ? 'ring-2 ring-primary ring-offset-1 rounded' : ''}`}>
                              {stockElements.find(c => c.type === el.type)?.iconUrl
                                ? <img src={stockElements.find(c => c.type === el.type)!.iconUrl!} alt={el.type} className="w-full h-full object-contain" draggable={false} />
                                : <div className="w-full h-full">{ELEMENT_ICONS[el.type] ?? <div className="w-full h-full bg-primary/40 rounded" />}</div>
                              }
                            </div>
                            {isSel && (
                              <div
                                className="absolute -top-7 left-1/2 flex gap-1"
                                style={{ transform: `translateX(-50%) rotate(${-el.rotation}deg)` }}
                                onMouseDown={e => e.stopPropagation()}
                              >
                                <button onClick={e => { e.stopPropagation(); tplRotate(el.id); }}
                                  className="p-1 bg-card border rounded shadow text-muted-foreground hover:text-foreground">
                                  <RotateCw className="size-3" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); tplRemove(el.id); }}
                                  className="p-1 bg-card border rounded shadow text-muted-foreground hover:text-destructive">
                                  <X className="size-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
