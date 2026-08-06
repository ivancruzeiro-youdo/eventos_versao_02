'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw, X, Save, Loader2, AlertCircle, Lock, Unlock, Plus, Trash2, LayoutGrid } from 'lucide-react';
import { ELEMENT_ICONS } from './layout-element-icons';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElementConfig {
  type: string;
  label: string;
  widthMeters: number;
  heightMeters: number;
  active: boolean;
  iconUrl?: string;
}

interface ComboCore {
  elementType: string;
  qty: number;
  arrangement: 'single' | 'row';
}

interface ComboSatellite {
  elementType: string;
  qty: number;
  variable?: boolean;
  shape: 'round' | 'rect';
}

interface ComboConfig {
  type: string;
  label: string;
  core: ComboCore;
  satellite: ComboSatellite;
  iconUrl?: string;
  active: boolean;
}

interface PlacedElement {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
}

interface SavedLayout {
  id: string;
  venueId: string | null;
  name: string;
  elements: PlacedElement[];
  isLocked: boolean;
  createdById: string | null;
  createdByClient: boolean;
}

interface EventVenueInfo {
  venueId: string;
  venueName: string;
  floorPlanUrl: string | null;
  floorPlanWidthMeters: number | null;
  floorPlanHeightMeters: number | null;
  layoutStock: Record<string, number> | null;
}

function ElementIcon({ type, iconUrl }: { type: string; iconUrl?: string }) {
  if (iconUrl) return <img src={iconUrl} alt={type} className="w-full h-full object-contain" />;
  return <>{ELEMENT_ICONS[type] ?? <div className="w-full h-full bg-muted rounded" />}</>;
}

const DEFAULT_CONFIGS: ElementConfig[] = [
  { type: 'mesa_6',   label: 'Mesa 6 lugares',  widthMeters: 1.2, heightMeters: 1.2, active: true },
  { type: 'mesa_10',  label: 'Mesa 10 lugares', widthMeters: 1.5, heightMeters: 1.5, active: true },
  { type: 'mesa_ret', label: 'Mesa Retangular', widthMeters: 1.8, heightMeters: 0.9, active: true },
  { type: 'arbusto',  label: 'Arbusto',         widthMeters: 0.6, heightMeters: 0.6, active: true },
  { type: 'puff',     label: 'Puff',            widthMeters: 0.8, heightMeters: 0.8, active: true },
  { type: 'palco',    label: 'Palco',           widthMeters: 6.0, heightMeters: 3.0, active: true },
  { type: 'bar',      label: 'Bar',             widthMeters: 3.0, heightMeters: 1.5, active: true },
  { type: 'wc',       label: 'WC',              widthMeters: 1.0, heightMeters: 1.0, active: true },
];

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// Gap kept between the core table(s) and the surrounding chairs, in meters.
const COMBO_GAP_METERS = 0.1;
// When the venue has no real floor plan scale configured, there's no meters↔fraction
// conversion available — approximate 1 meter as this fraction of the canvas (matches the
// ballpark of the fixed sizePct fallback already used per-element in getElementCss).
const COMBO_FALLBACK_METERS_TO_FRACTION = 0.045;

function metersToFractionX(meters: number, floorPlanW: number | null): number {
  return floorPlanW ? meters / floorPlanW : meters * COMBO_FALLBACK_METERS_TO_FRACTION;
}
function metersToFractionY(meters: number, floorPlanH: number | null): number {
  return floorPlanH ? meters / floorPlanH : meters * COMBO_FALLBACK_METERS_TO_FRACTION;
}

