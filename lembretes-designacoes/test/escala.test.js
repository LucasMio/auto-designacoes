import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reunioesDoMes, sugerirEscala } from '../src/escala.js';

const pessoas = (...nomes) => nomes.map((n) => ({ pessoa: n.toLowerCase(), nome: n }));

describe('escala mecânica sugerida', () => {
  it('lista as terças e sábados do mês', () => {
    const r = reunioesDoMes('2026-12', { terca: '19:30', sabado: '19:00' });
    assert.deepEqual(r.map((x) => x.data.slice(8)), ['01', '05', '08', '12', '15', '19', '22', '26', '29']);
    assert.equal(r[0].horario, '19:30');
    assert.equal(r[1].horario, '19:00');
  });

  it('preenche 1 leitor, 2 indicadores e 2 volantes por reunião, sem repetir na mesma reunião', () => {
    const autorizados = (f) => pessoas('Ana', 'Beto', 'Caio', 'Davi', 'Eli', 'Fabi', 'Gil', 'Hugo');
    const { designacoes } = sugerirEscala([{ data: '2026-12-01', dia: 'terca' }], autorizados, []);
    assert.equal(designacoes.length, 5);
    assert.equal(new Set(designacoes.map((d) => d.pessoa)).size, 5);
  });

  it('escolhe quem está há mais tempo sem fazer aquela parte', () => {
    const historico = [
      { pessoa: 'ana', funcao: 'Leitor', data: '2026-11-24' },
      { pessoa: 'beto', funcao: 'Leitor', data: '2026-10-06' },
      { pessoa: 'caio', funcao: 'Leitor', data: '2026-11-10' },
    ];
    const autorizados = (f) => (f === 'Leitor' ? pessoas('Ana', 'Beto', 'Caio') : pessoas('X1', 'X2', 'X3', 'X4', 'X5'));
    const { designacoes } = sugerirEscala([{ data: '2026-12-01', dia: 'terca' }], autorizados, historico);
    assert.equal(designacoes.find((d) => d.funcao === 'Leitor').nome, 'Beto');
  });

  it('quem nunca fez vem primeiro; e o rodízio passa por todos', () => {
    const autorizados = (f) => (f === 'Leitor' ? pessoas('Ana', 'Beto', 'Caio') : pessoas('X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'X10'));
    const reunioes = reunioesDoMes('2026-12', { terca: '19:30', sabado: '19:00' }).filter((r) => r.dia === 'terca');
    const { designacoes } = sugerirEscala(reunioes, autorizados, [{ pessoa: 'ana', funcao: 'Leitor', data: '2026-11-24' }]);
    const leitores = designacoes.filter((d) => d.funcao === 'Leitor').map((d) => d.nome);
    assert.deepEqual(leitores.slice(0, 3).sort(), ['Ana', 'Beto', 'Caio']);
    assert.notEqual(leitores[0], 'Ana', 'quem leu por último não começa');
  });

  it('evita a mesma pessoa em reuniões com menos de 4 dias; se faltar gente, avisa', () => {
    const poucos = (f) => (f === 'Leitor' ? pessoas('Ana') : pessoas('B', 'C', 'D', 'E'));
    const { designacoes, avisos } = sugerirEscala(
      [{ data: '2026-12-01', dia: 'terca' }, { data: '2026-12-03', dia: 'sabado' }],
      poucos,
      [],
    );
    assert.equal(designacoes.length, 10);
    assert.ok(avisos.some((a) => a.includes('menos de 4 dias')));
  });
});
