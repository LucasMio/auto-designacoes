// npm run log [-- 100] — mostra as últimas linhas do log (padrão: 40).
import fs from 'node:fs';
import path from 'node:path';
import { PASTA_LOGS } from '../caminhos.js';
import { argumentos, executar, linha } from './comum.js';

executar(async () => {
  const quantidade = Number(argumentos()[0]) || 40;
  const arquivos = fs.existsSync(PASTA_LOGS) ? fs.readdirSync(PASTA_LOGS).filter((a) => a.endsWith('.log')).sort() : [];
  if (!arquivos.length) {
    linha('Ainda não há log. Ele é criado quando o sistema roda pela primeira vez.');
    return;
  }
  // Junta os dois últimos meses para não cortar o histórico na virada do mês.
  const linhas = arquivos
    .slice(-2)
    .flatMap((a) => fs.readFileSync(path.join(PASTA_LOGS, a), 'utf8').replace(/^﻿/, '').split(/\r?\n/))
    .filter(Boolean);
  linha(`📜 Últimas ${Math.min(quantidade, linhas.length)} linhas do log (pasta dados\\logs):\n`);
  for (const l of linhas.slice(-quantidade)) linha(l);
});
