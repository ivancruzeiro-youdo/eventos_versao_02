import React from 'react';

export function TableSvg({ chairs, color = '#7c5c3e' }: { chairs: number; color?: string }) {
  const angles = Array.from({ length: chairs }, (_, i) => (i * 360) / chairs);
  const r = 35;
  const cr = 8;
  const dist = 46;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r={r} fill="white" stroke={color} strokeWidth="3" />
      {angles.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const cx = 50 + dist * Math.sin(rad);
        const cy = 50 - dist * Math.cos(rad);
        return <rect key={i} x={cx - cr} y={cy - cr * 0.7} width={cr * 2} height={cr * 1.4} rx="3" fill={color} transform={`rotate(${angle}, ${cx}, ${cy})`} />;
      })}
    </svg>
  );
}

export function BistroTableSvg({ chairs }: { chairs: number }) {
  const color = '#1a1a1a';
  const angles = Array.from({ length: chairs }, (_, i) => (i * 360) / chairs);
  const r = 26;
  const cr = 7;
  const dist = 36;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Pedestal */}
      <rect x="47" y="74" width="6" height="14" rx="2" fill={color} opacity="0.5" />
      <rect x="38" y="86" width="24" height="4" rx="2" fill={color} opacity="0.4" />
      {/* Table top */}
      <circle cx="50" cy="50" r={r} fill="#f9f6f1" stroke={color} strokeWidth="3" />
      {/* Metal rim */}
      <circle cx="50" cy="50" r={r - 2} fill="none" stroke="#888" strokeWidth="0.8" opacity="0.5" />
      {/* Chairs */}
      {angles.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const cx = 50 + dist * Math.sin(rad);
        const cy = 50 - dist * Math.cos(rad);
        return <rect key={i} x={cx - cr} y={cy - cr * 0.7} width={cr * 2} height={cr * 1.4} rx="3" fill={color} transform={`rotate(${angle}, ${cx}, ${cy})`} />;
      })}
    </svg>
  );
}

export function RectTableSvg({ color = '#7c5c3e' }: { color?: string }) {
  return (
    <svg viewBox="0 0 100 60" className="w-full h-full">
      <rect x="10" y="15" width="80" height="30" rx="4" fill="white" stroke={color} strokeWidth="3" />
      {[20, 40, 60, 80].map((x, i) => (
        <rect key={i} x={x - 7} y="5" width="14" height="10" rx="3" fill={color} />
      ))}
      {[20, 40, 60, 80].map((x, i) => (
        <rect key={i + 4} x={x - 7} y="45" width="14" height="10" rx="3" fill={color} />
      ))}
    </svg>
  );
}

export function ArbustoSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="52" r="34" fill="#4a7c4e" />
      <circle cx="35" cy="42" r="22" fill="#5a9e60" />
      <circle cx="65" cy="42" r="22" fill="#5a9e60" />
      <circle cx="50" cy="32" r="20" fill="#6bbf72" />
      <rect x="46" y="80" width="8" height="14" rx="2" fill="#8b5e3c" />
    </svg>
  );
}

export function PuffSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <ellipse cx="50" cy="55" rx="38" ry="28" fill="#c8a882" stroke="#8b6944" strokeWidth="2" />
      <ellipse cx="50" cy="48" rx="34" ry="22" fill="#ddc4a0" stroke="#8b6944" strokeWidth="2" />
      <ellipse cx="50" cy="44" rx="30" ry="18" fill="#e8d5b7" />
    </svg>
  );
}

export function PuffQuadSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="10" fill="#1a1a1a" stroke="#444" strokeWidth="2.5" />
      <rect x="14" y="14" width="72" height="72" rx="8" fill="#222" stroke="#333" strokeWidth="1" />
      {/* Tufting button */}
      <circle cx="50" cy="50" r="5" fill="#111" stroke="#555" strokeWidth="1.5" />
      {/* Tufting lines */}
      <line x1="50" y1="14" x2="50" y2="45" stroke="#333" strokeWidth="1" />
      <line x1="50" y1="55" x2="50" y2="86" stroke="#333" strokeWidth="1" />
      <line x1="14" y1="50" x2="45" y2="50" stroke="#333" strokeWidth="1" />
      <line x1="55" y1="50" x2="86" y2="50" stroke="#333" strokeWidth="1" />
    </svg>
  );
}

