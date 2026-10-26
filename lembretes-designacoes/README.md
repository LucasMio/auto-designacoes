# Lembretes de Designações pelo WhatsApp

Este sistema envia **automaticamente**, pelo **seu próprio WhatsApp**, lembretes para quem tem designação nas reuniões:

| Função | Quantidade por reunião |
|---|---|
| Indicador | 2 |
| Leitor | 1 |
| Microfone volante | 2 |

Reuniões: **terça às 19:30** e **sábado às 19:00**.

Cada irmão recebe:

| Designação | Lembretes |
|---|---|
| Indicador, Leitor, Microfone volante | **7 dias antes** (08:00) e **no dia** (08:00) |
| Dirigente de campo | **Uma vez só**: campo de **sábado** → na **véspera (sexta) às 19:00**; outros dias → no próprio dia, às **07:00** se for de manhã ou às **08:00** se for à tarde |

> Dá para mudar quais lembretes cada lista recebe no campo `lembretes` do `config.json` (seção 2).

Você só precisa **importar a planilha** que recebe. O resto é automático.

> ⚠️ **Importante:** o sistema usa o WhatsApp Web de forma **não oficial** (biblioteca *whatsapp-web.js*). Isso vai contra os termos de uso do WhatsApp. Com o volume da congregação (poucas dezenas de mensagens por semana, com intervalo aleatório entre elas), o risco de bloqueio é baixo, mas **não é zero**.

---

## Sumário

