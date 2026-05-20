# Sistema de Eventos v2.0 — Guia de Deploy em Produção

## Dados do Servidor

| Item | Valor |
|------|-------|
| IP Fixo | `54.161.207.19` |
| Domínio | `eventos.youdobrasil.com.br` |
| Usuário SSH | `ec2-user` |
| SO | Amazon Linux 2023 |
| Pasta do projeto | `~/eventos-v2` |

---

## 1. Acessar o servidor via SSH

Você vai precisar do arquivo `eventos-v2-key.pem` (peça ao administrador).

```bash
ssh -i eventos-v2-key.pem ec2-user@54.161.207.19
```

> Na primeira conexão o terminal vai perguntar se confia no host. Digite `yes`.

---

## 2. Enviar os arquivos para o servidor

Use o `scp` para copiar a pasta do projeto para o servidor:

```bash
scp -i eventos-v2-key.pem -r ./youdo-v2 ec2-user@54.161.207.19:~/eventos-v2/
```

Ou, se preferir usar Git, clone direto no servidor:

```bash
# Já conectado via SSH
cd ~/eventos-v2
git clone https://seu-repositorio.git .
```

---

## 3. Configurar variáveis de ambiente

No servidor, edite o arquivo de ambiente:

```bash
cd ~/eventos-v2/docker
nano .env.production
```

Atualize as seguintes variáveis com valores seguros:

```env
POSTGRES_USER=youdo
POSTGRES_PASSWORD=SENHA_SEGURA_AQUI
POSTGRES_DB=youdo_v2
JWT_SECRET=SEGredoJWT_SEGURA_AQUI
NODE_ENV=production
```

> **IMPORTANTE**: Use senhas fortes e únicas para produção!

---

## 4. Subir o Docker

Depois de configurar as variáveis:

```bash
# Entrar na pasta do projeto
cd ~/eventos-v2

# Subir os containers com configuração de produção
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.production up -d

# Verificar se está rodando
docker compose -f docker/docker-compose.prod.yml ps
```

---

## 5. Executar migrations do banco de dados

```bash
# Acessar o container da API
docker exec -it youdo-v2-api sh

# Executar migrations
npx prisma migrate deploy

# Opcional: executar seed para dados iniciais
npx prisma db seed

# Sair do container
exit
```

---

## 6. Verificar se está funcionando

Acesse no navegador:
- Frontend: `http://eventos.youdobrasil.com.br`
- API: `http://eventos.youdobrasil.com.br/api/health`

---

## 7. Comandos úteis do dia a dia

```bash
# Ver logs de todos os serviços
docker compose -f docker/docker-compose.prod.yml logs -f

# Ver logs de um serviço específico
docker compose -f docker/docker-compose.prod.yml logs -f api
docker compose -f docker/docker-compose.prod.yml logs -f web

# Parar tudo
docker compose -f docker/docker-compose.prod.yml down

# Rebuild após mudança no código
docker compose -f docker/docker-compose.prod.yml up -d --build

# Reiniciar um serviço específico
docker compose -f docker/docker-compose.prod.yml restart api
docker compose -f docker/docker-compose.prod.yml restart web

# Ver uso de recursos (CPU/memória)
docker stats
```

---

## 8. Atualizar o sistema (novo deploy)

Quando tiver uma nova versão para subir:

```bash
ssh -i eventos-v2-key.pem ec2-user@54.161.207.19

cd ~/eventos-v2

# Se estiver usando Git
git pull

# Parar containers
docker compose -f docker/docker-compose.prod.yml down

# Subir com rebuild
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.production up -d --build

# Verificar logs
docker compose -f docker/docker-compose.prod.yml logs -f
```

---

## 9. Backup do banco de dados

Para fazer backup do PostgreSQL:

```bash
# Backup
docker exec youdo-v2-postgres pg_dump -U youdo youdo_v2 > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar (se necessário)
docker exec -i youdo-v2-postgres psql -U youdo youdo_v2 < backup_20240101_120000.sql
```

---

## 10. Acesso ao banco de dados

Para acessar o PostgreSQL diretamente:

```bash
docker exec -it youdo-v2-postgres psql -U youdo youdo_v2
```

---

## Arquitetura do Docker

O sistema usa os seguintes containers:

- **postgres**: Banco de dados PostgreSQL 16
- **redis**: Cache e fila de processamento
- **api**: Backend Fastify (porta 3001)
- **web**: Frontend Next.js (porta 3000)
- **nginx**: Reverse proxy (portas 80 e 443)

O nginx faz o proxy das requisições:
- `/` → Frontend Next.js
- `/api/` → Backend Fastify

---

## Dica de segurança

O arquivo `eventos-v2-key.pem` é a chave de acesso ao servidor. Nunca compartilhe publicamente, não commite no Git e mantenha com permissão restrita:

```bash
chmod 400 eventos-v2-key.pem
```

---

## Troubleshooting

### Container não sobe

```bash
# Ver logs específicos
docker compose -f docker/docker-compose.prod.yml logs api
docker compose -f docker/docker-compose.prod.yml logs web

# Verificar se as portas estão em uso
sudo netstat -tlnp | grep -E ':(80|443|3000|3001|5432|6379)'

# Limpar tudo e subir de novo
docker compose -f docker/docker-compose.prod.yml down -v
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.production up -d --build
```

### Erro de conexão com banco

```bash
# Verificar se o postgres está saudável
docker exec youdo-v2-postgres pg_isready -U youdo -d youdo_v2

# Reiniciar o postgres
docker compose -f docker/docker-compose.prod.yml restart postgres
```

### Erro de permissão no volume

```bash
# Limpar volumes e recriar
docker compose -f docker/docker-compose.prod.yml down -v
docker volume prune
docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.production up -d --build
```
