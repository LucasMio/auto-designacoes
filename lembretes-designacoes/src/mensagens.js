// Monta o texto das mensagens a partir dos modelos em config/mensagens.
import { DateTime } from 'luxon';
import { FUSO, diaDaSemana, formatarData, descreverQuando } from './tempo.js';
import { juntarLista, primeiroNome } from './texto.js';
import { linhaDoTerritorio } from './siteTerritorios.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "📅 Terça-feira, 06/10 às 19:30 — Indicador" (uma linha por reunião do resumo). */
function linhasDoResumo(reunioes) {
  return reunioes
    .map((r) => {
      const dia = DateTime.fromISO(r.data, { zone: FUSO });
      let linha = `📅 ${diaDaSemana(r.data)}, ${dia.toFormat('dd/MM')} às ${r.horario} — ${juntarLista(r.funcoes)}`;
      // Segunda linha quando há local ou observação (ex.: dirigentes de campo).
      const detalhes = [r.local, r.observacao].filter(Boolean);
      if (detalhes.length) linha += `\n     📍 ${detalhes.join(' · ')}`;
      return linha;
    })
    .join('\n');
}

/** "Sua designação de Outubro" / "Suas designações de Outubro" / "Suas próximas designações" */
function tituloDoResumo(reunioes) {
  const total = reunioes.reduce((n, r) => n + r.funcoes.length, 0);
  const meses = new Set(reunioes.map((r) => r.data.slice(0, 7)));
  const plural = total > 1;
  if (meses.size === 1) {
    const mes = MESES[Number(reunioes[0].data.slice(5, 7)) - 1];
    return plural ? `Suas designações de ${mes}` : `Sua designação de ${mes}`;
  }
  return plural ? 'Suas próximas designações' : 'Sua próxima designação';
}

/**
 * @param {Record<string,string>} modelos  textos de config/mensagens
 * @param {string} tipo  '30d' | '7d' | 'dia' | 'aviso' | 'resumo'
 * @param {{ nome: string, data: string, horario: string, funcoes: string[], agora: import('luxon').DateTime,
 *           reunioes?: {data: string, horario: string, funcoes: string[]}[] }} dados
 */
export function montarMensagem(modelos, tipo, { nome, data, horario, funcoes, agora, reunioes, local, observacao, territorio }) {
  const modelo = modelos[tipo];
  if (!modelo) throw new Error(`Não existe modelo de mensagem para o tipo "${tipo}"`);
  const lista = reunioes?.length ? reunioes : [{ data, horario, funcoes, local, observacao }];
  const valores = {
    nome,
    primeiro_nome: primeiroNome(nome),
    data: formatarData(data),
    dia_semana: diaDaSemana(data),
    horario,
    designacao: juntarLista(funcoes),
    titulo_designacao: funcoes.length > 1 ? 'Designações' : 'Designação',
    quando: descreverQuando(data, agora),
    titulo: tituloDoResumo(lista),
    lista: linhasDoResumo(lista),
    local: local ?? '',
    observacao: observacao ?? '',
    // Linhas que somem quando o campo está vazio (usadas nos modelos).
    local_linha: local ? `📍 Local: ${local}\n` : '',
    observacao_linha: observacao ? `📝 ${observacao}\n` : '',
    // Território da saída de campo (só nos lembretes de dirigente; vazio nos outros).
    territorio_linha: linhaDoTerritorio(territorio),
  };
  return modelo.replace(/\{(\w+)\}/g, (original, campo) => (campo in valores ? valores[campo] : original));
}
