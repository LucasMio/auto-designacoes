import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { DateTime } from 'luxon';
import { abrirBanco } from '../src/banco.js';
import { carregarModelos } from '../src/config.js';
import { executarCiclo, recuperarEnviosInterrompidos } from '../src/envio.js';
import { aplicarContatos, aplicarDesignacoes } from '../src/importacao.js';
import { desativarArquivoDeLog } from '../src/log.js';
import { montarMensagem } from '../src/mensagens.js';
import { FUSO } from '../src/tempo.js';

desativarArquivoDeLog();

const config = {
  horaEnvio: '08:00',
  janelaEnvio: { inicio: '08:00', fim: '21:00' },
  intervaloEntreMensagens: { minimoSegundos: 0, maximoSegundos: 0 },
  horarioReunioes: { terca: '19:30', sabado: '19:00' },
  dddPadrao: '',
  meuNumero: '',
  avisarErrosNoWhatsApp: true,
};
const modelos = carregarModelos();
const em = (texto) => DateTime.fromFormat(texto, 'dd/MM/yyyy HH:mm', { zone: FUSO });
const semPausa = async () => {};

/** WhatsApp de mentira: registra o que seria enviado. */
function whatsappFalso({ semWhatsApp = [], falharEnvio = false } = {}) {
  return {
    meuChatId: 'eu@c.us',
    enviadas: [],
    async verificarNumero(numero) {
      return semWhatsApp.includes(numero) ? null : `${numero}@c.us`;
    },
    async enviar(chatId, texto) {
      if (falharEnvio && chatId !== 'eu@c.us') throw new Error('sem internet');
      this.enviadas.push({ chatId, texto });
    },
  };
}

let db;
beforeEach(() => {
  db = abrirBanco(':memory:');
  aplicarContatos(
    db,
    [
      { nome: 'Carlos Souza', telefone: '(11) 98765-4321' },
      { nome: 'João Silva', telefone: '(11) 91234-5678' },
    ],
    { agora: em('01/09/2026 09:00'), config },
  );
  // Terça 13/10/2026: Carlos é Leitor e também Microfone; João é Indicador.
  aplicarDesignacoes(
    db,
    [
      { data: '2026-10-13', horario: '19:30', funcao: 'Leitor', nome: 'Carlos Souza' },
      { data: '2026-10-13', horario: '19:30', funcao: 'Microfone volante', nome: 'Carlos Souza' },
      { data: '2026-10-13', horario: '19:30', funcao: 'Indicador', nome: 'João Silva' },
    ],
    { agora: em('01/09/2026 09:00'), config },
  );
});

const ciclo = (wa, agora, extra = {}) => executarCiclo({ db, config, modelos, wa, agora: em(agora), pausa: semPausa, ...extra });

