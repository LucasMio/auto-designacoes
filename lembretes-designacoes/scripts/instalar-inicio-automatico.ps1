# Cria uma tarefa no Agendador de Tarefas do Windows que liga o sistema
# automaticamente sempre que voce entra no Windows (e o mantem rodando escondido).

$nomeTarefa = 'Lembretes de Designacoes'
$pasta = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'rodar-servico.ps1'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERRO: Node.js nao encontrado. Instale o Node.js antes (veja o README).' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $pasta 'dados\sessao-whatsapp'))) {
    Write-Host 'ATENCAO: o WhatsApp ainda nao foi conectado. Rode primeiro: npm run conectar' -ForegroundColor Yellow
    exit 1
}

# "conhost --headless" abre o PowerShell sem janela nenhuma. So com "-WindowStyle Hidden" a janela preta
# piscava na tela; se alguem a fechasse no X, o sistema caia e voltava 10 minutos depois.
$acao = New-ScheduledTaskAction -Execute 'conhost.exe' `
    -Argument ('--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script) `
    -WorkingDirectory $pasta
# Liga ao entrar no Windows e confere a cada 10 minutos (se ja estiver rodando, nao abre outro):
# assim ele volta sozinho depois de suspensao, queda ou erro.
$aoEntrar = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$aCada10Min = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10)
$gatilho = @($aoEntrar, $aCada10Min)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

try {
    Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilho -Settings $ajustes -Principal $principal `
        -Description 'Envia lembretes de designacoes pelo WhatsApp' -Force -ErrorAction Stop | Out-Null
}
catch {
    Write-Host "ERRO ao criar a tarefa: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Tente de novo abrindo o PowerShell como Administrador (clique com o botao direito > Executar como administrador).' -ForegroundColor Yellow
    exit 1
}

Start-ScheduledTask -TaskName $nomeTarefa
Write-Host ''
Write-Host 'OK! Inicio automatico instalado.' -ForegroundColor Green
Write-Host 'O sistema ja foi ligado em segundo plano e vai ligar sozinho sempre que voce entrar no Windows.'
Write-Host 'Para acompanhar: npm run log     Para parar: npm run parar'
