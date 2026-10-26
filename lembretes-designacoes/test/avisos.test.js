import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DateTime } from 'luxon';
import { abrirBanco } from '../src/banco.js';
import { avisosPendentes } from '../src/avisosTerritorios.js';
import { FUSO } from '../src/tempo.js';

const em = (iso) => DateTime.fromISO(iso, { zone: FUSO });
/** Site de mentira: responde conforme o começo do caminho consultado. */
const site = (dados) => async (caminho) => {
  for (const [prefixo, valor] of Object.entries(dados)) if (caminho.startsWith(prefixo)) return typeof valor === 'function' ? valor(caminho) : valor;
  return [];
};

describe('avisos do site dos territórios', () => {
  it('na primeira vez não manda o histórico; depois avisa cada conclusão nova uma vez', async () => {
    const db = abrirBanco(':memory:');
    let conclusoes = [{ id: 1, territorio_numero: 35, data: '2026-10-21', manual: false, territorios: { bairro: 'Jardim X' } }];
    const consultar = site({ conclusoes: () => conclusoes, pedidos_substituicao: [] });
    assert.equal((await avisosPendentes({ db, agora: em('2026-10-21T10:00'), consultar })).length, 0);
    conclusoes = [{ id: 2, territorio_numero: 54, data: '2026-10-22', manual: true, concluida_por_nome: 'Ricardo Alves', territorios: { bairro: 'Vila Cardoso' } }, ...conclusoes];
    const avisos = await avisosPendentes({ db, agora: em('2026-10-22T10:00'), consultar });
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].texto, /Território 54\* – Vila Cardoso concluído à mão por Ricardo Alves em 22\/10\/2026/);
    db.prepare('INSERT INTO avisos_territorios VALUES (?, ?)').run(avisos[0].chave, 'x'); // como se tivesse enviado
    assert.equal((await avisosPendentes({ db, agora: em('2026-10-22T10:15'), consultar })).length, 0);
  });
  it('pedido de substituto: só avisa depois de 2 dias e se a saída ainda não passou', async () => {
    const db = abrirBanco(':memory:');
    const pedido = { id: 7, criado_em: '2026-10-20T12:00:00Z', pedido_por_nome: 'Fernando', motivo: 'viagem', saidas: { data: '2026-10-31', horario: '08:30', local: 'Salão do Reino' } };
    const consultar = site({ conclusoes: [], pedidos_substituicao: [pedido] });
    assert.equal((await avisosPendentes({ db, agora: em('2026-10-21T10:00'), consultar })).length, 0, 'menos de 2 dias');
    const [a] = await avisosPendentes({ db, agora: em('2026-10-22T10:00'), consultar });
    assert.match(a.texto, /Ninguém assumiu ainda.*31\/10\/2026 às 08:30.*Fernando pediu substituto há 1 dias|Ninguém assumiu ainda.*31\/10\/2026 às 08:30.*Fernando pediu substituto há 2 dias/s);
    assert.equal((await avisosPendentes({ db, agora: em('2026-11-01T10:00'), consultar: site({ conclusoes: [], pedidos_substituicao: [pedido], territorios: [], progresso_territorios: [] }) })).filter((x) => x.chave.startsWith('pedido')).length, 0, 'saída já passou');
  });
  it('resumo do mês anterior no dia 1º', async () => {
    const db = abrirBanco(':memory:');
    const consultar = site({
      'conclusoes?select=territorio_numero': [{ territorio_numero: 35 }, { territorio_numero: 12 }, { territorio_numero: 35 }],
      conclusoes: [],
      pedidos_substituicao: [],
      territorios: [{ numero: 1, ultima_data: '2026-10-21' }, { numero: 2, ultima_data: '2025-01-01' }],
      progresso_territorios: [{ numero: 1, total_quadras: 4, feitas_no_ciclo: 1 }, { numero: 2, total_quadras: 0, feitas_no_ciclo: 0 }],
    });
    assert.equal((await avisosPendentes({ db, agora: em('2026-10-31T10:00'), consultar })).length, 0, 'não é dia 1º');
    const [r] = await avisosPendentes({ db, agora: em('2026-11-01T08:00'), consultar });
    assert.equal(r.chave, 'resumo:2026-10');
    assert.match(r.texto, /resumo de outubro/);
    assert.match(r.texto, /Concluídos no mês: \*2\*/);
    assert.match(r.texto, /últimos 4 meses: \*1 de 2\* \(50%\)/);
  });
});