// Expands a combo (core table(s) + satellite chairs) into real, independent PlacedElements
// centered on the drop point (xFrac, yFrac). Core copies (when arrangement === 'row') are
// placed edge-to-edge along the widest axis, forming one combined bounding box; chairs are
// then distributed around that combined box's outline — never around each core piece on its
// own, which would put chairs in the seam between two joined tables.
function computeComboPlacement(
  combo: ComboConfig,
  configByType: Record<string, ElementConfig>,
  xFrac: number,
  yFrac: number,
  satelliteQty: number,
  floorPlanW: number | null,
  floorPlanH: number | null
): PlacedElement[] | null {
  const coreCfg = configByType[combo.core.elementType];
  const satCfg = configByType[combo.satellite.elementType];
  if (!coreCfg || !satCfg) return null;

  const coreQty = Math.max(1, combo.core.qty || 1);
  const isRow = combo.core.arrangement === 'row' && coreQty > 1;

  // Core piece centers, in meters relative to the combo's own center (0,0).
  const coreCentersM: { x: number; y: number }[] = [];
  if (isRow) {
    const totalW = coreQty * coreCfg.widthMeters;
    for (let i = 0; i < coreQty; i++) {
      coreCentersM.push({ x: -totalW / 2 + coreCfg.widthMeters * (i + 0.5), y: 0 });
    }
  } else {
    coreCentersM.push({ x: 0, y: 0 });
  }

  const boxW = isRow ? coreQty * coreCfg.widthMeters : coreCfg.widthMeters;
  const boxH = coreCfg.heightMeters;

  // Satellite (chair) centers, in meters relative to the combo's own center (0,0).
  const satCentersM: { x: number; y: number; rotationDeg: number }[] = [];
  const n = Math.max(0, satelliteQty);

  if (combo.satellite.shape === 'round') {
    const a = boxW / 2 + COMBO_GAP_METERS + satCfg.widthMeters / 2;
    const b = boxH / 2 + COMBO_GAP_METERS + satCfg.heightMeters / 2;
    for (let i = 0; i < n; i++) {
      const theta = (2 * Math.PI * i) / n - Math.PI / 2; // start at the top, go clockwise
      satCentersM.push({
        x: a * Math.cos(theta),
        y: b * Math.sin(theta),
        rotationDeg: (theta * 180) / Math.PI + 90, // face the combo's center
      });
    }
  } else {
    // 'rect' — walk the perimeter of the expanded bounding rectangle at evenly spaced
    // arc-length intervals, starting at the top-left corner and going clockwise.
    const W = boxW + 2 * (COMBO_GAP_METERS + satCfg.widthMeters / 2);
    const H = boxH + 2 * (COMBO_GAP_METERS + satCfg.heightMeters / 2);
    const perimeter = 2 * (W + H);
    for (let i = 0; i < n; i++) {
      let t = (perimeter * i) / n;
      let x: number, y: number, rotationDeg: number;
      if (t < W) { // top edge, left → right
        x = -W / 2 + t; y = -H / 2; rotationDeg = 180; // facing down, toward the table
      } else if ((t -= W) < H) { // right edge, top → bottom
        x = W / 2; y = -H / 2 + t; rotationDeg = 270; // facing left
      } else if ((t -= H) < W) { // bottom edge, right → left
        x = W / 2 - t; y = H / 2; rotationDeg = 0; // facing up
      } else { // left edge, bottom → top
        t -= W;
        x = -W / 2; y = H / 2 - t; rotationDeg = 90; // facing right
      }
      satCentersM.push({ x, y, rotationDeg });
    }
  }

  const placed: PlacedElement[] = [];
  for (const c of coreCentersM) {
    placed.push({
      id: uid(),
      type: combo.core.elementType,
      x: xFrac + metersToFractionX(c.x, floorPlanW),
      y: yFrac + metersToFractionY(c.y, floorPlanH),
      rotation: 0,
    });
  }
  for (const c of satCentersM) {
    placed.push({
      id: uid(),
      type: combo.satellite.elementType,
      x: xFrac + metersToFractionX(c.x, floorPlanW),
      y: yFrac + metersToFractionY(c.y, floorPlanH),
      rotation: c.rotationDeg,
    });
  }
  return placed;
}

