import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planejarLembretes, selecionarEnvios } from '../src/planejamento.js';
import { FUSO, paraBanco } from '../src/tempo.js';
import { DateTime } from 'luxon';

const config = { horaEnvio: '08:00' };
const em = (texto) => DateTime.fromFormat(texto, 'dd/MM/yyyy HH:mm', { zone: FUSO });
const fmt = (dt) => dt.setZone(FUSO).toFormat('dd/MM/yyyy HH:mm');

// Terça-feira, 13/10/2026 às 19:30
const TERCA = { data: '2026-10-13', horario: '19:30' };

function resumo(lembretes) {
  return lembretes.map((l) => `${l.tipo} ${fmt(l.previsto)}`);
}

describe('planejarLembretes', () => {
  it('cadastro com antecedência: 30 dias, 7 dias e no dia, às 08:00', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('01/09/2026 10:00'), config)), [
      '30d 13/09/2026 08:00',
      '7d 06/10/2026 08:00',
      'dia 13/10/2026 08:00',
    ]);
  });

  it('horário de envio configurável', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('01/09/2026 10:00'), { horaEnvio: '07:30' })), [
      '30d 13/09/2026 07:30',
      '7d 06/10/2026 07:30',
      'dia 13/10/2026 07:30',
    ]);
  });

  it('cadastrada depois do dia do lembrete de 30 dias: aviso imediato + 7 dias + no dia', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('21/09/2026 15:00'), config)), [
      'aviso 21/09/2026 15:00',
      '7d 06/10/2026 08:00',
      'dia 13/10/2026 08:00',
    ]);
  });

  it('cadastrada depois do lembrete de 7 dias: aviso imediato + no dia', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('08/10/2026 09:00'), config)), ['aviso 08/10/2026 09:00', 'dia 13/10/2026 08:00']);
  });

  it('cadastrada no próprio dia, depois das 08:00: só o aviso imediato', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('13/10/2026 12:00'), config)), ['aviso 13/10/2026 12:00']);
  });

  it('cadastrada exatamente no horário do lembrete de 30 dias: não vira aviso', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('13/09/2026 08:00'), config)), [
      '30d 13/09/2026 08:00',
      '7d 06/10/2026 08:00',
      'dia 13/10/2026 08:00',
    ]);
  });

  it('reunião que já começou ou passou: nenhum lembrete', () => {
    assert.deepEqual(planejarLembretes(TERCA, em('13/10/2026 19:30'), config), []);
    assert.deepEqual(planejarLembretes(TERCA, em('20/10/2026 10:00'), config), []);
  });
});

// Monta uma linha como as que vêm do banco.
let proximoId = 1;
function pendente({ tipo, previsto, designacao_id = 1, nome = 'João Silva', funcao = 'Leitor', data = '2026-10-13', horario = '19:30' }) {
  return {
    id: proximoId++, designacao_id, tipo, previsto_para: paraBanco(em(previsto)), tentativas: 0,
    data, horario, funcao, nome, chave: nome.toLowerCase(),
  };
}

