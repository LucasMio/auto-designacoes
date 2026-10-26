// Escala mecânica sugerida (indicadores, leitores e microfones volantes) por rodízio.
// É só um RASCUNHO: o responsável revisa, ajusta no Excel e importa como sempre.
//
// Regra de escolha para cada vaga, entre os autorizados daquela parte:
//   1. quem está há mais tempo sem fazer AQUELA parte (quem nunca fez vem primeiro);
//   2. empate: quem teve menos designações nos últimos 120 dias;
//   3. empate: quem está há mais tempo sem nenhuma designação.
// Restrições: ninguém duas vezes na mesma reunião; evita a mesma pessoa em reuniões com menos de
// 4 dias de distância (se não houver gente suficiente, essa regra é relaxada e fica anotado).

export const VAGAS = [
  { funcao: 'Leitor', quantidade: 1 },
  { funcao: 'Indicador', quantidade: 2 },
  { funcao: 'Microfone volante', quantidade: 2 },
];
const DIA_MS = 86400000;
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / DIA_MS);

/** Terças e sábados do mês ("AAAA-MM"), com o horário de cada uma. */
export function reunioesDoMes(mes, horarios) {
  const [a, m] = mes.split('-').map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const lista = [];
  for (let d = 1; d <= total; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`;
    const semana = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (semana === 2) lista.push({ data: iso, dia: 'terca', horario: horarios.terca });
    if (semana === 6) lista.push({ data: iso, dia: 'sabado', horario: horarios.sabado });
  }
  return lista;
}

/**
 * @param {{data:string, dia:'terca'|'sabado'}[]} reunioes
 * @param {(funcao:string, dia:string) => {pessoa:string, nome:string}[]} autorizados  candidatos de cada parte
 * @param {{pessoa:string, funcao:string, data:string}[]} historico  designações anteriores
 * @returns {{ designacoes: {data, dia, funcao, nome, pessoa, motivo}[], avisos: string[] }}
 */
export function sugerirEscala(reunioes, autorizados, historico) {
  const feitas = [...historico];
  const designacoes = [];
  const avisos = [];
  const ultima = (pessoa, funcao, antes) =>
    feitas.filter((h) => h.pessoa === pessoa && (!funcao || h.funcao === funcao) && h.data < antes).reduce((m, h) => (h.data > m ? h.data : m), '');
  const recentes = (pessoa, antes) => feitas.filter((h) => h.pessoa === pessoa && h.data < antes && dias(h.data, antes) <= 120).length;
  const perto = (pessoa, data) => feitas.some((h) => h.pessoa === pessoa && Math.abs(dias(h.data, data)) < 4);

  for (const r of reunioes) {
    const nestaReuniao = new Set();
    for (const vaga of VAGAS) {
      const candidatos = autorizados(vaga.funcao, r.dia);
      for (let n = 0; n < vaga.quantidade; n++) {
        const livres = candidatos.filter((c) => !nestaReuniao.has(c.pessoa));
        let opcoes = livres.filter((c) => !perto(c.pessoa, r.data));
        if (!opcoes.length) {
          opcoes = livres;
          if (livres.length) avisos.push(`${r.data}: poucos ${vaga.funcao.toLowerCase()}s disponíveis — alguém repete com menos de 4 dias de diferença.`);
        }
        if (!opcoes.length) {
          avisos.push(`${r.data}: não há ${vaga.funcao.toLowerCase()} autorizado sobrando — vaga em branco.`);
          designacoes.push({ ...r, funcao: vaga.funcao, nome: '', pessoa: null, motivo: 'sem candidato' });
          continue;
        }
        const pontuar = (c) => ({ c, uf: ultima(c.pessoa, vaga.funcao, r.data), rec: recentes(c.pessoa, r.data), ua: ultima(c.pessoa, null, r.data) });
        const [melhor] = opcoes
          .map(pontuar)
          .sort((x, y) => x.uf.localeCompare(y.uf) || x.rec - y.rec || x.ua.localeCompare(y.ua) || x.c.nome.localeCompare(y.c.nome));
        const motivo = melhor.uf ? `última vez como ${vaga.funcao.toLowerCase()}: ${melhor.uf} (${dias(melhor.uf, r.data)} dias antes)` : `ainda não tinha feito ${vaga.funcao.toLowerCase()} no histórico`;
        nestaReuniao.add(melhor.c.pessoa);
        feitas.push({ pessoa: melhor.c.pessoa, funcao: vaga.funcao, data: r.data });
        designacoes.push({ ...r, funcao: vaga.funcao, nome: melhor.c.nome, pessoa: melhor.c.pessoa, motivo });
      }
    }
  }
  return { designacoes, avisos: [...new Set(avisos)] };
}
