// npm run trocar -- 14/10/2026 "Nome Antigo" "Nome Novo"
// Substitui uma pessoa por outra nas designações daquela data.
import { buscarContato } from '../banco.js';
import { aplicarDesignacoes, interpretarData, removerDesignacoes } from '../importacao.js';
import { chaveNome } from '../texto.js';
import { NOMES_TIPOS } from '../planejamento.js';
import { agora, formatarData } from '../tempo.js';
import { sincronizarTerritorios } from '../territorios.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const [textoData, antigo, novo] = argumentos();
  if (!textoData || !antigo || !novo) throw new Error('Use: npm run trocar -- 14/10/2026 "Nome Antigo" "Nome Novo"');
  const momento = agora();
  const data = interpretarData(textoData, momento);
  if (!data) throw new Error(`Data "${textoData}" não reconhecida. Use o formato 14/10/2026.`);

  const { config, db } = carregarTudo();
  const removidas = removerDesignacoes(db, { data, nome: antigo }, { agora: momento });
  if (!removidas.length) throw new Error(`"${antigo}" não tem designação em ${formatarData(data)}. Confira com: npm run proximos -- --todos`);

  const resumo = aplicarDesignacoes(
    db,
    removidas.map((d) => ({ data, horario: d.horario, funcao: d.funcao, nome: novo, lista: d.lista, local: d.local, observacao: d.observacao })),
    { agora: momento, config, substituirDatas: false },
  );
  linha(`✅ ${formatarData(data)}: ${antigo} → ${novo}`);
  for (const n of resumo.novas) linha(`   ${n.funcao.padEnd(18)} lembretes: ${n.lembretes.map((t) => NOMES_TIPOS[t]).join(', ')}`);
  if (!buscarContato(db, chaveNome(novo))) {
    linha(`\n📵 "${novo}" não tem contato cadastrado e NÃO vai receber mensagem. Cadastre e rode: npm run contatos`);
  }
  linha('\nObs.: corrija também a planilha, senão a próxima importação desfaz a troca.');
  if (removidas.some((d) => d.lista === 'dirigentes')) sincronizarTerritorios();
});
