# Deploy do Chatwoot + Kanban no Easypanel

Este guia explica como fazer deploy da versão customizada do Chatwoot com o módulo Kanban/Funil.

---

## 📁 Estrutura do Projeto

```
chatwoot/
├── Dockerfile.custom          # Dockerfile para build customizado
├── app/javascript/dashboard/
│   ├── routes/dashboard/funnel/
│   │   ├── funnel.routes.js   # Rotas do Kanban
│   │   └── FunnelPage.vue     # Componente principal do Kanban
│   ├── components-next/sidebar/
│   │   └── Sidebar.vue        # Menu lateral (inclui item "Pipeline Kanban")
│   └── i18n/locale/en/
│       ├── general.json       # Traduções do Kanban
│       └── settings.json      # Label do menu
└── DEPLOY_EASYPANEL.md        # Este arquivo
```

---

## 🔧 Desenvolvimento Local

### Pré-requisitos
- Ruby 3.4.4 (via rbenv)
- Node.js 20+
- pnpm
- PostgreSQL
- Redis

### Instalação

```bash
# Clonar repositório
git clone https://github.com/Elisson78/MooveLabs-chatWoot.git
cd MooveLabs-chatWoot

# Instalar dependências Ruby
bundle install

# Instalar dependências JS
pnpm install

# Configurar banco de dados
cp .env.example .env
# Editar .env com suas credenciais
rails db:create db:migrate db:seed

# Rodar servidor de desenvolvimento
pnpm dev
# ou
overmind start -f Procfile.dev
```

### Testar o Kanban localmente
Acesse: `http://localhost:3000/app/accounts/1/funil`

---

## 🚀 Deploy no Easypanel

### 1. Configuração da Fonte (Git)

No Easypanel, vá em **Fonte** e configure:

| Campo | Valor |
|-------|-------|
| **Tipo** | Git |
| **URL do Repositório** | `https://github.com/Elisson78/MooveLabs-chatWoot.git` |
| **Branch** | `main` |
| **Caminho de Build** | `/` |
| **Construção** | Dockerfile |
| **Arquivo** | `Dockerfile.custom` |

Clique em **Salvar**.

---

### 2. Variáveis de Ambiente

No Easypanel, vá em **Ambiente** e adicione:

```env
FRONTEND_URL=https://chat.moovelabs.com
SECRET_KEY_BASE=<sua-chave-secreta>
DEFAULT_LOCALE=pt_BR
FORCE_SSL=false
ENABLE_ACCOUNT_SIGNUP=true

# Redis
REDIS_URL=redis://default@$(PROJECT_NAME)_chatwoot-redis:6379
REDIS_PASSWORD=<senha-redis>
REDIS_OPENSSL_VERIFY_MODE=none

# PostgreSQL
POSTGRES_DATABASE=$(PROJECT_NAME)
POSTGRES_HOST=$(PROJECT_NAME)_chatwoot-db
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=<senha-postgres>

# Rails
RAILS_MAX_THREADS=5
NODE_ENV=production
RAILS_ENV=production
INSTALLATION_ENV=docker
TRUSTED_PROXIES=*
```

> **Nota:** Substitua `<sua-chave-secreta>`, `<senha-redis>` e `<senha-postgres>` por valores reais.

Clique em **Salvar**.

---

### 3. Serviços Dependentes

Certifique-se de ter os seguintes serviços no mesmo projeto:

- **chatwoot-db** (PostgreSQL)
- **chatwoot-redis** (Redis)
- **chatwoot-sidekiq** (Worker - usa mesma imagem)

---

### 4. Domínios

Configure em **Domínios**:

| Domínio | Destino |
|---------|---------|
| `https://chat.moovelabs.com` | `http://chatwoot_chatwoot:3000` |

---

### 5. Implantar

1. Vá em **Implantações**
2. Clique em **Implantar**
3. Aguarde o build (pode levar ~3-5 minutos)
4. Verifique os logs se houver erro

---

## 🔄 Atualizando o Código

### Fluxo de atualização

```bash
# 1. Fazer alterações localmente
cd /Users/elissonuzual/Documents/Moovelabs-ChatWoot/chatwoot

# 2. Testar localmente (opcional)
pnpm dev

# 3. Adicionar arquivos modificados
git add .

# 4. Commit
git commit -m "feat: descrição da mudança"

# 5. Push para o GitHub
git push moovelabs main

# 6. No Easypanel, clicar em "Implantar"
```

---

## 📋 Dockerfile.custom

O Dockerfile usa **multi-stage build**:

```dockerfile
# Stage 1: Build do frontend com Node
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm exec vite build

# Stage 2: Imagem final baseada no Chatwoot oficial
FROM chatwoot/chatwoot:latest
COPY --from=builder /app/public/vite /app/public/vite
COPY --from=builder /app/app/javascript /app/app/javascript
```

---

## 🐛 Troubleshooting

### Erro: "pnpm: not found"
O Dockerfile.custom já inclui instalação do pnpm via corepack.

### Erro: "JavaScript heap out of memory"
Já configurado `NODE_OPTIONS="--max-old-space-size=4096"` no Dockerfile.

### Erro: "Dockerfile: no such file"
Verifique se em **Fonte > Arquivo** está `Dockerfile.custom` (não `Dockerfile`).

### Kanban não aparece no menu
1. Verifique se o build foi concluído com sucesso
2. Limpe cache do navegador (Ctrl+Shift+R)
3. Verifique o console do navegador (F12) por erros

### Kanban aparece mas está vazio
1. Verifique se há conversas na conta
2. Abra o console do navegador e veja erros de API
3. Verifique se o usuário tem permissão de agente/admin

---

## 📞 Suporte

- **Repositório:** https://github.com/Elisson78/MooveLabs-chatWoot
- **Chatwoot Docs:** https://www.chatwoot.com/docs





