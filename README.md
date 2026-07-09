# 🗓️ Agenda Inteligente 360

Aplicação web responsiva (com suporte a PWA) para organizar sua rotina pessoal e
de equipe: **calendário, kanban semanal, gestor de tarefas, central de links e
assistente de produtividade com IA** — tudo em um só lugar.

Construída com **React + Vite + Tailwind CSS + Supabase**. Simples, escalável e
barata: roda de graça na Vercel/Netlify e usa o plano gratuito do Supabase.

> ⚡ **Roda sem configurar nada.** Se o Supabase não estiver configurado, a app
> entra em **Modo Demo** e salva os dados no `localStorage` do navegador — ótimo
> para testar. Quando quiser persistir na nuvem e usar login real, basta
> preencher as variáveis de ambiente.

> 🚀 **Pronto para produção?** Siga o **[Guia prático de implantação
> (DEPLOY.md)](DEPLOY.md)**: Supabase real + deploy na Vercel + checklist de teste
> no celular, passo a passo.

---

## ✨ Funcionalidades

| Módulo | Descrição |
| --- | --- |
| 🔐 **Login e perfis** | E-mail + senha via Supabase Auth. Perfis Administrador, Gestor e Colaborador. O primeiro usuário cadastrado vira admin automaticamente. |
| 📅 **Agenda do dia** | Visão de horários (06h–23h), criação de atividade por horário, itens sem horário. |
| 🗂️ **Kanban semanal** | Colunas de segunda a domingo. Arraste os cards entre dias para reagendar. |
| 📆 **Calendário mensal** | Grade do mês; clique no dia para ver/criar atividades. |
| ✅ **Status** | A fazer, Em andamento, Feito, Furei, Delegado, Não necessário, Reagendado, Cancelado. |
| 🏷️ **Categorias** | 10 categorias padrão + categorias personalizadas. |
| 🔗 **Central de links** | Cole um link e transforme em tarefa, reunião, ideia, projeto, lembrete ou pauta futura. |
| 🤖 **Assistente IA** | Comandos em linguagem natural. Modo simulado por padrão, pronto para ChatGPT/Claude. |
| 📊 **Relatórios** | Conclusão, furos, delegações, categorias/dias com mais tarefas e furos, ranking de reagendamentos. |
| 🔔 **Alertas** | Lembretes no app. Arquitetura pronta para push, e-mail e WhatsApp (futuro). |
| 🌓 **Tema claro/escuro** | Alternância com persistência. |

---

## 📱 Experiência mobile & PWA

A V1 foi desenhada **mobile-first**, com sensação de app nativo:

- **Tela "Hoje"** (home): saudação, resumo do dia, próxima atividade, atividades
  atrasadas em destaque e a lista do dia em cards.
- **Menu inferior fixo** no celular (Hoje · Semana · Calendário · Links · IA); o
  menu lateral aparece só no desktop.
- **Botão flutuante (+)** para **criação rápida** de atividade (formulário
  enxuto, com campos opcionais recolhidos). O formulário completo continua
  disponível na edição.
- **Ações rápidas** em cada card: Feito, Furei, Reagendar, Delegar, Não
  necessário.
- **Atividades atrasadas** ganham destaque visual (contorno vermelho + selo).
- **Kanban** com rolagem horizontal entre os dias no celular; no celular, mover
  entre dias é feito por "Reagendar" (o arrastar segue no desktop).
- **Central de alertas** (sino no topo) com notificações in-app e base pronta
  para push do dispositivo.
- **PWA instalável**: manifest revisado, ícone, `theme-color` adaptável ao tema,
  áreas seguras (notch) e modo tela cheia.
- **Performance**: rotas com _code-splitting_ (lazy) e _chunks_ de vendor —
  bundle inicial ~22 kB gzip. Testado em 390px, 430px, 768px e desktop.

---

## 🧱 Estrutura de pastas

```
agenda-inteligente-360/
├── index.html
├── package.json
├── vite.config.js          # Vite + plugin PWA
├── tailwind.config.js
├── postcss.config.js
├── .env.example            # Variáveis de ambiente (copie para .env)
├── public/
│   └── favicon.svg
├── supabase/
│   └── schema.sql          # Schema completo: tabelas, RLS, triggers, seed
└── src/
    ├── main.jsx            # Entry + providers
    ├── App.jsx             # Rotas
    ├── index.css           # Tailwind + componentes base
    ├── lib/
    │   ├── constants.js    # Status, prioridades, categorias, regras de negócio
    │   ├── supabaseClient.js
    │   ├── date.js         # Helpers de data (date-fns, pt-BR)
    │   └── utils.js
    ├── context/
    │   ├── AuthContext.jsx
    │   ├── ThemeContext.jsx
    │   ├── DataContext.jsx
    │   └── ToastContext.jsx
    ├── hooks/
    │   └── useTasks.js
    ├── services/           # Camada de dados (Supabase OU localStorage)
    │   ├── localStore.js   # Modo demo (seed incluído)
    │   ├── authService.js
    │   ├── taskService.js  # CRUD + status + reagendar + delegar + logs
    │   ├── categoryService.js
    │   ├── linkService.js
    │   ├── logService.js
    │   └── aiService.js    # Assistente (mock + adapter p/ API)
    ├── components/
    │   ├── layout/         # Sidebar, Topbar, Layout
    │   ├── ui/             # Modal, Badges, StatCard, EmptyState...
    │   └── tasks/          # TaskCard, TaskModal
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── DayAgenda.jsx
        ├── WeekKanban.jsx
        ├── MonthCalendar.jsx
        ├── Links.jsx
        ├── Assistant.jsx
        ├── Reports.jsx
        └── Settings.jsx
```