describe('selecionarEnvios', () => {
  it('envia o lembrete que chegou na hora', () => {
    const { envios, expirados } = selecionarEnvios([pendente({ tipo: '7d', previsto: '06/10/2026 08:00' })], em('06/10/2026 08:00'));
    assert.equal(envios.length, 1);
    assert.equal(envios[0].tipo, '7d');
    assert.equal(expirados.length, 0);
  });

  it('não envia o que ainda não chegou na hora', () => {
    const { envios } = selecionarEnvios([pendente({ tipo: '7d', previsto: '06/10/2026 08:00' })], em('06/10/2026 07:59'));
    assert.equal(envios.length, 0);
  });

  it('computador desligado: envia o pendente atrasado se a reunião ainda não aconteceu', () => {
    const { envios } = selecionarEnvios([pendente({ tipo: '30d', previsto: '13/09/2026 08:00' })], em('15/09/2026 10:00'));
    assert.equal(envios.length, 1);
    assert.equal(envios[0].tipo, '30d');
  });

  it('vários pendentes acumulados: envia só o mais recente e pula os antigos', () => {
    const p30 = pendente({ tipo: '30d', previsto: '13/09/2026 08:00' });
    const p7 = pendente({ tipo: '7d', previsto: '06/10/2026 08:00' });
    const { envios } = selecionarEnvios([p30, p7], em('08/10/2026 10:00'));
    assert.equal(envios.length, 1);
    assert.equal(envios[0].tipo, '7d');
    assert.deepEqual(envios[0].lembretes.map((l) => l.id), [p7.id]);
    assert.deepEqual(envios[0].pulados.map((l) => l.id), [p30.id]);
  });

  it('no dia tem prioridade sobre o aviso imediato', () => {
    const aviso = pendente({ tipo: 'aviso', previsto: '13/10/2026 07:00' });
    const dia = pendente({ tipo: 'dia', previsto: '13/10/2026 08:00' });
    const { envios } = selecionarEnvios([aviso, dia], em('13/10/2026 08:00'));
    assert.equal(envios[0].tipo, 'dia');
    assert.deepEqual(envios[0].pulados.map((l) => l.id), [aviso.id]);
  });

  it('reunião já aconteceu: lembrete expira e não é enviado', () => {
    const { envios, expirados } = selecionarEnvios([pendente({ tipo: 'dia', previsto: '13/10/2026 08:00' })], em('13/10/2026 19:30'));
    assert.equal(envios.length, 0);
    assert.equal(expirados.length, 1);
  });

  it('mesma pessoa com duas designações na mesma data: uma única mensagem', () => {
    const leitor = pendente({ tipo: 'dia', previsto: '13/10/2026 08:00', designacao_id: 10, funcao: 'Leitor' });
    const indicador = pendente({ tipo: 'dia', previsto: '13/10/2026 08:00', designacao_id: 11, funcao: 'Indicador' });
    const { envios } = selecionarEnvios([leitor, indicador], em('13/10/2026 08:00'));
    assert.equal(envios.length, 1);
    assert.deepEqual(envios[0].funcoes, ['Indicador', 'Leitor']);
    assert.equal(envios[0].lembretes.length, 2);
  });

  it('pessoas diferentes ou datas diferentes: mensagens separadas', () => {
    const { envios } = selecionarEnvios(
      [
        pendente({ tipo: '7d', previsto: '06/10/2026 08:00', designacao_id: 1, nome: 'João Silva' }),
        pendente({ tipo: '7d', previsto: '06/10/2026 08:00', designacao_id: 2, nome: 'Pedro Lima' }),
        pendente({ tipo: '30d', previsto: '17/09/2026 08:00', designacao_id: 3, nome: 'João Silva', data: '2026-10-17', horario: '19:00' }),
      ],
      em('06/10/2026 08:00'),
    );
    assert.equal(envios.length, 3);
  });
});

describe('esquema resumo-mensal', () => {
  const cfg = { horaEnvio: '08:00', esquema: 'resumo-mensal' };

  it('planeja o resumo na hora do cadastro e o lembrete no dia', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('22/09/2026 10:00'), cfg)), ['resumo 22/09/2026 10:00', 'dia 13/10/2026 08:00']);
  });

  it('cadastro no próprio dia da reunião: só o resumo (ele já serve de lembrete)', () => {
    assert.deepEqual(resumo(planejarLembretes(TERCA, em('13/10/2026 07:00'), cfg)), ['resumo 13/10/2026 07:00']);
  });

  it('agrupa o resumo por pessoa, com todas as datas numa mensagem só', () => {
    const r1 = pendente({ tipo: 'resumo', previsto: '22/09/2026 10:00', designacao_id: 50, funcao: 'Indicador', data: '2026-10-06' });
    const r2 = pendente({ tipo: 'resumo', previsto: '22/09/2026 10:00', designacao_id: 51, funcao: 'Leitor', data: '2026-10-13' });
    const r3 = pendente({ tipo: 'resumo', previsto: '22/09/2026 10:00', designacao_id: 52, funcao: 'Microfone volante', data: '2026-10-13' });
    const outro = pendente({ tipo: 'resumo', previsto: '22/09/2026 10:00', designacao_id: 53, nome: 'Pedro Lima' });
    const { envios } = selecionarEnvios([r1, r2, r3, outro], em('22/09/2026 10:00'));
    assert.equal(envios.length, 2);
    const joao = envios.find((e) => e.nome === 'João Silva');
    assert.equal(joao.tipo, 'resumo');
    assert.deepEqual(joao.reunioes, [
      { data: '2026-10-06', horario: '19:30', local: null, observacao: null, funcoes: ['Indicador'] },
      { data: '2026-10-13', horario: '19:30', local: null, observacao: null, funcoes: ['Leitor', 'Microfone volante'] },
    ]);
  });

  it('se o resumo e o "no dia" da mesma designação estão atrasados juntos, vale o "no dia"', () => {
    const r = pendente({ tipo: 'resumo', previsto: '22/09/2026 10:00', designacao_id: 60 });
    const d = pendente({ tipo: 'dia', previsto: '13/10/2026 08:00', designacao_id: 60 });
    const { envios } = selecionarEnvios([r, d], em('13/10/2026 09:00'));
    assert.equal(envios.length, 1);
    assert.equal(envios[0].tipo, 'dia');
    assert.deepEqual(envios[0].pulados.map((p) => p.id), [r.id]);
  });
});

