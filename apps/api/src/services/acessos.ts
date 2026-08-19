import { getUserpToken } from '../lib/userp-auth.js';

const BASE_URL = process.env.ACESSOS_API_URL || 'https://acessos.youdobrasil.com.br';

async function getToken(): Promise<string> {
  // Mesmo cache compartilhado usado por toda chamada à Userp neste backend — antes esta função
  // tinha sua PRÓPRIA cópia de login+cache, e havia mais 3 outras (admin.ts, sync-events.ts,
  // degustacoes.ts) fazendo a mesma coisa de forma independente. Como a Userp só mantém uma
  // sessão ativa por conta, um login feito por qualquer uma delas invalidava o token que as
  // outras ainda achavam válido — causa raiz de 401 intermitente aqui mesmo (GET /acessos
  // funcionando ou não dependia de qual dessas quatro tinha logado por último).
  const { token } = await getUserpToken();
  return token;
}

export type AcessoInput = {
  acesso_id: string;
  data_inicio?: string;
  data_fim?: string;
};

export type GrantAccessParams = {
  nome: string;
  cpf: string;
  foto_base64?: string;
  acessos: AcessoInput[];
};

export type GrantAccessResult = {
  id: string;
  acao: 'criado' | 'atualizado';
};

export async function listAcessos(): Promise<{ id: string; nome: string; empreendimento: string }[]> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/acessos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Acessos listAcessos failed: ${res.status} — ${body}`);
  }
  const data = (await res.json()) as any[];
  return data.map((a) => ({
    id: a.id,
    nome: a.nome,
    empreendimento: a.empreendimentos?.nome ?? '',
  }));
}

export async function grantAccess(params: GrantAccessParams): Promise<GrantAccessResult> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/fornecedores`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Acessos grantAccess failed: ${res.status} — ${body}`);
  }
  return res.json() as Promise<GrantAccessResult>;
}

export async function revokeAccess(acessoExternoId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/fornecedores/${acessoExternoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Acessos revokeAccess failed: ${res.status}`);
  }
}

export async function syncLeitores(acessoExternoId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/api/fornecedores/${acessoExternoId}/sync-leitores`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Acessos syncLeitores failed: ${res.status}`);
}
