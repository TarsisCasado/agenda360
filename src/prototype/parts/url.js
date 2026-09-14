// O dominio de um link diz mais que a URL inteira: "exemplo.com" se le, uma
// query string de 120 caracteres nao. Guardar e uma coisa; RECONHECER depois e
// outra, e e a segunda que faz a memoria valer.
export function dominio(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