describe('lembrete no dia: mais cedo quando o compromisso é de manhã', () => {
  const cfg = { horaEnvio: '08:00', lembretes: { dirigentes: ['dia'] }, lembreteManha: { quandoComecarAntesDe: '12:00', hora: '07:00' } };
  const SABADO_MANHA = { data: '2026-10-17', horario: '08:30', lista: 'dirigentes' }; // campo de sábado de manhã
  const QUARTA_TARDE = { data: '2026-10-14', horario: '18:00', lista: 'dirigentes' }; // campo de quarta à tarde

  it('compromisso de manhã: um lembrete só, no próprio dia às 07:00', () => {
    assert.deepEqual(resumo(planejarLembretes(SABADO_MANHA, em('06/10/2026 12:00'), cfg)), ['dia 17/10/2026 07:00']);
  });

  it('compromisso de tarde/noite: um lembrete só, no próprio dia às 08:00', () => {
    assert.deepEqual(resumo(planejarLembretes(QUARTA_TARDE, em('06/10/2026 12:00'), cfg)), ['dia 14/10/2026 08:00']);
  });

  it('cadastrado no próprio dia, depois do horário do lembrete: aviso na hora', () => {
    assert.deepEqual(resumo(planejarLembretes(QUARTA_TARDE, em('14/10/2026 10:00'), cfg)), ['aviso 14/10/2026 10:00']);
  });
});

describe('dirigentes no sábado: aviso na véspera', () => {
  const cfg = {
    horaEnvio: '08:00',
    lembretes: { reuniao: ['7d', 'dia'], dirigentes: ['dia'] },
    lembreteManha: { quandoComecarAntesDe: '12:00', hora: '07:00' },
    lembreteVespera: { listas: ['dirigentes'], diasDaSemana: ['sabado'], hora: '19:00' },
  };

  it('campo de sábado: um aviso só, na sexta às 19:00', () => {
    const sabado = { data: '2026-10-10', horario: '08:30', lista: 'dirigentes' };
    assert.deepEqual(resumo(planejarLembretes(sabado, em('06/10/2026 12:00'), cfg)), ['vespera 09/10/2026 19:00']);
  });

  it('campo de domingo de manhã: no próprio dia às 07:00', () => {
    const domingo = { data: '2026-11-01', horario: '08:30', lista: 'dirigentes' };
    assert.deepEqual(resumo(planejarLembretes(domingo, em('06/10/2026 12:00'), cfg)), ['dia 01/11/2026 07:00']);
  });

  it('reunião de sábado à noite continua com 7 dias + no dia', () => {
    const reuniao = { data: '2026-10-10', horario: '19:00', lista: 'reuniao' };
    assert.deepEqual(resumo(planejarLembretes(reuniao, em('01/10/2026 12:00'), cfg)), ['7d 03/10/2026 08:00', 'dia 10/10/2026 08:00']);
  });

  it('cadastrado na sexta depois das 19:00: aviso na hora (uma vez só)', () => {
    const sabado = { data: '2026-10-10', horario: '08:30', lista: 'dirigentes' };
    assert.deepEqual(resumo(planejarLembretes(sabado, em('09/10/2026 20:00'), cfg)), ['aviso 09/10/2026 20:00']);
  });
});