---

## 🚀 Instalação

Requisitos: **Node.js 18+**.

```bash
# 1. Instale as dependências
npm install

# 2. (Opcional) Configure o Supabase
cp .env.example .env
# edite .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 3. Rode em desenvolvimento
npm run dev        # http://localhost:5173

# 4. Build de produção
npm run build
npm run preview
```

Sem `.env`, a aplicação inicia em **Modo Demo** (qualquer e-mail/senha entra e os
dados ficam no navegador).

---

## 🗄️ Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No painel, abra **SQL Editor** e execute o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql). Isso cria todas as tabelas,
   os índices, as políticas de **Row Level Security**, o gatilho que cria o
   perfil no cadastro e o seed das categorias padrão.
3. Em **Settings → API**, copie a **Project URL** e a **anon public key**.
4. Preencha o `.env`:

   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

5. Em **Authentication → Providers**, mantenha **Email** habilitado. Para testes
   rápidos, desative a confirmação de e-mail em **Authentication → Sign In / Providers**.

O **primeiro usuário** que se cadastrar recebe o perfil **Administrador**
automaticamente; os demais entram como **Colaborador** (ajustável na tabela
`profiles`).

### Tabelas criadas

`profiles` · `categories` · `tasks` · `links` · `reminders` · `activity_logs` ·
`delegations`

Toda alteração relevante (criação, edição, mudança de status, reagendamento,
delegação, cancelamento, conclusão, exclusão) gera um registro em
`activity_logs`.

---

## 🤖 Assistente de IA

Por padrão o assistente roda em **modo simulado** (interpretador de comandos por
regras, 100% local). Ele entende comandos como:

- "Agende uma reunião amanhã às 15h"
- "Crie uma tarefa para eu ver isso na sexta"
- "Reagende todas as tarefas atrasadas para amanhã"
- "Mostre o que eu mais furei essa semana"
- "Crie uma rotina semanal com base nas minhas pendências"

### Conectar ChatGPT ou Claude (futuro)

O código já está preparado em [`src/services/aiService.js`](src/services/aiService.js):

1. Defina `VITE_AI_PROVIDER=openai` ou `anthropic` e `VITE_AI_API_KEY` no `.env`.
2. Implemente a função `callRemoteAI()` (há um exemplo comentado).

> ⚠️ **Segurança:** nunca exponha a chave de IA no frontend em produção. O
> recomendado é criar uma **Supabase Edge Function** como proxy e chamar essa
> function a partir do app. Enquanto não configurado, o assistente usa o modo
> simulado.

---

## 🔔 Alertas

A versão inicial mostra lembretes dentro do app. Cada atividade possui os campos
`alert_enabled`, `alert_type`, `alert_minutes_before` e `alert_sent`, e existe a
tabela `reminders` — a arquitetura já está pronta para **push**, **e-mail** e
**WhatsApp** (este último ainda não implementado).

Sugestão de evolução: uma Supabase Edge Function agendada (cron) que varre
`reminders` pendentes e dispara as notificações.

---

## 📲 PWA

O projeto usa `vite-plugin-pwa`. Após o `npm run build`, o app é instalável
(gera `manifest.webmanifest` e service worker). Em produção com HTTPS, o
navegador oferece "Instalar app".

---

## ☁️ Deploy

### Vercel

1. Importe o repositório em [vercel.com](https://vercel.com).
2. Framework: **Vite** (detectado automaticamente).
3. Build command: `npm run build` · Output: `dist`.
4. Em **Settings → Environment Variables**, adicione `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.
5. Deploy. O arquivo [`vercel.json`](vercel.json) já faz o rewrite de SPA.

### Netlify

1. Importe o repositório em [netlify.com](https://netlify.com).
2. Build command: `npm run build` · Publish directory: `dist`.
3. Adicione as variáveis de ambiente do Supabase.
4. O arquivo [`netlify.toml`](netlify.toml) já configura o redirect de SPA.

---

## 🧭 Roadmap sugerido

- [x] Versão funcional simples
- [x] Experiência mobile-first (foco atual)
- [ ] Convite e gestão de múltiplos usuários da equipe
- [ ] Edge Function para disparo de alertas (push/e-mail)
- [ ] Integração real com ChatGPT/Claude via proxy
- [ ] Integração com Google Calendar
- [ ] WhatsApp (Twilio / API oficial)

---

## 🛠️ Scripts

| Comando | Ação |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Pré-visualiza o build |
| `npm run lint` | ESLint |

---

Feito com ☕ e foco em produtividade.
