import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { clientsClaim } from 'workbox-core'

// ---------------------------------------------------------------------------
// Service Worker da Agenda 360.
//
// Precache: gerado pelo vite-plugin-pwa (strategy injectManifest) — mesma
// lista de assets que o generateSW anterior gerava automaticamente.
//
// Push: adicionado aqui porque generateSW nao permite anexar listeners
// customizados (`push`/`notificationclick`) — por isso o projeto passou a
// usar injectManifest (ver vite.config.js). O worker de entrega
// (push-delivery-worker) envia um payload JSON cifrado; o navegador decifra
// ANTES de disparar o evento `push` (o SW so ve o JSON em claro).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// O DOCUMENTO NUNCA VEM DO PRECACHE (CP5.5.1)
//
// O BUG: `precacheAndRoute` nao cobre so os assets. Ele registra uma rota que
// tambem responde NAVEGACAO: uma ida a "/" e resolvida para o `index.html` do
// precache (o proprio bundle compilado mostra `directoryIndex: "index.html"`).
// Junte isso ao que o CP5.1.1 deixou de proposito — sem `skipWaiting`, o SW
// novo fica em `waiting` enquanto houver UMA aba aberta — e o resultado e uma
// sessao PRESA no build antigo por tempo indeterminado: o SW velho continua
// entregando o index.html velho, e com ele o bundle principal velho. Como
// "Hoje" e importado ESTATICAMENTE (App.jsx), quem manda na versao de Hoje e
// justamente esse bundle.
//
// Reproduzido antes de corrigir: com o deploy B ja publicado, o reload, a
// navegacao e ate UMA ABA NOVA continuavam renderizando o build A, e
// `performance.getEntriesByType('navigation')[0].deliveryType` respondia
// "cache-storage". Nao era hipotese.
//
// E a INCOERENCIA A -> B -> A sai daqui: o mesmo documento passa a ter duas
// origens possiveis (o precache velho e a rede), e qual delas ganha depende de
// aquele carregamento especifico ter sido ou nao interceptado pelo SW. Nada
// garantia que a sessao escolhesse uma so.
//
// A CORRECAO, e so ela: o documento passa a ser NETWORK-FIRST. Estando online,
// toda carga de pagina traz o HTML atual — logo o bundle atual, logo a versao
// atual. Offline, cai para o ultimo HTML visto e, na falta dele, para o
// `index.html` do precache: o app continua abrindo sem rede.
//
// O que NAO foi feito, de proposito: reintroduzir `skipWaiting()`. Ele
// continua fora, e a garantia do CP5.1.1 continua de pe — um SW novo jamais
// assume uma aba que esta rodando o bundle antigo. Com o documento sempre
// fresco, um SW velho ainda ativo passa a ser inofensivo: ele so serve os
// chunks do build que aquela aba realmente esta executando.
//
// A ORDEM IMPORTA: o Workbox tenta as rotas na ordem de registro, entao esta
// precisa vir ANTES de `precacheAndRoute` para ganhar dele na navegacao.
// ---------------------------------------------------------------------------
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'agenda360-documento',
      networkTimeoutSeconds: 4,
      plugins: [
        {
          // Sem rede e sem copia em runtime: o precache ainda salva a abertura.
          handlerDidError: async () => (await matchPrecache('index.html')) || Response.error(),
        },
      ],
    }),
  ),
)

// Precaches de builds anteriores nao tem por que sobreviver: sem isto eles
// ficam ocupando espaco e podem responder por assets que ninguem mais pede.
cleanupOutdatedCaches()

precacheAndRoute(self.__WB_MANIFEST)

