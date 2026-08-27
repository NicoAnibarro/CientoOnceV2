$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $backendDirectory '.env'

$credential = Get-Credential -UserName 'gemini-api-key' -Message 'Pega la clave Gemini en el campo Contraseña. No modifiques el usuario.'
if (-not $credential) { throw 'Configuración cancelada.' }
$key = $credential.GetNetworkCredential().Password.Trim()
if ($key.Length -lt 20 -or $key -eq '*') { throw 'La clave ingresada no parece válida.' }

$lines = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath } else { @() }
$lines = @($lines | Where-Object { $_ -notmatch '^GEMINI_API_KEY=' })
[System.IO.File]::WriteAllLines($envPath, @($lines + "GEMINI_API_KEY=$key"), [System.Text.UTF8Encoding]::new($false))
$key = $null
Write-Host 'Clave Gemini guardada correctamente en back-end/.env.' -ForegroundColor Green
