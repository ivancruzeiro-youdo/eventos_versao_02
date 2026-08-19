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
