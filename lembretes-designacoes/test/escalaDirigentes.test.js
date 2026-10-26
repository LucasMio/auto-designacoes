import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { saidasDoMes, sugerirDirigentes, tipoDaSaida } from '../src/escalaDirigentes.js';

describe('escala de dirigentes sugerida', () => {
  it('monta as saídas do mês pelas regras (dezembro de 2026)', () => {
    const s = saidasDoMes('2026-12');
    const resumo = s.map((x) => `${x.data.slice(8)}:${x.tipo}`);
    assert.deepEqual(resumo, ['02:qua', '05:sab', '06:dom1', '07:seg', '09:qua', '12:sab', '14:seg', '16:qua-cartas', '19:sab', '21:seg', '23:qua-cartas', '26:sab', '28:seg', '30:qua-cartas']);
    assert.equal(s.find((x) => x.tipo === 'seg').local, 'Casa do SR. Osvaldo');
    assert.equal(s.find((x) => x.tipo === 'sab').horario, '08:30');
  });
  it('lê o tipo das saídas do histórico (cartas pelo local também)', () => {
    assert.equal(tipoDaSaida('2026-10-21', 'Salão do Reino (Cartas)'), 'qua-cartas');
    assert.equal(tipoDaSaida('2026-10-07', 'Salão do Reino'), 'qua');
    assert.equal(tipoDaSaida('2026-10-11'), null, 'domingo dos grupos não entra');
  });
  it('faz rodízio entre quem costuma dirigir aquele dia', () => {
    const seg = [{ pessoa: 'jonas', nome: 'JONAS PEREIRA' }, { pessoa: 'tiago', nome: 'TIAGO' }, { pessoa: 'ciro', nome: 'CIRO' }];
    const historico = [
      { pessoa: 'jonas', tipo: 'seg', data: '2026-11-30' },
      { pessoa: 'tiago', tipo: 'seg', data: '2026-11-23' },
      { pessoa: 'ciro', tipo: 'seg', data: '2026-09-28' },
    ];
    const { saidas } = sugerirDirigentes(saidasDoMes('2026-12').filter((s) => s.tipo === 'seg'), (t) => (t === 'seg' ? seg : []), historico);
    assert.deepEqual(saidas.map((s) => s.nome), ['CIRO', 'TIAGO', 'JONAS PEREIRA', 'CIRO']);
  });
  it('sem ninguém no histórico para aquele dia: vaga em branco com aviso', () => {
    const { saidas, avisos } = sugerirDirigentes([{ data: '2026-12-06', tipo: 'dom1' }], () => [], []);
    assert.equal(saidas[0].nome, '');
    assert.ok(avisos[0].includes('escolha à mão'));
  });
});
