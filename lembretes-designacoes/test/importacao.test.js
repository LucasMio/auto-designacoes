import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DateTime } from 'luxon';
import { abrirBanco } from '../src/banco.js';
import {
  aplicarContatos,
  conferirAutorizados,
  aplicarDesignacoes,
  interpretarAutorizados,
  interpretarContatos,
  interpretarData,
  interpretarDesignacoes,
  removerDesignacoes,
  separarNomes,
} from '../src/importacao.js';
import { interpretarCsv } from '../src/planilha.js';
import { FUSO } from '../src/tempo.js';

const AGORA = DateTime.fromObject({ year: 2026, month: 9, day: 21, hour: 10 }, { zone: FUSO });
const config = { horaEnvio: '08:00', horarioReunioes: { terca: '19:30', sabado: '19:00' }, dddPadrao: '' };
const folha = (csv, nome = 'Planilha') => [{ nome, linhas: interpretarCsv(csv) }];

describe('interpretarData', () => {
  it('reconhece vários formatos', () => {
    assert.equal(interpretarData('13/10/2026', AGORA), '2026-10-13');
    assert.equal(interpretarData('13/10/26', AGORA), '2026-10-13');
    assert.equal(interpretarData('3/1', AGORA), '2027-01-03'); // sem ano, já passou -> ano que vem
    assert.equal(interpretarData('13/10', AGORA), '2026-10-13');
    assert.equal(interpretarData('2026-10-13', AGORA), '2026-10-13');
    assert.equal(interpretarData('Terça, 13/10/2026', AGORA), '2026-10-13');
    assert.equal(interpretarData('13 de outubro de 2026', AGORA), '2026-10-13');
    assert.equal(interpretarData(new Date(Date.UTC(2026, 9, 13)), AGORA), '2026-10-13'); // data do Excel
    assert.equal(interpretarData(46308, AGORA), '2026-10-13'); // número de série do Excel
    assert.equal(interpretarData('31/02/2026', AGORA), null);
    assert.equal(interpretarData('João', AGORA), null);
  });
});

describe('separarNomes', () => {
  it('separa por /, ;, vírgula e " e "', () => {
    assert.deepEqual(separarNomes('João Silva / Pedro Lima'), ['João Silva', 'Pedro Lima']);
    assert.deepEqual(separarNomes('João e Pedro'), ['João', 'Pedro']);
    assert.deepEqual(separarNomes('  -  '), []);
  });
});

