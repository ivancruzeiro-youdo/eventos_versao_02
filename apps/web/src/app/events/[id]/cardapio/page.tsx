'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

// ─── Brand tokens ──────────────────────────────────────────────────────────
const ORANGE  = '#E55A1C';
const GRAY_D  = '#4A4A4A';   // "You" in logo + banners
const GRAY_M  = '#7A7A7A';   // category labels
const INK     = '#1C1C1C';   // body text
const RULE    = '#E0DDD9';   // subtle dividers

// ─── Types ─────────────────────────────────────────────────────────────────
interface Choice  { id: string; label: string; chosen: string[] }
interface Answer  { questionId: string; answer: any }
interface Question { id: string; text: string }
interface EventItem {
  id: string;
  name: string;
  choices: Choice[];
  answers?: Answer[];
  product?: { questions: Question[] } | null;
}
interface EventData { id: string; name: string }

// Build sections from choices OR from question answers
function buildSections(item: EventItem): { label: string; chosen: string[] }[] {
  // Prefer choices if any have selections
  const fromChoices = item.choices
    .filter(c => c.chosen.length > 0)
    .map(c => ({ label: c.label, chosen: c.chosen }))
    .sort((a, b) => menuOrder(a.label) - menuOrder(b.label));
  if (fromChoices.length > 0) return fromChoices;

  // Fallback: build from product question answers
  if (!item.answers?.length || !item.product?.questions?.length) return [];
  const sections: { label: string; chosen: string[] }[] = [];
  for (const q of item.product.questions) {
    const ans = item.answers.find(a => a.questionId === q.id);
    if (!ans || ans.answer === null || ans.answer === undefined || ans.answer === '') continue;
    const chosen = Array.isArray(ans.answer)
      ? ans.answer.map(String).filter(Boolean)
      : [String(ans.answer)];
    if (chosen.length > 0) sections.push({ label: q.text, chosen });
  }
  return sections.sort((a, b) => menuOrder(a.label) - menuOrder(b.label));
}

// Section/item ordering: entradas → principais → sobremesas → rest
function menuOrder(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('entrada')) return 1;
  if (n.includes('principal') || n.includes('prato') || n.includes('buffet') || n.includes('finger')) return 2;
  if (n.includes('sobremesa') || n.includes('doce')) return 3;
  return 4;
}

const DRINK_KEYWORDS = ['bar', 'drink', 'bebida', 'open', 'chopp', 'cerveja', 'vinho', 'drinque'];
const isDrink = (name: string) => DRINK_KEYWORDS.some(k => name.toLowerCase().includes(k));

// Generic label for the printed cardápio — never shows the internal product name
function getMenuLabel(name: string, drink: boolean): string {
  const n = name.toLowerCase();
  if (drink) {
    if (n.includes('open')) return 'OPEN BAR';
    if (n.includes('chopp')) return 'OPEN CHOPP';
    if (n.includes('vinho')) return 'OPEN VINHO';
    if (n.includes('cerveja')) return 'OPEN CERVEJA';
    return 'BEBIDAS';
  }
  if (n.includes('finger')) return 'FINGER FOOD';
  if (n.includes('buffet')) return 'BUFFET';
  if (n.includes('jantar')) return 'JANTAR';
  if (n.includes('almo')) return 'ALMOÇO';
  if (n.includes('café') || n.includes('cafe') || n.includes('coffee')) return 'COFFEE BREAK';
  if (n.includes('coquetel') || n.includes('cocktail')) return 'COQUETEL';
  return 'CARDÁPIO';
}

// ─── YouDO Eventos logo (real image) ──────────────────────────────────────
function YouDOLogo({ height = 36 }: { height?: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <img
        src="/youdo-logo.png"
        alt="YouDO Eventos"
        style={{ height, width: 'auto', display: 'inline-block' }}
      />
    </div>
  );
}