export function PuffRondSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="52" cy="53" r="36" fill="#0a0a0a" opacity="0.25" />
      <circle cx="50" cy="50" r="36" fill="#1a1a1a" stroke="#444" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="28" fill="#222" stroke="#333" strokeWidth="1" />
      <circle cx="50" cy="50" r="5" fill="#111" stroke="#555" strokeWidth="1.5" />
    </svg>
  );
}

export function MesaApoioSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="52" cy="53" r="34" fill="#0a0a0a" opacity="0.12" />
      <circle cx="50" cy="50" r="34" fill="#d9b88f" stroke="#a97e51" strokeWidth="3" />
      <circle cx="50" cy="50" r="27" fill="#e6c9a3" stroke="#c19a6b" strokeWidth="1" />
    </svg>
  );
}

export function PalcoSvg() {
  return (
    <svg viewBox="0 0 160 80" className="w-full h-full">
      <rect x="5" y="5" width="150" height="70" rx="4" fill="#f0f0f0" stroke="#555" strokeWidth="2" />
      <text x="80" y="48" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#555">PALCO</text>
      {[15, 30, 45, 60, 75, 90, 105, 120, 135, 150].map((x, i) => (
        <line key={i} x1={x} y1="5" x2={x} y2="75" stroke="#bbb" strokeWidth="1" />
      ))}
    </svg>
  );
}

export function BarSvg() {
  return (
    <svg viewBox="0 0 130 70" className="w-full h-full">
      <rect x="5" y="5" width="120" height="60" rx="4" fill="#3d2b1a" stroke="#8b6944" strokeWidth="2" />
      <rect x="5" y="5" width="120" height="18" rx="4" fill="#5c3d20" />
      <text x="65" y="46" textAnchor="middle" fontSize="18" fontWeight="bold" fill="white">BAR</text>
    </svg>
  );
}

export function WcSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="10" y="40" width="80" height="50" rx="8" fill="#e8e8e8" stroke="#888" strokeWidth="2" />
      <rect x="20" y="35" width="60" height="20" rx="4" fill="#d0d0d0" stroke="#888" strokeWidth="2" />
      <text x="50" y="75" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#555">WC</text>
      <circle cx="50" cy="22" r="14" fill="#e8e8e8" stroke="#888" strokeWidth="2" />
    </svg>
  );
}

export function SofaChesterfieldSvg() {
  return (
    <svg viewBox="0 0 220 85" className="w-full h-full">
      {/* Left arm */}
      <rect x="3" y="10" width="24" height="72" rx="8" fill="#111" stroke="#333" strokeWidth="2" />
      <rect x="3" y="10" width="24" height="26" rx="8" fill="#1c1c1c" />
      {/* Right arm */}
      <rect x="193" y="10" width="24" height="72" rx="8" fill="#111" stroke="#333" strokeWidth="2" />
      <rect x="193" y="10" width="24" height="26" rx="8" fill="#1c1c1c" />
      {/* Back */}
      <rect x="24" y="3" width="172" height="40" rx="6" fill="#111" stroke="#333" strokeWidth="2" />
      {/* Back tufting buttons */}
      {[50, 79, 110, 141, 170].map((x, i) => (
        <circle key={i} cx={x} cy="23" r="4" fill="#1c1c1c" stroke="#444" strokeWidth="1" />
      ))}
      {/* Seat */}
      <rect x="24" y="40" width="172" height="42" rx="4" fill="#141414" stroke="#333" strokeWidth="2" />
      {/* Cushion dividers */}
      <line x1="81" y1="40" x2="81" y2="82" stroke="#222" strokeWidth="2" />
      <line x1="139" y1="40" x2="139" y2="82" stroke="#222" strokeWidth="2" />
      {/* Feet */}
      <rect x="30" y="78" width="8" height="7" rx="2" fill="#333" />
      <rect x="92" y="78" width="8" height="7" rx="2" fill="#333" />
      <rect x="120" y="78" width="8" height="7" rx="2" fill="#333" />
      <rect x="182" y="78" width="8" height="7" rx="2" fill="#333" />
    </svg>
  );
}

