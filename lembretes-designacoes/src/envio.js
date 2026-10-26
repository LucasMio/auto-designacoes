// O "coração" do sistema: verifica o que está na hora de enviar, envia e registra.
import {
  atualizarStatusLembretes,
  buscarContato,
  pendentesVencidos,
  registrarEnvio,
} from './banco.js';
import { log } from './log.js';
import { montarMensagem } from './mensagens.js';
import { territorioDaSaida } from './siteTerritorios.js';

// Nos testes automáticos não consulta o site de verdade.
const territorioPadrao = process.env.NODE_TEST_CONTEXT ? async () => null : territorioDaSaida;
import { NOMES_TIPOS, selecionarEnvios } from './planejamento.js';
import { normalizarTelefone } from './telefone.js';
import { dentroDaJanela, formatarData, formatarMomento, paraBanco } from './tempo.js';

// Depois de 3 falhas de conexão seguidas no mesmo envio, desiste e marca como erro.
const MAXIMO_TENTATIVAS = 3;

export function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function esperaAleatoria({ minimoSegundos, maximoSegundos }) {
  const segundos = minimoSegundos + Math.random() * (maximoSegundos - minimoSegundos);
  return esperar(Math.round(segundos * 1000));
}

function descrever(envio) {
  if (envio.tipo === 'resumo' && envio.reunioes?.length) {
    const datas = envio.reunioes.map((r) => formatarData(r.data).slice(0, 5)).join(', ');
    return `${envio.nome} — ${datas} — ${NOMES_TIPOS.resumo}`;
  }
  return `${envio.nome} — ${formatarData(envio.data)} (${envio.funcoes.join(' e ')}) — ${NOMES_TIPOS[envio.tipo]}`;
}

/**
 * Executa um ciclo de envio.
 *
 * @param {object} p
 * @param {import('node:sqlite').DatabaseSync} p.db
 * @param {object} p.config
 * @param {Record<string,string>} p.modelos
 * @param {object|null} p.wa  conexão do WhatsApp (null na simulação)
 * @param {import('luxon').DateTime} p.agora
 * @param {boolean} [p.simular]  true = só mostra, não envia e não grava nada
 * @param {Function} [p.pausa]  espera entre mensagens (troca-se nos testes)
 */