describe('executarCiclo', () => {
  it('envia no horário, agrupa designações da mesma pessoa e nunca reenvia', async () => {
    const wa = whatsappFalso();
    const r = await ciclo(wa, '13/09/2026 08:00');
    assert.equal(r.enviados.length, 2);
    const paraCarlos = wa.enviadas.find((m) => m.chatId === '5511987654321@c.us');
    assert.match(paraCarlos.texto, /Olá, Carlos!/);
    assert.match(paraCarlos.texto, /Designações: Leitor e Microfone volante/);
    assert.match(paraCarlos.texto, /Terça-feira, 13\/10\/2026 às 19:30/);
    assert.match(paraCarlos.texto, /daqui a 30 dias/);

    const r2 = await ciclo(wa, '13/09/2026 09:00');
    assert.equal(r2.enviados.length, 0);
    assert.equal(wa.enviadas.length, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM envios WHERE status = 'enviado'`).get().n, 2);
  });

  it('não envia fora da janela de horário (espera abrir)', async () => {
    const wa = whatsappFalso();
    const r = await ciclo(wa, '06/10/2026 22:00');
    assert.equal(r.foraDaJanela, true);
    assert.equal(wa.enviadas.length, 0);
    const r2 = await ciclo(wa, '07/10/2026 08:00');
    assert.equal(r2.enviados.length, 2);
  });

  it('pendências acumuladas (computador desligado): manda só a mais recente', async () => {
    const wa = whatsappFalso();
    await ciclo(wa, '08/10/2026 10:00'); // 30d e 7d vencidos
    assert.equal(wa.enviadas.length, 2);
    assert.ok(wa.enviadas.every((m) => /Falta pouco/.test(m.texto)));
    const status = db.prepare(`SELECT tipo, status FROM lembretes WHERE tipo IN ('30d','7d')`).all();
    assert.ok(status.filter((s) => s.tipo === '30d').every((s) => s.status === 'pulado'));
    assert.ok(status.filter((s) => s.tipo === '7d').every((s) => s.status === 'enviado'));
  });

  it('depois da reunião, os pendentes expiram sem envio', async () => {
    const wa = whatsappFalso();
    const r = await ciclo(wa, '14/10/2026 09:00');
    assert.equal(wa.enviadas.length, 0);
    assert.equal(r.expirados.length, 9);
  });

  it('pessoa sem contato: registra erro e avisa o dono', async () => {
    aplicarDesignacoes(db, [{ data: '2026-10-17', horario: '19:00', funcao: 'Leitor', nome: 'Fulano Sem Telefone' }], {
      agora: em('01/09/2026 09:00'), config,
    });
    const wa = whatsappFalso();
    const r = await ciclo(wa, '17/09/2026 08:00');
    assert.equal(r.erros.length, 1);
    assert.match(r.erros[0].motivo, /sem contato/);
    const aviso = wa.enviadas.find((m) => m.chatId === 'eu@c.us');
    assert.match(aviso.texto, /Fulano Sem Telefone/);
  });

  it('número sem WhatsApp: erro, não envia', async () => {
    const wa = whatsappFalso({ semWhatsApp: ['5511912345678'] });
    const r = await ciclo(wa, '13/09/2026 08:00');
    assert.equal(r.enviados.length, 1);
    assert.match(r.erros[0].motivo, /não tem WhatsApp/);
  });

  it('falha de conexão: tenta de novo e desiste depois de 3 vezes', async () => {
    const wa = whatsappFalso({ falharEnvio: true });
    await ciclo(wa, '13/09/2026 08:00');
    await ciclo(wa, '13/09/2026 08:01');
    let status = db.prepare(`SELECT DISTINCT status FROM lembretes WHERE tipo = '30d'`).all().map((s) => s.status);
    assert.deepEqual(status, ['pendente']);
    await ciclo(wa, '13/09/2026 08:02');
    status = db.prepare(`SELECT DISTINCT status FROM lembretes WHERE tipo = '30d'`).all().map((s) => s.status);
    assert.deepEqual(status, ['erro']);
  });

  it('simulação mostra as mensagens e não grava nada', async () => {
    const r = await ciclo(null, '13/09/2026 08:00', { simular: true });
    assert.equal(r.previstos.length, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM lembretes WHERE status <> 'pendente'`).get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM envios').get().n, 0);
  });

  it('envio interrompido no meio não é reenviado ao religar', async () => {
    db.prepare(`UPDATE lembretes SET status = 'enviando' WHERE tipo = '30d'`).run();
    assert.equal(recuperarEnviosInterrompidos(db, em('13/09/2026 08:05')), 3);
    const wa = whatsappFalso();
    await ciclo(wa, '13/09/2026 08:10');
    assert.equal(wa.enviadas.filter((m) => m.chatId !== 'eu@c.us').length, 0);
  });
});

