# QA C1 — validação real no iPhone

Branch `claude/sweet-hypatia-tzkcre`, commit `cbc2fbf`. Ambiente: **Preview**, nunca Production.

Este roteiro é curto de propósito. Ele não busca cobertura: busca descobrir, em
uma sessão, o que impede o uso diário. Anote só o que **falhar** ou **surpreender**.

## Antes de começar

- [ ] Confirmar no rodapé do deploy da Vercel que o commit é `cbc2fbf`.
- [ ] **Confirmar se o Preview usa o mesmo Supabase da Production.** Se usar,
      todo dado criado aqui é dado real. Prefixe tudo que criar com `ZZTESTE `
      para conseguir achar e apagar depois.
- [ ] Safari no iPhone, não Chrome. É o motor que o usuário final terá.

## Parte A — produto real (10 jornadas)

Classifique cada uma: **FUNCIONA / PARCIAL / BLOQUEADA**.

| # | Jornada | O que observar |
|---|---|---|
| 1 | Criar tarefa rapidamente | Quantos toques até estar salva? O título sai íntegro? |
| 2 | Planejar tarefa para hoje | Ela aparece no Hoje depois? |
| 3 | Criar compromisso com horário | O horário salvo é o digitado? |
| 4 | Consultar Dia, Semana e Mês | As três visões abrem e mostram o mesmo compromisso? |
| 5 | Mover tarefa no Kanban | **O gesto de arrastar com o dedo responde?** (congelado em `5049a52` — se regrediu, PARE e reporte) |
| 6 | Criar alerta e receber notificação | Esperado: **BLOQUEADA**. Confirmar a mensagem de erro exibida |
| 7 | Guardar uma ideia | Ela persiste ao sair da tela? |
| 8 | Recuperar pela busca | A ideia de (7) aparece? |
| 9 | Pedir algo ao Copiloto | Ele entende? Pede confirmação antes de escrever? |
| 10 | Fechar o app, reabrir | Tudo que foi criado continua lá? |

Observar em todas: travou? ficou em branco? texto cortado? algo embaixo da barra
de status ou da home bar do iPhone?

## Parte B — protótipo (só se `VITE_PROTOTIPO=true` estiver no Preview)

| # | Verificação | Esperado |
|---|---|---|
| B1 | Abrir `/prototipo/agenda` | A URL **permanece** em `/prototipo/agenda`. Se voltar para `/`, o portão está fechado — pare, nada abaixo vale |
| B2 | Cabeçalho | "Semana de …" + "Agenda". **Sem** a barra "Agenda 360" com hambúrguer |
| B3 | Aba Semana | **Três colunas temporais** (ex.: SEG 21 · TER 22 · QUA 23), não uma lista de "Dia livre" |
| B4 | Faixa de dias | Sete datas no topo, o dia escolhido em destaque |
| B5 | Deslizar na grade | Anda um dia; a rolagem vertical continua funcionando |
| B6 | Tocar um compromisso | Abre o detalhe; voltar devolve à mesma posição |
| B7 | Quinta-feira | Dois compromissos sobrepostos aparecem escalonados e legíveis |
| B8 | Abas Dia e Mês | Continuam como aprovado no UX-M3 |
| B9 | Modo escuro | Alternar no iOS; sem neon, sem cor ilegível |
| B10 | `/prototipo/hoje` | A linguagem UX-M2 (três superfícies) |

## Depois

- [ ] Apagar os dados `ZZTESTE ` criados, se o banco for compartilhado.
- [ ] Mandar os achados: o que falhou, com print quando der.

Não é preciso relatar o que funcionou — só o que não funcionou.
