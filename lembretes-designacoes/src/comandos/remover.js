// npm run remover -- 14/10/2026 "João Silva"            remove todas as designações da pessoa nessa data
// npm run remover -- 14/10/2026 "João Silva" Leitor     remove só a função indicada
import { funcaoCanonica, interpretarData, removerDesignacoes } from '../importacao.js';
import { agora, formatarData } from '../tempo.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const [textoData, nome, textoFuncao] = argumentos();
  if (!textoData || !nome) {
    throw new Error('Use: npm run remover -- 14/10/2026 "Nome da Pessoa" [Função]');
  }
  const momento = agora();
  const data = interpretarData(textoData, momento);
  if (!data) throw new Error(`Data "${textoData}" não reconhecida. Use o formato 14/10/2026.`);
  const funcao = textoFuncao ? (funcaoCanonica(textoFuncao) ?? textoFuncao) : null;

  const { db } = carregarTudo();
  const removidas = removerDesignacoes(db, { data, nome, funcao }, { agora: momento });
  if (!removidas.length) {
    const doDia = db.prepare('SELECT funcao, nome FROM designacoes WHERE data = ? AND ativa = 1 ORDER BY funcao, nome').all(data);
    linha(`Nenhuma designação encontrada para "${nome}"${funcao ? ` (${funcao})` : ''} em ${formatarData(data)}.`);
    if (doDia.length) {
      linha('Designações cadastradas nessa data:');
      for (const d of doDia) linha(`   ${d.funcao.padEnd(18)} ${d.nome}`);
    }
    process.exitCode = 1;
    return;
  }
  linha(`✅ Removido(s) em ${formatarData(data)} (lembretes pendentes cancelados):`);
  for (const d of removidas) linha(`   ${d.funcao.padEnd(18)} ${d.nome}`);
  linha('\nObs.: se a planilha ainda tiver essa pessoa, ela volta na próxima importação. O ideal é corrigir a planilha também.');
});
