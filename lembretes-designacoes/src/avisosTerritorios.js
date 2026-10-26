// Avisos do site dos territórios para o dono do sistema (Ricardo), na conversa com ele mesmo:
//   ✅ território concluído (pelo sistema ou à mão);
//   ⚠️ pedido de substituto aberto há 2 dias sem ninguém assumir;
//   📊 resumo do mês anterior, no dia 1º.
// Confere a cada 15 minutos, só dentro da janela de envio, e cada aviso sai uma vez só.
import { chatDoDono } from './envio.js';
import { log } from './log.js';
import { consultarSite } from './siteTerritorios.js';
import { dentroDaJanela, formatarData } from './tempo.js';

const INTERVALO_MS = 15 * 60 * 1000;
const HORAS_SEM_SUBSTITUTO = 48;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
let ultimaVerificacao = 0;

function prepararTabela(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS avisos_territorios (chave TEXT PRIMARY KEY, enviado_em TEXT NOT NULL)`);
}
const jaAvisado = (db, chave) => Boolean(db.prepare('SELECT 1 FROM avisos_territorios WHERE chave = ?').get(chave));
const marcarAvisado = (db, chave, agora) => db.prepare('INSERT OR IGNORE INTO avisos_territorios (chave, enviado_em) VALUES (?, ?)').run(chave, agora.toISO());

/** Monta os avisos pendentes (sem enviar). Exportada para os testes. */
export async function avisosPendentes({ db, agora, consultar = consultarSite }) {
  prepararTabela(db);
  const avisos = [];

  // Conclusões. Na primeira vez, as que já existiam contam como avisadas (não manda o histórico todo).
  const conclusoes = await consultar('conclusoes?select=id,territorio_numero,data,manual,concluida_por_nome,territorios(bairro)&order=id.desc&limit=50');
  if (conclusoes) {
    const primeiraVez = !db.prepare(`SELECT 1 FROM avisos_territorios WHERE chave LIKE 'conclusao:%' LIMIT 1`).get();
    for (const c of [...conclusoes].reverse()) {
      const chave = `conclusao:${c.id}`;
      if (jaAvisado(db, chave)) continue;
      if (primeiraVez) {
        marcarAvisado(db, chave, agora);
        continue;
      }
      const como = c.manual ? `concluído à mão${c.concluida_por_nome ? ` por ${c.concluida_por_nome}` : ''}` : 'concluído (todas as quadras marcadas)';
      avisos.push({ chave, texto: `✅ *Território ${c.territorio_numero}*${c.territorios?.bairro ? ` – ${c.territorios.bairro}` : ''} ${como} em ${formatarData(c.data)}.` });
    }
  }

  // Pedidos de substituto abertos há muito tempo, com a saída ainda por vir.
  const pedidos = await consultar('pedidos_substituicao?select=id,criado_em,pedido_por_nome,motivo,saidas(data,horario,local)&status=eq.aberto');
  if (pedidos) {
    for (const p of pedidos) {
      const chave = `pedido:${p.id}`;
      const horas = (agora.toMillis() - new Date(p.criado_em).getTime()) / 3600000;
      if (!p.saidas || p.saidas.data < agora.toISODate() || horas < HORAS_SEM_SUBSTITUTO || jaAvisado(db, chave)) continue;
      avisos.push({
        chave,
        texto:
          `⚠️ *Ninguém assumiu ainda* a saída de ${formatarData(p.saidas.data)}${p.saidas.horario ? ` às ${p.saidas.horario}` : ''}` +
          `${p.saidas.local ? ` (${p.saidas.local})` : ''}. ${p.pedido_por_nome} pediu substituto há ${Math.floor(horas / 24)} dias` +
          `${p.motivo ? ` — “${p.motivo}”` : ''}. Veja na Programação do site e, se precisar, troque pelo botão Alterar.`,
      });
    }
  }

  // Resumo do mês anterior, no dia 1º.
  if (agora.day === 1) {
    const anterior = agora.minus({ months: 1 });
    const chave = `resumo:${anterior.toFormat('yyyy-MM')}`;
    if (!jaAvisado(db, chave)) {
      const inicio = anterior.startOf('month').toISODate();
      const fim = anterior.endOf('month').toISODate();
      const [noMes, territorios, progresso] = await Promise.all([
        consultar(`conclusoes?select=territorio_numero&data=gte.${inicio}&data=lte.${fim}`),
        consultar('territorios?select=numero,ultima_data'),
        consultar('progresso_territorios?select=numero,total_quadras,feitas_no_ciclo'),
      ]);
      if (noMes && territorios && progresso) {
        const quatroMeses = agora.minus({ months: 4 }).toISODate();
        const recentes = territorios.filter((t) => t.ultima_data && t.ultima_data > quatroMeses).length;
        const desenhados = progresso.filter((p) => p.total_quadras > 0).length;
        const andamento = progresso.filter((p) => p.feitas_no_ciclo > 0).length;
        const pct = Math.round((recentes / territorios.length) * 100);
        avisos.push({
          chave,
          texto:
            `📊 *Territórios — resumo de ${MESES[anterior.month - 1]}*\n\n` +
            `• Concluídos no mês: *${new Set(noMes.map((c) => c.territorio_numero)).size}*\n` +
            `• Trabalhados nos últimos 4 meses: *${recentes} de ${territorios.length}* (${pct}%)\n` +
            `• Em andamento (com quadras faltando): ${andamento}\n` +
            `• Mapas desenhados no sistema: ${desenhados} de ${territorios.length}\n\n` +
            `Mais detalhes na aba Progresso do site.`,
        });
      }
    }
  }
  return avisos;
}

/** Chamada a cada ciclo do serviço; trabalha de 15 em 15 minutos. */
export async function verificarAvisosTerritorios({ db, wa, config, agora, consultar }) {
  if (Date.now() - ultimaVerificacao < INTERVALO_MS) return;
  if (!dentroDaJanela(agora, config.janelaEnvio)) return;
  ultimaVerificacao = Date.now();
  const avisos = await avisosPendentes({ db, agora, consultar });
  if (!avisos.length) return;
  const chat = await chatDoDono(wa, config);
  for (const a of avisos) {
    await wa.enviar(chat, a.texto);
    marcarAvisado(db, a.chave, agora);
    log.enviado(`Aviso dos territórios enviado para você (${a.chave}).`);
  }
}
