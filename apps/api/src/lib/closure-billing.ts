// Monta a descrição (cobra_obs) e o total (cobra_valor) enviados no check-out da Userp —
// une o excedente de A&B (checkins > contratado) com os itens avulsos a cobrar (quebrados,
// danificados, taxas extra) cadastrados no encerramento. Usado tanto pelo registro do
// check-out (userp-checkin.ts) quanto pela tela de relatório, pra sempre mostrar o mesmo total
// que de fato foi (ou será) enviado à Userp.
export interface ClosureBillingInput {
  itensQuebrados?: string | null;
  abExcessQty?: number | null;
  abExcessUnitValue?: number | null;
  charges?: { description: string; unitValue: number; quantity: number }[];
}

export interface ClosureBillingResult {
  obs: string;
  valor: number;
}

function fmtBrl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function computeClosureBilling(closure: ClosureBillingInput): ClosureBillingResult {
  const lines: string[] = [];
  let total = 0;

  if (closure.abExcessQty && closure.abExcessUnitValue) {
    const subtotal = closure.abExcessQty * closure.abExcessUnitValue;
    total += subtotal;
    lines.push(
      `A&B excedente: ${closure.abExcessQty} pessoa(s) x R$ ${fmtBrl(closure.abExcessUnitValue)} = R$ ${fmtBrl(subtotal)}`
    );
  }

  for (const c of closure.charges ?? []) {
    const subtotal = c.unitValue * c.quantity;
    total += subtotal;
    lines.push(`${c.description}: ${c.quantity} x R$ ${fmtBrl(c.unitValue)} = R$ ${fmtBrl(subtotal)}`);
  }

  // Observação livre do operador (itens quebrados sem valor definido, contexto geral) sempre
  // por último — os itens COM valor já aparecem detalhados acima com o cálculo.
  if (closure.itensQuebrados?.trim()) {
    lines.push(closure.itensQuebrados.trim());
  }

  return { obs: lines.join('\n'), valor: Math.round(total * 100) / 100 };
}