export async function executarCiclo({ db, config, modelos, wa, agora, simular = false, pausa = esperaAleatoria, buscarTerritorio = territorioPadrao }) {
  const resultado = { enviados: [], erros: [], expirados: [], previstos: [], foraDaJanela: false };
  const momento = () => paraBanco(agora);

  // Agrupa pela pessoa do cadastro de contatos: "Brito" e "Carlos Brito" são a mesma pessoa.
  const pessoas = new Map();
  const pessoaDe = (chave) => {
    if (!pessoas.has(chave)) {
      const contato = buscarContato(db, chave);
      pessoas.set(chave, contato ? `contato:${contato.id}` : chave);
    }
    return pessoas.get(chave);
  };
  const { envios, expirados } = selecionarEnvios(pendentesVencidos(db, paraBanco(agora)), agora, pessoaDe);

  // Reuniões que já começaram: não adianta mais avisar.
  for (const p of expirados) {
    resultado.expirados.push(p);
    if (!simular) {
      atualizarStatusLembretes(db, [p.id], 'expirado', { detalhe: 'reunião já aconteceu', momentoIso: momento() });
      log.pulado(`${p.nome} — ${formatarData(p.data)} (${p.funcao}) — ${NOMES_TIPOS[p.tipo]}: reunião já aconteceu, não enviado.`);
    }
  }

  if (!envios.length) return resultado;
  if (!dentroDaJanela(agora, config.janelaEnvio)) {
    resultado.foraDaJanela = true;
    if (!simular) return resultado; // espera a janela abrir
  }

  let primeiro = true;
  for (const envio of envios) {
    const idsEnviar = envio.lembretes.map((l) => l.id);
    const idsPular = envio.pulados.map((l) => l.id);

    const falhar = (motivo, { telefone = null, texto = null } = {}) => {
      resultado.erros.push({ envio, motivo });
      if (simular) return;
      const envioId = registrarEnvio(db, {
        momentoIso: momento(), nome: envio.nome, telefone, dataReuniao: envio.data, tipo: envio.tipo, texto, status: 'erro', erro: motivo,
      });
      atualizarStatusLembretes(db, [...idsEnviar, ...idsPular], 'erro', { detalhe: motivo, envioId, momentoIso: momento() });
      log.erro(`${descrever(envio)}: ${motivo}`);
    };

    const contato = buscarContato(db, envio.chave);
    if (!contato) {
      falhar(`sem contato cadastrado para "${envio.nome}"`);
      continue;
    }
    const tel = normalizarTelefone(contato.telefone, { dddPadrao: config.dddPadrao });
    if (!tel.ok) {
      falhar(`telefone inválido (${tel.erro})`);
      continue;
    }
    // Dirigente de campo, no dia ou na véspera: inclui o território da saída (vem do site dos territórios).
    const territorio =
      envio.funcoes?.includes('Dirigente de campo') && ['dia', 'vespera'].includes(envio.tipo) ? await buscarTerritorio(envio.data, envio.horario) : null;
    const texto = montarMensagem(modelos, envio.tipo, { ...envio, nome: contato.nome, agora, territorio });

    if (simular) {
      resultado.previstos.push({ envio, contato, telefone: tel, texto });
      continue;
    }

    if (!primeiro) await pausa(config.intervaloEntreMensagens);
    primeiro = false;

    let chatId;
    try {
      chatId = await wa.verificarNumero(tel.numero);
    } catch (e) {
      falhaTemporaria(db, envio, e, momento());
      continue;
    }
    if (!chatId) {
      falhar(`o número ${tel.formatado} não tem WhatsApp`, { telefone: tel.numero, texto });
      continue;
    }

    // Marca como "enviando" ANTES de enviar: se o programa cair no meio, não reenvia depois.
    atualizarStatusLembretes(db, idsEnviar, 'enviando', { momentoIso: momento() });
    try {
      await wa.enviar(chatId, texto);
    } catch (e) {
      if (e.name === 'EnvioNaoConfirmadoError') {
        // Pode ter saído mesmo assim: não reenviar sozinho, para não duplicar.
        falhar(e.message, { telefone: tel.numero, texto });
        continue;
      }
      atualizarStatusLembretes(db, idsEnviar, 'pendente', { momentoIso: momento() });
      falhaTemporaria(db, envio, e, momento());
      continue;
    }
    const envioId = registrarEnvio(db, {
      momentoIso: momento(), nome: contato.nome, telefone: tel.numero, dataReuniao: envio.data, tipo: envio.tipo, texto, status: 'enviado',
    });
    atualizarStatusLembretes(db, idsEnviar, 'enviado', { envioId, momentoIso: momento() });
    atualizarStatusLembretes(db, idsPular, 'pulado', { detalhe: 'substituído por um lembrete mais recente', envioId, momentoIso: momento() });
    resultado.enviados.push(envio);
    log.enviado(`${descrever(envio)} → ${tel.formatado}`);
    for (const p of envio.pulados) {
      log.pulado(`${p.nome} — ${formatarData(p.data)} (${p.funcao}) — ${NOMES_TIPOS[p.tipo]}: substituído pelo lembrete "${NOMES_TIPOS[envio.tipo]}".`);
    }
  }

  if (!simular && resultado.erros.length && config.avisarErrosNoWhatsApp && wa) {
    await avisarErros(wa, config, resultado.erros, agora);
  }
  return resultado;
}

/** Erro de conexão: tenta de novo no próximo ciclo, até MAXIMO_TENTATIVAS. */
function falhaTemporaria(db, envio, erro, momentoIso) {
  const ids = [...envio.lembretes, ...envio.pulados].map((l) => l.id);
  const tentativas = Math.max(...envio.lembretes.map((l) => l.tentativas ?? 0)) + 1;
  const stmt = db.prepare('UPDATE lembretes SET tentativas = ?, detalhe = ?, atualizado_em = ? WHERE id = ?');
  for (const id of ids) stmt.run(tentativas, `falha ao enviar: ${erro.message}`, momentoIso, id);
  if (tentativas >= MAXIMO_TENTATIVAS) {
    atualizarStatusLembretes(db, ids, 'erro', { detalhe: `falhou ${tentativas} vezes: ${erro.message}`, momentoIso });
    log.erro(`${descrever(envio)}: desistindo após ${tentativas} tentativas (${erro.message})`);
  } else {
    log.aviso(`${descrever(envio)}: falha ao enviar (${erro.message}). Tentarei de novo no próximo ciclo.`);
  }
}

