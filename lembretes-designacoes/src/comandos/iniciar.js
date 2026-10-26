// npm start — liga o sistema: conecta no WhatsApp e verifica a cada minuto se há lembretes a enviar.
import fs from 'node:fs';
import { CAMINHO_SINAL_PARAR } from '../caminhos.js';
import { executarCiclo, processarAvulsas, recuperarEnviosInterrompidos } from '../envio.js';
import { verificarAvisosTerritorios } from '../avisosTerritorios.js';
import { log } from '../log.js';
import { agora } from '../tempo.js';
import { abrirSessao, PrecisaDeQrError, WhatsAppOcupadoError } from '../whatsapp.js';
import { carregarTudo } from './comum.js';

// Códigos de saída usados pelo script de inicialização automática.
const SAIDA_ERRO = 1;
const SAIDA_PRECISA_QR = 2;
const SAIDA_OCUPADO = 3;

const INTERVALO_CICLO_MS = 60 * 1000;
const modoServico = process.argv.includes('--servico');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  const { config, modelos, db } = carregarTudo({ modelos: true });
  try {
    fs.unlinkSync(CAMINHO_SINAL_PARAR);
  } catch {
    // não existia
  }

  log.info('Iniciando o sistema de lembretes...');
  recuperarEnviosInterrompidos(db, agora());

  let wa;
  let encerrando = false;
  const encerrar = async (codigo, motivo) => {
    if (encerrando) return;
    encerrando = true;
    if (motivo) log.info(motivo);
    await wa?.fechar();
    process.exit(codigo);
  };

  try {
    wa = await abrirSessao({
      comando: 'npm start',
      config,
      permitirQr: !modoServico,
      aoDesconectar: (motivo) => {
        log.erro(`WhatsApp desconectado (${motivo}). O sistema será reiniciado.`);
        encerrar(SAIDA_ERRO);
      },
    });
  } catch (e) {
    log.erro(e.message);
    if (e instanceof PrecisaDeQrError) process.exit(SAIDA_PRECISA_QR);
    if (e instanceof WhatsAppOcupadoError) process.exit(SAIDA_OCUPADO);
    process.exit(SAIDA_ERRO);
  }

  process.on('SIGINT', () => encerrar(0, 'Sistema encerrado pelo usuário.'));
  process.on('SIGTERM', () => encerrar(0, 'Sistema encerrado.'));

  log.info(`Conectado ao WhatsApp${wa.meuNome ? ` como ${wa.meuNome}` : ''}. Verificando lembretes a cada minuto.`);
  if (!modoServico) log.info('Deixe esta janela aberta. Para parar, aperte Ctrl + C.');

  for (;;) {
    try {
      await processarAvulsas({ db, wa, config, agora: agora() });
      await executarCiclo({ db, config, modelos, wa, agora: agora() });
    } catch (e) {
      log.erro(`Erro inesperado no ciclo de envio: ${e.message}`);
    }
    try {
      // Avisos do site dos territórios para você (concluídos, substituto pendente, resumo do mês).
      await verificarAvisosTerritorios({ db, wa, config, agora: agora() });
    } catch (e) {
      log.aviso(`Avisos dos territórios: ${e.message}`);
    }
    // Espera o próximo ciclo, mas confere a cada 5 s se pediram para parar (npm run parar).
    for (let t = 0; t < INTERVALO_CICLO_MS; t += 5000) {
      if (fs.existsSync(CAMINHO_SINAL_PARAR)) {
        try {
          fs.unlinkSync(CAMINHO_SINAL_PARAR);
        } catch {
          // ignora
        }
        await encerrar(0, 'Sistema parado a pedido (npm run parar).');
      }
      await dormir(5000);
    }
  }
}

process.on('uncaughtException', (e) => {
  log.erro(`Erro inesperado: ${e.stack ?? e.message}`);
  process.exit(SAIDA_ERRO);
});
process.on('unhandledRejection', (e) => {
  log.erro(`Erro inesperado: ${e?.stack ?? e}`);
});

principal().catch((e) => {
  log.erro(e.message);
  process.exit(SAIDA_ERRO);
});