// ---------------------------------------------------------------------------
// ATUALIZACAO — por que NAO ha skipWaiting() aqui.
//
// Ate o CP5.1.1 este arquivo chamava self.skipWaiting() + clientsClaim(): o SW
// novo assumia NA HORA as abas ja abertas. Como o precache novo so contem os
// arquivos do build novo, a aba que continuava rodando o bundle ANTIGO passava
// a pedir chunks que nem o servidor nem o cache tinham mais — e toda rota lazy
// (ou seja, todas menos "Hoje") caia no ErrorBoundary. Foi o incidente do QA.
//
// Sem skipWaiting o SW novo fica em "waiting": a sessao aberta continua sendo
// servida pelo precache que combina com o codigo que ela esta executando, e a
// troca acontece quando o app e fechado e reaberto. clientsClaim() segue util
// SO no primeiro registro (quando ainda nao ha SW controlando a pagina).
//
// Rede de seguranca independente disto: lib/lazyRoute.js recarrega a pagina
// uma vez se um chunk sumir mesmo assim (cache despejado, aba sem SW).
// ---------------------------------------------------------------------------
clientsClaim()

// DIAGNOSTICO TEMPORARIO (Sprint 2 / Etapa 1D — investigacao "ultima milha"
// Safari/macOS). Tudo aqui e so console.log/console.error, visivel no Web
// Inspector do Safari (Desenvolver > [site] > Service Workers) — nao envia
// nada para fora, nao expoe segredo algum (o payload em si so tem
// titulo/hora/id da task, nunca chave privada). Remover apos confirmar que a
// entrega funciona ponta a ponta.
const PUSH_DEBUG_TAG = '[Agenda360:push]'

self.addEventListener('push', (event) => {
  // (C) prova que o evento `push` chegou ao Service Worker — se isto nunca
  // aparecer no console do Safari, a falha e ANTES do SW (decriptacao do
  // navegador ou entrega do sistema, fora do nosso alcance de log).
  console.log(PUSH_DEBUG_TAG, 'evento push recebido', {
    hasData: Boolean(event.data),
    timestamp: new Date().toISOString(),
  })

  let data = { title: 'Agenda 360', body: '' }
  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
      console.log(PUSH_DEBUG_TAG, 'payload decodificado OK', {
        title: parsed?.title,
        hasBody: Boolean(parsed?.body),
        tag: parsed?.tag,
      })
    } else {
      console.warn(PUSH_DEBUG_TAG, 'evento push SEM event.data — usando fallback padrao')
    }
  } catch (err) {
    // Payload nao-JSON (nao deveria acontecer; o worker sempre envia JSON):
    // cai no titulo/corpo padrao acima em vez de falhar a exibicao.
    console.error(PUSH_DEBUG_TAG, 'falha ao fazer event.data.json()', String(err))
    if (event.data) {
      try {
        data.body = event.data.text()
      } catch (err2) {
        console.error(PUSH_DEBUG_TAG, 'falha ao fazer event.data.text()', String(err2))
      }
    }
  }

  const title = data.title || 'Agenda 360'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag,
    data: data.data || {},
    // Explicito de proposito: NUNCA silenciar a notificacao. Sem este campo
    // o padrao da Notifications API ja e nao-silencioso, mas deixamos
    // explicito para que a intencao fique clara e a regra nao se perca numa
    // futura edicao. O som e o SOM NATIVO do sistema (SO/navegador) — nunca
    // tocamos audio via JavaScript aqui.
    silent: false,
  }

  // (D) prova que showNotification foi chamado e se resolveu ou rejeitou.
  const showPromise = self.registration
    .showNotification(title, options)
    .then(() => {
      console.log(PUSH_DEBUG_TAG, 'showNotification() resolveu OK', { title })
    })
    .catch((err) => {
      console.error(PUSH_DEBUG_TAG, 'showNotification() REJEITOU', String(err))
      // Nao relanca: waitUntil ja captura via .catch acima; falhar aqui so
      // faria o SW logar 2x sem mudar o resultado observavel.
    })

  event.waitUntil(showPromise)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Ja existe uma aba da Agenda 360 aberta: navega ATE a atividade e foca,
      // em vez de abrir uma janela nova.
      for (const client of allClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              const navigated = await client.navigate(url)
              return navigated ? navigated.focus() : client.focus()
            } catch {
              return client.focus()
            }
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})
