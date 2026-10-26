// Interpreta planilhas de designações/contatos e aplica as mudanças no banco.
import { DateTime } from 'luxon';
import { transacao } from './banco.js';
import { lembretesAgendados, planejarLembretes, tiposConfigurados } from './planejamento.js';
import { normalizarTelefone } from './telefone.js';
import { FUSO, diaDaSemana, formatarData, momentoReuniao, normalizarHorario, paraBanco } from './tempo.js';
import { chaveNome, limparNome } from './texto.js';

// Quantas pessoas cada função costuma ter por reunião (só para alertar se faltar alguém).
export const QUANTIDADE_ESPERADA = { Indicador: 2, Leitor: 1, 'Microfone volante': 2 };
// Partes da lista de discursos públicos (aba "Arranjos Discursos").
export const LISTA_DISCURSOS = ['Presidente da reunião', 'Discurso público'];

const MESES = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5,
  junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10,
  novembro: 11, nov: 11, dezembro: 12, dez: 12,
};

// Nomes aceitos para cada coluna (comparados sem acentos, espaços e maiúsculas).
const COLUNAS = {
  data: ['data', 'datas', 'dia', 'datareuniao', 'datadareuniao', 'reuniao'],
  horario: ['horario', 'hora', 'horariodareuniao', 'horarioreuniao'],
  funcao: ['funcao', 'designacao', 'parte', 'tarefa', 'privilegio', 'atribuicao'],
  nome: ['nome', 'nomecompleto', 'pessoa', 'irmao', 'designado', 'responsavel', 'publicador'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'numero', 'tel', 'contato', 'telefonecelular', 'whats'],
  local: ['local', 'lugar', 'ponto', 'pontodeencontro', 'saida'],
  observacao: ['observacao', 'obs', 'territorio', 'detalhe', 'anotacao', 'nota', 'tema', 'temadodiscurso'],
  congregacao: ['congregacao', 'congregacaodoorador'],
  diasemana: ['dias', 'diadasemana', 'diasemana'],
  apelidos: ['outrosnomes', 'outronome', 'apelido', 'apelidos', 'tambemaparececomo', 'nomenalista', 'comoaparecenalista'],
};

const chaveColuna = (v) => chaveNome(v).replace(/ /g, '');

function tipoDaColuna(valor) {
  const k = chaveColuna(valor);
  for (const [tipo, nomes] of Object.entries(COLUNAS)) if (nomes.includes(k)) return tipo;
  return null;
}

/** "Indicador 1", "Leitor de A Sentinela", "Microfone 2", "Volante" -> nome padronizado da função. */
export function funcaoCanonica(texto) {
  const k = chaveColuna(texto);
  if (!k) return null;
  if (k.startsWith('indicador')) return 'Indicador';
  if (k.startsWith('leitor') || k.includes('leitura')) return 'Leitor';
  if (k.includes('microfone') || k.includes('volante') || k.startsWith('mic')) return 'Microfone volante';
  if (k.startsWith('dirigente') || k.includes('dirigentedecampo')) return 'Dirigente de campo';
  if (k.startsWith('presidente')) return 'Presidente da reunião';
  if (k.startsWith('orador')) return 'Discurso público';
  return null;
}

function semAcentos(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function montarData(ano, mes, dia, agora, anoPadrao = null) {
  if (ano === null && anoPadrao) ano = anoPadrao;
  if (ano === null) {
    // Sem ano: usa o ano atual, ou o próximo se a data já passou há mais de 60 dias.
    let dt = DateTime.fromObject({ year: agora.year, month: mes, day: dia }, { zone: FUSO });
    if (dt.isValid && dt < agora.minus({ days: 60 })) dt = dt.plus({ years: 1 });
    return dt.isValid ? dt.toISODate() : null;
  }
  if (ano < 100) ano += 2000;
  const dt = DateTime.fromObject({ year: ano, month: mes, day: dia }, { zone: FUSO });
  return dt.isValid ? dt.toISODate() : null;
}

/**
 * Aceita data do Excel, "14/10/2026", "14/10/26", "14/10", "2026-10-14",
 * "Terça, 14/10/2026", "14 de outubro de 2026". Devolve "AAAA-MM-DD" ou null.
 */
export function interpretarData(valor, agora, anoPadrao = null) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return DateTime.fromJSDate(valor, { zone: 'utc' }).toISODate();
  }
  if (typeof valor === 'number') {
    if (valor < 20000 || valor > 80000) return null; // número de série de data do Excel
    return DateTime.fromObject({ year: 1899, month: 12, day: 30 }, { zone: 'utc' }).plus({ days: Math.floor(valor) }).toISODate();
  }
  const t = semAcentos(valor);
  if (!t) return null;
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return montarData(Number(m[1]), Number(m[2]), Number(m[3]), agora);
  m = t.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (m) return montarData(m[3] ? Number(m[3]) : null, Number(m[2]), Number(m[1]), agora, anoPadrao);
  m = t.match(/(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})\.?(?:\s*(?:de\s+)?(\d{4}))?/);
  if (m && MESES[m[2]]) return montarData(m[3] ? Number(m[3]) : null, MESES[m[2]], Number(m[1]), agora, anoPadrao);
  return null;
}

