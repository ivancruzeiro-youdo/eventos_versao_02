import { userpFetch } from './userp-auth.js';

// Status de uma simulação da Userp (GET /simulacoes/index.php). O endpoint só filtra por lead_id
// ou e-mail — não por contrato/sim_id —, então a ponte é o e-mail de quem pediu a simulação
// (contracts-details → main.simulacao_feita_para.email). Medido em produção: lead_id da entidade
// volta vazio; o e-mail acha a simulação.
export interface UserpSimulation {
  id: number;
  numero: string | null;
  cancelada: boolean;
  canceladaEm: string | null;
  anulada: boolean;
  anuladaEm: string | null;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; sims: Map<number, UserpSimulation> }>();

// Mesmo e-mail é consultado a cada abertura de evento — 5 min de cache evita repetir a chamada.
// `null` = falha na consulta (inconclusivo), nunca interpretado como "simulação ok".
async function simulationsByEmail(email: string): Promise<Map<number, UserpSimulation> | null> {
  const hit = cache.get(email);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sims;

  const sims = new Map<number, UserpSimulation>();
  let start = 0;
  try {
    while (true) {
      const res = await userpFetch(
        `/api/userp-satelite/simulacoes/index.php?email=${encodeURIComponent(email)}&start=${start}&limit=2000`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data?.success) return null;
      for (const s of data.items || []) {
        sims.set(Number(s.id), {
          id: Number(s.id),
          numero: s.sim_numero ?? null,
          cancelada: String(s.sim_cancelada) === '1',
          canceladaEm: s.sim_cancelada_dt ?? null,
          anulada: String(s.sim_anulada) === '1',
          anuladaEm: s.sim_anulada_dt ?? null,
        });
      }
      if (!data.has_more || (data.items || []).length === 0) break;
      start = data.next_start ?? start + 2000;
    }
  } catch {
    return null;
  }
  cache.set(email, { at: Date.now(), sims });
  return sims;
}

export function collectSimulationEmails(...contracts: any[]): string[] {
  const out = new Set<string>();
  for (const c of contracts) {
    if (!c) continue;
    for (const e of [c.simulacao_feita_para?.email, c.cliente_info?.enderecoemail, c.cliente_info?.email, c.representante_legal?.email]) {
      if (typeof e === 'string' && e.trim()) out.add(e.trim());
    }
  }
  return [...out];
}

// Acha cada sim_id pedido consultando os e-mails candidatos em ordem, parando quando todos
// foram achados. Simulação não encontrada fica de fora do mapa (desconhecida — o chamador cai
// no critério antigo, não conclui nada).
export async function lookupSimulations(simIds: number[], emails: string[]): Promise<Map<number, UserpSimulation>> {
  const wanted = new Set(simIds.filter(n => Number.isFinite(n) && n > 0));
  const found = new Map<number, UserpSimulation>();
  for (const email of emails) {
    if (found.size === wanted.size) break;
    const sims = await simulationsByEmail(email);
    if (!sims) continue;
    for (const id of wanted) {
      const s = sims.get(id);
      if (s && !found.has(id)) found.set(id, s);
    }
  }
  return found;
}
