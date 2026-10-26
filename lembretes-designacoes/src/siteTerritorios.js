// Consulta o site dos territórios (pasta vizinha "territorios") para saber o território de uma
// saída de campo e colocar no lembrete do dirigente. Lê as chaves do arquivo territorios/.env.local
// (no mesmo computador). Se algo falhar ou demorar, devolve null e o lembrete sai sem essa linha.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './caminhos.js';

export const SITE_TERRITORIOS = 'https://territorios-exemplo.vercel.app';
const TEMPO_MAXIMO_MS = 8000;

function lerChaves(pasta = path.join(RAIZ, '..', 'territorios')) {
  try {
    const texto = fs.readFileSync(path.join(pasta, '.env.local'), 'utf8');
    const v = Object.fromEntries(
      texto.split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
    );
    if (!v.VITE_SUPABASE_URL || !v.SUPABASE_SERVICE_ROLE_KEY) return null;
    return { url: v.VITE_SUPABASE_URL.replace(/\/$/, ''), chave: v.SUPABASE_SERVICE_ROLE_KEY };
  } catch {
    return null;
  }
}

/**
 * Território da saída de campo da planilha (data "AAAA-MM-DD", horário "HH:mm").
 * @returns {Promise<null | {numero: number, bairro: string|null, link: string} | {chefeEscolhe: true} | {semTerritorio: true}>}
 */
export async function territorioDaSaida(data, horario, { chaves = lerChaves(), buscar = fetch } = {}) {
  if (!chaves || !data || !horario) return null;
  const chave = `planilha:${data} ${horario}`;
  const url = `${chaves.url}/rest/v1/saidas?select=territorio_numero,sem_territorio,escolha_do_dirigente,territorios(bairro)&chave=eq.${encodeURIComponent(chave)}&limit=1`;
  try {
    const resp = await buscar(url, {
      headers: { apikey: chaves.chave, Authorization: `Bearer ${chaves.chave}` },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!resp.ok) return null;
    const [s] = await resp.json();
    if (!s) return null;
    if (s.sem_territorio) return { semTerritorio: true };
    if (s.territorio_numero) {
      return { numero: s.territorio_numero, bairro: s.territorios?.bairro ?? null, link: `${SITE_TERRITORIOS}/territorio/${s.territorio_numero}` };
    }
    if (s.escolha_do_dirigente) return { chefeEscolhe: true };
    return null;
  } catch {
    return null;
  }
}

/** Linha do território para os modelos de mensagem ({territorio_linha}). */
export function linhaDoTerritorio(t) {
  if (!t) return '';
  // Só o convite com o link: o território certo (e sempre atualizado) é o que está no sistema.
  if (t.numero) return `🗺️ Veja o território do dia no sistema:\n👉 ${t.link}\n`;
  if (t.chefeEscolhe) return `🗺️ Veja os territórios do seu grupo no sistema:\n👉 ${SITE_TERRITORIOS}/territorios\n`;
  return '';
}

/** Consulta qualquer tabela do site (ex.: "conclusoes?select=id&limit=5"). Devolve a lista, ou null se falhar. */
export async function consultarSite(caminho, { chaves = lerChaves(), buscar = fetch } = {}) {
  if (!chaves) return null;
  try {
    const resp = await buscar(`${chaves.url}/rest/v1/${caminho}`, {
      headers: { apikey: chaves.chave, Authorization: `Bearer ${chaves.chave}` },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}