/** Procura um ano no título da planilha, ex.: "Outubro 2026". Usado nas datas sem ano ("06/10"). */
function anoDoTitulo(linhas) {
  for (const l of linhas.slice(0, 15)) {
    for (const c of l ?? []) {
      if (typeof c !== 'string') continue;
      const m = semAcentos(c).match(/\b(20\d{2})\b/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/** Célula que "com certeza" é uma data (usado para achar cabeçalhos com datas). */
function pareceData(valor) {
  if (valor instanceof Date) return true;
  const t = semAcentos(valor);
  return /\d{1,2}\/\d{1,2}/.test(t) || /\d{1,2}\s*(de\s+)?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/.test(t);
}

export function interpretarHorario(valor) {
  if (valor instanceof Date) {
    const dt = DateTime.fromJSDate(valor, { zone: 'utc' });
    return dt.hour === 0 && dt.minute === 0 ? null : dt.toFormat('HH:mm');
  }
  if (typeof valor === 'number' && valor > 0 && valor < 1) {
    const minutos = Math.round(valor * 24 * 60);
    return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
  }
  return normalizarHorario(String(valor ?? '').trim().replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1'));
}

/** Horário padrão pelo dia da semana (terça ou sábado). */
export function horarioPadrao(data, config) {
  const diaSemana = DateTime.fromISO(data, { zone: FUSO }).weekday;
  if (diaSemana === 2) return config.horarioReunioes.terca;
  if (diaSemana === 6) return config.horarioReunioes.sabado;
  return null;
}

/** "João / Pedro", "João e Pedro", "João; Pedro" -> ["João", "Pedro"] */
export function separarNomes(valor) {
  return String(valor ?? '')
    .split(/\s*(?:\/|;|,|\n|&|\s+e\s+|\s+[-–—]\s+)\s*/i)
    .map(limparNome)
    .filter((n) => chaveNome(n) && !['x', 'xx', 'nd', 'na'].includes(chaveNome(n)));
}

const vazio = (v) => v === null || v === undefined || String(v).trim() === '';

function acharCabecalho(linhas, testar) {
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const mapa = testar(linhas[i] ?? []);
    if (mapa) return { indice: i, mapa };
  }
  return null;
}

function mapearColunas(linha) {
  const mapa = { papeis: [] };
  linha.forEach((celula, i) => {
    const tipo = tipoDaColuna(celula);
    if (tipo && mapa[tipo] === undefined) mapa[tipo] = i;
    else if (!tipo) {
      const funcao = funcaoCanonica(celula);
      if (funcao) mapa.papeis.push({ indice: i, funcao });
    }
  });
  return mapa;
}

/**
 * Lê as designações das abas da planilha. Aceita três formatos:
 *  1) Uma linha por reunião:  Data | Indicador 1 | Indicador 2 | Leitor | Microfone 1 | Microfone 2
 *  2) Uma linha por designação: Data | Função | Nome
 *  3) Quadro com as datas nas colunas e as funções nas linhas.
 * Coluna "Horário" é opcional (sem ela: terça 19:30, sábado 19:00).
 *
 * @returns {{ itens: {data,horario,funcao,nome,origem}[], avisos: string[] }}
 */
export function interpretarDesignacoes(todasAsFolhas, { agora, config }) {
  // A aba "Como foi escolhido" das sugestões de escala é só explicação: não tem designações.
  const folhas = todasAsFolhas.filter((f) => !/como foi escolhido/i.test(f.nome ?? ''));
  const itens = [];
  const avisos = [];

  const adicionar = (data, horarioBruto, funcao, celulaNomes, origem, extras = {}) => {
    const nomes = separarNomes(celulaNomes);
    if (!nomes.length) return;
    const horario = vazio(horarioBruto) ? horarioPadrao(data, config) : interpretarHorario(horarioBruto);
    if (!horario) {
      avisos.push(
        vazio(horarioBruto)
          ? `${origem}: ${formatarData(data)} não é terça nem sábado. Preencha a coluna "Horário" para essa data. Linha ignorada.`
          : `${origem}: horário "${horarioBruto}" não reconhecido. Linha ignorada.`,
      );
      return;
    }
    // A planilha diz o dia da semana? Confere com a data (pega erro de digitação).
    if (!vazio(extras.diaSemana)) {
      const escrito = semAcentos(extras.diaSemana).replace('-feira', '').trim();
      const real = semAcentos(diaDaSemana(data)).replace('-feira', '');
      if (escrito && real !== escrito) {
        avisos.push(`${origem}: a planilha diz "${String(extras.diaSemana).trim()}", mas ${formatarData(data)} é ${diaDaSemana(data)}. Confira a data.`);
      }
    }
    const local = vazio(extras.local) ? null : limparNome(extras.local);
    const observacao = vazio(extras.observacao) ? null : limparNome(extras.observacao);
    // Orador de outra congregação (visitante) não está nos contatos: fica de fora.
    if (funcao === 'Discurso público' && !vazio(extras.congregacao) && !/vila\s*exemplo/i.test(String(extras.congregacao))) return;
    const lista = funcao === 'Dirigente de campo' ? 'dirigentes' : LISTA_DISCURSOS.includes(funcao) ? 'discursos' : 'reuniao';
    for (const nome of nomes) itens.push({ data, horario, funcao, nome, origem, local, observacao, lista });
  };

  for (const folha of folhas) {
    const linhas = folha.linhas;
    const onde = (i) => `Aba "${folha.nome}", linha ${i + 1}`;

    // Formato 2: Data | Função | Nome
    const longo = acharCabecalho(linhas, (l) => {
      const m = mapearColunas(l);
      return m.data !== undefined && m.funcao !== undefined && m.nome !== undefined ? m : null;
    });
    if (longo) {
      const { mapa } = longo;
      let ultimaData = null;
      let ultimoHorario = '';
      for (let i = longo.indice + 1; i < linhas.length; i++) {
        const l = linhas[i] ?? [];
        const [bData, bFuncao, bNome] = [l[mapa.data], l[mapa.funcao], l[mapa.nome]];
        if (vazio(bFuncao) && vazio(bNome)) continue;
        if (!vazio(bData)) {
          ultimaData = interpretarData(bData, agora);
          ultimoHorario = mapa.horario !== undefined ? l[mapa.horario] : '';
          if (!ultimaData) {
            avisos.push(`${onde(i)}: data "${bData}" não reconhecida. Linha ignorada.`);
            continue;
          }
        } else if (mapa.horario !== undefined && !vazio(l[mapa.horario])) {
          ultimoHorario = l[mapa.horario];
        }
        if (!ultimaData) {
          avisos.push(`${onde(i)}: linha sem data. Linha ignorada.`);
          continue;
        }
        const funcao = funcaoCanonica(bFuncao) ?? limparNome(bFuncao);
        if (!funcao) {
          avisos.push(`${onde(i)}: função vazia. Linha ignorada.`);
          continue;
        }
        adicionar(ultimaData, ultimoHorario, funcao, bNome, onde(i), {
          local: mapa.local !== undefined ? l[mapa.local] : '',
          observacao: mapa.observacao !== undefined ? l[mapa.observacao] : '',
          diaSemana: mapa.diasemana !== undefined ? l[mapa.diasemana] : '',
        });
      }
      continue;
    }

    // Formato 1: uma linha por reunião. A coluna da data pode não ter título, e a planilha
    // pode ter vários blocos (ex.: um para Terça e outro para Sábado), cada um com seu cabeçalho.
    const ehCabecalho = (l) => {
      const m = mapearColunas(l);
      return (m.data !== undefined && m.papeis.length) || m.papeis.length >= 2 ? m : null;
    };
    const grade = acharCabecalho(linhas, ehCabecalho);
    if (grade) {
      let mapa = grade.mapa;
      const anoPadrao = anoDoTitulo(linhas);
      const itensAntes = itens.length;
      const avisosDaAba = [];
      const ignoradas = new Set();
      const anotarIgnoradas = (l) => {
        // Colunas que o sistema usa (data, horário, local, observação, dia da semana e as funções).
        const usadas = new Set([...Object.values(mapa).filter((v) => typeof v === 'number'), ...mapa.papeis.map((p) => p.indice)]);
        l.forEach((c, i) => {
          if (!vazio(c) && !usadas.has(i)) ignoradas.add(String(c).trim());
        });
      };
      anotarIgnoradas(linhas[grade.indice] ?? []);
      for (let i = grade.indice + 1; i < linhas.length; i++) {
        const l = linhas[i] ?? [];
        const outroCabecalho = ehCabecalho(l);
        if (outroCabecalho) {
          mapa = outroCabecalho; // começou outro bloco
          anotarIgnoradas(l);
          continue;
        }
        if (mapa.papeis.every((p) => vazio(l[p.indice]))) continue;
        // Data: na coluna "Data" ou, sem título, na primeira célula da linha que seja uma data.
        const celulaData =
          mapa.data !== undefined ? l[mapa.data] : l.find((c, j) => !mapa.papeis.some((p) => p.indice === j) && pareceData(c));
        const data = interpretarData(celulaData, agora, anoPadrao);
        if (!data) {
          // Faixa de título que ocupa a largura toda (ex.: "SÁBADO" mesclado): o mesmo texto em todas as colunas.
          const textos = new Set(mapa.papeis.map((p) => l[p.indice]).filter((c) => !vazio(c)).map((c) => String(c).trim()));
          if (vazio(celulaData) && textos.size === 1) continue;
          // Faixa com o nome do mês (ex.: "NOVEMBRO") mesclada na linha toda: o mesmo texto em todas as células.
          const todosTextos = new Set(l.filter((c) => !vazio(c)).map((c) => String(c).trim()));
          if (todosTextos.size === 1) continue;
          avisosDaAba.push(`${onde(i)}: data "${celulaData ?? ''}" não reconhecida. Linha ignorada.`);
          continue;
        }
        const horario = mapa.horario !== undefined ? l[mapa.horario] : '';
        const extras = {
          local: mapa.local !== undefined ? l[mapa.local] : '',
          observacao: mapa.observacao !== undefined ? l[mapa.observacao] : '',
          diaSemana: mapa.diasemana !== undefined ? l[mapa.diasemana] : '',
          congregacao: mapa.congregacao !== undefined ? l[mapa.congregacao] : '',
        };
        for (const papel of mapa.papeis) adicionar(data, horario, papel.funcao, l[papel.indice], onde(i), extras);
      }
      if (itens.length > itensAntes) {
        if (ignoradas.size) avisos.push(`Aba "${folha.nome}": colunas ignoradas (não são designações atendidas): ${[...ignoradas].join(', ')}`);
        avisos.push(...avisosDaAba);
      } else {
        avisos.push(`Aba "${folha.nome}": não tem datas de reunião (parece uma lista de nomes). Aba ignorada.`);
      }
      continue;
    }

    // Formato 3: datas nas colunas, funções nas linhas
    let colunasData = null;
    let horariosColuna = new Map();
    let encontrouAlgo = false;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i] ?? [];
      const datas = new Map();
      l.forEach((c, j) => {
        if (pareceData(c)) {
          const d = interpretarData(c, agora);
          if (d) datas.set(j, d);
        }
      });
      if (datas.size >= 2) {
        colunasData = datas;
        horariosColuna = new Map();
        continue;
      }
      if (!colunasData) continue;
      const primeiraColunaData = Math.min(...colunasData.keys());
      const rotulo = l.slice(0, primeiraColunaData).find((c) => !vazio(c));
      if (rotulo === undefined) continue;
      if (tipoDaColuna(rotulo) === 'horario') {
        for (const j of colunasData.keys()) if (!vazio(l[j])) horariosColuna.set(j, l[j]);
        continue;
      }
      const funcao = funcaoCanonica(rotulo);
      if (!funcao) continue;
      for (const [j, data] of colunasData) {
        encontrouAlgo = true;
        adicionar(data, horariosColuna.get(j) ?? '', funcao, l[j], onde(i));
      }
    }
    if (!encontrouAlgo) {
      avisos.push(
        `Aba "${folha.nome}": não reconheci o formato (precisa de uma coluna "Data" e colunas como "Indicador", "Leitor", "Microfone"). Aba ignorada.`,
      );
    }
  }

  // Remove repetidos (mesma data + função + pessoa).
  const vistos = new Set();
  const unicos = itens.filter((it) => {
    const k = `${it.data}|${it.funcao}|${chaveNome(it.nome)}`; // mesma pessoa, mesma função, mesmo dia
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // Alerta quando a quantidade de pessoas por função foge do esperado.
  const porData = new Map();
  for (const it of unicos) {
    if (!porData.has(it.data)) porData.set(it.data, new Map());
    const m = porData.get(it.data);
    m.set(it.funcao, (m.get(it.funcao) ?? 0) + 1);
  }
  for (const [data, contagem] of [...porData].sort()) {
    // Datas só de dirigentes de campo não têm indicadores/leitor/microfones.
    if (!Object.keys(QUANTIDADE_ESPERADA).some((f) => contagem.has(f))) continue;
    for (const [funcao, esperado] of Object.entries(QUANTIDADE_ESPERADA)) {
      const achado = contagem.get(funcao) ?? 0;
      if (achado !== esperado) avisos.push(`${formatarData(data)}: esperava ${esperado} × ${funcao}, encontrei ${achado}.`);
    }
  }

  return { itens: unicos, avisos };
}

function inserirLembretes(db, designacaoId, dados, agora, config, { semAviso = false } = {}) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO lembretes (designacao_id, tipo, previsto_para, status, atualizado_em) VALUES (?, ?, ?, 'pendente', ?)`,
  );
  const planejados = planejarLembretes(dados, agora, config).filter((l) => !(semAviso && (l.tipo === 'aviso' || l.tipo === 'resumo')));
  const criados = [];
  for (const l of planejados) {
    const r = stmt.run(designacaoId, l.tipo, paraBanco(l.previsto), paraBanco(agora));
    if (r.changes) criados.push(l.tipo);
  }
  return criados;
}

function desativar(db, designacao, agora, motivo) {
  const momento = paraBanco(agora);
  db.prepare('UPDATE designacoes SET ativa = 0, atualizada_em = ? WHERE id = ?').run(momento, designacao.id);
  db.prepare(
    `UPDATE lembretes SET status = 'cancelado', detalhe = ?, atualizado_em = ?
      WHERE designacao_id = ? AND status IN ('pendente', 'erro')`,
  ).run(motivo, momento, designacao.id);
}

/**
 * Grava as designações no banco.
 * Com substituirDatas = true (padrão), cada data que aparece na planilha é substituída:
 * quem saiu da planilha tem a designação removida e os lembretes pendentes cancelados.
 *
 * @returns resumo { novas, removidas, atualizadas, mantidas, passadas }
 */
export function aplicarDesignacoes(db, itens, { agora, config, substituirDatas = true, apenasConferir = false }) {
  const resumo = { novas: [], removidas: [], atualizadas: [], mantidas: 0, passadas: 0 };
  const momento = paraBanco(agora);

  // Agrupa por data E por lista: importar a lista dos dirigentes não mexe na das reuniões,
  // mesmo quando as duas caem no mesmo dia.
  const porData = new Map();
  for (const it of itens) {
    const chaveGrupo = `${it.data}|${it.lista ?? 'reuniao'}`;
    if (!porData.has(chaveGrupo)) porData.set(chaveGrupo, []);
    porData.get(chaveGrupo).push(it);
  }

  transacao(
    db,
    () => {
      for (const [chaveGrupo, lista] of [...porData].sort()) {
        const [data, nomeDaLista] = chaveGrupo.split('|');
        if (momentoReuniao(data, lista[0].horario) <= agora) {
          resumo.passadas += lista.length;
          continue;
        }
        const existentes = db.prepare('SELECT * FROM designacoes WHERE data = ? AND lista = ?').all(data, nomeDaLista);
        const chaveDe = (funcao, chave) => `${funcao}|${chave}`;
        const novasChaves = new Set(lista.map((it) => chaveDe(it.funcao, chaveNome(it.nome))));

        if (substituirDatas) {
          for (const e of existentes) {
            if (e.ativa && !novasChaves.has(chaveDe(e.funcao, e.chave))) {
              desativar(db, e, agora, 'designação removida na importação');
              resumo.removidas.push({ data, funcao: e.funcao, nome: e.nome });
            }
          }
        }

        for (const it of lista) {
          const chave = chaveNome(it.nome);
          const e = existentes.find((x) => x.funcao === it.funcao && x.chave === chave);
          if (!e) {
            const r = db
              .prepare(
                `INSERT INTO designacoes (data, horario, funcao, nome, chave, local, observacao, lista, ativa, criada_em, atualizada_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
              )
              .run(data, it.horario, it.funcao, it.nome, chave, it.local ?? null, it.observacao ?? null, nomeDaLista, momento, momento);
            const lembretes = inserirLembretes(db, Number(r.lastInsertRowid), it, agora, config);
            resumo.novas.push({ ...it, lembretes });
          } else if (!e.ativa) {
            // Designação que tinha sido removida e voltou.
            db.prepare('UPDATE designacoes SET ativa = 1, horario = ?, nome = ?, local = ?, observacao = ?, atualizada_em = ? WHERE id = ?').run(
              it.horario, it.nome, it.local ?? null, it.observacao ?? null, momento, e.id,
            );
            db.prepare(`DELETE FROM lembretes WHERE designacao_id = ? AND status = 'cancelado'`).run(e.id);
            const jaRecebeu = db.prepare(`SELECT COUNT(*) AS n FROM lembretes WHERE designacao_id = ? AND status = 'enviado'`).get(e.id).n > 0;
            const lembretes = inserirLembretes(db, e.id, it, agora, config, { semAviso: jaRecebeu });
            resumo.novas.push({ ...it, lembretes, reativada: true });
          } else if (e.horario !== it.horario || e.nome !== it.nome || e.local !== (it.local ?? null) || e.observacao !== (it.observacao ?? null)) {
            db.prepare('UPDATE designacoes SET horario = ?, nome = ?, local = ?, observacao = ?, atualizada_em = ? WHERE id = ?').run(
              it.horario, it.nome, it.local ?? null, it.observacao ?? null, momento, e.id,
            );
            resumo.atualizadas.push({ ...it, horarioAnterior: e.horario });
          } else {
            resumo.mantidas++;
          }
        }
      }
    },
    { desfazer: apenasConferir },
  );

  return resumo;
}

