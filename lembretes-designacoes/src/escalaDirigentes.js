// Escala de dirigentes de campo sugerida por rodízio. É só um RASCUNHO para o responsável revisar.
//
// Dias de saída (regras da congregação):
//   segunda: Casa do SR. Osvaldo 18:00 · quarta (1ª e 2ª do mês): Salão do Reino 18:00
//   quarta (3ª em diante): Salão do Reino (Cartas) 18:00 · sábado: Salão do Reino 08:30
//   1º domingo: Salão do Reino 08:30 (os demais domingos são dos chefes de grupo, fora desta lista)
// Quem pode cada tipo de dia: quem já dirigiu nesse tipo de dia (aprendido do histórico).
// Escolha: quem está há mais tempo sem dirigir AQUELE tipo de dia; empate: menos saídas nos
// últimos 90 dias; evita a mesma pessoa em saídas com menos de 3 dias de diferença.

const NOMES_DIA = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
const DIA_MS = 86400000;
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / DIA_MS);

export const TIPOS = {
  seg: { local: 'Casa do SR. Osvaldo', horario: '18:00', rotulo: 'segundas' },
  qua: { local: 'Salão do Reino', horario: '18:00', rotulo: 'quartas de campo' },
  'qua-cartas': { local: 'Salão do Reino (Cartas)', horario: '18:00', rotulo: 'quartas de cartas' },
  sab: { local: 'Salão do Reino', horario: '08:30', rotulo: 'sábados' },
  dom1: { local: 'Salão do Reino', horario: '08:30', rotulo: '1º domingo' },
};

/** Tipo de saída de uma data já programada (para ler o histórico). */
export function tipoDaSaida(data, local = '') {
  const d = new Date(`${data}T12:00:00Z`).getUTCDay();
  const n = Math.ceil(Number(data.slice(8, 10)) / 7);
  if (d === 1) return 'seg';
  if (d === 3) return /carta/i.test(local) || n > 2 ? 'qua-cartas' : 'qua';
  if (d === 6) return 'sab';
  if (d === 0 && n === 1) return 'dom1';
  return null;
}

/** Saídas do mês ("AAAA-MM") que entram na lista de dirigentes. */
export function saidasDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const lista = [];
  for (let d = 1; d <= total; d++) {
    const data = `${mes}-${String(d).padStart(2, '0')}`;
    const tipo = tipoDaSaida(data);
    if (tipo) lista.push({ data, tipo, dia: NOMES_DIA[new Date(`${data}T12:00:00Z`).getUTCDay()], ...TIPOS[tipo] });
  }
  return lista;
}

/**
 * @param {{data, tipo}[]} saidas
 * @param {(tipo:string) => {pessoa:string, nome:string}[]} candidatos
 * @param {{pessoa:string, tipo:string, data:string}[]} historico
 */
export function sugerirDirigentes(saidas, candidatos, historico) {
  const feitas = [...historico];
  const avisos = [];
  const ultima = (p, tipo, antes) => feitas.filter((h) => h.pessoa === p && (!tipo || h.tipo === tipo) && h.data < antes).reduce((m, h) => (h.data > m ? h.data : m), '');
  const recentes = (p, antes) => feitas.filter((h) => h.pessoa === p && h.data < antes && dias(h.data, antes) <= 90).length;
  const perto = (p, data) => feitas.some((h) => h.pessoa === p && Math.abs(dias(h.data, data)) < 3);
  const resultado = saidas.map((s) => {
    const todos = candidatos(s.tipo);
    let opcoes = todos.filter((c) => !perto(c.pessoa, s.data));
    if (!opcoes.length) opcoes = todos;
    if (!opcoes.length) {
      avisos.push(`${s.data}: ninguém no histórico dirigiu ${TIPOS[s.tipo].rotulo} — escolha à mão.`);
      return { ...s, nome: '', pessoa: null, motivo: 'sem candidato no histórico' };
    }
    const [melhor] = opcoes
      .map((c) => ({ c, ut: ultima(c.pessoa, s.tipo, s.data), rec: recentes(c.pessoa, s.data), ua: ultima(c.pessoa, null, s.data) }))
      .sort((x, y) => x.ut.localeCompare(y.ut) || x.rec - y.rec || x.ua.localeCompare(y.ua) || x.c.nome.localeCompare(y.c.nome));
    feitas.push({ pessoa: melhor.c.pessoa, tipo: s.tipo, data: s.data });
    const motivo = melhor.ut ? `última vez nas ${TIPOS[s.tipo].rotulo}: ${melhor.ut} (${dias(melhor.ut, s.data)} dias antes)` : `ainda não tinha dirigido nas ${TIPOS[s.tipo].rotulo} no histórico`;
    return { ...s, nome: melhor.c.nome, pessoa: melhor.c.pessoa, motivo };
  });
  return { saidas: resultado, avisos: [...new Set(avisos)] };
}
