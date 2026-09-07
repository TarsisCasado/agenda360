// ---------------------------------------------------------------------------
// O contrato canonico vive em `supabase/functions/_shared/contract.js` — o
// unico lugar que o front (Vite) e a Edge Function (Deno) alcancam. Este
// arquivo e so a porta de entrada do front, para que nenhum import existente
// precisasse mudar de caminho quando o contrato se mudou (CP6.2).
//
// Por que a fonte de verdade desceu para `supabase/`: duas definicoes do mesmo
// contrato divergem em silencio. Ver o cabecalho do arquivo compartilhado.
// ---------------------------------------------------------------------------
export {
  CONTRACT_VERSION,
  TURN_KIND,
  ALLOWED_INTENTS,
  KIND,
  PRIORITIES,
  STATUSES,
  PATCH_FIELD_NAMES,
  parseInterpretation,
  emptyInterpretation,
} from '../../../supabase/functions/_shared/contract.js'
