// Regras de QUANDO cada lembrete deve ser enviado. Funções puras (sem banco, sem WhatsApp),
// para poderem ser testadas com facilidade.
import { DateTime } from 'luxon';
import { FUSO, momentoReuniao, partesHorario, doBanco } from './tempo.js';

// Do lembrete mais "antigo" para o mais "recente".
export const ORDEM_TIPOS = { '30d': 1, '7d': 2, resumo: 3, aviso: 4, vespera: 5, dia: 6 };

export const NOMES_TIPOS = {
  '30d': '30 dias antes',
  '7d': '7 dias antes',
  dia: 'No dia',
  aviso: 'Aviso imediato',
  resumo: 'Resumo do mês',
  vespera: 'Na véspera',
};

// Esquemas de lembrete (campo "esquema" do config.json).
export const ESQUEMA_RESUMO = 'resumo-mensal'; // 1 resumo ao importar + lembrete no dia
export const ESQUEMA_TRES = 'tres-lembretes'; // 30 dias + 7 dias + no dia

const ORDEM_FUNCOES = ['Indicador', 'Leitor', 'Microfone volante', 'Dirigente de campo'];

/**
 * Horário do lembrete "no dia". Sempre no próprio dia do compromisso:
 * - compromisso de MANHÃ (ex.: campo às 08:30): mais cedo, em "lembreteManha.hora" (padrão 07:00);
 * - compromisso de tarde/noite: em "horaEnvio" (padrão 08:00).
 */
// Dia da semana escrito no config.json -> número do Luxon (segunda = 1 ... domingo = 7).
export const DIAS_DA_SEMANA = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 7 };

function lembreteDoDia(data, horario, config, lista = 'reuniao') {
  const dia = DateTime.fromISO(data, { zone: FUSO });
  // Ex.: campo de SÁBADO -> aviso na véspera (sexta) à noite, em vez de no próprio dia.
  const vespera = config.lembreteVespera;
  if (vespera && (vespera.listas ?? []).includes(lista) && (vespera.diasDaSemana ?? []).some((d) => DIAS_DA_SEMANA[d] === dia.weekday)) {
    return { tipo: 'vespera', previsto: dia.minus({ days: 1 }).set({ ...partesHorario(vespera.hora ?? '19:00'), second: 0, millisecond: 0 }) };
  }
  const manha = config.lembreteManha ?? {};
  const limite = partesHorario(manha.quandoComecarAntesDe ?? '12:00');
  const inicio = partesHorario(horario);
  const deManha = inicio.hour * 60 + inicio.minute < limite.hour * 60 + limite.minute;
  const hora = deManha ? (manha.hora ?? '07:00') : config.horaEnvio;
  return { tipo: 'dia', previsto: dia.set({ ...partesHorario(hora), second: 0, millisecond: 0 }) };
}

function ordemFuncao(funcao) {
  const i = ORDEM_FUNCOES.indexOf(funcao);
  return i === -1 ? ORDEM_FUNCOES.length : i;
}

/**
 * Quais lembretes cada lista recebe (config.json > "lembretes").
 * Ex.: { "reuniao": ["7d", "dia"], "dirigentes": ["dia"] }
 * Tipos possíveis: "30d", "7d", "dia" (manhã do dia, ou véspera à noite se for de manhã) e "resumo".
 */
export function tiposConfigurados(lista, config) {
  const porLista = config.lembretes?.[lista ?? 'reuniao'];
  if (porLista) return porLista;
  return (config.esquema ?? ESQUEMA_TRES) === ESQUEMA_RESUMO ? ['resumo', 'dia'] : ['30d', '7d', 'dia'];
}

/** Lembretes com data marcada (30 dias, 7 dias, no dia/véspera) de uma designação. */
export function lembretesAgendados({ data, horario, lista }, config) {
  const tipos = tiposConfigurados(lista, config);
  const noDia = DateTime.fromISO(data, { zone: FUSO }).set({ ...partesHorario(config.horaEnvio), second: 0, millisecond: 0 });
  const agendados = [];
  if (tipos.includes('30d')) agendados.push({ tipo: '30d', previsto: noDia.minus({ days: 30 }) });
  if (tipos.includes('7d')) agendados.push({ tipo: '7d', previsto: noDia.minus({ days: 7 }) });
  if (tipos.includes('dia')) agendados.push(lembreteDoDia(data, horario, config, lista ?? 'reuniao'));
  return agendados;
}

/**
 * Calcula os lembretes de uma designação, conforme a lista dela (reunião ou dirigentes).
 *
 * - Cada tipo configurado ("30d", "7d", "dia") é agendado no seu horário.
 * - Cadastrada tarde (algum desses horários já passou) e o compromisso ainda não aconteceu:
 *   UM "aviso imediato" no lugar dos lembretes perdidos; os futuros continuam valendo.
 * - Com "resumo": um resumo na hora do cadastro, e os agendados que não caiam no mesmo dia.
 * - Compromisso que já aconteceu não gera lembrete nenhum.
 *
 * @param {{ data: string, horario: string, lista?: string }} designacao
 * @param {DateTime} cadastradaEm  momento do cadastro (normalmente "agora")
 * @param {object} config
 * @returns {{ tipo: string, previsto: DateTime }[]}
 */
