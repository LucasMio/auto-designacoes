import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizarTelefone, variantesWhatsApp } from '../src/telefone.js';

const numero = (entrada, opcoes) => {
  const r = normalizarTelefone(entrada, opcoes);
  assert.ok(r.ok, `esperava sucesso para "${entrada}", veio: ${r.erro}`);
  return r.numero;
};
const erro = (entrada, opcoes) => {
  const r = normalizarTelefone(entrada, opcoes);
  assert.equal(r.ok, false, `esperava erro para "${entrada}"`);
  return r.erro;
};

describe('normalizarTelefone', () => {
  it('aceita os jeitos mais comuns de escrever um celular', () => {
    for (const e of ['(11) 98765-4321', '11987654321', '11 98765 4321', '+55 11 98765-4321', '5511987654321', '+55 (11) 9 8765-4321', '011 98765-4321']) {
      assert.equal(numero(e), '5511987654321', e);
    }
  });

  it('aceita número vindo como número do Excel', () => {
    assert.equal(numero(11987654321), '5511987654321');
  });

  it('remove código de operadora (0 + operadora + DDD)', () => {
    assert.equal(numero('0 15 11 98765-4321'), '5511987654321');
  });

  it('acrescenta o nono dígito em celular antigo de 8 dígitos', () => {
    assert.equal(numero('(21) 8765-4321'), '5521987654321');
    assert.equal(numero('55 21 7765-4321'), '5521977654321');
  });

  it('mantém telefone fixo sem acrescentar 9', () => {
    const r = normalizarTelefone('(11) 3456-7890');
    assert.equal(r.numero, '551134567890');
    assert.equal(r.fixo, true);
  });

  it('usa o DDD padrão quando o número vem sem DDD', () => {
    assert.match(erro('98765-4321'), /sem DDD/);
    assert.equal(numero('98765-4321', { dddPadrao: '19' }), '5519987654321');
  });

  it('formata para exibição', () => {
    assert.equal(normalizarTelefone('11987654321').formatado, '+55 (11) 98765-4321');
  });

  it('rejeita DDD inexistente, tamanho errado e vazio', () => {
    assert.match(erro('(20) 98765-4321'), /DDD 20/);
    assert.match(erro('123'), /dígitos/);
    assert.match(erro(''), /vazio/);
    assert.match(erro('(11) 88765-4321'), /começar com 9/);
    assert.match(erro('(11) 1234-5678'), /inválido/);
  });

  it('aceita número estrangeiro com +', () => {
    assert.equal(numero('+1 (555) 123-4567'), '15551234567');
  });
});

describe('variantesWhatsApp', () => {
  it('testa com e sem o nono dígito', () => {
    assert.deepEqual(variantesWhatsApp('5511987654321'), ['5511987654321', '551187654321']);
  });
  it('fixo e estrangeiro têm só uma variante', () => {
    assert.deepEqual(variantesWhatsApp('551134567890'), ['551134567890']);
    assert.deepEqual(variantesWhatsApp('15551234567'), ['15551234567']);
  });
});
