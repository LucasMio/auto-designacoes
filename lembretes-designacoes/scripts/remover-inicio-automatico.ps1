# Remove a tarefa agendada que liga o sistema junto com o Windows.

$nomeTarefa = 'Lembretes de Designacoes'
$pasta = Split-Path -Parent $PSScriptRoot

if (-not (Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue)) {
    Write-Host 'O inicio automatico nao esta instalado.'
    exit 0
}

Stop-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $nomeTarefa -Confirm:$false

# Pede para o sistema que estava rodando encerrar tambem.
Set-Location -LiteralPath $pasta
& node --disable-warning=ExperimentalWarning src/comandos/parar.js

Write-Host 'Inicio automatico removido.' -ForegroundColor Green
