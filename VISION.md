# VISION.md — Agenda360

> Documento oficial de visão de produto da Agenda360.
> É a referência máxima do projeto: em caso de dúvida ou conflito de decisão,
> **este documento prevalece** sobre preferências pontuais.
> Última consolidação: julho/2026 · Status: vivo (revisado a cada épico maior).

---

## 1. Missão

**Fazer com que a pessoa nunca mais perca uma informação, uma ideia ou um compromisso — e transforme cada um deles em ação no momento certo.**

A Agenda360 existe para reduzir a carga mental. O usuário não deveria precisar
segurar tudo na cabeça, nem decidir tudo no instante em que a informação chega.
Ele **captura primeiro, organiza depois e executa quando decidir**.

## 2. Visão

A Agenda360 deixa de ser "uma agenda" e passa a ser um **sistema operacional
pessoal** — um **segundo cérebro** que acompanha o ciclo completo da informação:
da captura instantânea até a execução e o aprendizado.

Queremos que a pessoa **abra o aplicativo várias vezes por dia** com a mesma
naturalidade com que abre a câmera: para *capturar* o que importa, confiante de
que nada será perdido e de que o sistema a ajudará a decidir o destino de cada
coisa — sem nunca decidir por ela.

## 3. Os quatro pilares

A Agenda360 se organiza em quatro pilares. Toda funcionalidade nova deve poder
ser explicada como parte de um deles.

### 3.1 CAPTURAR
Tudo entra primeiro aqui. Texto, checklist, foto, PDF, áudio (futuro),
compartilhamento, IA e integrações. **Nada precisa de data, prioridade ou
organização imediata.** O objetivo número um é a **velocidade de captura**: o
menor atrito possível entre "ter a informação" e "ela estar salva".
→ Materializado na **📥 Caixa de Entrada Inteligente**.

### 3.2 ORGANIZAR
Depois da captura, o usuário decide o destino: virar **Agenda**, ir para **Para
pensar**, ser **Arquivada**, **Compartilhada** ou **Delegada**. A IA pode
**sugerir** o destino; **nunca decide sozinha**. Há sempre confirmação.

### 3.3 EXECUTAR
O que virou ação flui para as superfícies de execução já existentes: **Hoje,
Agenda do dia, Calendário, Kanban, Alertas e Relatórios**. A Caixa de Entrada
alimenta a Agenda; a Agenda não é substituída por ela.

### 3.4 EVOLUIR
A camada de inteligência. A Agenda360 aprende padrões e **sugere** — nunca
executa automaticamente. Exemplos: "Você costuma transformar notas de Trabalho
em tarefas"; "Você cria reuniões após fotografar atas"; "Há 8 ideias em 'Para
pensar' há mais de 90 dias". Aqui vivem os **Insights**, a **Revisão Semanal** e
o **Destino Inteligente**.

> Fluxo mental do produto: **Capturar → Organizar → Executar → Evoluir**, em ciclo.

## 4. Princípios

1. **Captura acima de tudo.** Se capturar for lento, o sistema falhou. Nenhum
   campo obrigatório na entrada além do conteúdo.
2. **Capturar ≠ organizar.** São dois momentos distintos. Forçar organização na
   captura mata a captura.
3. **A decisão é sempre do usuário.** A IA sugere, explica e prepara; o humano
   confirma. Nunca ação destrutiva ou de escrita silenciosa pela IA.
4. **Nada se perde.** Toda captura tem origem, estado de processamento e
   histórico. Converter, arquivar ou delegar **preserva o rastro**.
5. **Confiança por transparência.** O usuário sempre entende o que o sistema
   fez, por que sugeriu e como desfazer.
6. **Privacidade por padrão.** O dado sensível é tratado como sensível: imagem
   bruta não é retida por padrão, chaves nunca vão ao frontend, arquivos são
   privados.
7. **Menos é mais.** Menos cliques, menos texto, mais contexto, mais fluidez.
8. **Produto próprio.** Não copiamos Notion, Todoist nem Google Calendar.
   Inspiração em qualidade (Apple, Linear, Sunsama), não em clonagem.
9. **Estabilidade é funcionalidade.** Um fluxo quebrado vale menos que uma tela
   a menos. Erros tratados, sem loading eterno, acessível.
10. **Multi-tenant desde a raiz.** Tudo é escopado por workspace; o modelo já
    suporta times, papéis e compartilhamento.

## 5. Filosofia

A Agenda360 acredita que a produtividade real não vem de "mais recursos", e sim
de **reduzir a fricção entre pensamento e ação**. O inimigo é a **carga
cognitiva**: a energia gasta em lembrar, decidir e reorganizar.

