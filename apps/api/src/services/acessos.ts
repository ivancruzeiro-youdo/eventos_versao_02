const BASE_URL = process.env.ACESSOS_API_URL || 'https://acessos.youdobrasil.com.br';
const API_EMAIL = process.env.ACESSOS_API_EMAIL || '';
const API_PASSWORD = process.env.ACESSOS_API_PASSWORD || '';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: API_EMAIL, password: API_PASSWORD }),
  });

  if (!res.ok) throw new Error(`Acessos auth failed: ${res.status}`);

  const data = (await res.json()) as { token: string };
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000; // 23h (token válido 24h)
  return cachedToken;
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
  if (!res.ok) throw new Error(`Acessos listAcessos failed: ${res.status}`);
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
