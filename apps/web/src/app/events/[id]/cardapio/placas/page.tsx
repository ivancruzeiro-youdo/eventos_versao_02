'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

// ─── Brand tokens ──────────────────────────────────────────────────────────
const ORANGE = '#E55A1C';
const GRAY_D = '#4A4A4A';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Choice { id: string; label: string; chosen: string[] }
interface Answer { questionId: string; answer: any }
interface Question { id: string; text: string }
interface EventItem {
  id: string;
  name: string;
  choices: Choice[];
  answers?: Answer[];
  product?: { questions: Question[] } | null;
}
interface EventData { id: string; name: string }

// Build sections from choices OR from question answers (same logic as the A6 cardápio)
function buildSections(item: EventItem): { label: string; chosen: string[] }[] {
  const fromChoices = item.choices
    .filter(c => c.chosen.length > 0)
    .map(c => ({ label: c.label, chosen: c.chosen }))
    .sort((a, b) => menuOrder(a.label) - menuOrder(b.label));
  if (fromChoices.length > 0) return fromChoices;

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

function menuOrder(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('entrada')) return 1;
  if (n.includes('principal') || n.includes('prato') || n.includes('buffet') || n.includes('finger')) return 2;
  if (n.includes('sobremesa') || n.includes('doce')) return 3;
  return 4;
}

// ─── Placa (grid box) ──────────────────────────────────────────────────────
const COLS = 3;
const ROWS = 7;
const PER_PAGE = COLS * ROWS;

function fontSizeFor(text: string): number {
  const len = text.length;
  if (len <= 8) return 34;
  if (len <= 14) return 28;
  if (len <= 22) return 22;
  if (len <= 34) return 17;
  return 13;
}

function PlacaBox({ text }: { text: string | null }) {
  return (
    <div style={{
      border: '2px solid #111', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '4mm', overflow: 'hidden',
    }}>
      {text && (
        <p style={{
          margin: 0, fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 800,
          textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.15,
          fontSize: `${fontSizeFor(text)}px`, color: '#111',
        }}>
          {text}
        </p>
      )}
    </div>
  );
}

function PlacasA4Page({ items }: { items: string[] }) {
  const cells: (string | null)[] = [...items];
  while (cells.length < PER_PAGE) cells.push(null);
  return (
    <div style={{
      width: '210mm', height: '297mm', boxSizing: 'border-box',
      padding: '12mm',
      display: 'grid',
      gridTemplateColumns: `repeat(${COLS}, 1fr)`,
      gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      gap: '3mm',
      backgroundColor: '#fff',
      pageBreakAfter: 'always', breakAfter: 'page',
    }}>
      {cells.map((text, i) => <PlacaBox key={i} text={text} />)}
    </div>
  );
}

// ─── YouDO Eventos logo ────────────────────────────────────────────────────
function YouDOLogo({ height = 28 }: { height?: number }) {
  return <img src="/youdo-logo.png" alt="YouDO Eventos" style={{ height, width: 'auto', display: 'inline-block' }} />;
}

// ─── Page component ────────────────────────────────────────────────────────
export default function PlacasBuffetPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const eventId = params.id;

  const allowedIds = searchParams.get('items')
    ? new Set(searchParams.get('items')!.split(',').filter(Boolean))
    : null;

  const [event, setEvent] = useState<EventData | null>(null);
  const [texts, setTexts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [evRes, itemsRes] = await Promise.all([
          fetch(`/api/v2/events/${eventId}`, { credentials: 'include' }),
          fetch(`/api/v2/events/${eventId}/items?category=ab`, { credentials: 'include' }),
        ]);
        if (!evRes.ok || !itemsRes.ok) throw new Error('Erro ao carregar dados');
        const evData = await evRes.json();
        const itemsData = await itemsRes.json();
        let items: EventItem[] = (itemsData.items || []).filter((i: EventItem) => buildSections(i).length > 0);
        if (allowedIds) items = items.filter(i => allowedIds.has(i.id));
        items.sort((a, b) => menuOrder(a.name) - menuOrder(b.name));

        const flat: string[] = [];
        for (const item of items) {
          for (const section of buildSections(item)) {
            for (const opt of section.chosen) flat.push(opt);
          }
        }
        setEvent(evData.event);
        setTexts(flat);
      } catch (e: any) {
        setError(e.message || 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: GRAY_D }}>
      Carregando placas…
    </div>
  );
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: 'crimson' }}>
      {error}
    </div>
  );
  if (texts.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: '#7A7A7A', textAlign: 'center', padding: '40px' }}>
      Nenhum item de A&B com seleções confirmadas.<br />Selecione os itens na aba A&B primeiro.
    </div>
  );

  const pages: string[][] = [];
  for (let i = 0; i < texts.length; i += PER_PAGE) pages.push(texts.slice(i, i + PER_PAGE));

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
            {event?.name && `· ${event.name} · Placas de Buffet`}
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
        {pages.map((pageItems, idx) => (
          <div key={idx} className="page-shadow">
            <PlacasA4Page items={pageItems} />
          </div>
        ))}
      </div>
    </>
  );
}
