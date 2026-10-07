// Estoque de itens do layout quando o evento tem mais de um espaço: o que cada espaço possui
// é somado num único saldo, e qualquer layout do evento pode usar o total. Mesmo critério do
// cadastro do espaço: tipo ausente = ilimitado, 0 = bloqueado — então basta UM espaço
// ilimitado pra um tipo ficar ilimitado no total; senão é a soma dos limites de cada espaço.
export function sumLayoutStock(
  venues: { layoutStock: Record<string, number> | null }[]
): Record<string, number> {
  if (venues.length === 0) return {};
  const types = new Set<string>();
  for (const v of venues) for (const t of Object.keys(v.layoutStock ?? {})) types.add(t);

  const total: Record<string, number> = {};
  for (const type of types) {
    if (venues.some(v => (v.layoutStock ?? {})[type] === undefined)) continue;
    total[type] = venues.reduce((sum, v) => sum + (v.layoutStock![type] ?? 0), 0);
  }
  return total;
}