describe('interpretarDesignacoes', () => {
  it('formato "uma linha por reunião" com horário padrão pelo dia da semana', () => {
    const csv = [
      'Data;Indicador 1;Indicador 2;Leitor;Microfone 1;Microfone 2',
      '13/10/2026;João Silva;Pedro Lima;Carlos Souza;André Costa;Bruno Dias',
      '17/10/2026;Pedro Lima;João Silva;Paulo Reis;Bruno Dias;André Costa',
    ].join('\n');
    const { itens, avisos } = interpretarDesignacoes(folha(csv), { agora: AGORA, config });
    assert.deepEqual(avisos, []);
    assert.equal(itens.length, 10);
    assert.deepEqual(
      itens.filter((i) => i.data === '2026-10-13').map((i) => `${i.funcao}:${i.nome}@${i.horario}`),
      [
        'Indicador:João Silva@19:30', 'Indicador:Pedro Lima@19:30', 'Leitor:Carlos Souza@19:30',
        'Microfone volante:André Costa@19:30', 'Microfone volante:Bruno Dias@19:30',
      ],
    );
    assert.ok(itens.filter((i) => i.data === '2026-10-17').every((i) => i.horario === '19:00'));
  });

  it('formato da congregação: título com o ano, blocos Terça/Sábado, data sem título e nomes com " - "', () => {
    const csv = [
      ';Lista de Designações;;;;;;;',
      ';;;Outubro 2026;;;;;',
      ';TERÇA;TERÇA;TERÇA;TERÇA;TERÇA;TERÇA;TERÇA;TERÇA',
      ';INDICADORES;INDICADORES;;LEITORES;LEITORES;;MICROFONES VOLANTES;MICROFONES VOLANTES',
      '06/10;Fernando - Marta;Fernando - Marta;;Jonas;Jonas;;Leandro - João;Leandro - João',
      '13/10;Estêvão - Alex;Estêvão - Alex;;Marta;Marta;;Ray - Clebson;Ray - Clebson',
      ';;;;;;;;',
      ';SÁBADO;SÁBADO;SÁBADO;SÁBADO;SÁBADO;SÁBADO;SÁBADO;SÁBADO',
      ';INDICADORES;INDICADORES;;LEITORES;LEITORES;;MICROFONES VOLANTES;MICROFONES VOLANTES',
      '10/10;Diogo - Gleibson;Diogo - Gleibson;;Fernando;Fernando;;Paulo - Estêvão Morais;Paulo - Estêvão Morais',
    ].join('\n');
    // Hoje = 21/09/2027: sem o ano do título, "06/10" viraria 2027.
    const agora = AGORA.plus({ years: 1 });
    const { itens, avisos } = interpretarDesignacoes(folha(csv), { agora, config });
    assert.deepEqual(avisos, []);
    assert.equal(itens.length, 15);
    assert.ok(itens.every((i) => i.data.startsWith('2026-10')));
    assert.deepEqual(
      itens.filter((i) => i.data === '2026-10-10').map((i) => `${i.funcao}:${i.nome}@${i.horario}`),
      ['Indicador:Diogo@19:00', 'Indicador:Gleibson@19:00', 'Leitor:Fernando@19:00', 'Microfone volante:Paulo@19:00', 'Microfone volante:Estêvão Morais@19:00'],
    );
  });

  it('aba só com listas de nomes (sem datas) é ignorada com um aviso', () => {
    const csv = ['Leitura do Livro;;Volantes;;Indicadores', 'Alex;;Alex;;Alex', 'Brito;;Brito;;Brito'].join('\n');
    const { itens, avisos } = interpretarDesignacoes(folha(csv, 'Autorizados'), { agora: AGORA, config });
    assert.equal(itens.length, 0);
    assert.deepEqual(avisos, ['Aba "Autorizados": não tem datas de reunião (parece uma lista de nomes). Aba ignorada.']);
  });

  it('formato "uma linha por designação", repetindo a data de cima quando vazia', () => {
    const csv = ['Data,Função,Nome', '13/10/2026,Leitor,Carlos Souza', ',Indicador,"João Silva / Pedro Lima"', ',Microfone volante,André Costa'].join('\n');
    const { itens } = interpretarDesignacoes(folha(csv), { agora: AGORA, config });
    assert.deepEqual(itens.map((i) => `${i.data} ${i.funcao}:${i.nome}`), [
      '2026-10-13 Leitor:Carlos Souza',
      '2026-10-13 Indicador:João Silva',
      '2026-10-13 Indicador:Pedro Lima',
      '2026-10-13 Microfone volante:André Costa',
    ]);
  });

  it('formato quadro (datas nas colunas)', () => {
    const csv = [
      'Designações de outubro;;',
      ';Ter 13/10;Sáb 17/10',
      'Indicadores;João / Pedro;Pedro / João',
      'Leitor;Carlos;Paulo',
      'Microfones;André / Bruno;Bruno / André',
    ].join('\n');
    const { itens } = interpretarDesignacoes(folha(csv), { agora: AGORA, config });
    assert.equal(itens.length, 10);
    assert.ok(itens.some((i) => i.data === '2026-10-17' && i.funcao === 'Leitor' && i.nome === 'Paulo' && i.horario === '19:00'));
  });

  it('data que não é terça nem sábado exige horário', () => {
    const csv = ['Data;Leitor', '14/10/2026;Carlos'].join('\n');
    const { itens, avisos } = interpretarDesignacoes(folha(csv), { agora: AGORA, config });
    assert.equal(itens.length, 0);
    assert.match(avisos.join('\n'), /não é terça nem sábado/);

    const comHorario = interpretarDesignacoes(folha(['Data;Horário;Leitor', '14/10/2026;19h30;Carlos'].join('\n')), { agora: AGORA, config });
    assert.equal(comHorario.itens[0].horario, '19:30');
  });

  it('avisa quando falta gente numa função', () => {
    const { avisos } = interpretarDesignacoes(folha(['Data;Leitor;Indicador', '13/10/2026;Carlos;João'].join('\n')), { agora: AGORA, config });
    assert.match(avisos.join('\n'), /esperava 2 × Indicador, encontrei 1/);
  });
});

function novoBanco() {
  return abrirBanco(':memory:');
}
const it2 = (data, funcao, nome, horario = '19:30') => ({ data, horario, funcao, nome });