// ─── Food card (frente) ────────────────────────────────────────────────────
function CardFood({ item }: { item: EventItem }) {
  const sections = buildSections(item);
  return (
    <div style={{
      width: '105mm', height: '148mm', boxSizing: 'border-box',
      backgroundColor: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Top orange stripe */}
      <div style={{ height: '5px', backgroundColor: ORANGE, flexShrink: 0 }} />

      {/* Header */}
      <div style={{ padding: '7mm 8mm 0', flexShrink: 0 }}>
        <div style={{
          fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900,
          fontSize: '36px', color: INK, letterSpacing: '-0.5px', lineHeight: 1,
        }}>
          CARDÁPIO
        </div>
        <div style={{
          fontFamily: 'Arial, sans-serif', fontWeight: 700,
          fontSize: '11px', color: ORANGE, letterSpacing: '3px', marginTop: '5px',
          textTransform: 'uppercase',
        }}>
          {getMenuLabel(item.name, false)}
        </div>
        {/* Rule below header */}
        <div style={{ height: '1.5px', backgroundColor: ORANGE, marginTop: '6mm', opacity: 0.8 }} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 8mm',
        gap: sections.length > 2 ? '4mm' : '6mm',
      }}>
        {sections.map((choice, i) => (
          <div key={i}>
            {i > 0 && <div style={{ height: '1px', backgroundColor: RULE, marginBottom: sections.length > 2 ? '4mm' : '6mm' }} />}
            {choice.chosen.map((opt, j) => (
              <p key={j} style={{
                fontFamily: 'Arial, sans-serif', fontWeight: 400,
                fontSize: '22px', color: INK, textAlign: 'center',
                margin: '0', lineHeight: '1.6',
              }}>
                {opt}
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '0 8mm 7mm', flexShrink: 0 }}>
        <div style={{ height: '1px', backgroundColor: RULE, marginBottom: '5mm' }} />
        <YouDOLogo height={64} />
      </div>
    </div>
  );
}

// ─── Drinks card (verso) ───────────────────────────────────────────────────
function CardDrink({ item }: { item: EventItem }) {
  const sections = buildSections(item);
  return (
    <div style={{
      width: '105mm', height: '148mm', boxSizing: 'border-box',
      backgroundColor: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Dark banner */}
      <div style={{
        backgroundColor: GRAY_D, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '7mm 8mm 6mm',
      }}>
        <div style={{
          fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900,
          fontSize: '18px', color: '#fff', letterSpacing: '2px',
          textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
        }}>
          {getMenuLabel(item.name, true)}
        </div>
      </div>
      {/* Orange stripe */}
      <div style={{ height: '5px', backgroundColor: ORANGE, flexShrink: 0 }} />

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 8mm',
        gap: sections.length > 2 ? '4mm' : '6mm',
      }}>
        {sections.map((choice, i) => (
          <div key={i}>
            {i > 0 && <div style={{ height: '1px', backgroundColor: RULE, marginBottom: sections.length > 2 ? '4mm' : '6mm' }} />}
            {choice.chosen.map((opt, j) => (
              <p key={j} style={{
                fontFamily: 'Arial, sans-serif', fontWeight: 400,
                fontSize: '22px', color: INK, textAlign: 'center',
                margin: '0', lineHeight: '1.6',
              }}>
                {opt}
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '0 8mm 7mm', flexShrink: 0 }}>
        <div style={{ height: '1px', backgroundColor: RULE, marginBottom: '5mm' }} />
        <YouDOLogo height={64} />
      </div>
    </div>
  );
}

// ─── A4 page grid (2 × 2 A6) ──────────────────────────────────────────────
function A4Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '210mm', height: '297mm',
      display: 'grid', gridTemplateColumns: '105mm 105mm', gridTemplateRows: '148mm 148mm',
      backgroundColor: '#fff', position: 'relative',
      pageBreakAfter: 'always', breakAfter: 'page',
    }}>
      {/* Cut guides */}
      <div style={{ position: 'absolute', left: '50%', top: '5mm', bottom: '5mm', width: '1px', background: 'repeating-linear-gradient(to bottom, #ccc 0, #ccc 4px, transparent 4px, transparent 8px)', zIndex: 10 }} />
      <div style={{ position: 'absolute', top: '50%', left: '5mm', right: '5mm', height: '1px', background: 'repeating-linear-gradient(to right, #ccc 0, #ccc 4px, transparent 4px, transparent 8px)', zIndex: 10 }} />
      {children}
    </div>
  );
}

// ─── Page component ────────────────────────────────────────────────────────
export default function CardapioPage() {
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const eventId      = params.id;

  // Items filter from query param (?items=id1,id2)
  const allowedIds = searchParams.get('items')
    ? new Set(searchParams.get('items')!.split(',').filter(Boolean))
    : null;

  const [event, setEvent]       = useState<EventData | null>(null);
  const [foodItems, setFood]    = useState<EventItem[]>([]);
  const [drinkItems, setDrinks] = useState<EventItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [evRes, itemsRes] = await Promise.all([
          fetch(`/api/v2/events/${eventId}`, { credentials: 'include' }),
          fetch(`/api/v2/events/${eventId}/items?category=ab`, { credentials: 'include' }),
        ]);
        if (!evRes.ok || !itemsRes.ok) throw new Error('Erro ao carregar dados');
        const evData    = await evRes.json();
        const itemsData = await itemsRes.json();
        let items: EventItem[] = (itemsData.items || []).filter((i: EventItem) => buildSections(i).length > 0);
        if (allowedIds) items = items.filter(i => allowedIds.has(i.id));
        setEvent(evData.event);
        setFood(items.filter(i => !isDrink(i.name)).sort((a, b) => menuOrder(a.name) - menuOrder(b.name)));
        setDrinks(items.filter(i => isDrink(i.name)));
      } catch (e: any) {
        setError(e.message || 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  const hasFood   = foodItems.length > 0;
  const hasDrinks = drinkItems.length > 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: GRAY_D }}>
      Carregando cardápio…
    </div>
  );
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: 'crimson' }}>
      {error}
    </div>
  );
  if (!hasFood && !hasDrinks) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: GRAY_M, textAlign: 'center', padding: '40px' }}>
      Nenhum item de A&B com seleções confirmadas.<br />Selecione os itens na aba A&B primeiro.
    </div>
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .screen-wrap { padding: 0 !important; background: white !important; }
        }
        @media screen {
          .screen-wrap { background: #DDDBD8; padding: 32px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; gap: 24px; }
          .page-shadow { box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
        backgroundColor: GRAY_D, padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'Arial, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <YouDOLogo height={28} />
          <span style={{ color: '#aaa', fontSize: '13px', marginLeft: '8px' }}>
            {event?.name && `· ${event.name}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a href={`/events/${eventId}`} style={{
            padding: '7px 16px', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff',
            borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontFamily: 'Arial, sans-serif',
          }}>← Voltar</a>
          <button onClick={() => window.print()} style={{
            padding: '7px 20px', backgroundColor: ORANGE, color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 700, fontFamily: 'Arial, sans-serif',
          }}>
            Imprimir / Baixar PDF
          </button>
        </div>
      </div>

      <div className="screen-wrap" style={{ paddingTop: '72px' }}>

        {/* FRENTE — Comida */}
        {hasFood && foodItems.map(item => (
          <div key={item.id} className="page-shadow">
            <A4Page>
              <CardFood item={item} />
              <CardFood item={item} />
              <div style={{ transform: 'rotate(180deg)' }}><CardFood item={item} /></div>
              <div style={{ transform: 'rotate(180deg)' }}><CardFood item={item} /></div>
            </A4Page>
          </div>
        ))}

        {/* VERSO — Bebidas */}
        {hasDrinks && drinkItems.map(item => (
          <div key={item.id} className="page-shadow">
            <A4Page>
              <CardDrink item={item} />
              <CardDrink item={item} />
              <div style={{ transform: 'rotate(180deg)' }}><CardDrink item={item} /></div>
              <div style={{ transform: 'rotate(180deg)' }}><CardDrink item={item} /></div>
            </A4Page>
          </div>
        ))}

      </div>
    </>
  );
}
