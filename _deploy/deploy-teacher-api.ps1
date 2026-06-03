# teacher-api 生产部署（需已安装 vercel CLI 并 vercel login）
Set-Location "$PSScriptRoot\..\teacher-api"
Write-Host "Deploying teacher-api from: $(Get-Location)" -ForegroundColor Cyan
vercel --prod
if ($LASTEXITCODE -eq 0) {
  Write-Host "`n部署完成。请执行: ..\_deploy\smoke-test.ps1" -ForegroundColor Green
}
