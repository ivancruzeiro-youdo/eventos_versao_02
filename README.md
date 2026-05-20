# YOUDO Experience v2.0

Sistema de gestão de eventos - Refatoração completa da plataforma YOUDO Brasil.

## Stack Tecnológica

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Fastify + TypeScript + Prisma
- **Banco de Dados**: PostgreSQL 16
- **Cache/Filas**: Redis 7 + BullMQ
- **Infra**: Docker + GitHub Actions CI/CD

## Estrutura do Monorepo

```
youdo-v2/
├── apps/
│   ├── web/          # Next.js 14 - Frontend
│   └── api/          # Fastify - API REST
├── packages/
│   ├── db/           # Prisma schema + migrations
│   ├── shared/       # Tipos TypeScript compartilhados
│   └── config/       # ESLint + tsconfig base
├── docker/
│   └── docker-compose.yml
└── .github/
    └── workflows/    # CI/CD
```

## Setup de Desenvolvimento

Você tem **duas opções** para rodar o sistema:

### Opção 1: Modo Híbrido (Recomendado para Dev) - Banco em Docker, Apps locais

#### 1. Iniciar apenas Banco de Dados

```bash
cd docker
docker-compose up -d
```

Isso inicia:
- PostgreSQL na porta 5432
- Redis na porta 6379
- pgAdmin na porta 5050

#### 2. Configurar e Rodar Apps Localmente

```bash
# Copiar .env
cp .env.example .env

# Instalar dependências
npm install -g pnpm
pnpm install

# Setup banco de dados
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# Terminal 1 - API (com hot reload)
pnpm dev:api

# Terminal 2 - Web (com hot reload)
pnpm dev:web
```

**Vantagens**: Hot reload mais rápido, debugging mais fácil

---

### Opção 2: Full Docker (Recomendado para consistência de ambiente)

```bash
cd docker

# Modo desenvolvimento (com hot reload)
docker-compose -f docker-compose.dev.yml up -d

# Ou modo produção (build otimizado)
docker-compose -f docker-compose.prod.yml up -d
```

Isso inicia **tudo em containers**:
- PostgreSQL: porta 5432
- Redis: porta 6379
- pgAdmin: porta 5050
- API: porta 3001
- Web: porta 3000
- Nginx: porta 80 (proxy reverso)

**Vantagens**: Ambiente idêntico à produção, sem dependências locais

---

### Acessos

| Serviço | URL | Docker | Local |
|---------|-----|--------|-------|
| Frontend | http://localhost:3000 | ✅ | ✅ |
| API | http://localhost:3001 | ✅ | ✅ |
| API Docs | http://localhost:3001/documentation | ✅ | ✅ |
| pgAdmin | http://localhost:5050 | ✅ | ✅ |
| Nginx | http://localhost | ✅ | ❌ |

## Comandos Disponíveis

```bash
# Desenvolvimento
pnpm dev              # Inicia todos os apps em dev mode
pnpm dev:api         # Apenas API
pnpm dev:web         # Apenas Web

# Build
pnpm build           # Build de todos os apps

# Qualidade de Código
pnpm lint            # ESLint em todos os pacotes
pnpm typecheck       # TypeScript check

# Banco de Dados
pnpm db:generate     # Gerar cliente Prisma
pnpm db:migrate      # Rodar migrações
pnpm db:studio       # Abrir Prisma Studio

# Testes
pnpm test            # Rodar testes
```

## Módulos do Sistema

- **Gestão de Eventos**: CRUD completo com máquina de estados
- **Convidados**: RSVP, QR Code, Check-in offline
- **Freelancers**: Portal de vagas e candidaturas
- **Planos e Briefings**: Templates dinâmicos
- **NPS**: Coleta automática pós-evento
- **Notificações**: WhatsApp (Twilio) + Email (Resend)
- **Auditoria**: Log completo de todas as ações

## Autenticação

- **Employer/Admin/Operator**: SSO via hub.youdobrasil.com.br
- **Freelancer**: Email + CPF (CPF é identificador, não senha)
- **JWT**: Cookie httpOnly com expiração (24h employer, 7d freelancer)

## Documentação da API

A documentação OpenAPI está disponível em `/documentation` quando o servidor está rodando.

Principais endpoints:

| Módulo | Endpoint |
|--------|----------|
| Auth | `/api/v2/auth/*` |
| Eventos | `/api/v2/events/*` |
| Convidados | `/api/v2/guests/*`, `/api/v2/rsvp/*` |
| Freelancers | `/api/v2/freelancer/*` |
| Planos | `/api/v2/plans/*` |
| NPS | `/api/v2/nps/*` |
| Admin | `/api/v2/admin/*` |

## Roadmap

Ver [YOUDO_v2_Documentacao_Projeto.md](./YOUDO_v2_Documentacao_Projeto.md) para o roadmap completo de 12 semanas.

### Fases:
1. **Semanas 1-2**: Setup e Fundação
2. **Semanas 3-7**: Módulos Core
3. **Semanas 8-10**: Features de Suporte
4. **Semanas 11-12**: Hardening e Go-Live

## Cutover (Migração)

O cutover seguirá estratégia **Big Bang**:
- Janela de manutenção: Domingo 02h-06h
- Script de migração MySQL → PostgreSQL
- Rollback < 30 min se necessário

## Contribuição

1. Criar branch a partir de `main`
2. Fazer alterações
3. Criar PR com descrição clara
4. CI deve passar (lint + typecheck + testes)
5. Code review
6. Merge na `main` dispara deploy automático

## Licença

Proprietário - YOUDO Brasil
