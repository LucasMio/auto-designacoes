// Normalização de telefones brasileiros para o formato do WhatsApp: 55 + DDD + número.

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function falha(erro) {
  return { ok: false, erro };
}

/**
 * Aceita praticamente qualquer forma de escrever um telefone:
 * "(11) 98765-4321", "11987654321", "+55 11 98765-4321", "011 98765 4321",
 * "11 8765-4321" (celular antigo sem o nono dígito) etc.
 *
 * @param {string|number} entrada
 * @param {{ dddPadrao?: string }} opcoes  DDD usado quando o número vem sem DDD
 * @returns {{ ok: true, numero: string, formatado: string, fixo: boolean } | { ok: false, erro: string }}
 */
export function normalizarTelefone(entrada, { dddPadrao = '' } = {}) {
  const texto = String(entrada ?? '').trim();
  let digitos = texto.replace(/\D/g, '');
  if (!digitos) return falha('telefone vazio');

  // Número estrangeiro (+ seguido de outro código de país): aceita como está.
  if (texto.startsWith('+') && !digitos.startsWith('55')) {
    if (digitos.length < 8 || digitos.length > 15) return falha(`telefone estrangeiro inválido: "${texto}"`);
    return { ok: true, numero: digitos, formatado: `+${digitos}`, fixo: false };
  }

  // Zero à esquerda ("011...") e código de operadora ("0 15 11 ...").
  if (digitos.startsWith('0')) {
    digitos = digitos.replace(/^0+/, '');
    if ((digitos.length === 12 || digitos.length === 13) && !digitos.startsWith('55')) {
      digitos = digitos.slice(2);
    }
  }

  // Remove o DDI 55.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    digitos = digitos.slice(2);
  }

  // Sem DDD: usa o DDD padrão, se configurado.
  if (digitos.length === 8 || digitos.length === 9) {
    const ddd = String(dddPadrao ?? '').replace(/\D/g, '');
    if (!ddd) return falha(`telefone sem DDD: "${texto}"`);
    digitos = ddd + digitos;
  }

  if (digitos.length !== 10 && digitos.length !== 11) {
    return falha(`quantidade de dígitos inválida: "${texto}"`);
  }

  const ddd = digitos.slice(0, 2);
  let numero = digitos.slice(2);
  if (!DDDS_VALIDOS.has(Number(ddd))) return falha(`DDD ${ddd} não existe: "${texto}"`);

  let fixo = false;
  if (numero.length === 9) {
    if (numero[0] !== '9') return falha(`celular com 9 dígitos deve começar com 9: "${texto}"`);
  } else {
    const primeiro = Number(numero[0]);
    if (primeiro >= 6) {
      numero = `9${numero}`; // celular antigo: acrescenta o nono dígito
    } else if (primeiro >= 2) {
      fixo = true; // telefone fixo (pode ter WhatsApp Business)
    } else {
      return falha(`número inválido: "${texto}"`);
    }
  }

  const meio = numero.length === 9 ? `${numero.slice(0, 5)}-${numero.slice(5)}` : `${numero.slice(0, 4)}-${numero.slice(4)}`;
  return { ok: true, numero: `55${ddd}${numero}`, formatado: `+55 (${ddd}) ${meio}`, fixo };
}

/**
 * Variações a testar no WhatsApp. Algumas contas antigas estão registradas
 * sem o nono dígito, então testamos com e sem ele.
 */
export function variantesWhatsApp(numero) {
  const variantes = [numero];
  if (numero.length === 13 && numero.startsWith('55') && numero[4] === '9') {
    variantes.push(numero.slice(0, 4) + numero.slice(5));
  }
  return variantes;
}