1. [Instalação (uma vez só)](#1-instalação-uma-vez-só)
2. [Configuração](#2-configuração)
3. [Primeiro uso, passo a passo](#3-primeiro-uso-passo-a-passo)
4. [Deixar ligado automaticamente com o Windows](#4-deixar-ligado-automaticamente-com-o-windows)
5. [Uso do dia a dia](#5-uso-do-dia-a-dia)
6. [As planilhas](#6-as-planilhas)
7. [Como o sistema decide o que enviar](#7-como-o-sistema-decide-o-que-enviar)
8. [Editando o texto das mensagens](#8-editando-o-texto-das-mensagens)
9. [Lista de todos os comandos](#9-lista-de-todos-os-comandos)
10. [Solução de problemas](#10-solução-de-problemas)
11. [Privacidade e segurança](#11-privacidade-e-segurança)
12. [Para quem programa](#12-para-quem-programa)

---

## 1. Instalação (uma vez só)

### 1.1 Node.js

O sistema roda com o **Node.js** (versão 22.13 ou mais nova). Para ver se ele já está instalado:

1. Aperte a tecla **Windows**, digite `PowerShell` e abra o **Windows PowerShell**.
2. Digite o comando abaixo e aperte **Enter**:
   ```
   node -v
   ```
   Se aparecer algo como `v24.19.0`, está tudo certo. Se der erro, baixe e instale a versão **LTS** em https://nodejs.org (é só clicar "Avançar" até o fim) e abra o PowerShell de novo.

### 1.2 Abrir o terminal na pasta do projeto

Todos os comandos deste guia são digitados **dentro da pasta do projeto**. O jeito mais fácil:

1. Abra a pasta do projeto no Explorador de Arquivos (`designações auto`).
2. Clique na **barra de endereço** (onde aparece o caminho da pasta), apague o texto, digite `powershell` e aperte **Enter**.
3. Vai abrir uma janela azul/preta **já dentro da pasta**. É nela que você digita os comandos.

> Dica: no VS Code, o menu **Terminal > Novo Terminal** também abre o terminal já na pasta.

### 1.2.1 Liberar o PowerShell para rodar o `npm` (uma vez só)

Se ao digitar um comando `npm` aparecer o erro **"a execução de scripts foi desabilitada neste sistema"**, rode:

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Se ele perguntar se deseja alterar, digite `S` e aperte **Enter**. Depois feche e abra o PowerShell de novo.

**O que faz:** permite rodar scripts criados no seu computador (como o `npm`). Vale só para o seu usuário e não precisa de administrador.

> Alternativa sem mudar nada: use `npm.cmd` no lugar de `npm` (ex.: `npm.cmd run conectar`).

### 1.3 Instalar as dependências

Na primeira vez (ou se copiar o projeto para outro computador), rode:

```
npm install
```

**O que faz:** baixa as bibliotecas que o sistema usa, incluindo um navegador Chrome próprio, escondido, que abre o WhatsApp Web. Pode levar alguns minutos.

> Neste computador isso **já foi feito**. Você só precisa rodar de novo se apagar a pasta `node_modules` ou mudar de computador.

---

## 2. Configuração

Abra o arquivo `config\config.json` no Bloco de Notas. Ele tem este formato:

```json
{
  "lembretes": { "reuniao": ["7d", "dia"], "dirigentes": ["dia"] },
  "horaEnvio": "08:00",
  "lembreteManha": { "quandoComecarAntesDe": "12:00", "hora": "07:00" },
  "lembreteVespera": { "listas": ["dirigentes"], "diasDaSemana": ["sabado"], "hora": "19:00" },
  "janelaEnvio": { "inicio": "07:00", "fim": "21:00" },
  "intervaloEntreMensagens": { "minimoSegundos": 5, "maximoSegundos": 20 },
  "horarioReunioes": { "terca": "19:30", "sabado": "19:00" },
  "dddPadrao": "",
  "meuNumero": "",
  "avisarErrosNoWhatsApp": true,
  "mostrarNavegador": false
}
```

| Campo | O que é |
|---|---|
| `lembretes` | Quais lembretes cada lista recebe. `reuniao` = indicadores, leitores e microfones; `dirigentes` = dirigentes de campo. Tipos: `"30d"` (30 dias antes), `"7d"` (7 dias antes), `"dia"` (no próprio dia) e `"resumo"` (um resumo ao importar). Ao mudar, o sistema ajusta sozinho o que já estava agendado, **sem reenviar** o que já saiu. |
| `horaEnvio` | Horário dos lembretes de 7 dias (e 30 dias, se usar) e do lembrete da manhã do dia. |
| `lembreteVespera` | Nos `diasDaSemana` indicados (sem acento: `"sabado"`, `"domingo"`…), as `listas` indicadas recebem o aviso **na véspera**, em `hora`, no lugar do aviso do dia. Padrão: dirigentes de sábado → sexta às 19:00. |
| `lembreteManha` | Compromissos que começam antes de `quandoComecarAntesDe` (padrão 12:00) são lembrados **no próprio dia, mais cedo**, no horário `hora` (padrão 07:00). Os demais, em `horaEnvio`. |
| `janelaEnvio` | O sistema **só envia** dentro deste horário. Se o computador ligar às 23h com algo atrasado, ele espera até as 07:00. |
| `intervaloEntreMensagens` | Pausa aleatória entre uma mensagem e outra, para parecer uso humano. |
| `horarioReunioes` | Horário padrão das reuniões de terça e sábado. |
| `dddPadrao` | Opcional. Se algum telefone da planilha vier **sem DDD**, usa este (ex.: `"11"`). |
| `meuNumero` | Opcional. Para onde vão os avisos de erro e os testes. **Vazio = a sua própria conversa** ("Você") no WhatsApp conectado. |
| `avisarErrosNoWhatsApp` | `true` = quando um envio falha, você recebe um resumo no WhatsApp. |
| `mostrarNavegador` | `true` = mostra a janela do Chrome (só para investigar problemas). |

⚠️ Mantenha as **aspas** e as **vírgulas** como estão. Se o arquivo ficar com erro, o sistema avisa qual é o problema.

---

## 3. Primeiro uso, passo a passo

Faça na ordem. Em cada passo está explicado o que o comando faz.

> **Sobre o `--`:** quando um comando recebe informações extras (um arquivo, uma data), elas vêm depois de `--`. Exemplo: `npm run importar -- "C:\Users\voce\Downloads\designacoes.xlsx"`. O `--` é obrigatório.

### Passo 1: conectar o WhatsApp

```
npm run conectar
```

**O que faz:** abre o WhatsApp Web escondido e mostra um **QR Code** no terminal.

No celular: **WhatsApp > Configurações** (no Android, **⋮**) **> Dispositivos conectados > Conectar um dispositivo**. Aponte a câmera para o QR Code.

Quando aparecer `✅ Conectado`, pronto. **A sessão fica salva**, e você não precisa repetir isso.

> Se o QR Code aparecer "quebrado", maximize a janela do terminal ou diminua a fonte (Ctrl + roda do mouse) e rode de novo.

### Passo 2: testar o envio

```
npm run teste-envio
```

**O que faz:** manda uma mensagem de teste **só para você** (conversa "Você" no WhatsApp). Se chegou, a conexão está funcionando.

Para ver como ficam os modelos de mensagem:

```
npm run teste-envio -- --modelos
```

### Passo 3: cadastrar os contatos

Monte uma planilha com as colunas **Nome**, **Telefone** e, se precisar, **Outros nomes** (veja a seção 6 e o exemplo em `exemplos\contatos-exemplo.xlsx`). Salve como `planilhas\contatos.xlsx` e rode:

```
npm run contatos
```

**O que faz:** cadastra ou atualiza os contatos. Telefones com problema (DDD errado, dígitos faltando) aparecem na tela.

Para conferir quem está cadastrado:

```
npm run contatos -- --listar
```

### Passo 4: importar as designações

Salve a planilha de designações como `planilhas\designacoes.xlsx`. Antes de gravar, **confira**:

```
npm run importar -- --conferir
```

**O que faz:** mostra o que seria importado e **não grava nada**. Aparecem avisos como "esperava 2 × Indicador, encontrei 1" e a lista de pessoas **sem contato cadastrado**.

Se estiver tudo certo, importe de verdade:

```
npm run importar
```

### Passo 5: conferir a agenda

```
npm run proximos
```

**O que faz:** lista as mensagens dos próximos 15 dias: quando sai, para quem e de qual reunião. Opções:

- `npm run proximos -- --dias 45` mostra os próximos 45 dias.
- `npm run proximos -- --todos` mostra tudo.

Para ver o **texto exato** que sairia agora, sem enviar nada:

```
npm run simular
```

Ou num momento futuro:

```
npm run simular -- 06/10/2026 08:00
```

### Passo 6: ligar o sistema

```
npm start
```

**O que faz:** liga o sistema. Ele verifica **a cada minuto** se há lembretes para enviar. Enquanto a janela estiver aberta, ele funciona. Para parar, aperte **Ctrl + C**.

Para não ter que deixar uma janela aberta, veja a próxima seção.

---

## 4. Deixar ligado automaticamente com o Windows

Depois de fazer o **Passo 1** (conectar), rode:

```
npm run instalar-inicio
```

**O que faz:** cria uma tarefa no **Agendador de Tarefas do Windows** chamada *"Lembretes de Designacoes"*. A partir de agora:

- O sistema **liga sozinho, escondido**, sempre que você entra no Windows.
- Se ele cair (internet, erro), **religa sozinho** em 1 minuto.
- Se o computador estava desligado no horário de algum lembrete, ele **envia o que ficou pendente** ao ligar (desde que a reunião ainda não tenha acontecido).

> Se aparecer erro de permissão, abra o PowerShell **como administrador** (clique com o botão direito no PowerShell > *Executar como administrador*), vá até a pasta com `cd "C:\Users\voce\Desktop\Autos\designações auto"` e rode o comando de novo.

Comandos relacionados:

| Comando | O que faz |
|---|---|
| `npm run log` | Mostra as últimas 40 linhas do log (o que foi enviado, pulado ou falhou). `npm run log -- 200` mostra 200 linhas. |
| `npm run parar` | Para o sistema que está rodando escondido. Ele fica parado até você rodar `npm run ligar` ou reiniciar o computador. |
| `npm run ligar` | Liga de novo o sistema escondido (depois de um `npm run parar`), sem reiniciar o PC. |

O início automático também **confere a cada 10 minutos** se o sistema está rodando e religa se não estiver (por exemplo, quando o computador volta da suspensão).
| `npm run remover-inicio` | Remove o início automático de vez. |

> **Importante:** o sistema só envia com o computador **ligado e conectado à internet**, com seu usuário logado no Windows. Evite que o PC **hiberne** nos horários de envio (08:00). Em *Configurações > Sistema > Energia*, dá para ajustar quando ele entra em suspensão.

### Alternativa: pm2

Se você preferir o **pm2** (gerenciador de processos do Node): `npm install -g pm2`, depois `pm2 start src/comandos/iniciar.js --name lembretes -- --servico` e `pm2 save`. No Windows o pm2 não inicia sozinho com o computador sem um pacote extra (`pm2-windows-startup`), por isso o **Agendador de Tarefas é o recomendado**.

---

## 5. Uso do dia a dia

Na prática, você só faz isto quando **recebe uma planilha nova ou corrigida**:

1. Salve a planilha como `planilhas\designacoes.xlsx`, substituindo a anterior.
2. Rode `npm run importar -- --conferir` e leia os avisos.
3. Rode `npm run importar`.
4. Se aparecer alguém **sem contato**, adicione na planilha de contatos e rode `npm run contatos`.
5. De vez em quando, `npm run proximos` e `npm run log` para acompanhar.

### Alterações de última hora

**Pelo caminho recomendado:** corrija a planilha e importe de novo. A importação compara com o que já existe:

- Quem **saiu** de uma data tem os lembretes pendentes **cancelados** (e não recebe mais nada).
- Quem **entrou** passa a receber os lembretes. Se já passou do dia do lembrete de 30 ou 7 dias, recebe **na hora** um *aviso imediato*.
- Datas que **não estão** na planilha nova não são alteradas.
- Nada é enviado duas vezes.

**Pelo terminal**, para correções rápidas:

```
npm run trocar -- 13/10/2026 "Carlos Souza" "Paulo Reis"
```
Troca uma pessoa por outra nas designações daquela data.

```
npm run remover -- 13/10/2026 "Carlos Souza"
npm run remover -- 13/10/2026 "Carlos Souza" Leitor
```
Remove a pessoa daquela data (todas as funções, ou só a função indicada) e cancela os lembretes pendentes.

> Se usar `trocar`/`remover`, corrija também a planilha. Senão, na próxima importação, a planilha "desfaz" a sua alteração.

---

## 6. As planilhas

Pode ser **Excel (.xlsx)** ou **CSV**. Do Google Planilhas, use *Arquivo > Fazer download > Microsoft Excel (.xlsx)*. Veja modelos prontos na pasta `exemplos`.

### Designações: a "Lista de Designações" da congregação

A planilha que você recebe todo mês funciona **do jeito que ela vem**, sem precisar mexer em nada:

| | INDICADORES | LEITORES | MICROFONES VOLANTES |
|---|---|---|---|
| **TERÇA** | | | |
| 06/10 | Fernando - Marta | Jonas | Leandro - João |
| **SÁBADO** | | | |
| 03/10 | Paulo - Jorge | Mateus | Diogo - Alex |

- O **ano** vem do título ("Outubro 2026").
- Os blocos **Terça** e **Sábado** são lidos separadamente. O horário sai sozinho: terça 19:30, sábado 19:00.
- As duas pessoas da mesma célula são separadas pelo **" - "**.
- Veja o modelo em `exemplos\designacoes-exemplo.xlsx`.

### Dirigentes de campo (segunda lista)

A lista dos dirigentes de campo fica num arquivo separado, `planilhas\dirigentes.xlsx`, no formato que você já recebe:

| DATAS | DIAS | LOCAL | DIRIGENTE | HORÁRIO | OBSERVAÇÃO |
|---|---|---|---|---|---|
| 02/09/2026 | QUARTA | Salão do Reino | MATEUS | 18:00 | |
| 03/09/2026 | QUINTA | | ELIAS | 18:00 | Campanha — território n58 |

Para importar:

```
npm run importar-dirigentes -- --conferir
npm run importar-dirigentes
```

- **Qualquer dia da semana** serve, desde que a coluna **HORÁRIO** esteja preenchida.
- **LOCAL** e **OBSERVAÇÃO** entram na mensagem. Use a OBSERVAÇÃO para o território da campanha.
- A coluna **DIAS** é conferida com a data: se estiver escrito "SEGUNDA" numa quarta-feira, o sistema avisa.
- As duas listas são independentes: importar uma **não mexe** na outra, mesmo quando caem no mesmo dia.
- Quem estiver nas duas listas recebe **um resumo só**, com tudo, se as duas forem importadas juntas.

### Listas de autorizados (opcional)

Se a planilha tiver uma aba com as listas de quem é autorizado em cada função ("Leitura do Livro", "Leitura da Sentinela", "Volantes", "Indicadores"), a importação **confere** cada designação e avisa quando alguém foi designado para uma função em que não está na lista. Exemplo:

```
⚠️ 03/10/2026 — Jorge está como Indicador, mas não aparece na lista "Indicadores".
```

- Para o **leitor**, a terça é conferida com a "Leitura do Livro" e o sábado com a "Leitura da Sentinela".
- "Ordem de Presidência" e outras listas são ignoradas.
- É **só um aviso**: o lembrete é enviado mesmo assim. Serve para você conferir a planilha.
- Nomes curtos são reconhecidos: "Diogo" na designação vale para "Diogo Amaral" na lista.
- As listas também podem ficar num arquivo separado: `planilhas\autorizados.xlsx`.

### Outros formatos aceitos

Se um dia a planilha vier diferente, o sistema também reconhece estes formatos. As colunas podem ter acentos, maiúsculas ou números ("Indicador 1", "Microfone 2", "Volante").

**Formato A: uma linha por reunião, com coluna Data:**

| Data | Indicador 1 | Indicador 2 | Leitor | Microfone 1 | Microfone 2 |
|---|---|---|---|---|---|
| 13/10/2026 | Carlos Souza | Pedro Lima | João Silva | André Costa | Bruno Dias |

**Formato B: uma linha por designação.** Se a data ficar em branco, vale a data da linha de cima:

| Data | Função | Nome |
|---|---|---|
| 13/10/2026 | Leitor | João Silva |
| | Indicador | Carlos Souza / Pedro Lima |

**Formato C: quadro com as datas nas colunas**, como os quadros impressos:

| | Ter 13/10 | Sáb 17/10 |
|---|---|---|
| Indicadores | Carlos / Pedro | Pedro / Marcos |
| Leitor | João | Paulo |
| Microfones | André / Bruno | Carlos / André |

Detalhes:

- **Duas pessoas na mesma célula** podem ser separadas por ` - `, `/`, `;`, vírgula ou " e ".
- **Datas** aceitas: `13/10/2026`, `13/10/26`, `13/10` (usa o ano mais provável), `Terça, 13/10/2026`, `13 de outubro de 2026`, ou data do próprio Excel.
- **Horário**: terça vira 19:30 e sábado vira 19:00, automaticamente. Para exceções (semana especial, outro dia da semana), crie uma coluna **Horário** e preencha só nessas datas. Datas que não são terça nem sábado **exigem** o horário.
- Colunas de outras funções (Som, Palco etc.) são **ignoradas**, e a importação avisa quais foram.
- Se tiver várias abas (uma por mês, por exemplo), **todas** são lidas.

> Se a sua planilha tiver um formato diferente e não for reconhecida, a importação avisa. Nesse caso, peça ajuste mandando um exemplo.

### Contatos

| Nome | Telefone | Outros nomes |
|---|---|---|
| Jonas Pereira | (11) 98765-4321 | Jonas |
| Diogo Amaral | (11) 91234-5678 | Diogo |
| Marta | (11) 99876-5432 | |

- O sistema liga a designação ao telefone **pelo nome**. Ele precisa bater com o **Nome** ou com um dos **Outros nomes**.
- Use **Outros nomes** para quem aparece na Lista de Designações com um nome diferente do cadastro. Por exemplo, "Jonas Pereira" aparece como "Jonas". Mais de um outro nome: separe com `/` (ex.: `Diogo / Diogo A.`).
- Maiúsculas/minúsculas e acentos **não importam** ("Estevao" = "Estêvão"). Mas o sistema **não adivinha**: "Diogo" só é ligado a "Diogo Amaral" se estiver nos Outros nomes.
- Cuidado com nomes repetidos: se houver dois "João", cada um precisa aparecer na lista de um jeito diferente (ex.: "João" e "João Ponce"). O sistema recusa um outro nome que já seja de outra pessoa.
- Para conferir o cadastro: `npm run contatos -- --listar`. A importação de designações também lista quem ficou **sem contato**.
- O telefone pode estar em qualquer formato: `(11) 98765-4321`, `11987654321`, `+55 11 98765-4321`. O sistema acrescenta o 55 e o nono dígito quando faltam, e antes de enviar confere se o número tem WhatsApp.

---

## 7. Como o sistema decide o que enviar

| Situação | O que acontece |
|---|---|
| Reuniões (indicador, leitor, microfone) | Lembrete **7 dias antes** e **no dia**, às 08:00. |
| Dirigente de campo | **Só o lembrete do dia**. |
| Designação cadastrada **depois** do dia do lembrete de 7 dias | Sai **na hora** um *aviso imediato* no lugar dele; o do dia continua valendo. |
| Campo de **sábado** | Aviso **na véspera (sexta) às 19:00**, uma vez só. |
| Outro compromisso de **manhã** (ex.: campo de domingo às 08:30) | O lembrete sai **no próprio dia às 07:00**. |
| Mesma pessoa escrita de jeitos diferentes nas listas ("Brito" e "Carlos Brito") | **Uma mensagem só**, desde que os dois nomes estejam no mesmo contato. |
| Mesma pessoa com **mais de uma** designação na mesma data | **Uma única mensagem**: "Designações: Indicador e Leitor". |
| Pai e filho (ou outros) com o **mesmo número** | Cada um recebe a própria mensagem, com o próprio nome. |
| Computador **desligado** no horário | Ao ligar, envia o que ficou pendente. Se acumulou mais de um lembrete da mesma reunião, envia **só o mais recente**. |
| A reunião **já aconteceu** | Não envia mais nada daquela reunião (registra no log como *pulado*). |
| Fora do horário de envio (21:00–08:00) | Espera até as 08:00. |
| Pessoa **sem contato**, telefone inválido, número **sem WhatsApp** | Não envia, registra o erro e **te avisa pelo WhatsApp**. Depois de corrigir, rode `npm run reenviar-erros`. |
| Queda de internet no envio | Tenta de novo no minuto seguinte (até 3 vezes). |
| Programa fechado **no meio** de um envio | Não reenvia (para nunca duplicar). Fica como erro "envio interrompido" para você conferir. |

Entre uma mensagem e outra há uma pausa **aleatória de 5 a 20 segundos**.

---

## 8. Editando o texto das mensagens

Os textos ficam em `config\mensagens\`. Abra com o Bloco de Notas:

| Arquivo | Quando é usado |
|---|---|
| `30-dias-antes.txt` | 30 dias antes |
| `7-dias-antes.txt` | 7 dias antes |
| `no-dia.txt` | na manhã do dia (compromissos de tarde/noite) |
| `na-vespera.txt` | aviso na véspera (dirigentes de sábado) |
| `aviso-imediato.txt` | designação cadastrada depois do dia do lembrete de 7 dias |
| `resumo-mensal.txt` | resumo do mês (só se `"resumo"` estiver em `lembretes`). Campos próprios: `{titulo}` ("Suas designações de Outubro") e `{lista}` (uma linha por reunião) |

Campos que você pode usar (são trocados automaticamente):

| Campo | Vira |
|---|---|
| `{primeiro_nome}` | Carlos |
| `{nome}` | Carlos Souza |
| `{dia_semana}` | Terça-feira |
| `{data}` | 13/10/2026 |
| `{horario}` | 19:30 |
| `{titulo_designacao}` | Designação (ou Designações, se forem várias) |
| `{designacao}` | Leitor (ou "Indicador e Leitor") |
| `{quando}` | hoje / amanhã / daqui a 7 dias |
| `{local_linha}` | "📍 Local: Salão do Reino" (some quando não há local) |
| `{observacao_linha}` | "📝 Campanha — território n58" (some quando não há observação) |

- Linhas que começam com `#` são **comentários** e não são enviadas.
- Para **negrito** no WhatsApp use `*texto*`; para *itálico*, `_texto_`.
- Ao salvar no Bloco de Notas, mantenha a codificação **UTF-8** (é o padrão), senão os emojis estragam.
- Depois de editar, confira com `npm run teste-envio -- --modelos`. Se o sistema estiver rodando escondido, rode `npm run parar` e depois `npm run ligar` para ele usar os textos novos.

---

## 9. Lista de todos os comandos

| Comando | O que faz |
|---|---|
| `npm run conectar` | Conecta o WhatsApp (QR Code). Só na primeira vez ou se desconectar. |
| `npm run teste-envio` | Manda uma mensagem de teste para você. Com `-- --modelos`, manda um exemplo de cada modelo. |
| `npm run contatos` | Importa `planilhas\contatos.xlsx`. Com `-- --listar`, mostra os contatos. |
| `npm run importar` | Importa `planilhas\designacoes.xlsx` (reuniões). Com `-- --conferir`, só mostra, sem gravar. |
| `npm run importar-dirigentes` | Importa `planilhas\dirigentes.xlsx` (dirigentes de campo). Aceita `-- --conferir`. |
| `npm run proximos` | Lista os próximos envios e os erros. Com `-- --dias 45` ou `-- --todos`, mostra mais. |
| `npm run simular` | Mostra o texto do que seria enviado agora, **sem enviar**. Com `-- 06/10/2026 08:00`, simula outro momento. |
| `npm start` | Liga o sistema nesta janela (Ctrl + C para parar). |
| `npm run trocar -- DATA "Antigo" "Novo"` | Troca uma pessoa por outra numa data. |
| `npm run sugerir-dirigentes -- 12/2026` | Monta um **rascunho** da lista de dirigentes de campo do mês (segundas na Casa do Osvaldo, quartas, quartas de cartas, sábados e 1º domingo) por rodízio entre quem costuma dirigir cada tipo de dia. Gera `planilhas\sugestao-dirigentes-2026-12.xlsx` no formato da planilha de dirigentes. Revise e importe com `npm run importar -- planilhas\sugestao-dirigentes-2026-12.xlsx`. |
| `npm run sugerir-escala -- 12/2026` | Monta um **rascunho** da escala mecânica do mês (indicadores, leitores, volantes) por rodízio: entre os autorizados, quem está há mais tempo sem fazer aquela parte. Gera `planilhas\sugestao-2026-12.xlsx` (mesmo formato da planilha de designações, com a aba "Como foi escolhido"). Revise, ajuste e importe com `npm run importar -- planilhas\sugestao-2026-12.xlsx`. Importe o mês anterior antes, para o rodízio levar ele em conta. |
| `npm run remover -- DATA "Nome" [Função]` | Remove uma designação e cancela os lembretes. |
| `npm run reenviar-erros` | Coloca de volta na fila os lembretes que deram erro (depois de corrigir). |
| `npm run log` | Mostra o histórico recente. |
| `npm run instalar-inicio` | Liga o sistema automaticamente com o Windows. |
| `npm run parar` | Para o sistema que está rodando escondido. |
| `npm run ligar` | Liga de novo o sistema escondido. |
| `npm run remover-inicio` | Desliga o início automático. |
| `npm test` | Roda os testes automáticos do sistema. |

Para usar uma planilha de outro lugar, passe o caminho entre aspas. Dica: **arraste o arquivo** para dentro da janela do terminal que o caminho aparece sozinho.

```
npm run importar -- "C:\Users\voce\Downloads\Designações Outubro.xlsx"
```

---

## 10. Solução de problemas

**"npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada"**
→ Rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, responda `S` e abra o PowerShell de novo (veja a seção 1.2.1). Ou use `npm.cmd` no lugar de `npm`.

**"A sessão do WhatsApp não está conectada"** / nada é enviado e o log mostra isso
→ O WhatsApp foi desconectado (pelo celular, ou por ficar muito tempo sem uso). Rode `npm run parar`, depois `npm run conectar`, escaneie o QR Code e rode `npm run ligar`.

**"O WhatsApp já está sendo usado por outro processo deste sistema"**
→ O sistema já está rodando escondido. Para enviar um teste, use `npm run teste-envio` normalmente (ele entra na fila). Para outras operações com o WhatsApp, rode antes `npm run parar`.

**Alguém não recebeu a mensagem**
1. `npm run proximos`: veja se aparece na seção de erros.
2. `npm run log -- 200`: procure o nome da pessoa.
3. Causas comuns: nome diferente entre a planilha de designações e a de contatos; telefone errado; número sem WhatsApp. Corrija, rode `npm run contatos` e depois `npm run reenviar-erros`.

**"Não reconheci o formato" na importação**
→ A planilha precisa de uma coluna **Data** e colunas com os nomes das funções (Indicador, Leitor, Microfone/Volante). Veja a seção 6 e os modelos na pasta `exemplos`.

**"não é terça nem sábado"**
→ A data provavelmente está errada na planilha. Se for mesmo uma reunião em outro dia, acrescente a coluna **Horário** para essa data.

**O WhatsApp Web mostra "erro no banco de dados do navegador" ou não conecta**
→ Rode `npm run conectar` de novo. Se persistir, a pasta do projeto pode estar com um caminho longo demais (o sistema avisa quando isso acontece). Mova a pasta inteira para algo curto como `C:\lembretes`. Em último caso, apague a pasta `dados\sessao-whatsapp` e conecte de novo.

**Quero ver o navegador funcionando**
→ Em `config\config.json`, coloque `"mostrarNavegador": true` e rode `npm start`.

**Mudei de computador**
→ Copie a pasta inteira (inclusive `dados`, que tem o histórico de envios), instale o Node.js, rode `npm install`, depois `npm run conectar` e `npm run instalar-inicio`.

**Mensagens de erro técnicas demais**
→ Rode o comando com `$env:DEBUG=1;` na frente (ex.: `$env:DEBUG=1; npm run importar`) para ver todos os detalhes, e mande para quem for ajudar.

---

## 11. Privacidade e segurança

- Tudo fica **no seu computador**. Nada é enviado para servidores, exceto as próprias mensagens do WhatsApp.
- A pasta `dados\` guarda a **sessão do WhatsApp** (quem tiver essa pasta consegue usar o seu WhatsApp!), o **banco** com nomes e telefones e os **logs**. Não compartilhe essa pasta.
- As pastas `dados\` e `planilhas\` e os arquivos `.xlsx`/`.csv` (fora `exemplos\`) estão no `.gitignore`: se um dia você usar git, eles **não** vão para o repositório.
- Para desconectar o computador do seu WhatsApp: no celular, **Dispositivos conectados >** toque no dispositivo **> Desconectar**.

---

## 12. Para quem programa

- **Node.js ≥ 22.13**, ES modules. SQLite embutido (`node:sqlite`), sem compilação nativa.
- **WhatsApp:** `whatsapp-web.js` + `LocalAuth` (Chrome headless via Puppeteer). Foi escolhido em vez do **Baileys** porque emula o WhatsApp Web real num navegador, a sessão é mais estável para um usuário leigo e `getNumberId` resolve de uma vez a verificação de número (com e sem o nono dígito). O Baileys é mais leve (não usa navegador), mas quebra com mais frequência entre versões e exige mais manutenção.
- **Estrutura:**
  - `src/planejamento.js`: regras de datas (puras): `planejarLembretes` e `selecionarEnvios`.
  - `src/envio.js`: ciclo de envio (agrupamento, janela, erros, anti-duplicata).
  - `src/importacao.js`: leitura dos 3 formatos de planilha, diff na reimportação, contatos.
  - `src/telefone.js`: normalização de telefones BR.
  - `src/whatsapp.js`: conexão, trava de sessão única, novas tentativas.
  - `src/banco.js`: esquema SQLite. Tabela `lembretes` com `UNIQUE(designacao_id, tipo)`.
  - `src/comandos/*.js`: um arquivo por comando `npm run`.
- **Anti-duplicata:** cada lembrete é uma linha única por designação/tipo. Antes de enviar, o status vira `enviando`; se o processo morrer ali, ao religar vira `erro` (nunca reenvia sozinho).
- **Testes:** `npm test` (node:test) cobre datas (30d/7d/dia, tardia, pendências, expiração, janela), agrupamento, importação/diff, telefones e o ciclo de envio com um WhatsApp falso.
- **Serviço:** `scripts/rodar-servico.ps1` reinicia o processo. Códigos de saída: `0` parado de propósito, `2` precisa de QR Code (espera 10 min), `3` sessão ocupada, `1` erro (espera 1 min).
