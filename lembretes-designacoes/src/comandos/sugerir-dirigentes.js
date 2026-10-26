// npm run sugerir-dirigentes -- 12/2026
// Monta um RASCUNHO da lista de dirigentes de campo do mês por rodízio (quem costuma dirigir cada
// tipo de dia, começando por quem está há mais tempo sem dirigir). Gera
// planilhas\sugestao-dirigentes-AAAA-MM.xlsx no mesmo formato da planilha de dirigentes.
// Revise e importe com: npm run importar -- planilhas\sugestao-dirigentes-AAAA-MM.xlsx
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PASTA_PLANILHAS } from '../caminhos.js';
import { buscarContato } from '../banco.js';
import { TIPOS, saidasDoMes, sugerirDirigentes, tipoDaSaida } from '../escalaDirigentes.js';
import { chaveNome } from '../texto.js';
import { agora } from '../tempo.js';
import { argumentos, carregarTudo, executar, linha } from './comum.js';

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

function lerMes(texto) {
  if (!texto) return agora().plus({ months: 1 }).toFormat('yyyy-MM');
  const a = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (a) return `${a[2]}-${a[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}$/.test(texto)) return texto;
  throw new Error(`Mês "${texto}" não reconhecido. Use, por exemplo: npm run sugerir-dirigentes -- 12/2026`);
}

executar(async () => {
  const mes = lerMes(argumentos()[0]);
  const { db } = carregarTudo();
  const pessoaDe = (nome) => {
    const c = buscarContato(db, chaveNome(nome));
    return c ? `contato:${c.id}` : chaveNome(nome);
  };

  const linhas = db
    .prepare(`SELECT data, nome, local FROM designacoes WHERE lista = 'dirigentes' AND ativa = 1 AND data < ? ORDER BY data`)
    .all(`${mes}-01`);
  const historico = linhas.map((l) => ({ pessoa: pessoaDe(l.nome), tipo: tipoDaSaida(l.data, l.local ?? ''), data: l.data, nome: l.nome })).filter((h) => h.tipo);
  // Quem pode cada tipo de dia = quem já dirigiu nele (com o nome como aparece por último na planilha).
  const candidatos = (tipo) => {
    const m = new Map();
    for (const h of historico.filter((x) => x.tipo === tipo)) m.set(h.pessoa, { pessoa: h.pessoa, nome: h.nome });
    return [...m.values()];
  };

  const { saidas, avisos } = sugerirDirigentes(saidasDoMes(mes), candidatos, historico);
  const [ano, m] = mes.split('-').map(Number);

  const livro = new ExcelJS.Workbook();
  const f = livro.addWorksheet('Dirigentes');
  [13, 12, 26, 20, 11, 28].forEach((w, i) => { f.getColumn(i + 1).width = w; });
  f.getCell('A1').value = 'LISTA DE DIRIGENTES DE CAMPO';
  f.mergeCells('A1:F1');
  f.getCell('A1').font = { bold: true, size: 13 };
  f.getCell('A3').value = MESES[m - 1];
  f.mergeCells('A3:F3');
  f.getCell('A3').font = { bold: true };
  f.getRow(4).values = ['DATAS', 'DIAS', 'LOCAL', 'DIRIGENTE', 'HORÁRIO', 'OBSERVAÇÃO'];
  f.getRow(4).font = { bold: true };
  saidas.forEach((s, i) => {
    f.getRow(5 + i).values = [`${s.data.slice(8, 10)}/${s.data.slice(5, 7)}/${s.data.slice(0, 4)}`, s.dia, s.local, s.nome, s.horario, ''];
  });

  const exp = livro.addWorksheet('Como foi escolhido');
  exp.columns = [{ header: 'Data', width: 12 }, { header: 'Tipo de saída', width: 20 }, { header: 'Dirigente', width: 18 }, { header: 'Por quê', width: 60 }];
  exp.getRow(1).font = { bold: true };
  for (const s of saidas) exp.addRow([`${s.data.slice(8, 10)}/${s.data.slice(5, 7)}`, TIPOS[s.tipo].rotulo, s.nome || '(em branco)', s.motivo]);
  exp.addRow([]);
  exp.addRow(['', '', '', 'Regra: entre quem já dirigiu aquele tipo de dia, quem está há mais tempo sem dirigi-lo. Os domingos dos chefes de grupo não entram nesta lista (o site cria sozinho).']);
  for (const a of avisos) exp.addRow(['', '', 'ATENÇÃO', a]);

  const destino = path.join(PASTA_PLANILHAS, `sugestao-dirigentes-${mes}.xlsx`);
  await livro.xlsx.writeFile(destino);

  linha(`✅ Dirigentes sugeridos de ${MESES[m - 1].toLowerCase()} de ${ano}: ${saidas.length} saídas.`);
  for (const s of saidas) linha(`   ${s.data.slice(8, 10)}/${s.data.slice(5, 7)} ${s.dia.padEnd(8)} ${s.local.padEnd(24)} ${s.nome || '(em branco)'}`);
  for (const a of avisos) linha(`⚠️  ${a}`);
  linha(`\n📄 Arquivo: planilhas\\sugestao-dirigentes-${mes}.xlsx — revise e ajuste (é só uma sugestão). Depois importe:`);
  linha(`   npm run importar -- planilhas\\sugestao-dirigentes-${mes}.xlsx --conferir   (confere, sem gravar)`);
  linha(`   npm run importar -- planilhas\\sugestao-dirigentes-${mes}.xlsx              (grava e agenda os lembretes)`);
});