async function api(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EventLayoutTab({ eventId }: { eventId: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const trashRef  = useRef<HTMLDivElement>(null);

  // Venues linked to this event — each has its own independent floor plan
  const [venues,          setVenues]          = useState<EventVenueInfo[]>([]);
  const [activeVenueId,   setActiveVenueId]   = useState<string | null>(null);
  const [imgAspect,       setImgAspect]       = useState<number | null>(null);

  const activeVenue = venues.find(v => v.venueId === activeVenueId) ?? null;
  const floorPlanUrl = activeVenue?.floorPlanUrl ?? null;
  const floorPlanW   = activeVenue?.floorPlanWidthMeters ?? null;
  const floorPlanH   = activeVenue?.floorPlanHeightMeters ?? null;
  const maxCounts    = activeVenue?.layoutStock ?? {};

  // Layouts (all venues loaded once; filtered by activeVenueId for display)
  const [allLayouts,     setAllLayouts]     = useState<SavedLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [elements,       setElements]       = useState<PlacedElement[]>([]);

  // Layouts belonging to the currently selected venue (legacy layouts with no venueId
  // fall back to the first venue, since they predate multi-venue support)
  const layouts = allLayouts.filter(l =>
    l.venueId ? l.venueId === activeVenueId : activeVenueId === venues[0]?.venueId
  );

  // Element configs
  const [configs,    setConfigs]    = useState<ElementConfig[]>(DEFAULT_CONFIGS);
  const configByType = Object.fromEntries(configs.map(c => [c.type, c]));

  // Combos ("kits" — a core table + surrounding chairs, expanded into real independent
  // elements on drop; see computeComboPlacement)
  const [combos,           setCombos]           = useState<ComboConfig[]>([]);
  const [comboDropPrompt,  setComboDropPrompt]  = useState<{ combo: ComboConfig; x: number; y: number; qty: number } | null>(null);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());

  // UI
  const [loading,          setLoading]          = useState(true);
  const [saving,           setSaving]           = useState(false);
  const [creatingLayout,   setCreatingLayout]   = useState(false);
  const [saveMsg,          setSaveMsg]          = useState<{ok:boolean;text:string}|null>(null);
  const [editingName,      setEditingName]      = useState(false);
  const [nameDraft,        setNameDraft]        = useState('');

  // Templates (per active venue)
  const [templates,        setTemplates]        = useState<{id:string;name:string;elements:PlacedElement[]}[]>([]);
  const [showTplPicker,    setShowTplPicker]    = useState(false);

  // Drag — dragAnchor.startPositions holds every selected element's position at mousedown, so
  // dragging any one of a multi-selection moves the whole group by the same delta.
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dragAnchor,  setDragAnchor]  = useState<{ mouseX: number; mouseY: number; startPositions: Record<string, { x: number; y: number }> } | null>(null);
  const [overTrash,   setOverTrash]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoverId,     setHoverId]     = useState<string | null>(null);
  // Rubber-band selection — dragging on empty canvas draws this box; released, it selects
  // every element whose center falls inside it (a plain click with no drag just clears selection).
  const [marquee,     setMarquee]     = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const activeLayout = layouts.find(l => l.id === activeLayoutId) ?? null;

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [venuesRes, layoutsRes, cfgRes] = await Promise.allSettled([
          api(`${API_URL}/api/v2/events/${eventId}/layout-venues`),
          api(`${API_URL}/api/v2/events/${eventId}/layouts`),
          api(`${API_URL}/api/v2/admin/layout-config`),
        ]);
        if (venuesRes.status === 'fulfilled') {
          const list: EventVenueInfo[] = venuesRes.value.venues ?? [];
          setVenues(list);
          if (list.length > 0) setActiveVenueId(list[0].venueId);
        }
        if (layoutsRes.status === 'fulfilled') {
          setAllLayouts(layoutsRes.value.layouts ?? []);
        }
        if (cfgRes.status === 'fulfilled') {
          setConfigs((cfgRes.value.elements ?? DEFAULT_CONFIGS).filter((c: ElementConfig) => c.active));
          setCombos((cfgRes.value.combos ?? []).filter((c: ComboConfig) => c.active));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  // When the active venue changes, select its first layout and load its templates
  useEffect(() => {
    if (!activeVenueId) return;
    setSelectedIds(new Set());
    setEditingName(false);
    setShowTplPicker(false);
    if (layouts.length > 0) {
      setActiveLayoutId(layouts[0].id);
      setElements(layouts[0].elements ?? []);
    } else {
      setActiveLayoutId(null);
      setElements([]);
    }
    fetch(`${API_URL}/api/v2/venues/${activeVenueId}/layout-templates`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVenueId, allLayouts]);

  // ── Layout management ─────────────────────────────────────────────────────

  function switchLayout(id: string) {
    const l = layouts.find(x => x.id === id);
    if (!l) return;
    setActiveLayoutId(id);
    setElements(l.elements ?? []);
    setSelectedIds(new Set());
    setEditingName(false);
  }

  async function createLayout(fromElements: PlacedElement[] = [], fromName?: string) {
    if (!activeVenueId) return;
    setCreatingLayout(true); setShowTplPicker(false);
    try {
      const data = await api(`${API_URL}/api/v2/events/${eventId}/layouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fromName ?? `Layout ${layouts.length + 1}`, elements: fromElements, venueId: activeVenueId }),
      });
      const l: SavedLayout = data.layout;
      setAllLayouts(prev => [...prev, l]);
      setActiveLayoutId(l.id);
      setElements(fromElements);
      setSelectedIds(new Set());
    } catch { /* ignore */ } finally {
      setCreatingLayout(false);
    }
  }

  function handleNewLayoutClick() {
    if (templates.length > 0) {
      setShowTplPicker(true);
    } else {
      createLayout();
    }
  }

  async function saveLayout() {
    if (!activeLayoutId || !activeLayout) return;
    setSaving(true); setSaveMsg(null);
    try {
      await api(`${API_URL}/api/v2/events/${eventId}/layouts/${activeLayoutId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements, name: activeLayout.name }),
      });
      setAllLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, elements, name: activeLayout.name } : l));
      setSaveMsg({ ok: true, text: 'Salvo!' });
    } catch {
      setSaveMsg({ ok: false, text: 'Erro ao salvar.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  async function deleteLayout(id: string) {
    if (layouts.length <= 1) return;
    if (!confirm('Excluir este layout?')) return;
    try {
      await api(`${API_URL}/api/v2/events/${eventId}/layouts/${id}`, { method: 'DELETE' });
      setAllLayouts(prev => prev.filter(l => l.id !== id));
      if (activeLayoutId === id) {
        const remaining = layouts.filter(l => l.id !== id);
        setActiveLayoutId(remaining[0]?.id ?? null);
        setElements(remaining[0]?.elements ?? []);
      }
    } catch { /* ignore */ }
  }

  async function toggleLock(id: string) {
    const l = layouts.find(x => x.id === id);
    if (!l) return;
    const newLocked = !l.isLocked;
    try {
      await api(`${API_URL}/api/v2/events/${eventId}/layouts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: newLocked }),
      });
      setAllLayouts(prev => prev.map(x => x.id === id ? { ...x, isLocked: newLocked } : x));
    } catch { /* ignore */ }
  }

  async function commitRename(id: string) {
    const name = nameDraft.trim() || (activeLayout?.name ?? 'Layout');
    try {
      await api(`${API_URL}/api/v2/events/${eventId}/layouts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setAllLayouts(prev => prev.map(l => l.id === id ? { ...l, name } : l));
    } catch { /* ignore */ }
    setEditingName(false);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  function handleSidebarDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData('elementType', type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleComboDragStart(e: React.DragEvent, comboType: string) {
    e.dataTransfer.setData('comboType', comboType);
    e.dataTransfer.effectAllowed = 'copy';
  }

  // How many more of `type` can still be placed in this layout, given the venue's stock.
  function availableStock(type: string, extraElements: PlacedElement[] = []): number {
    const max = maxCounts[type];
    if (max === undefined) return Infinity;
    const count = elements.filter(el => el.type === type).length + extraElements.filter(el => el.type === type).length;
    return Math.max(0, max - count);
  }

  // Flags the given elements as "just added" for a few seconds so the operator can see what a
  // combo drop produced, without turning into a persistent multi-selection.
  function flashRecentlyAdded(ids: string[]) {
    setRecentlyAddedIds(new Set(ids));
    setTimeout(() => setRecentlyAddedIds(new Set()), 1500);
  }

  // Expands a combo into real elements and appends them — clamps the satellite (chair) count
  // to whatever stock still allows rather than blocking the whole placement.
  function commitCombo(combo: ComboConfig, x: number, y: number, requestedQty: number) {
    const coreRoom = availableStock(combo.core.elementType);
    if (coreRoom < combo.core.qty) {
      setSaveMsg({ ok: false, text: `Sem estoque suficiente de "${configByType[combo.core.elementType]?.label ?? combo.core.elementType}" neste espaço.` });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    const satRoom = availableStock(combo.satellite.elementType);
    const qty = Math.max(0, Math.min(requestedQty, satRoom));
    if (qty < requestedQty) {
      setSaveMsg({ ok: false, text: `Só cabem mais ${qty} de "${configByType[combo.satellite.elementType]?.label ?? combo.satellite.elementType}" neste espaço — adicionadas ${qty} de ${requestedQty} solicitadas.` });
      setTimeout(() => setSaveMsg(null), 4000);
    }
    const placed = computeComboPlacement(combo, configByType, x, y, qty, floorPlanW, floorPlanH);
    if (!placed) return;
    setElements(prev => [...prev, ...placed]);
    flashRecentlyAdded(placed.map(p => p.id));
    setSelectedIds(new Set());
  }

  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const comboType = e.dataTransfer.getData('comboType');
    if (comboType) {
      const combo = combos.find(c => c.type === comboType);
      if (!combo) return;
      if (combo.satellite.variable) {
        setComboDropPrompt({ combo, x, y, qty: combo.satellite.qty });
      } else {
        commitCombo(combo, x, y, combo.satellite.qty);
      }
      return;
    }

    const type = e.dataTransfer.getData('elementType');
    if (!type) return;
    const count = elements.filter(el => el.type === type).length;
    const max = maxCounts[type];
    if (max !== undefined && count >= max) return;
    setElements(prev => [...prev, { id: uid(), type, x, y, rotation: 0 }]);
    setSelectedIds(new Set());
  }

  function handleElementMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!canvasRef.current) return;

    if (e.shiftKey) {
      // Shift-click only toggles membership — never starts a drag, so an accidental small
      // move right after doesn't drag the element the click landed on.
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }

    // Clicking an element that's already part of a multi-selection keeps the whole group
    // selected (so dragging it moves everyone); clicking any other element replaces the
    // selection with just that one.
    const effectiveSelection = selectedIds.has(id) && selectedIds.size > 1 ? selectedIds : new Set([id]);
    setSelectedIds(effectiveSelection);

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width;
    const mouseY = (e.clientY - rect.top) / rect.height;
    const startPositions: Record<string, { x: number; y: number }> = {};
    for (const elId of effectiveSelection) {
      const el = elements.find(x => x.id === elId);
      if (el) startPositions[elId] = { x: el.x, y: el.y };
    }
    setDragAnchor({ mouseX, mouseY, startPositions });
    setDraggingId(id);
  }

  // Window-level drag: tracks mouse across entire page, moves every selected element by the
  // same delta (so a multi-selection drags as one rigid group), handles trash.
  useEffect(() => {
    if (!draggingId || !dragAnchor) return;
    const ids = Object.keys(dragAnchor.startPositions);

    const onMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rect.width;
      const mouseY = (e.clientY - rect.top) / rect.height;
      let dx = mouseX - dragAnchor.mouseX;
      let dy = mouseY - dragAnchor.mouseY;
      // Clamp to the intersection of every selected element's valid range, so the whole
      // group stops together at the canvas edge instead of individual pieces clamping apart.
      for (const id of ids) {
        const p = dragAnchor.startPositions[id];
        dx = Math.max(-p.x, Math.min(1 - p.x, dx));
        dy = Math.max(-p.y, Math.min(1 - p.y, dy));
      }
      setElements(prev => prev.map(el => {
        const start = dragAnchor.startPositions[el.id];
        return start ? { ...el, x: start.x + dx, y: start.y + dy } : el;
      }));
      if (trashRef.current) {
        const tr = trashRef.current.getBoundingClientRect();
        setOverTrash(e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom);
      }
    };

    const onUp = (e: MouseEvent) => {
      if (trashRef.current) {
        const tr = trashRef.current.getBoundingClientRect();
        if (e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
          const idSet = new Set(ids);
          setElements(prev => prev.filter(el => !idSet.has(el.id)));
          setSelectedIds(new Set());
        }
      }
      setDraggingId(null);
      setDragAnchor(null);
      setOverTrash(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [draggingId, dragAnchor]);

  // Rubber-band selection: mousedown on empty canvas starts it; a drag past a small
  // threshold selects everything inside the box on release, a plain click clears selection.
  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMarquee({ x0: x, y0: y, x1: x, y1: y });
  }

  useEffect(() => {
    if (!marquee) return;

    const onMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setMarquee(m => m ? { ...m, x1: x, y1: y } : m);
    };

    const onUp = () => {
      setMarquee(m => {
        if (!m) return null;
        const dragDist = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
        if (dragDist < 0.01) {
          setSelectedIds(new Set());
        } else {
          const minX = Math.min(m.x0, m.x1), maxX = Math.max(m.x0, m.x1);
          const minY = Math.min(m.y0, m.y1), maxY = Math.max(m.y0, m.y1);
          const hits = elements.filter(el => el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY).map(el => el.id);
          setSelectedIds(new Set(hits));
        }
        return null;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [marquee, elements]);

  // ── Element actions ────────────────────────────────────────────────────────

  function rotateElement(id: string) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, rotation: (el.rotation + 45) % 360 } : el));
  }

  function removeElement(id: string) {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function rotateSelected() {
    setElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, rotation: (el.rotation + 45) % 360 } : el));
  }

  function removeSelected() {
    setElements(prev => prev.filter(el => !selectedIds.has(el.id)));
    setSelectedIds(new Set());
  }

  // ── CSS for placed elements ────────────────────────────────────────────────

  function getElementCss(el: PlacedElement): React.CSSProperties {
    const cfg = configs.find(c => c.type === el.type);
    const isActive = (selectedIds.size <= 1 && selectedIds.has(el.id)) || hoverId === el.id;
    if (floorPlanW && floorPlanH && cfg?.widthMeters && cfg?.heightMeters) {
      return {
        position: 'absolute',
        left: `${el.x * 100}%`,
        top: `${el.y * 100}%`,
        width: `${(cfg.widthMeters / floorPlanW) * 100}%`,
        height: `${(cfg.heightMeters / floorPlanH) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
        zIndex: isActive ? 20 : 10,
        cursor: draggingId === el.id ? 'grabbing' : 'grab',
      };
    }
    const wPct = (cfg as any)?.sizePct ?? 0.06;
    const hPct = (cfg as any)?.heightPct ?? wPct;
    return {
      position: 'absolute',
      left: `${el.x * 100}%`,
      top: `${el.y * 100}%`,
      width: `${wPct * 100}%`,
      aspectRatio: `${wPct}/${hPct}`,
      transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
      zIndex: isActive ? 20 : 10,
      cursor: draggingId === el.id ? 'grabbing' : 'grab',
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  }

  const hasScale = !!(floorPlanW && floorPlanH);

  if (venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <AlertCircle className="size-10" />
        <p className="text-sm text-center max-w-xs">Nenhum espaço vinculado a este evento ainda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">

      {/* ── Venue selector (only shown when the event has more than one venue) ── */}
      {venues.length > 1 && (
        <div className="flex items-center gap-1.5 pb-2 mb-1 flex-wrap">
          {venues.map(v => (
            <button
              key={v.venueId}
              onClick={() => setActiveVenueId(v.venueId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition ${
                v.venueId === activeVenueId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-input hover:bg-muted/50 text-card-foreground'
              }`}
            >
              {v.venueName}
              {!v.floorPlanUrl && (
                <AlertCircle className={`size-3 ${v.venueId === activeVenueId ? 'opacity-90' : 'text-amber-500'}`} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Layout tabs bar ── */}
      <div className="flex items-center gap-2 pb-2 mb-2 border-b flex-wrap">
        <div className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
          {layouts.map(layout => (
            <div
              key={layout.id}
              onClick={() => switchLayout(layout.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border cursor-pointer select-none transition flex-shrink-0 ${
                layout.id === activeLayoutId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-input hover:bg-muted/50 text-card-foreground'
              }`}
            >
              {layout.isLocked && <Lock className="size-3 opacity-70" />}
              {layout.createdByClient && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium">Cliente</span>
              )}
              {editingName && layout.id === activeLayoutId ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={() => commitRename(layout.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(layout.id);
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  onClick={e => e.stopPropagation()}
                  className="w-28 bg-transparent border-b border-current outline-none text-sm"
                />
              ) : (
                <span
                  className="max-w-[140px] truncate"
                  onDoubleClick={e => {
                    if (layout.id !== activeLayoutId) return;
                    e.stopPropagation();
                    setNameDraft(layout.name);
                    setEditingName(true);
                  }}
                  title="Clique duplo para renomear"
                >
                  {layout.name}
                </span>
              )}
              {layouts.length > 1 && layout.id === activeLayoutId && !editingName && (
                <button
                  onClick={e => { e.stopPropagation(); deleteLayout(layout.id); }}
                  className="ml-0.5 opacity-60 hover:opacity-100 transition"
                  title="Excluir layout"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
          {layouts.length === 0 && (
            <span className="text-xs text-muted-foreground px-2">Nenhum layout. Crie o primeiro.</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {activeLayoutId && (
            <button
              onClick={() => toggleLock(activeLayoutId)}
              title={activeLayout?.isLocked ? 'Desbloquear para cliente' : 'Bloquear para cliente (somente leitura)'}
              className="p-1.5 border border-input rounded-md hover:bg-muted transition"
            >
              {activeLayout?.isLocked
                ? <Unlock className="size-3.5 text-amber-500" />
                : <Lock className="size-3.5 text-muted-foreground" />}
            </button>
          )}
          <div className="relative">
            <button
              onClick={handleNewLayoutClick}
              disabled={creatingLayout}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-input rounded-md hover:bg-muted transition disabled:opacity-50"
              title="Novo layout"
            >
              {creatingLayout ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Novo
            </button>
            {showTplPicker && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-card border rounded-lg shadow-lg z-50 py-1 text-sm">
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                  Iniciar a partir de:
                </div>
                <button
                  onClick={() => createLayout([], `Layout ${layouts.length + 1}`)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition flex items-center gap-2"
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  Em branco
                </button>
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => createLayout(t.elements.map(el => ({ ...el, id: uid() })), t.name)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition flex items-center gap-2"
                  >
                    <LayoutGrid className="size-3.5 text-primary/70" />
                    <span className="truncate">{t.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">{t.elements.length} el.</span>
                  </button>
                ))}
                <div className="border-t mt-1 pt-1">
                  <button onClick={() => setShowTplPicker(false)} className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
          {saveMsg && (
            <span className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-destructive'}`}>{saveMsg.text}</span>
          )}
          <button
            onClick={saveLayout}
            disabled={saving || !activeLayoutId}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Salvar
          </button>
        </div>
      </div>

      {/* ── Editor area ── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Elementos</p>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {configs.map(cfg => {
              const count = elements.filter(el => el.type === cfg.type).length;
              const max = maxCounts[cfg.type];
              const blocked = max !== undefined && count >= max;
              return (
                <div
                  key={cfg.type}
                  draggable={!blocked}
                  onDragStart={e => handleSidebarDragStart(e, cfg.type)}
                  className={`flex items-center gap-2 p-2 border rounded-lg bg-card select-none transition ${
                    blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-grab hover:bg-muted/50 hover:border-primary/40 active:cursor-grabbing'
                  }`}
                >
                  <div className="w-9 h-9 flex-shrink-0">
                    <ElementIcon type={cfg.type} iconUrl={cfg.iconUrl} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight truncate">{cfg.label}</p>
                    <p className="text-[10px] text-muted-foreground">{cfg.widthMeters}m × {cfg.heightMeters}m</p>
                    {max !== undefined && (
                      <p className={`text-[10px] font-medium mt-0.5 ${count >= max ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {count}/{max}
                      </p>
                    )}
                  </div>
                  {blocked && <Lock className="size-3 text-muted-foreground flex-shrink-0" />}
                </div>
              );
            })}
          </div>

          {combos.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 border-t">Combos</p>
              <div className="space-y-1.5 pr-1">
                {combos.map(combo => {
                  const coreCfg = configByType[combo.core.elementType];
                  const satCfg = configByType[combo.satellite.elementType];
                  const blocked = availableStock(combo.core.elementType) < combo.core.qty
                    || (combo.satellite.qty > 0 && availableStock(combo.satellite.elementType) <= 0);
                  return (
                    <div
                      key={combo.type}
                      draggable={!blocked}
                      onDragStart={e => handleComboDragStart(e, combo.type)}
                      className={`flex items-center gap-2 p-2 border rounded-lg bg-card select-none transition ${
                        blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-grab hover:bg-muted/50 hover:border-primary/40 active:cursor-grabbing'
                      }`}
                    >
                      <div className="w-9 h-9 flex-shrink-0">
                        <ElementIcon type={combo.type} iconUrl={combo.iconUrl} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-tight truncate">{combo.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {combo.core.qty} {coreCfg?.label ?? combo.core.elementType} + {combo.satellite.qty}{combo.satellite.variable ? '+' : ''} {satCfg?.label ?? combo.satellite.elementType}
                        </p>
                      </div>
                      {blocked && <Lock className="size-3 text-muted-foreground flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Trash zone */}
          <div
            ref={trashRef}
            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-lg border-2 border-dashed transition-all duration-150 ${
              overTrash
                ? 'border-destructive bg-destructive/10 text-destructive scale-105'
                : draggingId
                  ? 'border-destructive/40 bg-destructive/5 text-destructive/50'
                  : 'border-muted-foreground/20 text-muted-foreground/25'
            }`}
          >
            <Trash2 className={`size-5 transition-transform duration-150 ${overTrash ? 'scale-125' : ''}`} />
            <span className="text-[10px] font-medium">Arraste aqui</span>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 border rounded-xl overflow-hidden bg-muted/30 min-h-0">
          {!floorPlanUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <AlertCircle className="size-12" />
              <p className="text-sm text-center max-w-xs">
                Nenhuma planta baixa configurada para <strong>{activeVenue?.venueName ?? 'este espaço'}</strong>.
                {venues.length > 1 && ' Selecione outro espaço acima ou cadastre a planta em Espaços.'}
              </p>
            </div>
          ) : layouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <p className="text-sm">Crie um layout para começar a montar o espaço.</p>
              <button
                onClick={handleNewLayoutClick}
                disabled={creatingLayout}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition"
              >
                {creatingLayout ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Criar Layout
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col min-h-0">
              {!hasScale && (
                <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertCircle className="size-3.5 flex-shrink-0" />
                  Configure as dimensões do espaço em <strong className="mx-1">Espaços → [nome]</strong> para ver a escala real dos elementos.
                </div>
              )}
              <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0 p-1">
                <div
                  ref={canvasRef}
                  className="relative select-none"
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleCanvasDrop}
                  onMouseDown={handleCanvasMouseDown}
                  style={{
                    cursor: draggingId ? 'grabbing' : 'default',
                    height: '100%',
                    width: 'auto',
                    maxWidth: '100%',
                    aspectRatio: imgAspect
                      ? `${imgAspect}`
                      : (hasScale ? `${floorPlanW}/${floorPlanH}` : '4/3'),
                  }}
                >
                  <img
                    src={floorPlanUrl}
                    alt="Planta baixa"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ objectFit: 'fill' }}
                    draggable={false}
                    onLoad={e => {
                      const img = e.target as HTMLImageElement;
                      setImgAspect(img.naturalWidth / img.naturalHeight);
                    }}
                  />

                  {/* Scale reference lines */}
                  {hasScale && (
                    <svg
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30 }}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <line x1="2" y1="96" x2="98" y2="96" stroke="#ef4444" strokeWidth="0.4" strokeDasharray="1.5,0.8" />
                      <line x1="2" y1="93.5" x2="2" y2="98.5" stroke="#ef4444" strokeWidth="0.4" />
                      <line x1="98" y1="93.5" x2="98" y2="98.5" stroke="#ef4444" strokeWidth="0.4" />
                      <text x="50" y="100" textAnchor="middle" fontSize="2.8" fill="#ef4444" fontFamily="sans-serif" fontWeight="600">{floorPlanW}m</text>
                      <line x1="97" y1="2" x2="97" y2="95" stroke="#3b82f6" strokeWidth="0.4" strokeDasharray="1.5,0.8" />
                      <line x1="94.5" y1="2" x2="99.5" y2="2" stroke="#3b82f6" strokeWidth="0.4" />
                      <line x1="94.5" y1="95" x2="99.5" y2="95" stroke="#3b82f6" strokeWidth="0.4" />
                      <text x="100" y="50" textAnchor="middle" fontSize="2.8" fill="#3b82f6" fontFamily="sans-serif" fontWeight="600" transform="rotate(90, 100, 50)">{floorPlanH}m</text>
                    </svg>
                  )}

                  {/* Rubber-band selection box */}
                  {marquee && (
                    <div
                      className="absolute border-2 border-primary bg-primary/10 pointer-events-none z-40"
                      style={{
                        left: `${Math.min(marquee.x0, marquee.x1) * 100}%`,
                        top: `${Math.min(marquee.y0, marquee.y1) * 100}%`,
                        width: `${Math.abs(marquee.x1 - marquee.x0) * 100}%`,
                        height: `${Math.abs(marquee.y1 - marquee.y0) * 100}%`,
                      }}
                    />
                  )}

                  {/* Group action bar — shown while more than one element is selected */}
                  {selectedIds.size > 1 && (
                    <div
                      className="absolute top-2 left-1/2 z-40 flex items-center gap-2 bg-card border rounded-lg shadow-lg px-3 py-1.5 text-xs"
                      style={{ transform: 'translateX(-50%)' }}
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <span className="font-medium text-muted-foreground">{selectedIds.size} selecionados</span>
                      <button
                        onClick={rotateSelected}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
                        title="Girar todos 45°"
                      >
                        <RotateCw className="size-3.5" />
                      </button>
                      <button
                        onClick={removeSelected}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        title="Remover todos"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
                        title="Limpar seleção"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Placed elements */}
                  {elements.map(el => {
                    const isSelected = selectedIds.has(el.id);
                    // Suppress the per-element toolbar during a multi-selection — the group
                    // toolbar below handles bulk rotate/remove instead of N overlapping mini-bars.
                    const isActive = (selectedIds.size <= 1 && isSelected) || hoverId === el.id;
                    return (
                      <div
                        key={el.id}
                        style={getElementCss(el)}
                        onMouseDown={e => handleElementMouseDown(e, el.id)}
                        onClick={e => e.stopPropagation()}
                        onMouseEnter={() => setHoverId(el.id)}
                        onMouseLeave={() => setHoverId(prev => (prev === el.id ? null : prev))}
                      >
                        <div className={`w-full h-full drop-shadow-md transition-all ${isSelected ? 'ring-2 ring-primary ring-offset-1 rounded' : ''} ${recentlyAddedIds.has(el.id) ? 'ring-2 ring-amber-400 ring-offset-1 rounded animate-pulse' : ''}`}>
                          <ElementIcon type={el.type} iconUrl={configs.find(c => c.type === el.type)?.iconUrl} />
                        </div>
                        <div
                          className={`absolute -top-7 left-1/2 flex gap-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                          style={{ transform: `translateX(-50%) rotate(${-el.rotation}deg)` }}
                          onMouseDown={e => e.stopPropagation()}
                          onMouseEnter={() => setHoverId(el.id)}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); rotateElement(el.id); }}
                            className="p-1 bg-card border rounded shadow text-muted-foreground hover:text-foreground"
                            title="Girar 45°"
                          >
                            <RotateCw className="size-3" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); removeElement(el.id); }}
                            className="p-1 bg-card border rounded shadow text-muted-foreground hover:text-destructive"
                            title="Remover"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Combo quantity prompt — asks how many chairs before expanding the combo */}
                  {comboDropPrompt && (
                    <div
                      className="absolute z-40 bg-card border rounded-lg shadow-lg p-3 text-sm w-56"
                      style={{ left: `${comboDropPrompt.x * 100}%`, top: `${comboDropPrompt.y * 100}%`, transform: 'translate(-50%, -50%)' }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                    >
                      <p className="font-medium mb-2 truncate">{comboDropPrompt.combo.label}</p>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Quantas {configByType[comboDropPrompt.combo.satellite.elementType]?.label.toLowerCase() ?? 'cadeiras'}?
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        autoFocus
                        value={comboDropPrompt.qty}
                        onChange={e => setComboDropPrompt(p => p ? { ...p, qty: Math.max(0, parseInt(e.target.value) || 0) } : p)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { commitCombo(comboDropPrompt.combo, comboDropPrompt.x, comboDropPrompt.y, comboDropPrompt.qty); setComboDropPrompt(null); }
                          if (e.key === 'Escape') setComboDropPrompt(null);
                        }}
                        className="w-full text-sm border border-input rounded px-2 py-1.5 bg-background focus:ring-1 focus:ring-ring mb-2"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setComboDropPrompt(null)}
                          className="px-3 py-1.5 border rounded-md text-xs hover:bg-muted transition"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => { commitCombo(comboDropPrompt.combo, comboDropPrompt.x, comboDropPrompt.y, comboDropPrompt.qty); setComboDropPrompt(null); }}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
