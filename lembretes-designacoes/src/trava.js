// Garante que só UM processo use a sessão do WhatsApp por vez
// (duas cópias abertas corrompem a sessão ou brigam pelo navegador).
import fs from 'node:fs';
import path from 'node:path';
import { CAMINHO_TRAVA } from './caminhos.js';

export function processoVivo(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Quem está usando o WhatsApp agora (ou null). */
export function donoDaTrava(caminho = CAMINHO_TRAVA) {
  try {
    const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return processoVivo(dados.pid) ? dados : null;
  } catch {
    return null;
  }
}

/** Tenta pegar a trava. Devolve { ok: true } ou { ok: false, dono }. */
export function obterTrava(comando, caminho = CAMINHO_TRAVA) {
  const dono = donoDaTrava(caminho);
  if (dono && dono.pid !== process.pid) return { ok: false, dono };
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, JSON.stringify({ pid: process.pid, comando, desde: new Date().toISOString() }));
  return { ok: true };
}

export function liberarTrava(caminho = CAMINHO_TRAVA) {
  try {
    const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    if (dados.pid === process.pid) fs.unlinkSync(caminho);
  } catch {
    // já não existe
  }
}
