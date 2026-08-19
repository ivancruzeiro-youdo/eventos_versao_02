import { getUserpLoginToken } from '../lib/userp-auth.js';

const BASE_URL = process.env.ACESSOS_API_URL || 'https://acessos.youdobrasil.com.br';

async function getToken(): Promise<string> {
  // A API de Acessos valida o Bearer chamando de volta `verify-token/index.php` na Userp, e
  // esse endpoint SÓ aceita token emitido por `login/index.php` (tabela tb_token_login) — o
  // token de `auth/token.php` (tabela tb_token, usado por sync-events/degustacoes/admin pra
  // falar com o resto da Userp) é rejeitado por ele, sempre, mesmo recém-emitido. Confirmado
  // via doc oficial + teste ponta a ponta: são dois pools de token completamente separados.
  return getUserpLoginToken();
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
