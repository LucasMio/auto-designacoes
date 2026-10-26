// Liga este sistema ao site dos territórios (pasta vizinha "territorios"): depois de importar ou trocar
// dirigentes, a programação de campo do site é atualizada. Se a pasta não existir, não faz nada.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RAIZ } from './caminhos.js';
import { linha } from './comandos/comum.js';

export function sincronizarTerritorios() {
  const pasta = path.join(RAIZ, '..', 'territorios');
  const script = path.join(pasta, 'scripts', 'sincronizar-programacao.js');
  if (!fs.existsSync(script)) return;
  linha('\n🗺️  Atualizando a programação de campo no site dos territórios…');
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', script], { cwd: pasta, stdio: 'inherit' });
  if (r.status !== 0) linha('   ⚠️  Não consegui atualizar o site agora. Depois rode, na pasta "territorios": npm run sincronizar-programacao');
}
