// Leitura da configuração (config/config.json) e dos modelos de mensagem (config/mensagens/*.txt).
import fs from 'node:fs';
import path from 'node:path';
import { PASTA_CONFIG } from './caminhos.js';
import { normalizarHorario } from './tempo.js';

const PADRAO = {
  // Quais lembretes cada lista recebe. Tipos: "30d", "7d", "dia" e "resumo".
  lembretes: { reuniao: ['7d', 'dia'], dirigentes: ['dia'] },
  horaEnvio: '08:00',
  // Compromisso que começa antes de "quandoComecarAntesDe" é lembrado no próprio dia, em "hora".
  lembreteManha: { quandoComecarAntesDe: '12:00', hora: '07:00' },
  // Nesses dias da semana, as listas indicadas recebem o aviso na VÉSPERA, em "hora" (em vez de no dia).
  lembreteVespera: { listas: ['dirigentes'], diasDaSemana: ['sabado'], hora: '19:00' },
  janelaEnvio: { inicio: '07:00', fim: '21:00' },
  intervaloEntreMensagens: { minimoSegundos: 5, maximoSegundos: 20 },
  horarioReunioes: { terca: '19:30', sabado: '19:00' },
  dddPadrao: '',
  meuNumero: '',
  avisarErrosNoWhatsApp: true,
  mostrarNavegador: false,
};

// Tipo de lembrete -> arquivo do modelo.
export const ARQUIVOS_MODELOS = {
  '30d': '30-dias-antes.txt',
  '7d': '7-dias-antes.txt',
  dia: 'no-dia.txt',
  vespera: 'na-vespera.txt',
  aviso: 'aviso-imediato.txt',
  resumo: 'resumo-mensal.txt',
};

const ESQUEMAS = ['resumo-mensal', 'tres-lembretes'];
const TIPOS_LEMBRETE = ['30d', '7d', 'dia', 'resumo'];
// Configuração antiga ("esquema") -> lembretes equivalentes.
const LEMBRETES_DO_ESQUEMA = { 'resumo-mensal': ['resumo', 'dia'], 'tres-lembretes': ['30d', '7d', 'dia'] };

function erroConfig(msg) {
  return new Error(`Problema em config/config.json: ${msg}`);
}

function horarioValido(valor, campo) {
  const h = normalizarHorario(valor);
  if (!h) throw erroConfig(`"${campo}" deve ser um horário como "08:00" (valor atual: "${valor}")`);
  return h;
}

export function carregarConfig(pasta = PASTA_CONFIG) {
  const arquivo = path.join(pasta, 'config.json');
  let doArquivo = {};
  if (fs.existsSync(arquivo)) {
    try {
      doArquivo = JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      throw erroConfig(`o arquivo não é um JSON válido (${e.message}). Confira vírgulas e aspas.`);
    }
  }
  const c = {
    ...PADRAO,
    ...doArquivo,
    janelaEnvio: { ...PADRAO.janelaEnvio, ...doArquivo.janelaEnvio },
    intervaloEntreMensagens: { ...PADRAO.intervaloEntreMensagens, ...doArquivo.intervaloEntreMensagens },
    horarioReunioes: { ...PADRAO.horarioReunioes, ...doArquivo.horarioReunioes },
    lembreteManha: { ...PADRAO.lembreteManha, ...doArquivo.lembreteManha },
    lembreteVespera: { ...PADRAO.lembreteVespera, ...doArquivo.lembreteVespera },
  };
  if (!doArquivo.lembretes && doArquivo.esquema) {
    if (!ESQUEMAS.includes(doArquivo.esquema)) throw erroConfig(`"esquema" deve ser "resumo-mensal" ou "tres-lembretes" (valor atual: "${doArquivo.esquema}")`);
    const tipos = LEMBRETES_DO_ESQUEMA[doArquivo.esquema];
    c.lembretes = { reuniao: tipos, dirigentes: tipos };
  } else {
    c.lembretes = { ...PADRAO.lembretes, ...doArquivo.lembretes };
  }
  delete c.esquema;
  for (const [lista, tipos] of Object.entries(c.lembretes)) {
    if (!Array.isArray(tipos) || tipos.some((t) => !TIPOS_LEMBRETE.includes(t))) {
      throw erroConfig(`"lembretes.${lista}" deve ser uma lista com "30d", "7d", "dia" e/ou "resumo" (ex.: ["7d", "dia"])`);
    }
  }
  c.horaEnvio = horarioValido(c.horaEnvio, 'horaEnvio');
  c.janelaEnvio.inicio = horarioValido(c.janelaEnvio.inicio, 'janelaEnvio.inicio');
  c.janelaEnvio.fim = horarioValido(c.janelaEnvio.fim, 'janelaEnvio.fim');
  // Configuração antiga da véspera ("quandoComecarAntesDe") não vale mais: usa o padrão novo.
  if (c.lembreteVespera.quandoComecarAntesDe) c.lembreteVespera = { ...PADRAO.lembreteVespera };
  c.lembreteVespera.hora = horarioValido(c.lembreteVespera.hora, 'lembreteVespera.hora');
  const diasValidos = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  if (!Array.isArray(c.lembreteVespera.diasDaSemana) || c.lembreteVespera.diasDaSemana.some((d) => !diasValidos.includes(d))) {
    throw erroConfig(`"lembreteVespera.diasDaSemana" deve ser uma lista como ["sabado"] (dias sem acento: ${diasValidos.join(', ')})`);
  }
  if (!Array.isArray(c.lembreteVespera.listas)) throw erroConfig('"lembreteVespera.listas" deve ser uma lista como ["dirigentes"]');
  c.lembreteManha.quandoComecarAntesDe = horarioValido(c.lembreteManha.quandoComecarAntesDe, 'lembreteManha.quandoComecarAntesDe');
  c.lembreteManha.hora = horarioValido(c.lembreteManha.hora, 'lembreteManha.hora');
  c.horarioReunioes.terca = horarioValido(c.horarioReunioes.terca, 'horarioReunioes.terca');
  c.horarioReunioes.sabado = horarioValido(c.horarioReunioes.sabado, 'horarioReunioes.sabado');
  const { minimoSegundos: min, maximoSegundos: max } = c.intervaloEntreMensagens;
  if (!(min >= 0 && max >= min)) throw erroConfig('"intervaloEntreMensagens" precisa ter minimoSegundos <= maximoSegundos');
  return c;
}

/** Lê um modelo de mensagem. Linhas que começam com "#" são comentários e são ignoradas. */
function lerModelo(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
  return texto
    .split(/\r?\n/)
    .filter((linha) => !linha.startsWith('#'))
    .join('\n')
    .trim();
}

export function carregarModelos(pasta = PASTA_CONFIG) {
  const modelos = {};
  for (const [tipo, nomeArquivo] of Object.entries(ARQUIVOS_MODELOS)) {
    const arquivo = path.join(pasta, 'mensagens', nomeArquivo);
    if (!fs.existsSync(arquivo)) throw new Error(`Modelo de mensagem não encontrado: config/mensagens/${nomeArquivo}`);
    modelos[tipo] = lerModelo(arquivo);
  }
  return modelos;
}
