// Caminhos de pastas e arquivos usados pelo sistema.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Tudo que é sensível fica em "dados/" (fora do git).
export const PASTA_DADOS = path.join(RAIZ, 'dados');
export const CAMINHO_BANCO = path.join(PASTA_DADOS, 'banco.sqlite');
export const PASTA_SESSAO = path.join(PASTA_DADOS, 'sessao-whatsapp');
export const PASTA_LOGS = path.join(PASTA_DADOS, 'logs');
export const CAMINHO_TRAVA = path.join(PASTA_DADOS, 'whatsapp.trava');
export const CAMINHO_SINAL_PARAR = path.join(PASTA_DADOS, 'parar.sinal');

export const PASTA_CONFIG = path.join(RAIZ, 'config');
export const PASTA_PLANILHAS = path.join(RAIZ, 'planilhas');
