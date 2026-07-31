# Guia do desenvolvedor — servidor e sistema online (apps/api + apps/web)

Este guia é sobre o **backend (API) e o site (web)** — o monorepo Node/TypeScript que
roda em produção em `eventos.youdobrasil.com.br`. Para o app Windows do painel de LED,
veja [`desktop/led-controller/README.md`](desktop/led-controller/README.md). Para o
passo a passo de deploy em produção, veja [`DEPLOY.md`](DEPLOY.md) — este guia aqui é
sobre **rodar localmente e evoluir o código**, não sobre subir pro servidor.

## 1. Visão geral do monorepo

```
apps/
  api/            — backend Fastify (Node + TypeScript), porta 3001
  web/            — frontend Next.js 14, porta 3000
desktop/
  led-controller/ — app Windows (.NET/WPF) do painel de LED — guia próprio
packages/
  db/             — schema Prisma, migrations, seed — pacote @youdo/db
  shared/         — tipos/utils TypeScript compartilhados — pacote @youdo/shared
  config/         — presets de ESLint/TypeScript compartilhados
docker/           — compose files (dev: só infra; prod: stack completo + nginx)
DEPLOY.md         — guia de deploy manual em produção (EC2 via SSH)
```

Gerenciado com **pnpm workspaces + Turborepo** (`turbo.json`) — cada comando do
`package.json` da raiz (`build`, `dev`, `lint`, `typecheck`, `test`, `db:*`) delega pro
Turbo, que roda a task equivalente em cada app/pacote.

## 2. Rodando localmente

Pré-requisitos: Node ≥ 18, pnpm, Docker (só pra subir Postgres/Redis locais).

```bash
pnpm install

# sobe só a infra (Postgres + Redis + pgAdmin) via docker/docker-compose.yml
docker compose -f docker/docker-compose.yml up -d

cp .env.example .env   # preencha DATABASE_URL, JWT_SECRET, AWS_*, etc.

pnpm db:generate       # gera o Prisma Client
pnpm db:migrate        # aplica as migrations (prisma migrate dev)
pnpm db:seed           # cria employer/usuários/times de exemplo

pnpm dev               # roda api (porta 3001) + web (porta 3000) juntos via turbo
```

`pnpm db:studio` abre o Prisma Studio pra inspecionar/editar dados direto no banco.

### Variáveis de ambiente (`.env` na raiz)

Só existe um `.env.example`, na raiz — não tem `.env` separado por app. Categorias:

- **Banco**: `DATABASE_URL` (Postgres)
- **Cache/fila**: `REDIS_URL`
- **Auth**: `JWT_SECRET`
- **Integrações externas**: SSO Hub (`SSO_HUB_*`), UERP (`UERP_API_*`), Acessos
  (`ACESSOS_API_*`)
- **Storage**: AWS S3 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) — usado
  pra upload de mídia/arquivos (presigned URLs)
- **Notificações**: Twilio WhatsApp (`TWILIO_*`), Resend e-mail (`RESEND_API_KEY`)
- **Observabilidade**: `SENTRY_DSN`
- **URLs**: `NEXT_PUBLIC_API_URL`, `WEB_URL`, `API_URL`
- `NODE_ENV`, `PORT`

## 3. Banco de dados (Prisma)

- Schema: `packages/db/prisma/schema.prisma`
- Migrations: `packages/db/prisma/migrations/` (histórico completo, uma pasta por
  migration)
- Seed: `packages/db/prisma/seed.ts` — cria um employer padrão ("YOUDO Brasil"), usuários
  admin/event_owner/operator, freelancers de exemplo e os times padrão (Cozinha, Salão,
  Bar, Montagem...)
- Outros scripts utilitários (`import-legacy.ts`, `import-candidaturas.ts`, etc.) também
  vivem em `packages/db/prisma/` — one-off, não fazem parte do fluxo normal de dev

**Fluxo pra alterar o schema:**
1. Edite `schema.prisma`
2. `pnpm db:migrate` (roda `prisma migrate dev`, cria a migration e aplica local)
3. `pnpm db:generate` se precisar regenerar o client manualmente (o migrate já faz isso)
4. Commit tanto o `schema.prisma` quanto a pasta nova em `migrations/`

