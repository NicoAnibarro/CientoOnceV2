$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "No se encontro el archivo .env del backend."
}

$gmail = (Read-Host 'Cuenta de Gmail que enviara los correos').Trim().ToLowerInvariant()
if ($gmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
  throw 'La direccion de correo no es valida.'
}

$securePassword = Read-Host 'Contrasena de aplicacion de Google (16 caracteres)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $appPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer).Replace(' ', '')
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

if ($appPassword.Length -ne 16) {
  throw 'La contrasena de aplicacion debe tener 16 caracteres, sin espacios.'
}

$settings = [ordered]@{
  REQUIRE_EMAIL_VERIFICATION = 'true'
  SMTP_HOST = 'smtp.gmail.com'
  SMTP_PORT = '465'
  SMTP_SECURE = 'true'
  SMTP_USER = $gmail
  SMTP_PASS = $appPassword
  MAIL_FROM = "Ciento Once <$gmail>"
  PUBLIC_API_URL = 'http://192.168.1.11:3000/api'
}

$lines = [Collections.Generic.List[string]](Get-Content -LiteralPath $envPath)
foreach ($entry in $settings.GetEnumerator()) {
  $prefix = "$($entry.Key)="
  $replacement = "$prefix$($entry.Value)"
  $found = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index].StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
      $lines[$index] = $replacement
      $found = $true
      break
    }
  }
  if (-not $found) { $lines.Add($replacement) }
}

[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
Write-Host 'Configuracion de Gmail guardada de forma local. La clave no fue mostrada.' -ForegroundColor Green