/**
 * Remove as designações de uma pessoa numa data (opcionalmente só de uma função)
 * e cancela os lembretes pendentes. Devolve a lista do que foi removido.
 */
export function removerDesignacoes(db, { data, nome, funcao = null }, { agora }) {
  const chave = chaveNome(nome);
  return transacao(db, () => {
    const alvo = db
      .prepare('SELECT * FROM designacoes WHERE data = ? AND chave = ? AND ativa = 1')
      .all(data, chave)
      .filter((d) => !funcao || d.funcao === funcao);
    for (const d of alvo) desativar(db, d, agora, 'designação removida manualmente');
    return alvo;
  });
}

/**
 * Lê contatos de uma planilha com colunas "Nome" e "Telefone".
 * Sem cabeçalho, usa a coluna A como nome e a B como telefone.
 */
export function interpretarContatos(folhas) {
  const contatos = [];
  const avisos = [];
  const semTelefone = [];
  for (const folha of folhas) {
    const cab = acharCabecalho(folha.linhas, (l) => {
      const m = mapearColunas(l);
      return m.nome !== undefined && m.telefone !== undefined ? m : null;
    });
    const iNome = cab ? cab.mapa.nome : 0;
    const iTel = cab ? cab.mapa.telefone : 1;
    const iApelidos = cab ? cab.mapa.apelidos : undefined;
    for (let i = cab ? cab.indice + 1 : 0; i < folha.linhas.length; i++) {
      const l = folha.linhas[i] ?? [];
      const nome = limparNome(l[iNome]);
      const telefone = String(l[iTel] ?? '').trim();
      const apelidos = iApelidos !== undefined ? separarNomes(l[iApelidos]) : [];
      if (!nome && !telefone) continue;
      if (!cab && String(telefone).replace(/\D/g, '').length < 8) continue; // provavelmente cabeçalho/lixo
      if (!nome) {
        avisos.push(`Aba "${folha.nome}", linha ${i + 1}: telefone sem nome. Ignorado.`);
        continue;
      }
      if (!telefone) {
        semTelefone.push(nome);
        continue;
      }
      contatos.push({ nome, telefone, apelidos, origem: `Aba "${folha.nome}", linha ${i + 1}` });
    }
  }
  if (semTelefone.length) avisos.push(`Ainda sem telefone (ignorados por enquanto): ${semTelefone.join(", ")}`);
  return { contatos, avisos };
}

