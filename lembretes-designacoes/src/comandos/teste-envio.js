// npm run teste-envio                      manda uma mensagem de teste só para você
// npm run teste-envio -- --modelos         manda um exemplo de cada modelo de mensagem para você
import { chatDoDono } from '../envio.js';
import { montarMensagem } from '../mensagens.js';
import { NOMES_TIPOS } from '../planejamento.js';
import { agora, formatarMomento } from '../tempo.js';
import { donoDaTrava } from '../trava.js';
import { abrirSessao } from '../whatsapp.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const args = argumentos();
  const { config, modelos, db } = carregarTudo({ modelos: true });
  const momento = agora();

  let textos;
  if (args.includes('--modelos')) {
    // Exemplo: a próxima terça-feira daqui a 30 dias.
    let dia = momento.plus({ days: 30 });
    while (dia.weekday !== 2) dia = dia.plus({ days: 1 });
    const exemplo = { nome: 'Nome de Exemplo', data: dia.toISODate(), horario: config.horarioReunioes.terca, funcoes: ['Leitor'] };
    textos = Object.keys(modelos).map(
      (tipo) => `🧪 *Exemplo: ${NOMES_TIPOS[tipo]}*\n\n${montarMensagem(modelos, tipo, { ...exemplo, agora: tipo === 'dia' ? dia : momento })}`,
    );
  } else {
    textos = [
      `✅ *Teste do sistema de lembretes de designações*\n\nSe você recebeu esta mensagem, a conexão com o WhatsApp está funcionando. (${formatarMomento(momento)})`,
    ];
  }

  // Se o sistema já está rodando, ele mesmo envia (duas conexões ao mesmo tempo não funcionam).
  const dono = donoDaTrava();
  if (dono?.comando === 'npm start') {
    const stmt = db.prepare('INSERT INTO avulsas (criada_em, texto) VALUES (?, ?)');
    for (const t of textos) stmt.run(momento.toISO(), t);
    linha('📨 O sistema já está rodando: a mensagem foi colocada na fila e será enviada em até 1 minuto.');
    linha('   Confira no seu WhatsApp (conversa com você mesmo) ou rode: npm run log');
    return;
  }

  linha('Abrindo o WhatsApp Web (pode levar até 1 minuto)...');
  const wa = await abrirSessao({ comando: 'npm run teste-envio', config, permitirQr: true });
  try {
    const chat = await chatDoDono(wa, config);
    for (const t of textos) await wa.enviar(chat, t);
    linha(`✅ ${textos.length} mensagem(ns) enviada(s) para você. Confira a conversa com você mesmo no WhatsApp.`);
  } finally {
    await wa.fechar();
  }
  process.exit(0);
});
