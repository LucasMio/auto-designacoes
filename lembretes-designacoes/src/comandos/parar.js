// npm run parar — para o sistema que está rodando em segundo plano.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CAMINHO_SINAL_PARAR, PASTA_DADOS } from '../caminhos.js';
import { donoDaTrava } from '../trava.js';
import { executar, linha } from './comum.js';

export const NOME_TAREFA = 'Lembretes de Designacoes';
const CAMINHO_PAUSA = path.join(PASTA_DADOS, 'pausado.json'); // lido por scripts/rodar-servico.ps1

executar(async () => {
  // 1) Marca a pausa (a verificação de 10 em 10 minutos respeita até o Windows reiniciar ou "npm run ligar")
  //    e para a tarefa agendada (senão ela religa o sistema em 1 minuto).
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  fs.writeFileSync(CAMINHO_PAUSA, JSON.stringify({ inicioDoWindows: Date.now() - os.uptime() * 1000, pausadoEm: new Date().toISOString() }));
  if (process.platform === 'win32') {
    try {
      execFileSync('powershell', ['-NoProfile', '-Command', `Stop-ScheduledTask -TaskName '${NOME_TAREFA}' -ErrorAction SilentlyContinue`], {
        stdio: 'ignore',
      });
    } catch {
      // tarefa não instalada
    }
  }

  // 2) Pede para o sistema encerrar com calma (fechando o WhatsApp direitinho).
  const dono = donoDaTrava();
  if (!dono) {
    linha('O sistema não está rodando.');
    return;
  }
  fs.writeFileSync(CAMINHO_SINAL_PARAR, String(Date.now()));
  linha('Pedindo para o sistema parar...');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!donoDaTrava()) {
      linha('✅ Sistema parado. Para ligar de novo: npm start (ou reinicie o computador, se o início automático estiver instalado).');
      return;
    }
  }
  // 3) Não respondeu: encerra à força.
  try {
    process.kill(dono.pid);
  } catch {
    // já terminou
  }
  linha('✅ Sistema encerrado à força (não respondeu a tempo).');
});
