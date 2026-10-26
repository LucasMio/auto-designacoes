// Conexão com o WhatsApp Web (biblioteca não oficial whatsapp-web.js).
// A sessão fica salva em dados/sessao-whatsapp, então o QR Code só é pedido uma vez.
import { execFileSync } from 'node:child_process';
import qrcode from 'qrcode-terminal';
import wwebjs from 'whatsapp-web.js';
import { PASTA_SESSAO } from './caminhos.js';
import { log } from './log.js';
import { variantesWhatsApp } from './telefone.js';
import { obterTrava, liberarTrava } from './trava.js';

const { Client, LocalAuth } = wwebjs;

const TEMPO_LIMITE_MS = 5 * 60 * 1000;
const TENTATIVAS_CONEXAO = 3;

// A biblioteca às vezes tenta ler uma resposta do navegador que não está disponível e
// deixa o erro "solto", o que derrubaria o programa. Esse erro é inofensivo: ignoramos.
process.on('unhandledRejection', (erro) => {
  const msg = String(erro?.message ?? erro);
  if (/Could not load response body|Execution context was destroyed|Target closed|Session closed/i.test(msg)) return;
  log.erro(`Erro inesperado: ${erro?.stack ?? msg}`);
});

// Erros que acontecem quando a página do WhatsApp Web recarrega no meio do carregamento.
// Nesses casos, vale tentar de novo.
const ERRO_PASSAGEIRO = /Execution context was destroyed|Target closed|Session closed|Navigating frame was detached|net::ERR_/i;

export class PrecisaDeQrError extends Error {}
export class WhatsAppOcupadoError extends Error {}

/**
 * Se o sistema foi fechado de forma brusca, o navegador escondido pode ter ficado
 * aberto segurando a sessão. Fecha só os navegadores que usam a NOSSA pasta de sessão.
 */
function encerrarNavegadoresOrfaos() {
  if (process.platform !== 'win32') return;
  // Letras com acento (ç, õ...) podem chegar embaralhadas ao PowerShell; trocamos por "?",
  // que no -like vale "qualquer caractere".
  const filtro = PASTA_SESSAO.replace(/'/g, "''").replace(/[^\x20-\x7E]/g, '?');
  const comando =
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" + filtro + "*' } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', comando], { stdio: 'ignore', timeout: 30000 });
  } catch {
    // não é grave
  }
}

/**
 * A mensagem foi entregue ao WhatsApp, mas o servidor não confirmou a tempo.
 * NÃO deve ser reenviada automaticamente (ela ainda pode chegar e virar duplicata).
 */
export class EnvioNaoConfirmadoError extends Error {
  name = 'EnvioNaoConfirmadoError';
}

const TEMPO_CONFIRMACAO_MS = 60000;

/**
 * Envia pela página do WhatsApp Web e devolve { id, ack } da mensagem criada.
 * (A função de envio da biblioteca às vezes não acha a mensagem que acabou de criar,
 * por exemplo na conversa com você mesmo; então procuramos a mensagem na conversa.)
 */
async function enviarNaPagina(client, chatId, texto, tempoLimiteMs = TEMPO_CONFIRMACAO_MS) {
  return client.pupPage.evaluate(
    async (chatId, texto, tempoLimiteMs) => {
      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
      if (!chat) return { semConversa: true };
      const inicio = Math.floor(Date.now() / 1000) - 5;
      const msg = await window.WWebJS.sendMessage(chat, texto, { waitUntilMsgSent: true });
      // Procura a mensagem recém-criada (o retorno da biblioteca pode vir vazio).
      const localizar = () =>
        msg ||
        chat.msgs
          .getModelsArray()
          .filter((m) => m.id?.fromMe && m.body === texto && m.t >= inicio)
          .at(-1);
      // Espera o "✓": ack >= 1 significa que o servidor do WhatsApp recebeu.
      const limite = Date.now() + tempoLimiteMs;
      let achada = localizar();
      while (Date.now() < limite) {
        achada = localizar();
        if (achada?.ack >= 1) return { localizada: true, ack: achada.ack };
        if (achada?.ack === -1) return { localizada: true, ack: -1 };
        await new Promise((r) => setTimeout(r, 1000));
      }
      return { localizada: Boolean(achada), ack: achada?.ack ?? null };
    },
    chatId,
    texto,
    tempoLimiteMs,
  );
}