/** Cadastra/atualiza contatos. Devolve { novos, atualizados, iguais, problemas }. */
export function aplicarContatos(db, contatos, { agora, config }) {
  const resumo = { novos: 0, atualizados: 0, iguais: 0, problemas: [] };
  const momento = paraBanco(agora);
  const vistos = new Map();
  transacao(db, () => {
    for (const c of contatos) {
      const chave = chaveNome(c.nome);
      if (vistos.has(chave) && vistos.get(chave) !== c.telefone) {
        resumo.problemas.push({ nome: c.nome, erro: `nome repetido na planilha com telefones diferentes; ficou o último (${c.telefone})` });
      }
      vistos.set(chave, c.telefone);
      const tel = normalizarTelefone(c.telefone, { dddPadrao: config.dddPadrao });
      if (!tel.ok) resumo.problemas.push({ nome: c.nome, erro: tel.erro });

      const existente = db.prepare('SELECT * FROM contatos WHERE chave = ?').get(chave);
      let contatoId;
      const apelidosAntes = existente
        ? db.prepare('SELECT chave FROM apelidos WHERE contato_id = ? ORDER BY chave').all(existente.id).map((a) => a.chave).join('|')
        : '';
      if (!existente) {
        const r = db.prepare('INSERT INTO contatos (nome, chave, telefone, atualizado_em) VALUES (?, ?, ?, ?)').run(c.nome, chave, c.telefone, momento);
        contatoId = Number(r.lastInsertRowid);
        resumo.novos++;
      } else {
        contatoId = existente.id;
        if (existente.telefone !== c.telefone || existente.nome !== c.nome) {
          db.prepare('UPDATE contatos SET nome = ?, telefone = ?, atualizado_em = ? WHERE id = ?').run(c.nome, c.telefone, momento, existente.id);
        }
      }

      // "Outros nomes": substitui os anteriores deste contato.
      db.prepare('DELETE FROM apelidos WHERE contato_id = ?').run(contatoId);
      for (const apelido of c.apelidos ?? []) {
        const chaveApelido = chaveNome(apelido);
        if (!chaveApelido || chaveApelido === chave) continue;
        const dono =
          db.prepare('SELECT nome FROM contatos WHERE chave = ? AND id <> ?').get(chaveApelido, contatoId) ??
          db.prepare('SELECT c.nome FROM apelidos a JOIN contatos c ON c.id = a.contato_id WHERE a.chave = ? AND a.contato_id <> ?').get(chaveApelido, contatoId);
        if (dono) {
          resumo.problemas.push({ nome: c.nome, erro: `o outro nome "${apelido}" já pertence a ${dono.nome}; ignorado` });
          continue;
        }
        db.prepare('INSERT OR REPLACE INTO apelidos (chave, nome, contato_id) VALUES (?, ?, ?)').run(chaveApelido, apelido, contatoId);
      }

      if (existente) {
        const apelidosDepois = db.prepare('SELECT chave FROM apelidos WHERE contato_id = ? ORDER BY chave').all(contatoId).map((a) => a.chave).join('|');
        const mudou = existente.telefone !== c.telefone || existente.nome !== c.nome || apelidosAntes !== apelidosDepois;
        if (mudou) resumo.atualizados++;
        else resumo.iguais++;
      }
    }
  });
  return resumo;
}

