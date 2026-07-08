# Correção: anexos de eventos (S3) e edição de horário

Resumo do diagnóstico e das correções feitas na sessão. Nada foi commitado nem enviado para o GitHub ainda — todas as mudanças abaixo estão só no working directory local.

## Bug 1 — Horário do evento não salvava ao editar

### Sintoma
Ao editar o horário (início/término) de um evento, a alteração não ficava salva — a tela voltava a mostrar o valor antigo.

### Causa raiz confirmada
Dois problemas combinados:

1. **Permissão**: a rota `PATCH /api/v2/events/:id` só permitia os papéis `admin` e `event_owner`. O usuário que reportou o bug estava logado como `operator`, que não tinha acesso — a API respondia `403`.
2. **Erro engolido silenciosamente**: a função `saveDates()` no frontend não verificava se a requisição `PATCH` tinha sucesso (`response.ok`). Ao receber o erro 403, o código ignorava, recarregava o evento (com o valor antigo, do banco) e fechava o modal de edição — dando a impressão de "editei e não salvou", sem nenhuma mensagem de erro.

### Correção aplicada
- [`apps/api/src/routes/events.ts:119`](apps/api/src/routes/events.ts) — adicionado `'operator'` à lista de papéis permitidos no `PATCH /:id`.
- [`apps/web/src/app/events/[id]/page.tsx`](apps/web/src/app/events/[id]/page.tsx) — função `saveDates()` agora verifica `response.ok` e mostra um `alert()` com a mensagem de erro real, em vez de falhar silenciosamente. Vale para qualquer erro futuro nessa rota, não só permissão.

### Status
✅ Corrigido no código. Falta apenas deploy.

---

## Bug 2 — Download de anexos quebrado (`s3.amazonaws.com/undefined/...`)

### Sintoma
Ao tentar baixar um arquivo anexado a um evento, o navegador era redirecionado para uma URL com o bucket literalmente como a string `undefined`, resultando em erro `PermanentRedirect` da AWS.

### Causa raiz confirmada
A integração com S3 **nunca foi implementada de verdade** — era só um placeholder:

- Upload (`POST /events/:id/files/upload`): salvava metadados no Postgres, mas nunca enviava os bytes do arquivo para lugar nenhum. O stream do arquivo multipart nunca era consumido (`data.file` nunca era lido); o plugin `@fastify/multipart` drena e descarta automaticamente streams não consumidos após a resposta, então o upload "funcionava" (201 de sucesso), mas o conteúdo do arquivo era jogado fora.
- Download/Presign (`GET /files/:id/download`, `POST /events/:id/files/presign`): montavam a URL manualmente por concatenação de string (`https://s3.amazonaws.com/${process.env.AWS_S3_BUCKET}/...`), sem usar o SDK da AWS — não existia (nem estava instalado) o pacote `@aws-sdk/client-s3`.
- Como `AWS_S3_BUCKET` não estava definida nos arquivos `docker-compose.dev.yml`/`docker-compose.prod.yml` (não eram repassadas ao container), a variável chegava `undefined` no backend e virava a string literal `"undefined"` na URL.

### ⚠️ Consequência importante: arquivos antigos são irrecuperáveis
**Todo anexo enviado antes desta correção nunca foi salvo em lugar nenhum** — nem em disco, nem em S3. O registro no banco existe (nome, comentário, data), mas o conteúdo do arquivo foi descartado no momento do upload. Muito provavelmente esses registros têm `sizeBytes = 0` no banco (o valor era lido do stream antes de qualquer byte ser processado). Não há como recuperar esses arquivos — os usuários precisarão reenviá-los depois que a correção estiver em produção.

### Correção aplicada
- Instalados `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` em `apps/api` (via instalação manual em `apps/api/node_modules`, pois o `pnpm` do ambiente estava com conflito de store — ver seção "Detalhe técnico: instalação de dependências" abaixo).
- Criado [`apps/api/src/lib/s3.ts`](apps/api/src/lib/s3.ts) com funções reais: `uploadBufferToS3`, `createUploadPresignedUrl`, `createDownloadPresignedUrl`, `deleteS3Object`. O `S3Client` é instanciado sem credenciais explícitas — usa a cadeia padrão de credenciais da AWS (variáveis de ambiente, ou IAM Role da instância EC2, nessa ordem).
- Reescrito [`apps/api/src/routes/files.ts`](apps/api/src/routes/files.ts):
  - Upload agora lê o buffer real (`data.toBuffer()`) e envia para o S3 antes de gravar o registro no Postgres. Se o S3 falhar, retorna erro 502 explícito em vez de fingir sucesso.
  - Download gera uma presigned URL real e assinada via SDK.
  - Presign de upload (endpoint hoje não usado pelo frontend, mas corrigido por consistência) gera URL real via SDK.
  - Delete agora remove o objeto do S3 além do registro no banco (se a remoção no S3 falhar, o registro no banco é removido mesmo assim, só loga o erro).

### Infraestrutura AWS necessária (feito nesta sessão)
- Bucket real identificado: **`youdo-eventos-uploads`**, região **`us-east-1`** (não `sa-east-1` como assumido inicialmente, nem `youdo-v2-uploads` como no `.env.example` original).
- Criada IAM Role **`youdo-eventos-uploads`** (trust policy: `ec2.amazonaws.com`), anexada à instância EC2 de produção — evita usar chaves estáticas (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`), que são mais arriscadas.
- Criada e corrigida a policy **`youdo-v2-s3-access-policy`** (escopo mínimo: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` restritos ao bucket `youdo-eventos-uploads`), anexada à role acima.
- Atualizados para refletir o bucket/região reais:
  - `docker/.env.production`
  - `docker/docker-compose.dev.yml` / `docker-compose.prod.yml` (valores default de fallback)
  - `.env` e `.env.example` (raiz do repo)