Em produção, migrations são aplicadas com `prisma migrate deploy` (não `migrate dev`) —
isso já está encapsulado no fluxo de deploy, ver `DEPLOY.md`.

## 4. Autenticação — dois sistemas distintos

- **Usuários humanos** (admin, operador, freelancer, recepção): JWT em cookie
  (`@fastify/jwt` + `@fastify/cookie`). Login por e-mail+CPF pra freelancer/recepção
  (`apps/api/src/routes/auth.ts`); o middleware `requireAuth`
  (`apps/api/src/middleware/auth.ts`) lê o cookie `token`, valida o JWT e busca o
  `User` ou `Freelancer` correspondente.
- **Dispositivos** (o painel de LED, por enquanto): JWT de longa duração no header
  `x-device-auth`, sem cookie — ver `apps/api/src/routes/devices.ts`. Pareamento via
  código de 6 dígitos, sem senha.

Se for adicionar um novo tipo de "ator" no sistema (outro tipo de dispositivo, uma
integração externa, etc.), decida logo se ele se autentica como usuário (cookie) ou
como um cliente machine-to-machine (header token) — são caminhos de código separados.

## 5. Onde mexer pra adicionar uma feature

- **Nova rota de API**: crie um arquivo em `apps/api/src/routes/`, exporte uma função
  `xRoutes(app: FastifyInstance)`, registre em `apps/api/src/server.ts` com
  `app.register(xRoutes, { prefix: '/api/v2/...' })` (siga o padrão dos ~30 registros
  já existentes ali).
- **Nova página/módulo no site**: `apps/web/src/app/<nome>` (App Router do Next.js).
  Módulos existentes hoje: admin, checkin, client, cozinha, dashboard, events,
  fornecedores, freelancer, freelancers, login, nps, people, reports, rsvp, venues.
- **Tipos/lógica compartilhada entre api e web**: `packages/shared`.

## 6. Testes

`vitest` já está configurado em `apps/api` e `apps/web` (`"test": "vitest run
--passWithNoTests"`), mas **não existe nenhum teste escrito ainda** — é só o
scaffolding. Se for começar a escrever testes, esse é o runner já plugado, sem
configuração adicional necessária.

## 7. CI/CD

- `.github/workflows/ci.yml`: roda em PR/push pra `main` — install, lint, typecheck,
  `db:generate` (valida o schema Prisma), testes da API com um container Postgres de
  serviço.
- `.github/workflows/cd.yml`: **deploy automático a cada push em `main`** — conecta via
  SSH no servidor EC2 (`54.161.207.19`) e faz o pull + rebuild. Ou seja, **qualquer
  merge em `main` já vai pra produção sozinho** — não existe um passo de aprovação
  manual no meio. Cuidado extra com o que é mergeado em `main`.
- Deploy manual (caso o CD falhe ou pra situações especiais): passo a passo completo em
  `DEPLOY.md` (acesso SSH, estrutura de pastas no servidor, `docker/.env.production`,
  docker compose de produção com nginx).

## 8. Convenção de commits

Sem `CONTRIBUTING.md` formal, mas o histórico é consistente: mensagens em português,
prefixadas por tipo no estilo Conventional Commits — `feat:`, `fix:`, `chore:` — seguido
de descrição livre. Ex.: `feat: Fase 2 do subsistema de mídia — upload/gestão de
EventMediaAsset`, `fix: ciclo infinito de detecção de remoção de contrato secundário`.
Siga esse padrão.

## 9. Pontas soltas conhecidas (bom ponto de partida pra evoluir)

- **Painel de LED — auto-update do app Windows**: implementado (`GET
  /api/v2/devices/latest-version` + página "Sistemas → Downloads" +
  `Services/UpdateService.cs` no app). Checklist de release em
  `desktop/led-controller/README.md`.
- **Spotify (Fase 3 do painel de LED)**: em andamento — ver plano/implementação mais
  recente para o desenho completo (conexão por espaço via OAuth, playlist por evento,
  Web Playback SDK via WebView2).
- **Testes**: scaffolding pronto, zero cobertura — qualquer feature nova é uma boa
  oportunidade de começar a escrever os primeiros testes reais.