/**
 * Lê as listas de autorizados por função (ex.: aba com colunas "Leitura do Livro",
 * "Leitura da Sentinela", "Volantes", "Indicadores"; cada coluna com os nomes embaixo).
 * Para o leitor: "Livro" vale para terça e "Sentinela" para sábado.
 *
 * @returns {{ listas: Map<string, {titulo: string, nomes: string[]}>, abas: string[] }}
 *          chaves: 'Indicador', 'Microfone volante', 'Leitor', 'Leitor:terca', 'Leitor:sabado'
 */
export function interpretarAutorizados(folhas) {
  const listas = new Map();
  const abas = new Set();
  const chaveDaLista = (titulo) => {
    const k = chaveColuna(titulo);
    if (k.includes('leitura') || k.startsWith('leitor')) {
      if (k.includes('livro') || k.includes('estudo')) return 'Leitor:terca';
      if (k.includes('sentinela')) return 'Leitor:sabado';
      return 'Leitor';
    }
    return funcaoCanonica(titulo);
  };
  for (const folha of folhas) {
    const linhas = folha.linhas;
    // Abas com datas são de designações, não de autorizados.
    if (linhas.some((l) => (l ?? []).some((c) => pareceData(c)))) continue;
    for (let i = 0; i < linhas.length; i++) {
      (linhas[i] ?? []).forEach((celula, j) => {
        if (typeof celula !== 'string') return;
        const chave = chaveDaLista(celula);
        if (!chave) return;
        const nomes = [];
        for (let k = i + 1; k < linhas.length; k++) {
          const v = (linhas[k] ?? [])[j];
          if (vazio(v) || chaveDaLista(String(v)) || /presid/i.test(semAcentos(v))) break;
          nomes.push(limparNome(v));
        }
        if (!nomes.length) return;
        const atual = listas.get(chave) ?? { titulo: celula.trim(), nomes: [] };
        atual.nomes.push(...nomes);
        listas.set(chave, atual);
        abas.add(folha.nome);
      });
    }
  }
  return { listas, abas: [...abas] };
}