### Status
✅ Corrigido no código e na infraestrutura AWS. Falta apenas deploy e teste real.

---

## ⚠️ Problema de segurança encontrado (não corrigido — decisão adiada a pedido do usuário)

O arquivo **`docker/.env.production` está versionado no Git e já foi enviado ao GitHub** (`origin/main`), desde 20/05/2026, contendo em texto puro:
- `JWT_SECRET` de produção
- `POSTGRES_PASSWORD` de produção
- `ACESSOS_API_PASSWORD` (senha real de `ivan@youdobrasil.com.br` no sistema de Acessos)

O `.gitignore` do projeto cobre `.env`, `.env.local`, `.env.*.local`, mas **não** o padrão `docker/.env.production`.

**Decisão do usuário**: tratar isso depois, focar primeiro em resolver o S3. Ou seja, os valores de `AWS_S3_BUCKET`/`AWS_REGION` que adicionei a esse arquivo *também* vão para o histórico do Git quando isso for commitado — mas como a autenticação AWS usa IAM Role (sem chaves), não há segredo AWS novo sendo exposto, só o nome do bucket e a região (informação de baixo risco).

### Recomendação para quando for tratar isso
1. `git rm --cached docker/.env.production` + adicionar o padrão ao `.gitignore`.
2. Rotacionar os 3 segredos já expostos (`JWT_SECRET`, `POSTGRES_PASSWORD`, `ACESSOS_API_PASSWORD`) — remover do tracking daqui pra frente não apaga o que já está no histórico do GitHub.
3. Manter a partir de então uma cópia de `docker/.env.production` só no servidor, fora do Git.

---

## Detalhe técnico: instalação de dependências

O `pnpm` do ambiente local (v9.0.0) estava em conflito com o formato do store já usado pelo `node_modules` existente (criado por uma versão mais nova do pnpm, v11.x). Não foi possível rodar `pnpm add` normalmente sem forçar uma reinstalação completa do monorepo (arriscado, não executado). Solução aplicada: instalação isolada dos pacotes `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` via `npm` em diretório temporário, seguida de cópia manual para `apps/api/node_modules/@aws-sdk/`. As dependências foram adicionadas normalmente ao `apps/api/package.json` para que um `pnpm install` futuro (rodado com a versão de pnpm correta) resolva isso de forma limpa.

**Ação recomendada**: em algum momento, alinhar a versão do `pnpm` do ambiente (`pnpm add -g pnpm` para atualizar para 11.x, conforme sugerido pelo próprio CLI) e rodar um `pnpm install` limpo para consolidar o lockfile.

---

## Arquivos alterados nesta sessão

```
 M .env
 M .env.example
 M apps/api/package.json
 M apps/api/src/routes/events.ts
 M apps/api/src/routes/files.ts
 M apps/web/src/app/events/[id]/page.tsx
 M docker/.env.production
 M docker/docker-compose.dev.yml
 M docker/docker-compose.prod.yml
?? apps/api/src/lib/s3.ts   (novo arquivo)
```

Validação feita: `tsc --noEmit` em `apps/api` e `apps/web` sem novos erros introduzidos (erros pré-existentes de Prisma Client desatualizado não são relacionados a esta correção). Testada isoladamente a lógica de erro do módulo `s3.ts` (lança erro claro quando falta configuração). **Não foi possível testar ponta a ponta** — não há Docker rodando neste ambiente (sem Postgres/Redis locais disponíveis).

---

## O que falta fazer (checklist)

- [x] Diagnosticar causa raiz dos dois bugs
- [x] Corrigir código do backend (`events.ts`, `files.ts`, novo `s3.ts`)
- [x] Corrigir frontend (`saveDates()` com tratamento de erro)
- [x] Criar bucket S3 e confirmar nome/região reais
- [x] Criar IAM Role + policy escopada, anexar à instância EC2
- [x] Corrigir policy IAM para apontar ao bucket certo
- [x] Atualizar `.env`/`.env.example`/`docker-compose.*.yml`/`docker/.env.production` locais com bucket/região reais
- [ ] **Decidir e confirmar como é feito o deploy hoje** (git pull + docker compose up --build direto na EC2? CI/CD?) — para dar o comando exato
- [ ] Commitar as mudanças localmente (aguardando aprovação — foi interrompido antes de finalizar)
- [ ] Dar push para o GitHub
- [ ] Rebuild da imagem Docker da API e redeploy no servidor EC2 de produção
- [ ] Confirmar no servidor, depois do deploy: `docker exec <container> printenv | grep AWS` deve mostrar `AWS_S3_BUCKET=youdo-eventos-uploads` e `AWS_REGION=us-east-1` (sem `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, ou vazias — a Role cuida da autenticação)
- [ ] Teste real pós-deploy: editar o horário de um evento logado como `operator` (deve salvar); subir um anexo novo em um evento e baixá-lo de volta (deve funcionar de ponta a ponta)
- [ ] Levantar quantos registros antigos de `File` têm `sizeBytes = 0` (uploads pré-correção, irrecuperáveis) e decidir se avisa os usuários afetados para reenviarem
- [ ] (Adiado a pedido do usuário) Corrigir o vazamento de segredos em `docker/.env.production`: remover do Git, ajustar `.gitignore`, rotacionar `JWT_SECRET`, `POSTGRES_PASSWORD` e `ACESSOS_API_PASSWORD`
- [ ] (Sugestão, não bloqueante) Atualizar `pnpm` do ambiente local para v11.x e rodar `pnpm install` limpo para consolidar as dependências novas no lockfile
