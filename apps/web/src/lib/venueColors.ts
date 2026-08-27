import type { CSSProperties } from 'react';

// Paleta pré-selecionada pras cores de local no calendário — cores bem distintas entre si e
// contra o branco/cinza de fundo do chip, pra funcionar como borda fina sem lavar.
export const VENUE_COLOR_PRESETS = [
  '#ef4444', // vermelho
  '#f97316', // laranja
  '#f59e0b', // âmbar
  '#eab308', // amarelo
  '#84cc16', // lima
  '#22c55e', // verde
  '#10b981', // esmeralda
  '#14b8a6', // teal
  '#06b6d4', // ciano
  '#3b82f6', // azul
  '#6366f1', // índigo
  '#8b5cf6', // violeta
  '#a855f7', // roxo
  '#d946ef', // fúcsia
  '#ec4899', // rosa
  '#64748b', // slate
] as const;

/** Borda do evento no calendário: uma cor sólida com 1 local, dividida em faixas iguais com
 *  2+ locais (evento multi-espaço no mesmo contrato). Sem cor nenhuma, sem borda especial. */
export function venueBorderStyle(colors: string[]): CSSProperties {
  const unique = [...new Set(colors.filter(Boolean))];
  if (unique.length === 0) return {};
  if (unique.length === 1) {
    return { borderWidth: 2, borderStyle: 'solid', borderColor: unique[0] };
  }
  const stops = unique
    .map((c, i) => `${c} ${(i * 100) / unique.length}% ${((i + 1) * 100) / unique.length}%`)
    .join(', ');
  return {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderImageSource: `linear-gradient(90deg, ${stops})`,
    borderImageSlice: 1,
  } as CSSProperties;
}