function criarConexao(client) {
  return {
    client,
    get meuChatId() {
      return client.info?.wid?._serialized;
    },
    get meuNome() {
      return client.info?.pushname ?? '';
    },
    /** Devolve o ID do chat se o número tem WhatsApp, ou null se não tem. */
    async verificarNumero(numero) {
      for (const variante of variantesWhatsApp(numero)) {
        const id = await client.getNumberId(variante);
        if (id) return id._serialized;
      }
      return null;
    },
    /**
     * A conversa "com você mesmo" (e, cada vez mais, as conversas em geral) usa um
     * identificador interno terminado em "@lid" em vez do número de telefone.
     */
    async chatProprio() {
      const wid = client.info?.wid?._serialized;
      try {
        const [r] = await client.getContactLidAndPhone([wid]);
        if (r?.lid) return r.lid;
      } catch {
        // cai no número
      }
      return wid;
    },
    /**
     * Envia e só retorna depois que o servidor do WhatsApp CONFIRMAR o recebimento
     * (o "✓"). Se a conversa não for achada pelo número, tenta pelo identificador @lid.
     */
    async enviar(chatId, texto) {
      let r = await enviarNaPagina(client, chatId, texto);
      if (r.semConversa) {
        const [ids] = await client.getContactLidAndPhone([chatId]).catch(() => []);
        if (ids?.lid && ids.lid !== chatId) r = await enviarNaPagina(client, ids.lid, texto);
      }
      if (r.semConversa) throw new Error('o WhatsApp não encontrou a conversa desse número');
      if (r.ack === -1) throw new Error('o WhatsApp recusou a mensagem (erro no envio)');
      if (!(r.ack >= 1)) {
        throw new EnvioNaoConfirmadoError(
          'o WhatsApp não confirmou o envio em 60 s (a mensagem pode ter ficado "no reloginho"). Confira no seu WhatsApp se ela saiu',
        );
      }
    },
    async fechar() {
      try {
        await client.destroy();
      } catch {
        // ignora
      }
    },
  };
}

/**
 * Abre o WhatsApp. Se não houver sessão salva e permitirQr = true, mostra o QR Code no terminal.
 * @returns conexão com { meuChatId, verificarNumero, enviar, fechar }
 */
