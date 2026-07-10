// ---------------------------------------------------------------------------
// Validador de schema minimalista e sem dependencias.
// Cada ferramenta declara um schema { campo: spec }. Spec:
//   { type, required, values (enum), default, max }
// Tipos: string | number | boolean | date (YYYY-MM-DD) | time (HH:MM) |
//        enum | id (string nao vazia)
// Retorna { valid, errors[], value } — ignora chaves desconhecidas (nao executa
// nada fora do contrato).
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function checkType(key, spec, value, errors) {
  switch (spec.type) {
    case 'string':
    case 'id':
      if (typeof value !== 'string') errors.push(`${key} deve ser texto`)
      else if (spec.type === 'id' && value.trim() === '')
        errors.push(`${key} invalido`)
      else if (spec.max && value.length > spec.max)
        errors.push(`${key} excede ${spec.max} caracteres`)
      break
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value))
        errors.push(`${key} deve ser numero`)
      break
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${key} deve ser booleano`)
      break
    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value))
        errors.push(`${key} deve ser uma data YYYY-MM-DD`)
      break
    case 'time':
      if (typeof value !== 'string' || !TIME_RE.test(value))
        errors.push(`${key} deve ser um horario HH:MM`)
      break
    case 'enum':
      if (!spec.values?.includes(value))
        errors.push(`${key} deve ser um de: ${spec.values?.join(', ')}`)
      break
    default:
      errors.push(`${key}: tipo de schema desconhecido`)
  }
}

export function validateSchema(schema, input = {}) {
  const errors = []
  const value = {}

  for (const [key, spec] of Object.entries(schema)) {
    let v = input?.[key]
    const empty = v === undefined || v === null || v === ''

    if (empty) {
      if (spec.required) {
        errors.push(`${key} é obrigatório`)
        continue
      }
      if (spec.default !== undefined) {
        value[key] = spec.default
      }
      // campo opcional ausente: simplesmente nao entra no value
      continue
    }

    checkType(key, spec, v, errors)
    if (errors.length === 0 || !errors.some((e) => e.startsWith(key))) {
      value[key] = v
    }
  }

  return { valid: errors.length === 0, errors, value }
}
