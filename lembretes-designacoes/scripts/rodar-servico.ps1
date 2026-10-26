# Mantem o sistema de lembretes rodando em segundo plano.
# Se ele fechar (queda de internet, WhatsApp desconectou, computador acordou da suspensao, erro), religa sozinho.
# Este script e chamado pela tarefa agendada criada por "npm run instalar-inicio", que tambem confere
# a cada 10 minutos se ele esta rodando (se ja estiver, nao abre outro).
#
# So fica parado se alguem pediu "npm run parar" (arquivo dados\pausado.json) e o Windows nao foi
# reiniciado depois disso. Para ligar de novo: npm run ligar.

$pasta = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $pasta
$arquivoPausa = Join-Path $pasta 'dados\pausado.json'

function Esta-Pausado {
    if (-not (Test-Path -LiteralPath $arquivoPausa)) { return $false }
    try {
        $pausa = Get-Content -LiteralPath $arquivoPausa -Raw | ConvertFrom-Json
        $inicioWindows = [DateTimeOffset]::new((Get-CimInstance Win32_OperatingSystem).LastBootUpTime).ToUnixTimeMilliseconds()
        if ([Math]::Abs($inicioWindows - [double]$pausa.inicioDoWindows) -lt 300000) { return $true }
    }
    catch { }
    # Pausa de antes do ultimo reinicio do Windows: vale o inicio automatico de novo.
    Remove-Item -LiteralPath $arquivoPausa -ErrorAction SilentlyContinue
    return $false
}

while (-not (Esta-Pausado)) {
    & node --disable-warning=ExperimentalWarning src/comandos/iniciar.js --servico
    $codigo = $LASTEXITCODE

    if (Esta-Pausado) { break }        # parado de proposito (npm run parar)

    if ($codigo -eq 2) {
        Start-Sleep -Seconds 600       # sessao do WhatsApp desconectada: precisa "npm run conectar"
    }
    else {
        Start-Sleep -Seconds 60        # erro, queda ou volta da suspensao: tenta de novo em 1 minuto
    }
}