/**
 * Confere se cada designado está na lista de autorizados da função.
 * O nome da designação pode ser curto ("Diogo") e o da lista completo ("Diogo Amaral"):
 * vale se coincidir com o nome/outros nomes do contato, ou se todas as palavras do nome
 * curto estiverem no nome da lista. Só gera avisos — nada deixa de ser enviado.
 *
 * @param {Function} nomesDaPessoa  (nome) => lista de nomes conhecidos dessa pessoa
 */
export function conferirAutorizados(itens, listas, nomesDaPessoa = (n) => [n]) {
  const avisos = [];
  const palavras = (n) => chaveNome(n).split(' ').filter(Boolean);
  for (const it of itens) {
    let lista = listas.get(it.funcao);
    if (it.funcao === 'Leitor') {
      const dia = DateTime.fromISO(it.data, { zone: FUSO }).weekday;
      lista = listas.get(dia === 2 ? 'Leitor:terca' : dia === 6 ? 'Leitor:sabado' : 'Leitor') ?? listas.get('Leitor');
    }
    if (!lista) continue;
    const conhecidos = nomesDaPessoa(it.nome).map(palavras);
    const autorizado = lista.nomes.some((autorizadoNome) => {
      const pa = palavras(autorizadoNome);
      return conhecidos.some((pn) => pn.join(' ') === pa.join(' ') || (pn.length && pn.every((p) => pa.includes(p))));
    });
    if (!autorizado) {
      avisos.push(`${formatarData(it.data)} — ${it.nome} está como ${it.funcao}, mas não aparece na lista "${lista.titulo}".`);
    }
  }
  return avisos;
}

