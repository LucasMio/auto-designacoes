// npm run proximos [-- --dias 30] [-- --todos]
// Lista os próximos lembretes agendados e os erros pendentes de correção.
import { buscarContato, lembretesComErro, todosPendentes } from '../banco.js';
import { NOMES_TIPOS } from '../planejamento.js';
import { normalizarTelefone } from '../telefone.js';
import { agora, doBanco, formatarData, formatarMomento } from '../tempo.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const args = argumentos();
  const iDias = args.indexOf('--dias');
  const dias = iDias >= 0 ? Number(args[iDias + 1]) || 15 : 15;
  const todos = args.includes('--todos');

  const { config, db } = carregarTudo();
  const momento = agora();
  const limite = momento.plus({ days: dias });

  // Agrupa como será enviado: mesma pessoa + mesma reunião + mesmo tipo = uma mensagem.
  const grupos = new Map();
  for (const p of todosPendentes(db)) {
    const previsto = doBanco(p.previsto_para);
    if (!todos && previsto > limite) continue;
    // O resumo é uma mensagem só por pessoa (todas as datas); os outros, por pessoa + data.
    const k = p.tipo === 'resumo' ? `${p.previsto_para}|${p.chave}|resumo` : `${p.previsto_para}|${p.chave}|${p.data}|${p.tipo}`;
    if (!grupos.has(k)) grupos.set(k, { ...p, previsto, funcoes: [], datas: [] });
    grupos.get(k).funcoes.push(p.tipo === 'resumo' ? `${formatarData(p.data).slice(0, 5)} ${p.funcao}` : p.funcao);
    grupos.get(k).datas.push(p.data);
  }

  const alertaContato = new Map();
  const alerta = (p) => {
    if (!alertaContato.has(p.chave)) {
      const c = buscarContato(db, p.chave);
      const tel = c && normalizarTelefone(c.telefone, { dddPadrao: config.dddPadrao });
      alertaContato.set(p.chave, !c ? '⚠️ sem contato' : tel.ok ? '' : `⚠️ ${tel.erro}`);
    }
    return alertaContato.get(p.chave);
  };

  linha(`📬 Próximos envios ${todos ? '(todos)' : `(próximos ${dias} dias)`} — agora: ${formatarMomento(momento)}\n`);
  if (!grupos.size) {
    linha('   Nenhum envio agendado nesse período.');
  } else {
    linha(`   ${'Quando'.padEnd(18)}${'Tipo'.padEnd(16)}${'Pessoa'.padEnd(28)}${'Reunião'.padEnd(18)}Designação`);
    linha(`   ${'-'.repeat(100)}`);
    for (const g of grupos.values()) {
      const quando = g.previsto <= momento ? 'ATRASADO → já' : formatarMomento(g.previsto);
      linha(
        `   ${quando.padEnd(18)}${NOMES_TIPOS[g.tipo].padEnd(16)}${g.nome.slice(0, 26).padEnd(28)}` +
          `${(g.tipo === 'resumo' ? `${new Set(g.datas).size} reunião(ões)` : `${formatarData(g.data)} ${g.horario}`).padEnd(18)}${g.funcoes.join(g.tipo === 'resumo' ? ', ' : ' e ')}  ${alerta(g)}`,
      );
    }
    linha(`\n   Total: ${grupos.size} mensagem(ns). Envios só acontecem entre ${config.janelaEnvio.inicio} e ${config.janelaEnvio.fim}.`);
  }

  const erros = lembretesComErro(db, momento.toISODate());
  if (erros.length) {
    linha('\n❌ Lembretes com erro (não serão enviados até você corrigir e rodar "npm run reenviar-erros"):');
    for (const e of erros) {
      linha(`   ${formatarData(e.data)}  ${e.nome.padEnd(28)} ${e.funcao.padEnd(18)} ${NOMES_TIPOS[e.tipo].padEnd(15)} ${e.detalhe ?? ''}`);
    }
  }
});
