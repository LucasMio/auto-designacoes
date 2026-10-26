// npm run conectar — faz o login no WhatsApp pelo QR Code (só precisa uma vez).
import { donoDaTrava } from '../trava.js';
import { abrirSessao } from '../whatsapp.js';
import { carregarConfig } from '../config.js';
import { executar, linha } from './comum.js';

executar(async () => {
  const dono = donoDaTrava();
  if (dono?.comando === 'npm start') {
    linha('✅ O sistema já está rodando e conectado ao WhatsApp. Não é preciso conectar de novo.');
    return;
  }
  const config = carregarConfig();
  linha('Abrindo o WhatsApp Web (pode levar até 1 minuto)...');
  const wa = await abrirSessao({ comando: 'npm run conectar', config, permitirQr: true });
  linha(`\n✅ Conectado${wa.meuNome ? ` como ${wa.meuNome}` : ''}! A sessão ficou salva; não será preciso escanear de novo.`);
  linha('Próximo passo sugerido: npm run teste-envio');
  await wa.fechar();
  process.exit(0);
});