Por isso separamos o **capturar** (rápido, sem julgamento) do **organizar**
(reflexivo, com contexto) e do **executar** (no tempo certo). A inteligência
não existe para automatizar o usuário, e sim para **devolver-lhe atenção**:
lembrar do que ele esqueceu, apontar padrões, sugerir o próximo passo — e sair
do caminho quando ele quiser apenas registrar e seguir.

O tom do produto é **calmo, elegante, discreto e profissional**. Nunca
infantil, nunca ansioso, nunca ruidoso. A sensação deve ser de **organização e
confiabilidade** — um lugar seguro para a mente descansar.

## 6. Como a IA deve agir

**Papel:** copiloto, nunca piloto automático.

- **Sugere, não decide.** Toda escrita/alteração proposta pela IA passa por
  confirmação explícita do usuário (Origin-aware confirmation).
- **Explica-se.** Mostra confiança de forma humana (🟢 Alta / 🟡 Média / 🔴
  Precisa confirmar), nunca porcentagem crua; oferece o "porquê" quando incerta.
- **Nunca inventa.** Grounding no contexto real (Context Engine); na dúvida,
  pergunta em vez de alucinar.
- **Trata conteúdo capturado como não confiável.** OCR, PDF e áudio podem conter
  ruído ou injeção; a IA propõe, o usuário revisa e confirma.
- **Destino Inteligente.** Ao analisar uma captura, apresenta opções
  ("parece Nota / Checklist / Compromisso / Ideia / Projeto — onde salvar?") e
  **nunca salva automaticamente**.
- **Respeita privacidade.** Não expõe chaves, não registra imagem bruta em logs,
  processa no servidor (Edge Functions).
- **Reversível e auditável.** Toda ação da IA fica registrada e pode ser
  desfeita/rastreada.
- **Degrada com elegância.** Sem provedor remoto, cai para o modo mock/local sem
  quebrar a experiência.

## 7. Como decidimos adicionar funcionalidades

Toda proposta passa por este crivo, **nesta ordem**:

1. **Pertence a um pilar?** Se não é Capturar, Organizar, Executar ou Evoluir,
   provavelmente não é nossa.
2. **Reduz carga mental ou fricção?** Se aumenta, recusar.
3. **Reforça a identidade própria?** Se é "porque o concorrente X tem", recusar.
4. **Respeita os princípios?** (captura rápida, decisão do usuário, nada se
   perde, privacidade, simplicidade).
5. **Cabe incrementalmente?** Preferimos milestones pequenos e estáveis a
   grandes entregas arriscadas.
6. **Podemos manter?** Sem bibliotecas pesadas desnecessárias; reuso antes de
   criar; bundle sob controle.
7. **Tem estado de erro, vazio e loading tratados?** Se não, não está pronto.

Quando em dúvida: **cortar escopo, não qualidade.**

## 8. O que nunca devemos fazer

- ❌ **Nunca** deixar a IA executar ação de escrita/destrutiva sem confirmação.
- ❌ **Nunca** tornar a captura lenta ou cheia de campos obrigatórios.
- ❌ **Nunca** perder o histórico/origem de uma captura.
- ❌ **Nunca** colocar chaves de IA ou segredos no frontend.
- ❌ **Nunca** armazenar imagem/arquivo sensível permanentemente sem
  consentimento explícito.
- ❌ **Nunca** registrar imagem bruta em logs.
- ❌ **Nunca** virar um clone de Notion, Todoist ou Google Calendar.
- ❌ **Nunca** transformar "Para pensar" em depósito morto — é um incubador vivo.
- ❌ **Nunca** sacrificar estabilidade/acessibilidade por um recurso a mais.
- ❌ **Nunca** criar sistemas paralelos redundantes (ex.: segundo sistema de
  categorias) — reusar o que já existe.
- ❌ **Nunca** introduzir mudança de banco/arquitetura sem plano, RLS e revisão.

## 9. Diretrizes de UX

- **Mobile-first e PWA-first.** A captura precisa ser instantânea no celular
  (botão flutuante, uma tela para tudo). Funcionar bem "na tela inicial" do
  iPhone é requisito, não extra.
- **Um ponto de entrada.** Rumo à **Captura Universal**: uma tela que aceita
  texto, colagem, imagem, foto, PDF, áudio e links.
- **Calma visual.** Espaçamento generoso, tipografia legível, hierarquia clara,
  animações sutis (60fps), dark/light impecáveis.
- **Estados sempre tratados.** Vazio (ícone + frase + ação), erro (mensagem
  amigável + "Tentar novamente"), carregando (skeleton), sucesso (feedback
  discreto). Nada pode sumir em silêncio nem travar em loading.
