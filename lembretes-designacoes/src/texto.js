// Utilidades para nomes e textos.

/** Chave de comparação: sem acentos, minúsculas, espaços únicos. "José  da Silva" -> "jose da silva" */
export function chaveNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Remove espaços sobrando. */
export function limparNome(nome) {
  return String(nome ?? '').replace(/\s+/g, ' ').trim();
}

export function primeiroNome(nome) {
  return limparNome(nome).split(' ')[0] ?? '';
}

/** ["A"] -> "A";  ["A","B"] -> "A e B";  ["A","B","C"] -> "A, B e C" */
export function juntarLista(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}