export function AparadorASvg() {
  return (
    <svg viewBox="0 0 220 40" className="w-full h-full">
      <rect x="2" y="2" width="216" height="36" rx="4" fill="#1e1e1e" stroke="#555" strokeWidth="2" />
      <rect x="2" y="2" width="216" height="10" rx="4" fill="#2d2d2d" />
      <rect x="6" y="14" width="98" height="20" rx="2" fill="#141414" stroke="#444" strokeWidth="1" />
      <rect x="108" y="14" width="106" height="20" rx="2" fill="#141414" stroke="#444" strokeWidth="1" />
      <line x1="36" y1="22" x2="66" y2="22" stroke="#777" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="148" y1="22" x2="178" y2="22" stroke="#777" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="5" y="34" width="5" height="5" rx="1" fill="#555" />
      <rect x="210" y="34" width="5" height="5" rx="1" fill="#555" />
    </svg>
  );
}

export function AparadorBSvg() {
  return (
    <svg viewBox="0 0 160 45" className="w-full h-full">
      <rect x="2" y="2" width="156" height="41" rx="4" fill="#1e1e1e" stroke="#555" strokeWidth="2" />
      <rect x="2" y="2" width="156" height="10" rx="4" fill="#2d2d2d" />
      <rect x="6" y="14" width="70" height="23" rx="2" fill="#141414" stroke="#444" strokeWidth="1" />
      <rect x="80" y="14" width="70" height="23" rx="2" fill="#141414" stroke="#444" strokeWidth="1" />
      <line x1="26" y1="24" x2="52" y2="24" stroke="#777" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="100" y1="24" x2="126" y2="24" stroke="#777" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="5" y="38" width="5" height="5" rx="1" fill="#555" />
      <rect x="150" y="38" width="5" height="5" rx="1" fill="#555" />
    </svg>
  );
}

export function MesaDjSvg() {
  return (
    <svg viewBox="0 0 170 95" className="w-full h-full">
      <rect x="3" y="3" width="164" height="89" rx="5" fill="#111" stroke="#444" strokeWidth="2" />
      <rect x="3" y="3" width="164" height="16" rx="5" fill="#1e1e1e" />
      <text x="85" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#666" fontFamily="monospace">DJ BOOTH</text>
      {/* Left deck */}
      <rect x="10" y="22" width="62" height="62" rx="4" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" />
      <circle cx="41" cy="53" r="22" fill="#0d0d0d" stroke="#555" strokeWidth="1.5" />
      <circle cx="41" cy="53" r="9" fill="#1a1a1a" />
      <circle cx="41" cy="53" r="2.5" fill="#888" />
      {/* Right deck */}
      <rect x="98" y="22" width="62" height="62" rx="4" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" />
      <circle cx="129" cy="53" r="22" fill="#0d0d0d" stroke="#555" strokeWidth="1.5" />
      <circle cx="129" cy="53" r="9" fill="#1a1a1a" />
      <circle cx="129" cy="53" r="2.5" fill="#888" />
      {/* Mixer */}
      <rect x="76" y="26" width="18" height="56" rx="3" fill="#1a1a1a" stroke="#444" strokeWidth="1" />
      <rect x="79" y="31" width="5" height="20" rx="2" fill="#2a2a2a" />
      <rect x="86" y="31" width="5" height="20" rx="2" fill="#2a2a2a" />
      {[39, 50, 61].map((y, i) => (
        <circle key={i} cx="85" cy={y} r="3" fill="#ff3030" opacity="0.85" />
      ))}
    </svg>
  );
}

export const ELEMENT_ICONS: Record<string, React.ReactNode> = {
  mesa_6:       <TableSvg chairs={6} />,
  mesa_10:      <TableSvg chairs={10} />,
  mesa_ret:     <RectTableSvg />,
  arbusto:      <ArbustoSvg />,
  puff:         <PuffSvg />,
  palco:        <PalcoSvg />,
  bar:          <BarSvg />,
  wc:           <WcSvg />,
  bistro_5:     <BistroTableSvg chairs={5} />,
  bistro_3:     <BistroTableSvg chairs={3} />,
  puff_quad:    <PuffQuadSvg />,
  puff_rond:    <PuffRondSvg />,
  sofa_chester: <SofaChesterfieldSvg />,
  aparador_a:   <AparadorASvg />,
  aparador_b:   <AparadorBSvg />,
  mesa_apoio:   <MesaApoioSvg />,
  mesa_dj:      <MesaDjSvg />,
};
