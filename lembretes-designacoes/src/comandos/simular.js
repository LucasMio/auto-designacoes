// npm run simular                        mostra o que seria enviado AGORA (sem enviar nada)
// npm run simular -- 07/10/2026 08:00    mostra o que seria enviado nesse momento
import { executarCiclo } from '../envio.js';
import { NOMES_TIPOS } from '../planejamento.js';
import { agora, formatarData, formatarMomento, lerMomentoDigitado } from '../tempo.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const args = argumentos();
  let momento = agora();
  if (args.length) {
    momento = lerMomentoDigitado(args.join(' '));
    if (!momento) throw new Error('Use o formato: npm run simular -- 07/10/2026 08:00');
  }

  const { config, modelos, db } = carregarTudo({ modelos: true });
  const r = await executarCiclo({ db, config, modelos, wa: null, agora: momento, simular: true });

  linha(`🧪 SIMULAÇÃO — nada será enviado. Momento simulado: ${formatarMomento(momento)}\n`);
  if (r.foraDaJanela) {
    linha(`⏰ Esse horário está fora da janela de envio (${config.janelaEnvio.inicio}–${config.janelaEnvio.fim}). As mensagens abaixo esperariam a janela abrir.\n`);
  }

  for (const p of r.previstos) {
    linha(`━━━ Para: ${p.contato.nome} (${p.telefone.formatado}) — ${NOMES_TIPOS[p.envio.tipo]}`);
    if (p.envio.pulados.length) linha(`    (substitui lembretes atrasados: ${p.envio.pulados.map((x) => NOMES_TIPOS[x.tipo]).join(', ')})`);
    linha(p.texto.replace(/^/gm, '    │ '));
    linha();
  }
  for (const e of r.erros) linha(`❌ ${e.envio.nome} — ${formatarData(e.envio.data)} (${e.envio.funcoes.join(' e ')}): ${e.motivo}`);
  for (const x of r.expirados) linha(`⏭️  ${x.nome} — ${formatarData(x.data)} (${x.funcao}) — ${NOMES_TIPOS[x.tipo]}: reunião já aconteceu, não seria enviado`);

  if (!r.previstos.length && !r.erros.length && !r.expirados.length) {
    linha('Nada para enviar nesse momento. Veja a agenda completa com: npm run proximos');
  } else {
    linha(`\nResumo: ${r.previstos.length} mensagem(ns) seriam enviadas, ${r.erros.length} com erro, ${r.expirados.length} expirada(s).`);
  }
});