- **Confirmação antes de agir** em tudo que a IA propõe.
- **"Para pensar" tem identidade própria** — visual criativo, distinto da Caixa
  de Entrada, transmitindo possibilidade e inspiração.
- **Acessibilidade.** Navegação por teclado, foco visível e retornável, `aria`,
  contraste adequado, alvos de toque generosos.
- **Reversibilidade.** Desfazer fácil; arquivar em vez de excluir quando
  possível; exclusão definitiva é explícita.

## 10. Roadmap macro

Horizonte de produto (as datas são direção, não compromisso):

1. **Fundação de agente & assistente** — ✅ concluído (Tool Registry, Agent
   Runtime, Provider Manager mock↔Edge, Context Engine, memória, logging).
2. **Experiência premium** — ✅ concluído (Assistente premium, Dashboard Vivo,
   onboarding conversacional, product polish).
3. **Estabilização RC (RC-1A / RC-1B)** — ✅ concluído (segurança de links,
   fluxos, error boundary global, a11y de modais, estados de erro consistentes,
   workspace ausente).
4. **📥 Caixa de Entrada Inteligente** — 🔜 **próximo grande épico** (pilar
   Capturar/Organizar). Milestones A→D (ver `CAIXA_DE_ENTRADA_INTELIGENTE.md`).
5. **Evoluir — Inteligência de padrões** — Insights avançados, **Revisão
   Semanal**, Destino Inteligente maduro.
6. **Captura Universal** — tela única de entrada (texto/colar/imagem/PDF/áudio/
   links/compartilhamentos).
7. **Multimídia** — Foto (visão/OCR com compreensão), PDF, depois **Áudio**.
8. **Colaboração** — compartilhamento/ delegação ricos, papéis, times.
9. **Integrações** — Google Calendar, importações, entrada por compartilhamento
   do SO.
10. **Canais** — Push e (futuro) Voz — **não iniciados**, previstos.

> Regra de sequência: **Capturar e Organizar** amadurecem antes de investir
> pesado em **Evoluir**; canais (Voz/Push) e IA remota entram por último e sob
> feature flags.

## 11. Glossário

- **Captura:** qualquer informação que entra no sistema (texto, checklist, foto,
  PDF, áudio, link, compartilhamento, IA, integração). Vive na Caixa de Entrada.
- **Caixa de Entrada Inteligente (📥):** módulo onde toda captura chega primeiro.
  Sucessora oficial do antigo "Bloco de Notas".
- **Para pensar:** incubador de ideias, projetos, negócios, viagens,
  investimentos, melhorias e sonhos. **Não** é arquivo morto; tem identidade
  visual criativa própria. Mover para lá **não** cria tarefa nem data.
- **Nota / Item de captura:** unidade da Caixa de Entrada (`inbox_item`).
- **Origem:** de onde a captura veio (manual, checklist, foto, PDF, áudio,
  assistente, compartilhado, integração, importado, convertido de atividade).
  Base para estatísticas e IA.
- **Estado de processamento:** ciclo de vida da captura (novo → precisa decidir →
  em processamento → processado → arquivado → convertido). Preservado no
  histórico.
- **Destino Inteligente:** sugestão da IA sobre onde salvar uma captura
  analisada (nota, checklist, compromisso, ideia, projeto) — sempre com
  confirmação.
- **Conversão:** transformar uma captura em **atividade** da Agenda, mantendo
  nota e tarefa vinculadas e o histórico preservado.
- **Timeline / Histórico:** linha do tempo de eventos de uma captura (criada,
  editada, compartilhada, delegada, movida, convertida, concluída, arquivada).
- **Revisão Semanal:** rotina (prevista) em que a IA **sugere** revisitar notas
  esquecidas, ideias antigas e itens nunca processados. Nunca executa sozinha.
- **Captura Universal:** tela única (futura) capaz de receber qualquer tipo de
  entrada — o principal ponto de entrada do sistema.
- **Workspace:** tenant/espaço (Pessoal, Família, Projetos...). Tudo é escopado
  por ele; base de toda a autorização (RLS).
- **Agente / Tool Registry / Agent Runtime:** camada que executa **apenas**
  intents permitidos (allowlist), com política de confirmação por origem.
- **Provider Manager:** decide interpretação/análise entre **mock** (local) e
  **remoto** (Edge Function), sob feature flag; chaves só no servidor.
- **Insight:** observação por regras/IA que **sugere** uma ação, exibida de
  forma discreta e humana.
- **Segundo cérebro:** metáfora-guia do produto — capturar tudo, organizar
  depois, executar quando decidir, evoluir com o tempo.

---

*Este documento é a bússola da Agenda360. Recursos vêm e vão; a visão permanece.*
