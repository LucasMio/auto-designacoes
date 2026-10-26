// npm run importar [-- "caminho\da\planilha.xlsx"] [--conferir]
// Importa as designações. Sem caminho, usa planilhas/designacoes.xlsx (ou .csv).
import { PASTA_PLANILHAS } from '../caminhos.js';
import { buscarContato, nomesDoContato } from '../banco.js';
import { aplicarDesignacoes, conferirAutorizados, interpretarAutorizados, interpretarDesignacoes } from '../importacao.js';
import { NOMES_TIPOS } from '../planejamento.js';
import { lerPlanilha, localizarArquivo } from '../planilha.js';
import { normalizarTelefone } from '../telefone.js';
import { agora, formatarData } from '../tempo.js';
import { chaveNome } from '../texto.js';
import { sincronizarTerritorios } from '../territorios.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const args = argumentos();
  const conferir = args.includes('--conferir');
  const arquivo = localizarArquivo(args.find((a) => !a.startsWith('--')), PASTA_PLANILHAS, 'designacoes');
  if (!arquivo) {
    throw new Error('Informe a planilha: npm run importar -- "C:\\caminho\\designacoes.xlsx"\n   (ou salve o arquivo como planilhas\\designacoes.xlsx)');
  }

  const { config, db } = carregarTudo();
  const momento = agora();
  linha(`📄 Lendo ${arquivo}\n`);
  const folhas = await lerPlanilha(arquivo);
  const { itens, avisos: avisosLeitura } = interpretarDesignacoes(folhas, { agora: momento, config });

  // Listas de autorizados: numa aba da mesma planilha ou em planilhas\autorizados.xlsx
  let autorizados = interpretarAutorizados(folhas);
  if (!autorizados.listas.size) {
    const arquivoAutorizados = localizarArquivo(null, PASTA_PLANILHAS, 'autorizados');
    if (arquivoAutorizados) autorizados = interpretarAutorizados(await lerPlanilha(arquivoAutorizados));
  }
  const avisos = avisosLeitura.filter((a) => !autorizados.abas.some((aba) => a.startsWith(`Aba "${aba}": não tem datas`)));
  if (autorizados.listas.size) {
    const titulos = [...autorizados.listas.values()].map((l) => l.titulo).join(', ');
    linha(`📋 Listas de autorizados encontradas: ${titulos}\n`);
    const nomesDaPessoa = (nome) => {
      const contato = buscarContato(db, chaveNome(nome));
      return contato ? [nome, ...nomesDoContato(db, contato)] : [nome];
    };
    avisos.push(...conferirAutorizados(itens, autorizados.listas, nomesDaPessoa));
  }

  if (avisos.length) {
    linha('⚠️  Atenção:');
    for (const a of avisos) linha(`   - ${a}`);
    linha();
  }
  if (!itens.length) throw new Error('Nenhuma designação encontrada na planilha.');

  const resumo = aplicarDesignacoes(db, itens, { agora: momento, config, apenasConferir: conferir });
  const datas = [...new Set(itens.map((i) => i.data))].sort();
  linha(`${conferir ? '🔎 CONFERÊNCIA (nada foi gravado)' : '✅ Importação concluída'} — ${datas.length} reunião(ões) de ${formatarData(datas[0])} a ${formatarData(datas.at(-1))}`);
  linha(`   Novas: ${resumo.novas.length}   Mantidas: ${resumo.mantidas}   Alteradas: ${resumo.atualizadas.length}   Removidas: ${resumo.removidas.length}`);
  if (resumo.passadas) linha(`   Ignoradas (reunião já passou): ${resumo.passadas}`);

  if (resumo.novas.length) {
    linha('\n➕ Novas designações:');
    for (const n of resumo.novas) {
      const tipos = n.lembretes.map((t) => NOMES_TIPOS[t]).join(', ') || 'nenhum lembrete';
      linha(`   ${formatarData(n.data)} ${n.horario}  ${n.funcao.padEnd(18)} ${n.nome.padEnd(28)} lembretes: ${tipos}`);
    }
  }
  if (resumo.atualizadas.length) {
    linha('\n✏️  Alteradas:');
    for (const a of resumo.atualizadas) linha(`   ${formatarData(a.data)}  ${a.funcao.padEnd(18)} ${a.nome} (horário ${a.horarioAnterior} → ${a.horario})`);
  }
  if (resumo.removidas.length) {
    linha('\n➖ Removidas (lembretes pendentes cancelados):');
    for (const r of resumo.removidas) linha(`   ${formatarData(r.data)}  ${r.funcao.padEnd(18)} ${r.nome}`);
  }

  // Confere se todo mundo tem telefone cadastrado.
  const nomes = [...new Map(itens.map((i) => [chaveNome(i.nome), i.nome])).entries()];
  const problemas = [];
  for (const [chave, nome] of nomes) {
    const contato = buscarContato(db, chave);
    if (!contato) problemas.push(`${nome}: sem contato cadastrado`);
    else {
      const tel = normalizarTelefone(contato.telefone, { dddPadrao: config.dddPadrao });
      if (!tel.ok) problemas.push(`${nome}: ${tel.erro}`);
    }
  }
  if (problemas.length) {
    linha('\n📵 Pessoas que NÃO vão receber mensagem até você corrigir o cadastro de contatos:');
    for (const p of problemas) linha(`   - ${p}`);
    linha('   (Adicione na planilha de contatos e rode: npm run contatos)');
  }

  linha(conferir ? '\nPara gravar de verdade, rode o mesmo comando sem --conferir.' : '\nPara ver o que será enviado: npm run proximos');
  if (!conferir && itens.some((i) => i.lista === 'dirigentes')) sincronizarTerritorios();
});
