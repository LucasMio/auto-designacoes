// Lê arquivos CSV e XLSX e devolve as abas como listas de linhas (arrays de células).
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

/** Converte o conteúdo de uma célula do Excel em texto, número ou Date. */
function valorCelula(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  if ('result' in v) return valorCelula(v.result); // fórmula
  if ('text' in v) return valorCelula(v.text); // link
  if ('error' in v) return '';
  return String(v);
}

async function lerXlsx(caminho) {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.readFile(caminho);
  return pasta.worksheets.map((aba) => {
    const linhas = [];
    aba.eachRow({ includeEmpty: true }, (linha, numero) => {
      const valores = [];
      for (let c = 1; c <= linha.cellCount; c++) valores.push(valorCelula(linha.getCell(c).value));
      linhas[numero - 1] = valores;
    });
    return { nome: aba.name, linhas: Array.from(linhas, (l) => l ?? []) };
  });
}

/** Decodifica em UTF-8; se não for UTF-8 válido, usa Windows-1252 (padrão do Excel ao salvar CSV). */
function decodificar(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Parser de CSV que aceita ; , ou TAB e campos entre aspas. */
export function interpretarCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] ?? '';
  const contagem = (s) => primeiraLinha.split(s).length - 1;
  const separador = [';', '\t', ','].reduce((a, b) => (contagem(b) > contagem(a) ? b : a));

  const linhas = [];
  let linha = [];
  let campo = '';
  let entreAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreAspas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') {
        entreAspas = false;
      } else {
        campo += ch;
      }
    } else if (ch === '"') {
      entreAspas = true;
    } else if (ch === separador) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.map((l) => l.map((c) => c.trim()));
}

/** Lê um arquivo .csv, .txt ou .xlsx. Devolve [{ nome, linhas }], uma entrada por aba. */
export async function lerPlanilha(caminho) {
  if (!fs.existsSync(caminho)) throw new Error(`Arquivo não encontrado: ${caminho}`);
  const ext = path.extname(caminho).toLowerCase();
  if (ext === '.xlsx' || ext === '.xlsm') return lerXlsx(caminho);
  if (ext === '.csv' || ext === '.txt') {
    return [{ nome: path.basename(caminho), linhas: interpretarCsv(decodificar(fs.readFileSync(caminho))) }];
  }
  if (ext === '.xls') throw new Error('Arquivos .xls (Excel antigo) não são suportados. No Excel, use "Salvar como" > "Pasta de Trabalho do Excel (.xlsx)".');
  throw new Error(`Formato não suportado: "${ext}". Use .xlsx ou .csv`);
}

/**
 * Sem caminho informado, procura na pasta planilhas/ um arquivo com o nome indicado
 * (ex.: "designacoes.xlsx" ou "designacoes.csv").
 */
export function localizarArquivo(argumento, pasta, nomeBase) {
  // O npm muda a pasta atual para a do projeto; INIT_CWD é onde o usuário estava.
  if (argumento) return path.resolve(process.env.INIT_CWD ?? process.cwd(), argumento.replace(/^"|"$/g, ''));
  for (const ext of ['.xlsx', '.csv']) {
    const candidato = path.join(pasta, nomeBase + ext);
    if (fs.existsSync(candidato)) return candidato;
  }
  return null;
}
