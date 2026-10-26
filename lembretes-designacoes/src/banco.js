// Banco de dados local (SQLite embutido no Node).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CAMINHO_BANCO } from './caminhos.js';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS contatos (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL,
  chave         TEXT NOT NULL UNIQUE,   -- nome sem acentos/minúsculo, usado para comparar
  telefone      TEXT NOT NULL,          -- como veio na planilha
  atualizado_em TEXT NOT NULL
);

-- "Outros nomes" de um contato (ex.: Jonas Pereira também aparece como "Jonas").
CREATE TABLE IF NOT EXISTS apelidos (
  chave       TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  contato_id  INTEGER NOT NULL REFERENCES contatos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS designacoes (
  id            INTEGER PRIMARY KEY,
  data          TEXT NOT NULL,          -- AAAA-MM-DD
  horario       TEXT NOT NULL,          -- HH:mm
  funcao        TEXT NOT NULL,          -- Indicador, Leitor, Microfone volante, Dirigente de campo...
  nome          TEXT NOT NULL,
  chave         TEXT NOT NULL,
  local         TEXT,                   -- ex.: "Salão do Reino", "Casa do SR. Osvaldo"
  observacao    TEXT,                   -- ex.: "território n58 (continuação)"
  lista         TEXT NOT NULL DEFAULT 'reuniao',  -- reuniao | dirigentes
  ativa         INTEGER NOT NULL DEFAULT 1,
  criada_em     TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  UNIQUE (data, funcao, chave)
);

CREATE TABLE IF NOT EXISTS envios (
  id            INTEGER PRIMARY KEY,
  momento       TEXT NOT NULL,
  nome          TEXT,
  telefone      TEXT,
  data_reuniao  TEXT,
  tipo          TEXT,
  texto         TEXT,
  status        TEXT NOT NULL,          -- enviado | erro
  erro          TEXT
);

-- Um lembrete por designação e tipo (30d, 7d, dia, aviso). O UNIQUE impede duplicatas.
CREATE TABLE IF NOT EXISTS lembretes (
  id             INTEGER PRIMARY KEY,
  designacao_id  INTEGER NOT NULL REFERENCES designacoes(id),
  tipo           TEXT NOT NULL,
  previsto_para  TEXT NOT NULL,         -- ISO em UTC
  status         TEXT NOT NULL DEFAULT 'pendente',
                 -- pendente | enviando | enviado | pulado | expirado | cancelado | erro
  tentativas     INTEGER NOT NULL DEFAULT 0,
  detalhe        TEXT,
  atualizado_em  TEXT,
  envio_id       INTEGER REFERENCES envios(id),
  UNIQUE (designacao_id, tipo)
);
CREATE INDEX IF NOT EXISTS idx_lembretes_status ON lembretes (status, previsto_para);

-- Mensagens avulsas (ex.: teste) pedidas enquanto o serviço está rodando.
CREATE TABLE IF NOT EXISTS avulsas (
  id         INTEGER PRIMARY KEY,
  criada_em  TEXT NOT NULL,
  texto      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pendente',
  detalhe    TEXT
);
`;

export function abrirBanco(caminho = CAMINHO_BANCO) {
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  if (caminho !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
  db.exec(ESQUEMA);
  // Colunas acrescentadas depois (bancos criados antes continuam funcionando).
  const colunas = db.prepare('PRAGMA table_info(designacoes)').all().map((c) => c.name);
  if (!colunas.includes('local')) db.exec('ALTER TABLE designacoes ADD COLUMN local TEXT');
  if (!colunas.includes('observacao')) db.exec('ALTER TABLE designacoes ADD COLUMN observacao TEXT');
  if (!colunas.includes('lista')) db.exec(`ALTER TABLE designacoes ADD COLUMN lista TEXT NOT NULL DEFAULT 'reuniao'`);
  // Mensagem avulsa para outra pessoa (telefone com 55 + DDD); vazio = para você mesmo.
  if (!db.prepare('PRAGMA table_info(avulsas)').all().some((c) => c.name === 'telefone')) db.exec('ALTER TABLE avulsas ADD COLUMN telefone TEXT');
  return db;
}

/** Executa fn dentro de uma transação. Com desfazer=true, nada é gravado (modo conferência). */
export function transacao(db, fn, { desfazer = false } = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec(desfazer ? 'ROLLBACK' : 'COMMIT');
    return resultado;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Acha o contato pelo nome ou por um dos "outros nomes". */
export function buscarContato(db, chave) {
  return (
    db.prepare('SELECT * FROM contatos WHERE chave = ?').get(chave) ??
    db.prepare('SELECT c.* FROM apelidos a JOIN contatos c ON c.id = a.contato_id WHERE a.chave = ?').get(chave)
  );
}

/** Todos os nomes de um contato: o principal e os "outros nomes". */
export function nomesDoContato(db, contato) {
  const outros = db.prepare('SELECT nome FROM apelidos WHERE contato_id = ? ORDER BY nome').all(contato.id).map((a) => a.nome);
  return [contato.nome, ...outros];
}

export function listarContatos(db) {
  return db
    .prepare(
      `SELECT c.*, (SELECT group_concat(a.nome, ', ') FROM apelidos a WHERE a.contato_id = c.id) AS outros_nomes
         FROM contatos c ORDER BY c.nome`,
    )
    .all();
}

/** Lembretes pendentes cujo horário previsto já chegou (inclui os atrasados). */
export function pendentesVencidos(db, agoraIso) {
  return db.prepare(`
    SELECT l.id, l.designacao_id, l.tipo, l.previsto_para, l.tentativas,
           d.data, d.horario, d.funcao, d.nome, d.chave, d.local, d.observacao
      FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id
     WHERE l.status = 'pendente' AND d.ativa = 1 AND l.previsto_para <= ?
     ORDER BY d.data, d.chave, l.previsto_para`).all(agoraIso);
}

/** Todos os lembretes pendentes (para o comando "proximos"). */
export function todosPendentes(db) {
  return db.prepare(`
    SELECT l.id, l.designacao_id, l.tipo, l.previsto_para, l.status, l.detalhe,
           d.data, d.horario, d.funcao, d.nome, d.chave, d.local, d.observacao
      FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id
     WHERE l.status = 'pendente' AND d.ativa = 1
     ORDER BY l.previsto_para, d.chave`).all();
}

export function lembretesComErro(db, aPartirDe) {
  return db.prepare(`
    SELECT l.id, l.tipo, l.detalhe, l.atualizado_em, d.data, d.horario, d.funcao, d.nome
      FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id
     WHERE l.status = 'erro' AND d.ativa = 1 AND d.data >= ?
     ORDER BY d.data, d.nome`).all(aPartirDe);
}

export function atualizarStatusLembretes(db, ids, status, { detalhe = null, envioId = null, momentoIso }) {
  const stmt = db.prepare(
    'UPDATE lembretes SET status = ?, detalhe = ?, envio_id = COALESCE(?, envio_id), atualizado_em = ? WHERE id = ?',
  );
  for (const id of ids) stmt.run(status, detalhe, envioId, momentoIso, id);
}

export function registrarEnvio(db, { momentoIso, nome, telefone, dataReuniao, tipo, texto, status, erro = null }) {
  const r = db
    .prepare(`INSERT INTO envios (momento, nome, telefone, data_reuniao, tipo, texto, status, erro)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(momentoIso, nome, telefone, dataReuniao, tipo, texto, status, erro);
  return Number(r.lastInsertRowid);
}
