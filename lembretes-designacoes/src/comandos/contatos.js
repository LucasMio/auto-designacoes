// npm run contatos [-- "caminho\contatos.xlsx"]   importa contatos (Nome + Telefone)
// npm run contatos -- --listar                     mostra os contatos cadastrados
import { PASTA_PLANILHAS } from '../caminhos.js';
import { listarContatos } from '../banco.js';
import { aplicarContatos, interpretarContatos } from '../importacao.js';
import { lerPlanilha, localizarArquivo } from '../planilha.js';
import { normalizarTelefone } from '../telefone.js';
import { agora } from '../tempo.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

executar(async () => {
  const args = argumentos();
  const { config, db } = carregarTudo();

  if (args.includes('--listar')) {
    const contatos = listarContatos(db);
    linha(`📇 ${contatos.length} contato(s) cadastrado(s):\n`);
    for (const c of contatos) {
      const tel = normalizarTelefone(c.telefone, { dddPadrao: config.dddPadrao });
      const outros = c.outros_nomes ? `   (também: ${c.outros_nomes})` : "";
      linha(`   ${c.nome.padEnd(32)} ${tel.ok ? tel.formatado : `⚠️  ${tel.erro}`}${outros}`);
    }
    return;
  }

  const arquivo = localizarArquivo(args.find((a) => !a.startsWith('--')), PASTA_PLANILHAS, 'contatos');
  if (!arquivo) {
    throw new Error('Informe a planilha: npm run contatos -- "C:\\caminho\\contatos.xlsx"\n   (ou salve o arquivo como planilhas\\contatos.xlsx)');
  }
  linha(`📄 Lendo ${arquivo}\n`);
  const { contatos, avisos } = interpretarContatos(await lerPlanilha(arquivo));
  for (const a of avisos) linha(`⚠️  ${a}`);
  if (!contatos.length) throw new Error('Nenhum contato encontrado. A planilha precisa das colunas "Nome" e "Telefone".');

  const resumo = aplicarContatos(db, contatos, { agora: agora(), config });
  linha(`✅ Contatos importados — novos: ${resumo.novos}, atualizados: ${resumo.atualizados}, sem mudança: ${resumo.iguais}`);
  if (resumo.problemas.length) {
    linha('\n⚠️  Telefones com problema (foram salvos, mas não vão funcionar até corrigir):');
    for (const p of resumo.problemas) linha(`   - ${p.nome}: ${p.erro}`);
  }
});
