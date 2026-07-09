# 🚀 Guia prático de implantação — Agenda Inteligente 360

Este guia leva a aplicação do **modo demo (localStorage)** para uma **versão real
em produção**, com Supabase na nuvem e deploy na Vercel. Siga na ordem.

> Tempo estimado: ~20 a 30 minutos. Não é preciso saber programar.

---

## Índice

1. [Criar o projeto no Supabase](#1-criar-o-projeto-no-supabase)
2. [Rodar o schema.sql](#2-rodar-o-schemasql)
3. [Pegar as chaves da API](#3-pegar-as-chaves-da-api)
4. [Configurar o Auth (login por e-mail)](#4-configurar-o-auth-login-por-e-mail)
5. [Rodar localmente com Supabase real](#5-rodar-localmente-com-supabase-real)
6. [Criar o primeiro usuário (administrador)](#6-criar-o-primeiro-usuário-administrador)
7. [Deploy na Vercel](#7-deploy-na-vercel)
8. [Checklist de teste no celular](#8-checklist-de-teste-no-celular-iphone--android)
9. [Segurança e privacidade](#9-segurança-e-privacidade)
10. [Solução de problemas](#10-solução-de-problemas)

---

## 1. Criar o projeto no Supabase

1. Acesse **https://supabase.com** e clique em **Start your project** (login com
   GitHub é o mais rápido).
2. No painel, clique em **New project**.
3. Preencha:
   - **Name**: `agenda-360` (ou o que preferir)
   - **Database Password**: crie uma senha forte e **guarde-a** (você pode
     precisar depois; não é a mesma coisa que a anon key).
   - **Region**: escolha a mais próxima (ex.: `South America (São Paulo)`).
4. Clique em **Create new project** e aguarde ~2 minutos até provisionar.

---

## 2. Rodar o schema.sql

O arquivo [`supabase/schema.sql`](supabase/schema.sql) cria **tudo**: tabelas,
enums, índices, políticas de segurança (RLS), gatilhos e o seed das categorias.

1. No painel do Supabase, menu lateral → **SQL Editor**.
2. Clique em **+ New query**.
3. Abra o arquivo `supabase/schema.sql` deste projeto, **copie todo o conteúdo** e
   cole no editor.
4. Clique em **Run** (ou `Ctrl/Cmd + Enter`).
5. Deve aparecer **Success. No rows returned**. Pronto — o banco está montado.

> Pode rodar de novo sem medo: o script é idempotente (`create ... if not
> exists`, `drop policy if exists`, etc.).

**Confirme que deu certo:** menu → **Table Editor**. Você deve ver as tabelas:
`workspaces`, `workspace_members`, `profiles`, `categories`, `tasks`, `links`,
`reminders`, `activity_logs`, `delegations` e as preparadas para o futuro
(`ai_conversations`, `ai_messages`, `ai_actions`, `integrations`,
`notifications`).

> O banco é **multi-tenant por workspace**. Detalhes da arquitetura em
> [`supabase/ARQUITETURA.md`](ARQUITETURA.md).

---

## 3. Pegar as chaves da API

1. Menu lateral → **Project Settings** (ícone de engrenagem) → **API**.
2. Copie estes dois valores:
   - **Project URL** → vira `VITE_SUPABASE_URL`
     (algo como `https://abcdefgh.supabase.co`)
   - **Project API keys → `anon` `public`** → vira `VITE_SUPABASE_ANON_KEY`
     (uma chave longa começando com `eyJ...`)

> ⚠️ Use **somente** a chave `anon public`. **Nunca** use a `service_role` no
> frontend — ela ignora todas as regras de segurança.

---

## 4. Configurar o Auth (login por e-mail)

1. Menu lateral → **Authentication** → **Sign In / Providers**.
2. Confirme que **Email** está **habilitado**.
3. **Para começar rápido**, desative a confirmação por e-mail:
   - **Authentication → Providers → Email → Confirm email** → **desligado**.
   - Assim o usuário entra na hora após o cadastro. (Você pode religar depois,
     quando configurar um provedor de e-mail.)
4. (Opcional) Em **Authentication → URL Configuration**, adicione a URL do seu
   site da Vercel em **Site URL** e **Redirect URLs** depois do deploy.

---

## 5. Rodar localmente com Supabase real

1. Na raiz do projeto, crie o arquivo de ambiente:

   ```bash
   cp .env.example .env.local
   ```

2. Edite o `.env.local` e cole suas chaves:

   ```env
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
   VITE_AI_PROVIDER=mock
   VITE_AI_API_KEY=
   ```

3. Rode:

   ```bash
   npm install      # se ainda não instalou
   npm run dev
   ```

4. Abra **http://localhost:5173**.

**Como saber em que modo está:** se as variáveis estiverem preenchidas, o aviso
amarelo "Modo demo" **desaparece** e a tela de login passa a usar o Supabase de
verdade. A detecção é automática (ver `src/lib/supabaseClient.js`).

---

## 6. Criar o primeiro usuário (administrador)

1. Na tela de login, clique em **Criar agora**.
2. Informe nome, e-mail e senha e **crie a conta**.
3. O gatilho `handle_new_user` cria automaticamente: seu **perfil**, um workspace
   **"Pessoal"** (você como **Owner**) e as **10 categorias** padrão. O
   **primeiro** usuário do sistema também recebe `role = admin` de plataforma;
   os próximos entram como `collaborator` (cada um com seu próprio "Pessoal").
4. Confira em **Table Editor**: seu usuário em `profiles`, o workspace em
   `workspaces`, o vínculo em `workspace_members` (role `owner`) e as categorias
   em `categories` (todas com o mesmo `workspace_id`).

> Papéis de **workspace** ficam em `workspace_members.role`
> (`owner`/`admin`/`manager`/`collaborator`/`viewer`). O `profiles.role` é o
> papel de **plataforma**.

---

## 7. Deploy na Vercel

### 7.1 Suba o código para o GitHub
O projeto já está no repositório `TarsisCasado/agenda360`. Garanta que o último
commit foi enviado (`git push`).

### 7.2 Conecte na Vercel
1. Acesse **https://vercel.com** e faça login com **GitHub**.
2. **Add New… → Project**.
3. **Import** o repositório `agenda360`.
4. A Vercel detecta **Vite** sozinha. Confirme:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### 7.3 Coloque as variáveis de ambiente
Antes de clicar em Deploy, abra **Environment Variables** e adicione:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | sua Project URL |
| `VITE_SUPABASE_ANON_KEY` | sua anon public key |
| `VITE_AI_PROVIDER` | `mock` |

> As variáveis `VITE_*` são lidas **no momento do build**. Se você adicioná-las
> depois, faça um **Redeploy** para valerem.

### 7.4 Deploy
1. Clique em **Deploy** e aguarde (~1 minuto).
2. A Vercel entrega uma URL tipo `https://agenda360.vercel.app`.
3. Volte no Supabase → **Authentication → URL Configuration** e coloque essa URL
   em **Site URL** (evita problemas de redirecionamento).

O arquivo [`vercel.json`](vercel.json) já cuida do *rewrite* de SPA (todas as
rotas caem no `index.html`), então links diretos como `/semana` funcionam.

---

## 8. Checklist de teste no celular (iPhone / Android)

Abra a URL da Vercel no navegador do celular (**Safari** no iPhone, **Chrome** no
Android) e valide:

- [ ] **Login** — entrar com e-mail e senha criados
- [ ] **Criar tarefa** — botão flutuante **+** → preencher → **Criar**
- [ ] **Editar tarefa** — menu do card (•••) → **Editar** → **Salvar**
- [ ] **Marcar como Feito** — ação rápida **Feito** no card
- [ ] **Marcar como Furei** — ação rápida **Furei**
- [ ] **Reagendar** — ação **Reagendar** → escolher data / atalho
- [ ] **Delegar** — ação **Delegar** → informar responsável
- [ ] **Criar link** — aba **Links** → colar URL → **Salvar link**
- [ ] **Central de alertas** — tocar no **sino** no topo
- [ ] **Kanban** — rolar os dias na horizontal; mover via **Reagendar**
- [ ] **Calendário** — tocar num dia → ver/criar atividade
- [ ] **Relatórios** — números batem com o que você criou
- [ ] **Tema claro/escuro** — alternar no ícone de lua/sol
- [ ] **Persistência** — fechar e reabrir: os dados continuam lá (nuvem)
- [ ] **Instalar como PWA**:
  - **iPhone (Safari)**: botão Compartilhar → **Adicionar à Tela de Início**
  - **Android (Chrome)**: menu ⋮ → **Instalar app** / **Adicionar à tela inicial**
- [ ] **Abrir em tela cheia** — abrir pelo ícone instalado (sem barra do
  navegador)

> Dica: teste com **dois aparelhos/contas** para confirmar que cada usuário só vê
> os próprios dados.

---

## 9. Segurança e privacidade

- **RLS (Row Level Security)** está **ativa** em todas as tabelas. Cada usuário
  só enxerga e altera **os próprios registros** (`auth.uid() = user_id`).
- **Tarefas delegadas** também ficam visíveis para o responsável
  (`assignee_id`), preparando o uso em equipe.
- A chave usada no frontend é a **anon public**, que **só** funciona respeitando
  as políticas de RLS.
- **Preparado para o futuro:** os perfis `admin`, `manager` e `collaborator` já
  existem em `profiles`. Quando quiser abrir para a equipe, basta criar políticas
  adicionais por cargo (ex.: gestor vê o time) — a estrutura já está pronta.

---

## 10. Solução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Continua aparecendo "Modo demo" | `.env.local` não lido | Confirme o nome do arquivo e **reinicie** `npm run dev`. Na Vercel, **Redeploy**. |
| "Database error saving new user" no cadastro | schema não rodou por completo | Rode o `schema.sql` inteiro de novo no SQL Editor. |
| Cadastra mas não entra | Confirmação de e-mail ligada | Desligue **Confirm email** (passo 4) ou confirme pelo e-mail recebido. |
| Login OK, mas não vejo nada | Normal em conta nova | Crie sua primeira atividade no **+**. |
| Erro de CORS / redirect | Site URL não configurada | Adicione a URL da Vercel em **Authentication → URL Configuration**. |
| Variáveis não aplicaram na Vercel | `VITE_*` é build-time | Faça **Redeploy** após adicionar/editar variáveis. |
| Rota direta (`/semana`) dá 404 | Sem rewrite de SPA | Confirme que o `vercel.json` está no repositório. |

---

### Resumo dos comandos

```bash
cp .env.example .env.local   # criar env local e preencher as chaves
npm install                  # instalar dependências
npm run dev                  # rodar local (http://localhost:5173)
npm run build                # build de produção
npm run lint                 # checar o código
```

Pronto — sua Agenda Inteligente 360 está no ar, salvando na nuvem e instalável no
celular. 🎉
