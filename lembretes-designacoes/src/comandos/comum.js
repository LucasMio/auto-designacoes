// Funções compartilhadas pelos comandos (npm run ...).
import { abrirBanco } from '../banco.js';
import { carregarConfig, carregarModelos } from '../config.js';
import { sincronizarLembretes } from '../importacao.js';
import { log } from '../log.js';
import { agora } from '../tempo.js';

export function carregarTudo({ modelos = false } = {}) {
  const config = carregarConfig();
  const db = abrirBanco();
  // Mantém os lembretes agendados de acordo com o config.json (não reenvia nada).
  const ajuste = sincronizarLembretes(db, config, agora());
  if (ajuste.criados || ajuste.reagendados || ajuste.cancelados) {
    log.info(`Lembretes ajustados à configuração: ${ajuste.criados} agendados, ${ajuste.reagendados} reagendados, ${ajuste.cancelados} cancelados.`);
  }
  return { config, modelos: modelos ? carregarModelos() : null, db };
}

/** Roda o comando mostrando erros de forma amigável (sem aquele monte de linhas técnicas). */
export function executar(principal) {
  principal().catch((e) => {
    console.error(`\n❌ ${e.message}\n`);
    if (process.env.DEBUG) console.error(e);
    process.exit(1);
  });
}

/** Argumentos digitados depois de "npm run comando --". */
export function argumentos() {
  return process.argv.slice(2);
}

export function linha(texto = '') {
  console.log(texto);
}
