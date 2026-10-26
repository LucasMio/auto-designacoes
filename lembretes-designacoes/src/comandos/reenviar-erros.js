// npm run reenviar-erros — coloca de volta na fila os lembretes que deram erro
// (use depois de corrigir o problema, ex.: cadastrar o contato que faltava).
import { paraBanco, agora } from '../tempo.js';
import { carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const { db } = carregarTudo();
  const momento = agora();
  const r = db
    .prepare(
      `UPDATE lembretes SET status = 'pendente', tentativas = 0, detalhe = 'reenvio solicitado', atualizado_em = ?
        WHERE status = 'erro'
          AND designacao_id IN (SELECT id FROM designacoes WHERE ativa = 1 AND data >= ?)`,
    )
    .run(paraBanco(momento), momento.toISODate());
  if (!r.changes) {
    linha('Nenhum lembrete com erro para reenviar.');
    return;
  }
  linha(`🔁 ${r.changes} lembrete(s) voltaram para a fila. Serão enviados no próximo ciclo (se o sistema estiver ligado e dentro do horário de envio).`);
  linha('   Para ver antes o que vai sair: npm run simular');
});
