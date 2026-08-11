'use client';

import { MapPin, Check } from 'lucide-react';

interface Venue { id: string; name: string }

interface Props {
  venues: Venue[];
  selected: string[];
  onToggle: (id: string) => void;
  loading?: boolean;
}

/** Seleção de espaços. Mesma ideia da lista de checkbox em events/new, mas com alvo grande
 *  o suficiente pra dedo — a tela da cozinha costuma ser touch. */
export default function VenuePicker({ venues, selected, onToggle, loading }: Props) {
  if (loading) return <p className="text-white/50 text-sm">Carregando espaços…</p>;
  if (venues.length === 0) return <p className="text-white/50 text-sm">Nenhum espaço cadastrado.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {venues.map(v => {
        const on = selected.includes(v.id);
        return (
          <button
            key={v.id}
            onClick={() => onToggle(v.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              on
                ? 'bg-emerald-500 text-black'
                : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            {on ? <Check className="size-4" /> : <MapPin className="size-4" />}
            {v.name}
          </button>
        );
      })}
    </div>
  );
}