/** Descobre para qual chat mandar os avisos ao dono do sistema. */
export async function chatDoDono(wa, config) {
  if (config.meuNumero) {
    const tel = normalizarTelefone(config.meuNumero, { dddPadrao: config.dddPadrao });
    if (!tel.ok) throw new Error(`"meuNumero" do config.json é inválido: ${tel.erro}`);
    const id = await wa.verificarNumero(tel.numero);
    if (!id) throw new Error(`"meuNumero" (${tel.formatado}) não tem WhatsApp`);
    return id;
  }
  // A conversa "com você mesmo" usa um identificador interno (@lid), não o número.
  return wa.chatProprio ? await wa.chatProprio() : wa.meuChatId;
}

async function avisarErros(wa, config, erros, agora) {
  const linhas = erros.map(({ envio, motivo }) => `• ${envio.nome} (${formatarData(envio.data)} – ${envio.funcoes.join(' e ')}): ${motivo}`);
  const texto =
    `⚠️ *Lembretes de designações* — ${erros.length} envio(s) falharam em ${formatarMomento(agora)}:\n\n` +
    `${linhas.join('\n')}\n\nCorrija (ex.: cadastre o contato) e rode "npm run reenviar-erros".`;
  try {
    await wa.enviar(await chatDoDono(wa, config), texto);
  } catch (e) {
    log.erro(`Não consegui te avisar dos erros pelo WhatsApp: ${e.message}`);
  }
}

/** Envia as mensagens avulsas (ex.: teste) que foram pedidas enquanto o serviço rodava. */
export async function processarAvulsas({ db, wa, config, agora, pausa = esperaAleatoria }) {
  const pendentes = db.prepare(`SELECT * FROM avulsas WHERE status = 'pendente' ORDER BY id`).all();
  for (const [i, a] of pendentes.entries()) {
    // Várias mensagens para outras pessoas: uma pausa entre elas, como nos lembretes (evita parecer envio em massa).
    if (i > 0 && a.telefone) await pausa(config.intervaloEntreMensagens);
    const para = a.telefone ? `o número terminado em ${a.telefone.slice(-4)}` : 'você';
    try {
      let chat;
      if (a.telefone) {
        chat = await wa.verificarNumero(a.telefone);
        if (!chat) throw new Error('este número não tem WhatsApp');
      } else {
        chat = await chatDoDono(wa, config);
      }
      // Marca antes de enviar: se o programa cair no meio, não manda duas vezes.
      db.prepare(`UPDATE avulsas SET status = 'enviando' WHERE id = ?`).run(a.id);
      await wa.enviar(chat, a.texto);
      db.prepare(`UPDATE avulsas SET status = 'enviada', detalhe = ? WHERE id = ?`).run(paraBanco(agora), a.id);
      log.enviado(`Mensagem avulsa enviada para ${para}.`);
    } catch (e) {
      db.prepare(`UPDATE avulsas SET status = 'erro', detalhe = ? WHERE id = ?`).run(e.message, a.id);
      log.erro(`Falha ao enviar mensagem avulsa para ${para}: ${e.message}`);
    }
  }
}

/**
 * Ao iniciar: lembretes que ficaram "enviando" (o programa caiu no meio do envio)
 * viram "erro" em vez de serem reenviados — assim nunca há mensagem duplicada.
 */
export function recuperarEnviosInterrompidos(db, agora) {
  const presos = db.prepare(`SELECT id FROM lembretes WHERE status = 'enviando'`).all();
  if (!presos.length) return 0;
  atualizarStatusLembretes(
    db,
    presos.map((p) => p.id),
    'erro',
    { detalhe: 'envio interrompido: confira no WhatsApp se a mensagem chegou', momentoIso: paraBanco(agora) },
  );
  log.aviso(`${presos.length} lembrete(s) estavam sendo enviados quando o programa foi fechado. Confira no WhatsApp; se não chegaram, rode "npm run reenviar-erros".`);
  return presos.length;
}