/**
 * Ajusta os lembretes já agendados à configuração atual ("lembretes" do config.json):
 * - cria os lembretes que faltam (só os que ainda vão acontecer);
 * - reagenda os pendentes cujo horário mudou;
 * - cancela os pendentes de tipos que não são mais usados (ex.: resumo, 30 dias).
 * NUNCA mexe no que já foi enviado. Devolve { criados, reagendados, cancelados }.
 */
export function sincronizarLembretes(db, config, agora) {
  const resultado = { criados: 0, reagendados: 0, cancelados: 0 };
  const designacoes = db.prepare('SELECT * FROM designacoes WHERE ativa = 1 AND data >= ?').all(agora.minus({ days: 1 }).toISODate());
  const mudancas = [];
  for (const d of designacoes) {
    if (momentoReuniao(d.data, d.horario) <= agora) continue;
    const tipos = tiposConfigurados(d.lista, config);
    const desejados = new Map(lembretesAgendados(d, config).map((l) => [l.tipo, l]));
    const permitidos = new Set([...desejados.keys(), 'aviso']);
    if (tipos.includes('resumo')) permitidos.add('resumo');

    const existentes = db.prepare('SELECT * FROM lembretes WHERE designacao_id = ?').all(d.id);
    for (const l of existentes) {
      if (l.status === 'pendente' && !permitidos.has(l.tipo)) mudancas.push({ acao: 'cancelar', id: l.id });
    }
    // Quem já recebeu o aviso da véspera (regra antiga) não recebe outro no dia: só uma vez.
    const jaAvisadoNaVespera = existentes.some((e) => e.tipo === 'vespera' && e.status === 'enviado');
    for (const [tipo, l] of desejados) {
      if (l.previsto <= agora) continue; // já passou: não cria lembrete atrasado
      if (tipo === 'dia' && jaAvisadoNaVespera) continue;
      const previsto = paraBanco(l.previsto);
      const atual = existentes.find((e) => e.tipo === tipo);
      if (!atual) mudancas.push({ acao: 'criar', designacaoId: d.id, tipo, previsto });
      else if (atual.status === 'cancelado') mudancas.push({ acao: 'reativar', id: atual.id, previsto });
      else if (atual.status === 'pendente' && atual.previsto_para !== previsto) mudancas.push({ acao: 'reagendar', id: atual.id, previsto });
    }
  }
  if (!mudancas.length) return resultado;

  const momento = paraBanco(agora);
  transacao(db, () => {
    for (const m of mudancas) {
      if (m.acao === 'cancelar') {
        db.prepare(`UPDATE lembretes SET status = 'cancelado', detalhe = 'não usado na configuração atual', atualizado_em = ? WHERE id = ?`).run(momento, m.id);
        resultado.cancelados++;
      } else if (m.acao === 'criar') {
        db.prepare(`INSERT INTO lembretes (designacao_id, tipo, previsto_para, status, atualizado_em) VALUES (?, ?, ?, 'pendente', ?)`).run(m.designacaoId, m.tipo, m.previsto, momento);
        resultado.criados++;
      } else {
        db.prepare(`UPDATE lembretes SET status = 'pendente', previsto_para = ?, tentativas = 0, detalhe = NULL, atualizado_em = ? WHERE id = ?`).run(m.previsto, momento, m.id);
        if (m.acao === 'reativar') resultado.criados++;
        else resultado.reagendados++;
      }
    }
  });
  return resultado;
}