function lembretes(db, nome) {
  return db
    .prepare(`SELECT l.tipo, l.status FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id WHERE d.nome = ? ORDER BY l.id`)
    .all(nome)
    .map((l) => `${l.tipo}:${l.status}`);
}

describe('aplicarDesignacoes', () => {
  it('cria designações com lembretes', () => {
    const db = novoBanco();
    const r = aplicarDesignacoes(db, [it2('2026-11-24', 'Leitor', 'Carlos Souza')], { agora: AGORA, config });
    assert.equal(r.novas.length, 1);
    assert.deepEqual(lembretes(db, 'Carlos Souza'), ['30d:pendente', '7d:pendente', 'dia:pendente']);
  });

  it('designação tardia ganha aviso imediato', () => {
    const db = novoBanco();
    aplicarDesignacoes(db, [it2('2026-10-13', 'Leitor', 'Carlos Souza')], { agora: AGORA, config });
    assert.deepEqual(lembretes(db, 'Carlos Souza'), ['aviso:pendente', '7d:pendente', 'dia:pendente']);
  });

  it('reimportar a mesma planilha não duplica nada', () => {
    const db = novoBanco();
    const lista = [it2('2026-11-24', 'Leitor', 'Carlos Souza')];
    aplicarDesignacoes(db, lista, { agora: AGORA, config });
    const r = aplicarDesignacoes(db, lista, { agora: AGORA, config });
    assert.equal(r.novas.length, 0);
    assert.equal(r.mantidas, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lembretes').get().n, 3);
  });

  it('alteração na planilha: quem saiu tem os lembretes pendentes cancelados', () => {
    const db = novoBanco();
    aplicarDesignacoes(db, [it2('2026-11-24', 'Leitor', 'Carlos Souza')], { agora: AGORA, config });
    db.prepare(`UPDATE lembretes SET status = 'enviado' WHERE tipo = '30d'`).run();

    const r = aplicarDesignacoes(db, [it2('2026-11-24', 'Leitor', 'Paulo Reis')], { agora: AGORA, config });
    assert.equal(r.removidas.length, 1);
    assert.deepEqual(lembretes(db, 'Carlos Souza'), ['30d:enviado', '7d:cancelado', 'dia:cancelado']);
    assert.deepEqual(lembretes(db, 'Paulo Reis'), ['30d:pendente', '7d:pendente', 'dia:pendente']);
  });

  it('datas que não estão na planilha não são mexidas', () => {
    const db = novoBanco();
    aplicarDesignacoes(db, [it2('2026-11-24', 'Leitor', 'Carlos Souza')], { agora: AGORA, config });
    aplicarDesignacoes(db, [it2('2026-11-28', 'Leitor', 'Paulo Reis', '19:00')], { agora: AGORA, config });
    assert.deepEqual(lembretes(db, 'Carlos Souza'), ['30d:pendente', '7d:pendente', 'dia:pendente']);
  });

  it('designação removida que volta: não repete o que já foi enviado', () => {
    const db = novoBanco();
    aplicarDesignacoes(db, [it2('2026-10-13', 'Leitor', 'Carlos Souza')], { agora: AGORA, config });
    db.prepare(`UPDATE lembretes SET status = 'enviado' WHERE tipo = 'aviso'`).run();
    aplicarDesignacoes(db, [it2('2026-10-13', 'Leitor', 'Paulo Reis')], { agora: AGORA, config });
    const depois = AGORA.plus({ days: 1 });
    aplicarDesignacoes(db, [it2('2026-10-13', 'Leitor', 'Carlos Souza')], { agora: depois, config });
    assert.deepEqual(lembretes(db, 'Carlos Souza').sort(), ['7d:pendente', 'aviso:enviado', 'dia:pendente']);
  });

  it('reunião que já passou é ignorada', () => {
    const db = novoBanco();
    const r = aplicarDesignacoes(db, [it2('2026-09-15', 'Leitor', 'Carlos Souza')], { agora: AGORA, config });
    assert.equal(r.passadas, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM designacoes').get().n, 0);
  });

  it('modo conferir não grava nada', () => {
    const db = novoBanco();
    const r = aplicarDesignacoes(db, [it2('2026-11-24', 'Leitor', 'Carlos Souza')], { agora: AGORA, config, apenasConferir: true });
    assert.equal(r.novas.length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM designacoes').get().n, 0);
  });
});

describe('removerDesignacoes', () => {
  it('remove e cancela lembretes pendentes; nome sem acento/maiúscula também serve', () => {
    const db = novoBanco();
    aplicarDesignacoes(db, [it2('2026-11-24', 'Leitor', 'José Araújo'), it2('2026-11-24', 'Indicador', 'José Araújo')], { agora: AGORA, config });
    const r = removerDesignacoes(db, { data: '2026-11-24', nome: 'jose araujo', funcao: 'Leitor' }, { agora: AGORA });
    assert.equal(r.length, 1);
    const status = db.prepare(`SELECT d.funcao, l.status FROM lembretes l JOIN designacoes d ON d.id = l.designacao_id`).all();
    assert.ok(status.filter((s) => s.funcao === 'Leitor').every((s) => s.status === 'cancelado'));
    assert.ok(status.filter((s) => s.funcao === 'Indicador').every((s) => s.status === 'pendente'));
  });
});

describe('contatos', () => {
  it('importa, atualiza e aponta telefones com problema', () => {
    const db = novoBanco();
    const { contatos } = interpretarContatos(folha(['Nome;Telefone', 'João Silva;(11) 98765-4321', 'Pedro Lima;123'].join('\n')));
    const r = aplicarContatos(db, contatos, { agora: AGORA, config });
    assert.equal(r.novos, 2);
    assert.equal(r.problemas.length, 1);

    const r2 = aplicarContatos(db, [{ nome: 'João Silva', telefone: '11 91111-2222' }], { agora: AGORA, config });
    assert.equal(r2.atualizados, 1);
  });

  it('sem cabeçalho usa coluna A = nome, B = telefone', () => {
    const { contatos } = interpretarContatos(folha(['João Silva;11987654321', 'Pedro Lima;21987654321'].join('\n')));
    assert.equal(contatos.length, 2);
  });
});

describe('outros nomes dos contatos', () => {
  it('a designação com o nome curto acha o contato pelo "outro nome"', async () => {
    const { buscarContato, nomesDoContato } = await import('../src/banco.js');
    const db = novoBanco();
    const { contatos } = interpretarContatos(
      folha(['Nome;Telefone;Outros nomes', 'Jonas Pereira;(11) 98765-4321;Jonas', 'Diogo Amaral;(11) 91234-5678;Diogo / Diogo A.'].join('\n')),
    );
    const r = aplicarContatos(db, contatos, { agora: AGORA, config });
    assert.equal(r.novos, 2);
    assert.equal(buscarContato(db, 'jonas').nome, 'Jonas Pereira');
    assert.equal(buscarContato(db, 'diogo a').nome, 'Diogo Amaral');
    assert.deepEqual(nomesDoContato(db, buscarContato(db, 'diogo')), ['Diogo Amaral', 'Diogo', 'Diogo A.']);
  });

  it('outro nome que já pertence a outra pessoa é recusado', () => {
    const db = novoBanco();
    const r = aplicarContatos(
      db,
      [
        { nome: 'João Ponce', telefone: '11987654321', apelidos: ['João'] },
        { nome: 'João Silva', telefone: '11912345678', apelidos: ['João'] },
      ],
      { agora: AGORA, config },
    );
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0].erro, /já pertence a João Ponce/);
  });

  it('mudar só os outros nomes conta como atualização', () => {
    const db = novoBanco();
    aplicarContatos(db, [{ nome: 'Jonas Pereira', telefone: '11987654321', apelidos: [] }], { agora: AGORA, config });
    const r = aplicarContatos(db, [{ nome: 'Jonas Pereira', telefone: '11987654321', apelidos: ['Jonas'] }], { agora: AGORA, config });
    assert.equal(r.atualizados, 1);
  });
});

describe('autorizados', () => {
  const autorizadosCsv = [
    'Leitura do Livro;;Leitura da Sentinela;;Ordem de Presidência',
    'Jonas;;João;;Jorge',
    'Diogo Amaral;;Ciro;;Tiago',
    ';;;;',
    'Volantes;;Indicadores',
    'Alex;;Jonas Pereira',
    'Brito;;Paulo',
  ].join('\n');

  it('lê as listas por função (Livro = terça, Sentinela = sábado; Presidência ignorada)', () => {
    const { listas, abas } = interpretarAutorizados(folha(autorizadosCsv, 'Autorizados'));
    assert.deepEqual([...listas.keys()].sort(), ['Indicador', 'Leitor:sabado', 'Leitor:terca', 'Microfone volante']);
    assert.deepEqual(listas.get('Leitor:terca').nomes, ['Jonas', 'Diogo Amaral']);
    assert.deepEqual(abas, ['Autorizados']);
  });

  it('avisa quem está fora da lista, aceitando nome curto ("Diogo" = "Diogo Amaral")', () => {
    const { listas } = interpretarAutorizados(folha(autorizadosCsv, 'Autorizados'));
    const itens = [
      it2('2026-10-06', 'Leitor', 'Diogo'), // terça, Livro: ok (nome curto)
      it2('2026-10-10', 'Leitor', 'Diogo', '19:00'), // sábado, Sentinela: NÃO está
      it2('2026-10-03', 'Indicador', 'Jorge', '19:00'), // só na Presidência
      it2('2026-10-03', 'Indicador', 'Paulo', '19:00'),
      it2('2026-10-03', 'Microfone volante', 'Alex', '19:00'),
    ];
    const avisos = conferirAutorizados(itens, listas);
    assert.equal(avisos.length, 2);
    assert.match(avisos[0], /Diogo está como Leitor.*Leitura da Sentinela/);
    assert.match(avisos[1], /Jorge está como Indicador/);
  });

  it('usa os outros nomes do contato ("Jonas" = "Jonas Pereira")', () => {
    const { listas } = interpretarAutorizados(folha(autorizadosCsv, 'Autorizados'));
    const itens = [it2('2026-10-03', 'Indicador', 'Jonas', '19:00')];
    assert.equal(conferirAutorizados(itens, listas).length, 0, 'palavra "Jonas" está em "Jonas Pereira"');
    assert.equal(conferirAutorizados(itens, listas, () => ['Jonas', 'Jonas Pereira']).length, 0);
  });

  it('aba de designações (com datas) não é confundida com lista de autorizados', () => {
    const { listas } = interpretarAutorizados(folha(['Data;Indicador 1;Leitor', '13/10/2026;João;Carlos'].join('\n')));
    assert.equal(listas.size, 0);
  });
});

describe('lista de dirigentes de campo', () => {
  const csv = [
    'LISTA DE DIRIGENTES DE CAMPO;;;;;',
    'SETEMBRO;;;;;',
    'DATAS;DIAS;LOCAL;DIRIGENTE;HORÁRIO;OBSERVAÇÃO',
    '02/12/2026;QUARTA;Salão do Reino;MATEUS;18:00;',
    '03/12/2026;QUINTA;;ELIAS;18:00;Campanha — território n58',
    '05/12/2026;SÁBADO;Casa do SR. Osvaldo;GLEIBSON;08:30;',
    '07/12/2026;SEGUNDA;Salão do Reino;CIRO;18:00;',
  ].join('\n');

  it('lê data, dia, local, dirigente, horário e observação', () => {
    const { itens, avisos } = interpretarDesignacoes(folha(csv, 'Dirigentes'), { agora: AGORA, config });
    assert.deepEqual(avisos, []);
    assert.equal(itens.length, 4);
    assert.deepEqual(itens[1], {
      data: '2026-12-03', horario: '18:00', funcao: 'Dirigente de campo', nome: 'ELIAS',
      origem: 'Aba "Dirigentes", linha 5', local: null, observacao: 'Campanha — território n58', lista: 'dirigentes',
    });
    assert.equal(itens[0].local, 'Salão do Reino');
    assert.equal(itens[2].horario, '08:30');
  });

  it('avisa quando o dia da semana escrito não bate com a data', () => {
    const { avisos } = interpretarDesignacoes(
      folha(['DATAS;DIAS;LOCAL;DIRIGENTE;HORÁRIO', '02/12/2026;SEGUNDA;Salão do Reino;MATEUS;18:00'].join('\n'), 'Dirigentes'),
      { agora: AGORA, config },
    );
    assert.match(avisos.join('\n'), /diz "SEGUNDA", mas 02\/12\/2026 é Quarta-feira/);
  });

  it('não cobra indicadores/leitor nas datas que só têm dirigente', () => {
    const { avisos } = interpretarDesignacoes(folha(csv, 'Dirigentes'), { agora: AGORA, config });
    assert.doesNotMatch(avisos.join('\n'), /esperava/);
  });

  it('importar a lista de dirigentes não apaga a das reuniões no mesmo dia', () => {
    const db = novoBanco();
    // 05/12/2026 é sábado: tem reunião e também dirigente de campo.
    aplicarDesignacoes(db, [it2('2026-12-05', 'Leitor', 'Carlos Souza', '19:00')], { agora: AGORA, config });
    const { itens } = interpretarDesignacoes(folha(csv, 'Dirigentes'), { agora: AGORA, config });
    aplicarDesignacoes(db, itens, { agora: AGORA, config });
    const ativas = db.prepare('SELECT funcao, nome, lista, local, observacao FROM designacoes WHERE data = ? AND ativa = 1 ORDER BY funcao').all('2026-12-05');
    assert.deepEqual(ativas.map((d) => `${d.lista}:${d.funcao}:${d.nome}`), ['dirigentes:Dirigente de campo:GLEIBSON', 'reuniao:Leitor:Carlos Souza']);
    assert.equal(ativas[0].local, 'Casa do SR. Osvaldo');
  });

  it('reimportar a lista de dirigentes troca só quem mudou nela', () => {
    const db = novoBanco();
    const { itens } = interpretarDesignacoes(folha(csv, 'Dirigentes'), { agora: AGORA, config });
    aplicarDesignacoes(db, itens, { agora: AGORA, config });
    const trocado = itens.map((i) => (i.data === '2026-12-07' ? { ...i, nome: 'FERNANDO' } : i));
    const r = aplicarDesignacoes(db, trocado, { agora: AGORA, config });
    assert.deepEqual(r.removidas.map((d) => d.nome), ['CIRO']);
    assert.deepEqual(r.novas.map((d) => d.nome), ['FERNANDO']);
    assert.equal(r.mantidas, 3);
  });
});

describe('dirigentes: vários meses na mesma aba', () => {
  it('ignora a faixa com o nome do mês entre os blocos', () => {
    const csv = [
      'LISTA DE DIRIGENTES DE CAMPO;;;;',
      'OUTUBRO;OUTUBRO;OUTUBRO;OUTUBRO;OUTUBRO',
      'DATAS;DIAS;LOCAL;DIRIGENTE;HORÁRIO',
      '31/10/2026;SÁBADO;Salão do Reino;LOPES;08:30',
      ';;;;',
      'NOVEMBRO;NOVEMBRO;NOVEMBRO;NOVEMBRO;NOVEMBRO',
      'DATAS;DIAS;LOCAL;DIRIGENTE;HORÁRIO',
      '01/11/2026;DOMINGO;Salão do Reino;DAVI;08:30',
    ].join('\n');
    const { itens, avisos } = interpretarDesignacoes(folha(csv, 'Dirigentes'), { agora: AGORA, config });
    assert.deepEqual(avisos, []);
    assert.deepEqual(itens.map((i) => `${i.data} ${i.nome}`), ['2026-10-31 LOPES', '2026-11-01 DAVI']);
  });
});

describe('discursos públicos (aba Arranjos Discursos)', async () => {
  const { interpretarDesignacoes } = await import('../src/importacao.js');
  const { DateTime } = await import('luxon');
  const configD = { horarioReunioes: { terca: '19:30', sabado: '19:00' } };
  const agoraD = DateTime.fromISO('2026-10-21T10:00', { zone: 'America/Cuiaba' });
  it('presidente e orador da congregação viram designações da lista "discursos"; visitante fica de fora', () => {
    const folhas = [{ nome: 'Arranjos Discursos 2026', linhas: [
      ['PROGRAMAÇÃO DE DISCURSOS PÚBLICOS'],
      ['', '', 'Novembro 2026'],
      ['DATA', 'PRESIDENTE', 'ORADOR', 'TEMA DO DISCURSO', 'CONGREGAÇÃO'],
      ['07/11', 'Rogério', 'Wagner Freitas', '(46) Fortaleça sua confiança', 'Jardim Atlântico, Cidade Exemplo'],
      ['14/11', 'Gleibson', 'Tiago Ramos', '(27) Como construir um casamento feliz', 'Vila Exemplo'],
    ] }];
    const { itens } = interpretarDesignacoes(folhas, { agora: agoraD, config: configD });
    const resumo = itens.map((i) => `${i.data} ${i.funcao} ${i.nome} ${i.lista}`);
    assert.deepEqual(resumo, [
      '2026-11-07 Presidente da reunião Rogério discursos',
      '2026-11-14 Presidente da reunião Gleibson discursos',
      '2026-11-14 Discurso público Tiago Ramos discursos',
    ]);
    assert.equal(itens[2].observacao, '(27) Como construir um casamento feliz');
    assert.equal(itens[0].horario, '19:00');
  });
});