export function planejarLembretes(designacao, cadastradaEm, config) {
  if (cadastradaEm >= momentoReuniao(designacao.data, designacao.horario)) return [];
  const agendados = lembretesAgendados(designacao, config);

  if (tiposConfigurados(designacao.lista, config).includes('resumo')) {
    const lista = [{ tipo: 'resumo', previsto: cadastradaEm }];
    for (const l of agendados) {
      // Se o lembrete cairia no mesmo dia do cadastro, o resumo já avisa: não repete.
      if (l.previsto > cadastradaEm && !l.previsto.hasSame(cadastradaEm.setZone(FUSO), 'day')) lista.push(l);
    }
    return lista;
  }

  const futuros = agendados.filter((c) => c.previsto >= cadastradaEm);
  if (futuros.length < agendados.length) futuros.unshift({ tipo: 'aviso', previsto: cadastradaEm });
  return futuros;
}

const ordenarFuncoes = (funcoes) => [...new Set(funcoes)].sort((a, b) => ordemFuncao(a) - ordemFuncao(b));

/**
 * Decide o que enviar AGORA a partir dos lembretes pendentes.
 *
 * - Lembretes de reuniões que já começaram -> "expirados" (não são enviados).
 * - Se uma designação acumulou vários lembretes (ex.: computador desligado), vale só o
 *   mais recente (no dia > aviso > resumo > 7 dias > 30 dias); os outros são "pulados".
 * - Agrupamento (uma mensagem por grupo):
 *     resumo: por pessoa (lista todas as reuniões dela);
 *     demais: por pessoa + data da reunião (lista as funções dela naquela data).
 *
 * @param {Array} pendentes  linhas com id, designacao_id, tipo, previsto_para, data, horario, funcao, nome, chave
 * @param {DateTime} agora
 * @param {Function} [pessoaDe]  converte a chave do nome na chave do contato, para que a mesma
 *        pessoa escrita de jeitos diferentes nas listas ("Brito" e "Carlos Brito") receba UMA mensagem.
 */
export function selecionarEnvios(pendentes, agora, pessoaDe = (chave) => chave) {
  const expirados = [];

  // 1) Por designação: o lembrete vencido mais recente vence; os outros são pulados.
  const porDesignacao = new Map();
  for (const p of pendentes) {
    if (doBanco(p.previsto_para) > agora) continue; // ainda não chegou a hora
    if (momentoReuniao(p.data, p.horario) <= agora) {
      expirados.push(p);
      continue;
    }
    if (!porDesignacao.has(p.designacao_id)) porDesignacao.set(p.designacao_id, []);
    porDesignacao.get(p.designacao_id).push(p);
  }

  // 2) Agrupa os vencedores em mensagens.
  const grupos = new Map();
  for (const lista of porDesignacao.values()) {
    lista.sort((a, b) => ORDEM_TIPOS[b.tipo] - ORDEM_TIPOS[a.tipo]);
    const [vencedor, ...pulados] = lista;
    const pessoa = pessoaDe(vencedor.chave);
    const chave = vencedor.tipo === 'resumo' ? `${pessoa}|resumo` : `${pessoa}|${vencedor.data}`;
    if (!grupos.has(chave)) grupos.set(chave, { lembretes: [], pulados: [] });
    grupos.get(chave).lembretes.push(vencedor);
    grupos.get(chave).pulados.push(...pulados);
  }

  const envios = [];
  for (const { lembretes, pulados } of grupos.values()) {
    lembretes.sort((a, b) => a.data.localeCompare(b.data) || ordemFuncao(a.funcao) - ordemFuncao(b.funcao));
    const tipo = lembretes.reduce((a, b) => (ORDEM_TIPOS[b.tipo] > ORDEM_TIPOS[a.tipo] ? b : a)).tipo;
    const { nome, chave, data, horario } = lembretes[0];

    // Reuniões do grupo (no resumo podem ser várias datas).
    const porData = new Map();
    for (const l of lembretes) {
      const k = `${l.data}|${l.local ?? ''}|${l.observacao ?? ''}`;
      if (!porData.has(k)) porData.set(k, { data: l.data, horario: l.horario, local: l.local ?? null, observacao: l.observacao ?? null, funcoes: [] });
      porData.get(k).funcoes.push(l.funcao);
    }
    const reunioes = [...porData.values()].map((r) => ({ ...r, funcoes: ordenarFuncoes(r.funcoes) }));

    const { local, observacao } = lembretes[0];
    envios.push({ nome, chave, data, horario, local, observacao, tipo, funcoes: ordenarFuncoes(lembretes.map((l) => l.funcao)), reunioes, lembretes, pulados });
  }

  envios.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
  return { envios, expirados };
}
