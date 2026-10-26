// npm run sugerir-escala -- 12/2026
// Monta um RASCUNHO da escala mecânica do mês (indicadores, leitores e microfones volantes) por rodízio,
// usando as listas de autorizados e o histórico de designações já importadas.
// Gera planilhas\sugestao-AAAA-MM.xlsx no mesmo formato da planilha de designações:
// revise, ajuste o que quiser e importe com: npm run importar -- planilhas\sugestao-AAAA-MM.xlsx
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PASTA_PLANILHAS } from '../caminhos.js';
import { buscarContato } from '../banco.js';
import { reunioesDoMes, sugerirEscala } from '../escala.js';
import { interpretarAutorizados } from '../importacao.js';
import { lerPlanilha, localizarArquivo } from '../planilha.js';
import { chaveNome } from '../texto.js';
import { agora } from '../tempo.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function lerMes(texto) {
  if (!texto) return agora().plus({ months: 1 }).toFormat('yyyy-MM');
  const a = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (a) return `${a[2]}-${a[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}$/.test(texto)) return texto;
  throw new Error(`Mês "${texto}" não reconhecido. Use, por exemplo: npm run sugerir-escala -- 12/2026`);
}

executar(async () => {
  const mes = lerMes(argumentos()[0]);
  const { config, db } = carregarTudo();
  const pessoaDe = (nome) => {
    const c = buscarContato(db, chaveNome(nome));
    return c ? `contato:${c.id}` : chaveNome(nome);
  };

  // Autorizados: aba "Autorizados" da planilha de designações (ou planilhas\autorizados.xlsx).
  const arquivo = localizarArquivo(null, PASTA_PLANILHAS, 'designacoes');
  const arquivoAut = localizarArquivo(null, PASTA_PLANILHAS, 'autorizados');
  let listas = arquivo ? interpretarAutorizados(await lerPlanilha(arquivo)).listas : new Map();
  if (!listas.size && arquivoAut) listas = interpretarAutorizados(await lerPlanilha(arquivoAut)).listas;
  if (!listas.size) throw new Error('Não encontrei as listas de autorizados (aba "Autorizados" em planilhas\\designacoes.xlsx).');
  const autorizados = (funcao, dia) => {
    const lista = listas.get(`${funcao}:${dia}`) ?? listas.get(funcao);
    const vistos = new Map();
    for (const nome of lista?.nomes ?? []) {
      const p = pessoaDe(nome);
      if (!vistos.has(p)) vistos.set(p, { pessoa: p, nome }); // "Jonas" e "Jonas Pereira" são a mesma pessoa
    }
    return [...vistos.values()];
  };

  // Histórico: todas as designações de reunião já importadas antes deste mês.
  const historico = db
    .prepare(`SELECT nome, funcao, data FROM designacoes WHERE lista = 'reuniao' AND ativa = 1 AND data < ?`)
    .all(`${mes}-01`)
    .map((h) => ({ pessoa: pessoaDe(h.nome), funcao: h.funcao, data: h.data }));
  const [ano, m] = mes.split('-').map(Number);
  const mesAnterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`;
  const doAnterior = historico.filter((h) => h.data.startsWith(mesAnterior)).length;

  const reunioes = reunioesDoMes(mes, config.horarioReunioes);
  const { designacoes, avisos } = sugerirEscala(reunioes, autorizados, historico);

  // Planilha no mesmo formato da de designações.
  const livro = new ExcelJS.Workbook();
  const f = livro.addWorksheet('Designações');
  [8, 13, 13, 3, 11, 11, 3, 13, 13].forEach((w, i) => { f.getColumn(i + 1).width = w; });
  f.getCell('B1').value = 'Lista de Designações';
  f.getCell('B1').font = { bold: true, size: 14 };
  f.getCell('D2').value = `${MESES[m - 1]} ${ano}`;
  f.getCell('D2').font = { bold: true };
  let linhaAtual = 4;
  for (const [dia, titulo] of [['terca', 'TERÇA'], ['sabado', 'SÁBADO']]) {
    f.getCell(`B${linhaAtual}`).value = titulo;
    f.getCell(`B${linhaAtual}`).font = { bold: true };
    linhaAtual++;
    for (const [col, cab] of [['B', 'INDICADORES'], ['E', 'LEITORES'], ['H', 'MICROFONES VOLANTES']]) {
      f.getCell(`${col}${linhaAtual}`).value = cab;
      f.getCell(`${col}${linhaAtual}`).font = { bold: true };
    }
    linhaAtual++;
    for (const r of reunioes.filter((x) => x.dia === dia)) {
      const nomes = (funcao) => designacoes.filter((d) => d.data === r.data && d.funcao === funcao).map((d) => d.nome).filter(Boolean).join(' - ');
      f.getCell(`A${linhaAtual}`).value = `${r.data.slice(8, 10)}/${r.data.slice(5, 7)}`;
      f.getCell(`B${linhaAtual}`).value = nomes('Indicador');
      f.getCell(`E${linhaAtual}`).value = nomes('Leitor');
      f.getCell(`H${linhaAtual}`).value = nomes('Microfone volante');
      for (const [a, b] of [['B', 'C'], ['E', 'F'], ['H', 'I']]) f.mergeCells(`${a}${linhaAtual}:${b}${linhaAtual}`);
      linhaAtual++;
    }
    linhaAtual++;
  }

  // Autorizados: copia a aba original, para a importação continuar conferindo.
  const origem = new ExcelJS.Workbook();
  await origem.xlsx.readFile(arquivoAut && !arquivo ? arquivoAut : arquivo);
  const abaAut = origem.worksheets.find((w) => /autorizad/i.test(w.name));
  if (abaAut) {
    const copia = livro.addWorksheet('Autorizados');
    abaAut.eachRow({ includeEmpty: true }, (row, r) => row.eachCell({ includeEmpty: false }, (c, n) => { if (c.type !== ExcelJS.ValueType.Merge) copia.getCell(r, n).value = c.value; }));
    for (const mg of abaAut.model.merges ?? []) copia.mergeCells(mg);
    abaAut.columns.forEach((c, i) => { copia.getColumn(i + 1).width = c.width; });
  }

  // Por que cada um foi escolhido.
  const exp = livro.addWorksheet('Como foi escolhido');
  exp.columns = [{ header: 'Data', width: 12 }, { header: 'Parte', width: 18 }, { header: 'Nome', width: 18 }, { header: 'Por quê', width: 60 }];
  exp.getRow(1).font = { bold: true };
  for (const d of designacoes) exp.addRow([`${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`, d.funcao, d.nome || '(vaga em branco)', d.motivo]);
  exp.addRow([]);
  exp.addRow(['', '', '', 'Regra: entre os autorizados, quem está há mais tempo sem fazer aquela parte; depois, quem teve menos designações nos últimos 120 dias.']);
  for (const a of avisos) exp.addRow(['', '', 'ATENÇÃO', a]);

  const destino = path.join(PASTA_PLANILHAS, `sugestao-${mes}.xlsx`);
  await livro.xlsx.writeFile(destino);

  linha(`✅ Escala sugerida de ${MESES[m - 1]} ${ano}: ${reunioes.length} reuniões, ${designacoes.filter((d) => d.nome).length} designações.`);
  linha(`📄 Arquivo: planilhas\\sugestao-${mes}.xlsx (abas: Designações, Autorizados, Como foi escolhido)`);
  if (!doAnterior) linha(`\n⚠️  O mês anterior (${mesAnterior}) ainda não foi importado: a sugestão não sabe quem já foi designado nele e pode repetir pessoas. Importe ${mesAnterior} antes e gere de novo.`);
  for (const a of avisos) linha(`⚠️  ${a}`);
  linha('\nPróximos passos: abra o arquivo, revise e ajuste (é só uma sugestão). Depois importe:');
  linha(`   npm run importar -- planilhas\\sugestao-${mes}.xlsx --conferir   (confere, sem gravar)`);
  linha(`   npm run importar -- planilhas\\sugestao-${mes}.xlsx              (grava e agenda os lembretes)`);
});
