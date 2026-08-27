'use client';

import { Check } from 'lucide-react';
import { VENUE_COLOR_PRESETS } from '@/lib/venueColors';

interface Props {
  value: string | null;
  onChange: (color: string) => void;
}

export default function VenueColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {VENUE_COLOR_PRESETS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          title={color}
          className="size-7 rounded-full flex items-center justify-center border-2 transition"
          style={{ backgroundColor: color, borderColor: value === color ? '#0f172a' : 'transparent' }}
        >
          {value === color && <Check size={14} className="text-white drop-shadow" />}
        </button>
      ))}
    </div>
  );
}