describe('montarMensagem', () => {
  it('preenche os campos dos 4 modelos', () => {
    for (const tipo of ['30d', '7d', 'dia', 'aviso']) {
      const texto = montarMensagem(modelos, tipo, {
        nome: 'Carlos Souza', data: '2026-10-17', horario: '19:00', funcoes: ['Leitor'], agora: em('10/10/2026 08:00'),
      });
      assert.doesNotMatch(texto, /\{\w+\}/, `sobrou campo sem preencher no modelo ${tipo}`);
      assert.doesNotMatch(texto, /^#/m, 'comentário vazou para a mensagem');
      assert.match(texto, /Sábado, 17\/10\/2026 às 19:00/);
      assert.match(texto, /Designação: Leitor/);
    }
  });
});

describe('esquema resumo-mensal (ciclo completo)', () => {
  it('um resumo por pessoa com o mês inteiro; depois só o lembrete no dia', async () => {
    const cfgResumo = { ...config, esquema: 'resumo-mensal' };
    const dbR = abrirBanco(':memory:');
    aplicarContatos(dbR, [{ nome: 'Marta', telefone: '(66) 99221-0000' }], { agora: em('22/09/2026 09:00'), config: cfgResumo });
    aplicarDesignacoes(
      dbR,
      [
        { data: '2026-10-06', horario: '19:30', funcao: 'Indicador', nome: 'Marta' },
        { data: '2026-10-13', horario: '19:30', funcao: 'Leitor', nome: 'Marta' },
        { data: '2026-10-31', horario: '19:00', funcao: 'Indicador', nome: 'Marta' },
      ],
      { agora: em('22/09/2026 09:00'), config: cfgResumo },
    );
    const wa = whatsappFalso();
    const c = (quando) => executarCiclo({ db: dbR, config: cfgResumo, modelos, wa, agora: em(quando), pausa: semPausa });

    await c('22/09/2026 09:01');
    assert.equal(wa.enviadas.length, 1);
    assert.match(wa.enviadas[0].texto, /Suas designações de Outubro/);
    assert.match(wa.enviadas[0].texto, /Terça-feira, 06\/10 às 19:30 — Indicador/);
    assert.match(wa.enviadas[0].texto, /Sábado, 31\/10 às 19:00 — Indicador/);

    await c('29/09/2026 08:00'); // sem lembrete de 7 dias
    assert.equal(wa.enviadas.length, 1);
    await c('06/10/2026 08:00');
    assert.equal(wa.enviadas.length, 2);
    assert.match(wa.enviadas[1].texto, /Hoje é o dia/);
  });

});

describe('mesma pessoa com nomes diferentes nas listas', () => {
  it('"Brito" e "Carlos Brito" recebem uma mensagem só', async () => {
    const cfgResumo = { ...config, esquema: 'resumo-mensal' };
    const dbB = abrirBanco(':memory:');
    aplicarContatos(dbB, [{ nome: 'Brito', telefone: '(66) 99111-2222', apelidos: ['Carlos Brito'] }], { agora: em('22/09/2026 09:00'), config: cfgResumo });
    aplicarDesignacoes(dbB, [{ data: '2026-10-24', horario: '19:00', funcao: 'Microfone volante', nome: 'Brito' }], {
      agora: em('22/09/2026 09:00'), config: cfgResumo,
    });
    aplicarDesignacoes(
      dbB,
      [{ data: '2026-10-17', horario: '08:30', funcao: 'Dirigente de campo', nome: 'CARLOS BRITO', local: 'Salão do Reino', lista: 'dirigentes' }],
      { agora: em('22/09/2026 09:05'), config: cfgResumo },
    );
    const wa = whatsappFalso();
    await executarCiclo({ db: dbB, config: cfgResumo, modelos, wa, agora: em('22/09/2026 09:10'), pausa: semPausa });
    assert.equal(wa.enviadas.length, 1, 'deveria ser uma mensagem só');
    assert.match(wa.enviadas[0].texto, /17\/10 às 08:30 — Dirigente de campo/);
    assert.match(wa.enviadas[0].texto, /24\/10 às 19:00 — Microfone volante/);
  });
});

describe('lembretes por lista: reuniões 7 dias + no dia; dirigentes só no dia', () => {
  const cfg = {
    ...config,
    lembretes: { reuniao: ['7d', 'dia'], dirigentes: ['dia'] },
    lembreteManha: { quandoComecarAntesDe: '12:00', hora: '07:00' },
  };

  it('agenda 7 dias + no dia para a reunião e só o do dia para o dirigente', () => {
    const dbL = abrirBanco(':memory:');
    aplicarDesignacoes(
      dbL,
      [
        { data: '2026-10-24', horario: '19:00', funcao: 'Leitor', nome: 'Ciro' },
        { data: '2026-10-28', horario: '18:00', funcao: 'Dirigente de campo', nome: 'Ciro', lista: 'dirigentes' },
        { data: '2026-10-31', horario: '08:30', funcao: 'Dirigente de campo', nome: 'Brito', lista: 'dirigentes' },
      ],
      { agora: em('25/09/2026 10:00'), config: cfg },
    );
    const l = dbL
      .prepare('SELECT d.data, l.tipo, l.previsto_para FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id ORDER BY d.data, l.previsto_para')
      .all()
      .map((x) => `${x.data} ${x.tipo}`);
    assert.deepEqual(l, ['2026-10-24 7d', '2026-10-24 dia', '2026-10-28 dia', '2026-10-31 dia']);
    // campo de sábado às 08:30: lembrete às 07:00 do próprio dia
    const manha = dbL.prepare(`SELECT l.previsto_para FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id WHERE d.data = '2026-10-31'`).get();
    assert.equal(manha.previsto_para, '2026-10-31T11:00:00.000Z'); // 07:00 em Cuiabá (UTC-4)
  });

  it('muda a configuração: cancela o que não é usado, agenda o que falta e não reenvia o que já saiu', async () => {
    const { sincronizarLembretes } = await import('../src/importacao.js');
    // O banco do beforeEach foi criado com 30d + 7d + dia (13/10/2026). Simula: o 30d já foi enviado,
    // o 7d tinha sido cancelado e sobrou um resumo pendente.
    db.prepare(`UPDATE lembretes SET status = 'enviado' WHERE tipo = '30d'`).run();
    db.prepare(`UPDATE lembretes SET status = 'cancelado' WHERE tipo = '7d'`).run();
    const umaDesignacao = db.prepare('SELECT id FROM designacoes LIMIT 1').get().id;
    db.prepare(`INSERT INTO lembretes (designacao_id, tipo, previsto_para, status) VALUES (?, 'resumo', '2026-09-22T12:00:00.000Z', 'pendente')`).run(umaDesignacao);

    const r = sincronizarLembretes(db, cfg, em('25/09/2026 10:00'));
    assert.deepEqual(r, { criados: 3, reagendados: 0, cancelados: 1 });
    const status = db.prepare('SELECT tipo, status, COUNT(*) AS n FROM lembretes GROUP BY 1, 2 ORDER BY 1, 2').all().map((x) => `${x.tipo}:${x.status}:${x.n}`);
    assert.deepEqual(status, ['30d:enviado:3', '7d:pendente:3', 'dia:pendente:3', 'resumo:cancelado:1']);
    // Rodar de novo não muda nada.
    assert.deepEqual(sincronizarLembretes(db, cfg, em('25/09/2026 10:05')), { criados: 0, reagendados: 0, cancelados: 0 });

    // E no ciclo, o que já foi enviado não volta: em 06/10 sai só o de 7 dias.
    const wa = whatsappFalso();
    await executarCiclo({ db, config: cfg, modelos, wa, agora: em('06/10/2026 08:00'), pausa: semPausa });
    assert.equal(wa.enviadas.length, 2);
    assert.ok(wa.enviadas.every((m) => /Falta pouco/.test(m.texto)));
  });

  it('não cria lembrete atrasado: se o dia do lembrete de 7 dias já passou, fica só o do dia', async () => {
    const { sincronizarLembretes } = await import('../src/importacao.js');
    db.prepare(`DELETE FROM lembretes`).run();
    const r = sincronizarLembretes(db, cfg, em('08/10/2026 10:00'));
    assert.deepEqual(r, { criados: 3, reagendados: 0, cancelados: 0 });
    assert.deepEqual(db.prepare('SELECT DISTINCT tipo FROM lembretes').all().map((x) => x.tipo), ['dia']);
  });
});

describe('dirigente que já foi avisado na véspera (regra antiga)', () => {
  it('não recebe um segundo aviso no dia', async () => {
    const { sincronizarLembretes } = await import('../src/importacao.js');
    const cfg = { ...config, lembretes: { reuniao: ['7d', 'dia'], dirigentes: ['dia'] }, lembreteManha: { quandoComecarAntesDe: '12:00', hora: '07:00' } };
    const dbV = abrirBanco(':memory:');
    aplicarDesignacoes(dbV, [{ data: '2026-10-10', horario: '08:30', funcao: 'Dirigente de campo', nome: 'Brito', lista: 'dirigentes' }], {
      agora: em('06/10/2026 10:00'), config: cfg,
    });
    // Simula: pela regra antiga ele tinha um "vespera" e ele já foi enviado.
    dbV.prepare(`UPDATE lembretes SET tipo = 'vespera', status = 'enviado'`).run();
    sincronizarLembretes(dbV, cfg, em('09/10/2026 20:00'));
    assert.equal(dbV.prepare(`SELECT COUNT(*) AS n FROM lembretes WHERE status = 'pendente'`).get().n, 0);
  });
});

describe('território no lembrete do dirigente', async () => {
  const { linhaDoTerritorio, territorioDaSaida } = await import('../src/siteTerritorios.js');
  const respostaFalsa = (linhas) => async () => ({ ok: true, json: async () => linhas });
  const chaves = { url: 'https://exemplo.supabase.co', chave: 'x' };

  it('busca o território da saída e monta a linha com o link', async () => {
    const t = await territorioDaSaida('2026-10-24', '08:30', { chaves, buscar: respostaFalsa([{ territorio_numero: 4, territorios: { bairro: 'Gran Ville II' } }]) });
    assert.equal(t.numero, 4);
    assert.equal(linhaDoTerritorio(t), '🗺️ Veja o território do dia no sistema:\n👉 https://territorios-exemplo.vercel.app/territorio/4\n');
    assert.doesNotMatch(linhaDoTerritorio(t), /Gran Ville|Nº 4/, 'não mostra número nem bairro');
  });
  it('cartas não tem linha; chefe escolhe tem aviso; falha não atrapalha', async () => {
    assert.equal(linhaDoTerritorio(await territorioDaSaida('2026-10-28', '18:00', { chaves, buscar: respostaFalsa([{ sem_territorio: true }]) })), '');
    assert.match(linhaDoTerritorio(await territorioDaSaida('2026-10-25', '08:30', { chaves, buscar: respostaFalsa([{ escolha_do_dirigente: true }]) })), /territórios do seu grupo no sistema/);
    assert.equal(await territorioDaSaida('2026-10-24', '08:30', { chaves, buscar: async () => { throw new Error('sem internet'); } }), null);
    assert.equal(await territorioDaSaida('2026-10-24', '08:30', { chaves: null }), null);
  });
  it('o lembrete do dia do dirigente sai com o território', async () => {
    const dbT = abrirBanco(':memory:');
    aplicarContatos(dbT, [{ nome: 'Ciro', telefone: '(66) 99617-0000' }], { agora: em('20/10/2026 09:00'), config });
    aplicarDesignacoes(dbT, [{ data: '2026-10-26', horario: '18:00', funcao: 'Dirigente de campo', nome: 'Ciro', local: 'Casa do SR. Osvaldo', lista: 'dirigentes' }], { agora: em('20/10/2026 09:00'), config });
    const wa = whatsappFalso();
    await executarCiclo({ db: dbT, config, modelos, wa, agora: em('26/10/2026 08:05'), pausa: semPausa,
      buscarTerritorio: async () => ({ numero: 32, bairro: 'Jardim Teste', link: 'https://territorios-exemplo.vercel.app/territorio/32' }) });
    const msg = wa.enviadas.find((m) => m.chatId !== 'eu@c.us');
    assert.ok(msg, 'lembrete enviado');
    assert.match(msg.texto, /🗺️ Veja o território do dia no sistema/);
    assert.match(msg.texto, /territorio\/32/);
  });
  it('lembrete de reunião não muda', () => {
    const texto = montarMensagem(modelos, 'dia', { nome: 'Marta', data: '2026-10-27', horario: '19:30', funcoes: ['Leitor'], agora: em('27/10/2026 08:00') });
    assert.doesNotMatch(texto, /Território/);
  });
});
