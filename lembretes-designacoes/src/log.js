// Log simples: mostra na tela e grava em dados/logs/AAAA-MM.log
import fs from 'node:fs';
import path from 'node:path';
import { PASTA_LOGS } from './caminhos.js';
import { agora } from './tempo.js';

let gravarEmArquivo = true;

/** Usado nos testes e na simulação para não sujar o arquivo de log. */
export function desativarArquivoDeLog() {
  gravarEmArquivo = false;
}

function registrar(nivel, mensagem) {
  const momento = agora();
  const linha = `[${momento.toFormat('dd/MM/yyyy HH:mm:ss')}] ${nivel.padEnd(8)} ${mensagem}`;
  if (nivel === 'ERRO') console.error(linha);
  else console.log(linha);
  if (!gravarEmArquivo) return;
  try {
    fs.mkdirSync(PASTA_LOGS, { recursive: true });
    const arquivo = path.join(PASTA_LOGS, `${momento.toFormat('yyyy-MM')}.log`);
    // BOM no início para o Bloco de Notas/PowerShell mostrarem os acentos corretamente.
    if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, '﻿', 'utf8');
    fs.appendFileSync(arquivo, `${linha}\r\n`, 'utf8');
  } catch {
    // Se não conseguir gravar o log, segue em frente (a tela ainda mostra).
  }
}

export const log = {
  info: (m) => registrar('INFO', m),
  enviado: (m) => registrar('ENVIADO', m),
  pulado: (m) => registrar('PULADO', m),
  aviso: (m) => registrar('ATENCAO', m),
  erro: (m) => registrar('ERRO', m),
};
