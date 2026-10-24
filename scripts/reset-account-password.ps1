param(
  [Parameter(Mandatory = $true)]
  [Guid] $UserId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[^\s@]+@[^\s@]+\.[^\s@]+$')]
  [string] $Email,

  [string] $ProjectRef = 'vpkhriywprepuhrbarye',

  [Security.SecureString] $NewPassword
)

$ErrorActionPreference = 'Stop'

function ConvertFrom-SecureText([Security.SecureString] $Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$keyJson = & npx --yes supabase projects api-keys --project-ref $ProjectRef --output-format json
if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI chưa đăng nhập hoặc không có quyền quản lý project.' }
$keys = $keyJson | ConvertFrom-Json
$serviceKey = ($keys.keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
if (-not $serviceKey) { throw 'Không lấy được khóa quản trị từ Supabase CLI.' }

$baseUrl = "https://$ProjectRef.supabase.co/auth/v1/admin/users/$UserId"
$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
try {
  $account = Invoke-RestMethod -Method Get -Uri $baseUrl -Headers $headers
} catch {
  throw 'Không đọc được tài khoản trong project Supabase. Kiểm tra UserId và quyền truy cập.'
}
if ($account.email -ine $Email) { throw 'Email không khớp với UserId. Mật khẩu chưa thay đổi.' }
if (-not $account.email_confirmed_at) { throw 'Tài khoản chưa xác nhận email. Mật khẩu chưa thay đổi.' }

Write-Output "Đặt lại mật khẩu cho $Email trong project $ProjectRef."
if (-not $NewPassword) {
  $NewPassword = Read-Host 'Mật khẩu mới (ký tự nhập sẽ không hiện)' -AsSecureString
  $confirmation = Read-Host 'Nhập lại mật khẩu mới' -AsSecureString
}

$plainPassword = $null
$plainConfirmation = $null
$body = $null
try {
  $plainPassword = ConvertFrom-SecureText $NewPassword
  if ($plainPassword.Length -lt 8) { throw 'Mật khẩu cần ít nhất 8 ký tự. Mật khẩu chưa thay đổi.' }
  if ($confirmation) {
    $plainConfirmation = ConvertFrom-SecureText $confirmation
    if ($plainPassword -cne $plainConfirmation) { throw 'Hai lần nhập mật khẩu không khớp. Mật khẩu chưa thay đổi.' }
  }
  $body = @{ password = $plainPassword } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Method Put -Uri $baseUrl -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
  } catch {
    throw 'Supabase không cập nhật được mật khẩu. Kiểm tra chính sách mật khẩu và thử lại.'
  }
  Write-Output 'Đã cập nhật mật khẩu. Hãy đăng nhập trên website bằng mật khẩu mới.'
} finally {
  $plainPassword = $null
  $plainConfirmation = $null
  $body = $null
  $serviceKey = $null
}
