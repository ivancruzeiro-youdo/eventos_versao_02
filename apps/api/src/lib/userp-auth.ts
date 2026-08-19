import { prisma } from '../server.js';

// Cache ÚNICO e compartilhado do token Userp — existiam 4 cópias independentes desta função
// (admin.ts, sync-events.ts, degustacoes.ts, acessos.ts), cada uma logando na Userp por conta
// própria e cacheando (ou nem isso — admin.ts logava a cada chamada) separadamente. A Userp só
// mantém uma sessão ativa por conta: um login feito por uma cópia invalidava o token que outra
// cópia ainda achava válido, causando 401 intermitente sem relação nenhuma com credencial errada
// (foi exatamente o que quebrou GET /acessos/externos com "listAcessos failed: 401" — o token
// que acessos.ts tinha cacheado morreu porque outra parte do sistema logou de novo depois).
let cachedToken: string | null = null;
let cachedBaseUrl: string | null = null;
let tokenExpiresAt = 0;

export async function getUserpToken(): Promise<{ token: string; baseUrl: string }> {
  if (cachedToken && cachedBaseUrl && Date.now() < tokenExpiresAt) {
    return { token: cachedToken, baseUrl: cachedBaseUrl };
  }

  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const baseUrl = map['userpBaseUrl'] || '';
  const email = map['userpEmail'] || '';
  const senha = map['userpSenha'] || '';
  if (!baseUrl || !email || !senha) throw new Error('Credenciais Userp não configuradas.');

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
