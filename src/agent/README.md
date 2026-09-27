# Agente do Agenda 360 — arquitetura

Duas camadas, separadas de proposito. A regra de ouro: **o que garante correção
é determinístico; o que entende linguagem é substituível.**

```
mensagem
  │
  ├─ conversationMemory   histórico + intenção pendente (ai_conversations.context)
  ├─ contextEngine        today, now, timezone, categorias, tarefas recentes, histórico
  │
  ├─ providerManager ─────────────────── CAMADA SEMÂNTICA (substituível)
  │     └─ local: nlu/localNlu.js        ← hoje (offline, sem chave)
  │     └─ remoto: Edge `ai-interpret`   ← quando `ai.remote` for ligada
  │        (contrato idêntico dos dois lados)
  │
  ├─ slots.js ────────────────────────── CAMADA DETERMINÍSTICA
  │     mergeTurn     este turno continua a intenção anterior?
  │     missingSlots  o que falta MESMO (nunca inventa data/hora)
  │     slotQuestion  UMA pergunta, só do que falta
  │
  ├─ nlu/temporal.js  datas/horas PT-BR resolvidas com today/now do contexto
  ├─ nlu/title.js     título = texto do usuário − spans temporais − comando
  │
  ├─ agentRuntime     propose → (confirmação humana) → confirm
  ├─ toolRegistry     allowlist de intents + validação de schema
  └─ aiActionsService registro em ai_actions (proposed/applied/dismissed)
```

## O que é determinístico (não muda com o provider)

- resolução de datas relativas (`amanhã`, `sexta`, `semana que vem`, `daqui a 2h`);
- política de ambiguidade: **nunca inventar data ou horário**; período do dia
  (`depois do almoço`) vira nota, não vira `start_time`;
- slot-filling e continuidade multi-turno;
- validação de payload, allowlist de ferramentas, confirmação obrigatória em
  toda escrita, bloqueio de ação em massa;
- identidade (`workspaceId`/`userId`) sempre da sessão, nunca do modelo.

## O que é semântico (hoje local, amanhã pode ser LLM)

Apenas: **qual é a intenção e quais campos o usuário mencionou**.

`nlu/localNlu.js` reconhece padrões de PT-BR (inclusive sem verbo de comando:
"preciso…", "tenho…", "não posso esquecer…"). É bom em frases diretas do dia a
dia e honesto sobre o limite: não compreende texto longo, ironia, negociação,
nem reformulação livre. Isso é trabalho de modelo.

Trocar para LLM = trocar `providerManager.interpret`. Nada em `slots.js`,
`temporal.js`, `toolRegistry` ou `agentRuntime` precisa mudar — e as garantias
acima continuam valendo mesmo que o modelo erre.

## Testes que sustentam isso

| arquivo | cobre |
| --- | --- |
| `nlu/temporal.test.js` | datas, horas, períodos, respostas curtas |
| `nlu/title.test.js` | título sem resíduo (`08:30hs` → sem "s") e sem reescrita |
| `__tests__/realPhrases.test.js` | as 10 frases do QA real + variação linguística + proteções |
| `__tests__/multiTurn.test.js` | slot-filling ponta a ponta pelo assistant |
| `conversationMemory.test.js` | intenção pendente em `ai_conversations.context` |