export async function conectarWhatsApp(opcoes = {}) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await conectarUmaVez(opcoes);
    } catch (e) {
      if (tentativa >= TENTATIVAS_CONEXAO || !ERRO_PASSAGEIRO.test(e.message)) throw e;
      log.aviso(`Falha passageira ao abrir o WhatsApp (${e.message}). Tentando de novo (${tentativa + 1}/${TENTATIVAS_CONEXAO})...`);
      encerrarNavegadoresOrfaos();
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Logo depois de abrir, o WhatsApp Web costuma RECARREGAR a página sozinho uma ou mais vezes.
 * Se a biblioteca começa a trabalhar antes disso, fica esperando para sempre na página antiga.
 * Aqui esperamos a página ficar estável: sem recarregar por alguns segundos e com o
 * WhatsApp já carregado (estado da conexão definido).
 */
const SILENCIO_MS = 8000; // tempo sem recarregar para considerar a página estável

async function esperarPaginaEstavel(pagina, ultimaNavegacao) {
  const inicio = Date.now();
  const limite = inicio + 90000;
  while (Date.now() < limite) {
    await esperar(1000);
    if (Date.now() - Math.max(ultimaNavegacao(), inicio) < SILENCIO_MS) continue;
    try {
      const estado = await pagina.evaluate(() => {
        try {
          return window.require('WAWebSocketModel').Socket.state ?? null;
        } catch {
          return null;
        }
      });
      if (process.env.DEBUG) console.error(`[debug] estado da conexão: ${estado}`);
      if (estado && !['OPENING', 'UNLAUNCHED', 'PAIRING', 'CONNECTING'].includes(estado)) return;
    } catch {
      // página recarregando no meio da verificação: tenta de novo
    }
  }
}

/** Faz a "injeção" da biblioteca esperar a página estabilizar e repetir se ela recarregar no meio. */
function protegerInjecao(client) {
  const debug = (m) => process.env.DEBUG && console.error(`[debug] ${m}`);
  const injetarOriginal = client.inject.bind(client);
  let ultimaNavegacao = Date.now();

  // Começa a observar as recargas ANTES de a página abrir (initWebVersionCache roda antes do goto).
  const prepararOriginal = client.initWebVersionCache.bind(client);
  client.initWebVersionCache = async () => {
    client.pupPage.on('framenavigated', (frame) => {
      if (!frame.parentFrame()) {
        ultimaNavegacao = Date.now();
        debug(`página navegou: ${frame.url()}`);
      }
    });
    return prepararOriginal();
  };

  // A biblioteca só percebe o "pronto" quando a sincronização MUDA para concluída.
  // Como esperamos a página estabilizar, às vezes ela já sincronizou antes; então
  // conferimos e, se for o caso, disparamos o aviso de sincronização nós mesmos.
  let pronto = false;
  client.once('ready', () => {
    pronto = true;
  });
  const dispararSeJaSincronizado = async () => {
    await esperar(1500);
    if (pronto) return;
    const sincronizado = await client.pupPage
      .evaluate(() => {
        try {
          return Boolean(window.require('WAWebSocketModel').Socket.hasSynced);
        } catch {
          return false;
        }
      })
      .catch(() => false);
    debug(`já sincronizado antes da injeção? ${sincronizado}`);
    if (sincronizado && !pronto) {
      await client.pupPage.evaluate(() => {
        window.onAppStateHasSyncedEvent();
      });
    }
  };

  const injetarComCalma = async () => {
    for (let tentativa = 1; ; tentativa++) {
      await esperarPaginaEstavel(client.pupPage, () => ultimaNavegacao);
      debug(`injetando (tentativa ${tentativa})`);
      try {
        const r = await injetarOriginal();
        debug('injeção concluída');
        await dispararSeJaSincronizado();
        return r;
      } catch (e) {
        debug(e.stack);
        const recarregou = ERRO_PASSAGEIRO.test(e.message) || /timed out|Waiting failed/i.test(e.message);
        if (tentativa >= 4 || !recarregou) throw e;
        log.aviso(`WhatsApp Web recarregou durante o carregamento; aguardando e tentando de novo (${tentativa + 1}/4)...`);
      }
    }
  };

  // A biblioteca chama inject() de novo a cada recarga da página. Nunca deixamos duas
  // injeções rodarem juntas: quem chegar enquanto uma está em andamento espera por ela.
  let emAndamento = null;
  client.inject = () => {
    if (!emAndamento) {
      emAndamento = injetarComCalma().finally(() => {
        emAndamento = null;
      });
    } else {
      debug('inject() chamado de novo durante a injeção — aguardando a atual');
    }
    return emAndamento;
  };
}

function conectarUmaVez({ config, permitirQr = true, aoDesconectar } = {}) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: PASTA_SESSAO }),
    webVersionCache: { type: 'none' },
    puppeteer: {
      headless: !config?.mostrarNavegador,
      // Se o navegador travar numa operação, desiste em 60 s (em vez de 3 min) e tenta de novo.
      protocolTimeout: 60000,
      args: ['--no-first-run', '--no-default-browser-check'],
    },
  });
  protegerInjecao(client);

  return new Promise((resolve, reject) => {
    let finalizado = false;
    let qrMostrado = false;

    const falhar = async (erro) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      try {
        await client.destroy();
      } catch {
        // ignora
      }
      reject(erro);
    };

    const timer = setTimeout(
      () => falhar(new Error('O WhatsApp demorou demais para conectar (5 minutos). Verifique a internet e tente de novo.')),
      TEMPO_LIMITE_MS,
    );

    client.on('qr', (qr) => {
      if (!permitirQr) {
        falhar(new PrecisaDeQrError('A sessão do WhatsApp não está conectada. Rode "npm run conectar" e escaneie o QR Code.'));
        return;
      }
      console.log(
        qrMostrado
          ? '\n(QR Code atualizado — escaneie este novo)\n'
          : '\nNo celular: WhatsApp > Configurações (ou ⋮) > Dispositivos conectados > Conectar um dispositivo.\nDepois aponte a câmera para o QR Code abaixo:\n',
      );
      qrMostrado = true;
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => log.info('WhatsApp autenticado, carregando conversas...'));
    client.on('auth_failure', (m) => falhar(new Error(`Falha na autenticação do WhatsApp: ${m}. Rode "npm run conectar" de novo.`)));

    client.on('ready', () => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      resolve(criarConexao(client));
    });

    client.on('disconnected', (motivo) => {
      if (!finalizado) falhar(new Error(`WhatsApp desconectado: ${motivo}`));
      else aoDesconectar?.(motivo);
    });

    client.initialize().catch((e) => falhar(e));
  });
}

/**
 * Pega a trava, fecha navegadores esquecidos e conecta.
 * O "fechar" da conexão devolvida também libera a trava.
 */
export async function abrirSessao({ comando, config, permitirQr = true, aoDesconectar }) {
  const trava = obterTrava(comando);
  if (!trava.ok) {
    throw new WhatsAppOcupadoError(
      `O WhatsApp já está sendo usado por outro processo deste sistema (comando "${trava.dono.comando}", PID ${trava.dono.pid}).`,
    );
  }
  encerrarNavegadoresOrfaos();
  // O Chrome guarda arquivos com nomes longos dentro da sessão; se a pasta do projeto
  // estiver muito "funda", passa do limite do Windows e o WhatsApp Web dá erro de banco de dados.
  if (process.platform === 'win32' && PASTA_SESSAO.length > 110) {
    log.aviso(`A pasta do projeto tem um caminho muito longo (${PASTA_SESSAO.length} caracteres). Se o WhatsApp mostrar erro de "banco de dados do navegador", mova o projeto para uma pasta mais curta, ex.: C:\\lembretes`);
  }
  try {
    const wa = await conectarWhatsApp({ config, permitirQr, aoDesconectar });
    const fecharOriginal = wa.fechar;
    wa.fechar = async () => {
      await fecharOriginal();
      liberarTrava();
    };
    return wa;
  } catch (e) {
    liberarTrava();
    throw e;
  }
}
