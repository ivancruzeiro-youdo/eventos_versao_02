import { prisma } from '../server.js';

// Cache ÚNICO e compartilhado do token Userp — existiam 4 cópias independentes desta função
// (admin.ts, sync-events.ts, degustacoes.ts, acessos.ts), cada uma logando na Userp por conta
// própria e cacheando (ou nem isso — admin.ts logava a cada chamada) separadamente. A Userp só
// mantém uma sessão ativa por conta: um login feito por uma cópia invalidava o token que outra
// cópia ainda achava válido, causando 401 intermitente sem relação nenhuma com credencial errada.

async function getUserpCredentials(): Promise<{ baseUrl: string; email: string; senha: string }> {
  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const baseUrl = map['userpBaseUrl'] || '';
  const email = map['userpEmail'] || '';
  const senha = map['userpSenha'] || '';
  if (!baseUrl || !email || !senha) throw new Error('Credenciais Userp não configuradas.');
  return { baseUrl, email, senha };
}

let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;
let tokenExpiresAt = 0;

/** Token de `/auth/token.php` (tabela tb_token, ~30min) — usado pra chamar os demais endpoints
 *  da Userp (contratos, entidades). NÃO serve pra Acessos: ver getUserpLoginToken() abaixo. */
export async function getUserpToken(): Promise<{ token: string; baseUrl: string }> {
  if (cachedToken && cachedBaseUrl && Date.now() < tokenExpiresAt) {
    return { token: cachedToken, baseUrl: cachedBaseUrl };
  }

  const { baseUrl, email, senha } = await getUserpCredentials();
  const res = await fetch(`${baseUrl}/api/userp-satelite/auth/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error('Falha na autenticação Userp.');
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Token não retornado pelo Userp.');

  cachedToken = data.access_token;
  cachedBaseUrl = baseUrl;
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000; // renovar antes de expirar
  return { token: cachedToken as string, baseUrl };
}

function invalidateUserpToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/**
 * fetch autenticado com o token de `/auth/token.php`, com 1 retry automático em 401. A Userp só
 * mantém uma sessão ativa por conta — qualquer login concorrente na mesma conta (outra chamada
 * nossa, um script de diagnóstico, o que for) invalida o token cacheado, e sem isso esse 401
 * vazava pro usuário como se fosse um erro real (já aconteceu com a API de Acessos, e de novo
 * na busca de entidade — não é a credencial, é a sessão única sendo disputada). `path` é
 * relativo à base da Userp, ex. `/api/userp-satelite/entidades/index.php?id=123`.
 */
export async function userpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const first = await getUserpToken();
  const call = (token: string) => fetch(`${first.baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });

  let res = await call(first.token);
  if (res.status === 401) {
    invalidateUserpToken();
    const retried = await getUserpToken();
    res = await call(retried.token);
  }
  return res;
}

let cachedLoginToken: string | null = null;
let loginTokenExpiresAt = 0;

/**
 * Token de `/login/index.php` (tabela tb_token_login, 24h) — é o ÚNICO tipo de token que
 * `/verify-token/index.php` aceita, e é isso que a API de Acessos usa pra validar o Bearer
 * (authMiddlewareFlexivel, ec2-api/src/middleware/auth.js). Confirmado por doc oficial: token
 * de `/auth/token.php` (tb_token) e este (tb_token_login) são pools completamente separados —
 * um não serve pro verificador do outro, não é questão de expiração.
 */
export async function getUserpLoginToken(): Promise<string> {
  if (cachedLoginToken && Date.now() < loginTokenExpiresAt) return cachedLoginToken;

  const { baseUrl, email, senha } = await getUserpCredentials();
  const res = await fetch(`${baseUrl}/api/userp-satelite/login/index.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error('Falha na autenticação Userp (login).');
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Token não retornado pelo Userp (login).');

  cachedLoginToken = data.access_token;
  loginTokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000; // token dura 24h, renova antes
  return cachedLoginToken as string;
}

/**
 * Valida um token EMITIDO PELA USERP chamando de volta `verify-token/index.php` — o mesmo
 * mecanismo que a própria API de Acessos usa pra confirmar o Bearer que a gente envia pra ela
 * (ver comentário de getUserpLoginToken acima: é a Userp quem confirma, não a Acessos sozinha).
 * Usado pra validar tokens que sistemas EXTERNOS (ex.: chat) recebem da Userp e nos enviam,
 * sem precisar de login/JWT nosso — o token da Userp É a credencial.
 */
export async function verifyUserpToken(token: string): Promise<{ valid: boolean; user?: { tipo: string; codigo: string | number } }> {
  const { baseUrl } = await getUserpCredentials();
  const res = await fetch(`${baseUrl}/api/userp-satelite/verify-token/index.php`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { valid: false };
  const data: any = await res.json().catch(() => null);
  return data?.valid ? { valid: true, user: data.user } : { valid: false };
}
