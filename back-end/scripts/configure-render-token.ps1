$ErrorActionPreference = 'Stop'
$secureToken = Read-Host 'Pega el token de Render' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
  if ($token.Length -lt 20) {
    throw 'El token ingresado parece incompleto.'
  }
  $target = Join-Path $PSScriptRoot '..\.render-token'
  [IO.File]::WriteAllText($target, $token, [Text.UTF8Encoding]::new($false))
  Write-Host 'Token de Render guardado localmente. No se mostro ni se subira a Git.' -ForegroundColor Green
} finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $token = $null
}
