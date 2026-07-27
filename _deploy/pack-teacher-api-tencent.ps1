# 打包 teacher-api 腾讯云部署包（含 server/paperRoute.js、_scripts 等完整文件）
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'teacher-api'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$out = Join-Path $root "teacher-api-full-deploy-$stamp.tar.gz"

if (-not (Test-Path $src)) { throw "teacher-api 目录不存在: $src" }

$required = @(
  'server.js',
  'server/paperRoute.js',
  'server/teacher/docxImportService.js',
  'server/teacher/bookDocxClean.js',
  'server/teacher/bookDocxPreprocess.js',
  'server/teacher/ommlToLatex.js',
  'server/teacher/wmfConvert.js',
  'api/teacher/book/docx-import.js',
  'api/teacher/book/docx-clean-chapters.js',
  '_scripts/wmf_batch_to_png.py',
  '.npmrc',
  'install-production.sh',
  'DEPLOY_VERSION.txt'
)
foreach ($rel in $required) {
  $p = Join-Path $src $rel
  if (-not (Test-Path $p)) { throw "缺少部署必需文件: $rel" }
}

$pkg = Get-Content (Join-Path $src 'package.json') -Raw | ConvertFrom-Json
foreach ($dep in @('omml2mathml', 'mathml-to-latex', 'mammoth', 'adm-zip')) {
  if (-not ($pkg.dependencies.PSObject.Properties.Name -contains $dep)) {
    throw "package.json 缺少依赖: $dep"
  }
}

Push-Location $src
try {
  if (Get-Command tar -ErrorAction SilentlyContinue) {
    tar -czf $out --exclude=node_modules --exclude=.env.local --exclude=.git .
    Write-Host "已生成: $out" -ForegroundColor Green
  } else {
    throw '未找到 tar 命令，请安装 Git Bash 或使用 WSL'
  }
} finally {
  Pop-Location
}

Write-Host @"

部署到腾讯云:
  scp $out root@<服务器IP>:/root/
  ssh root@<服务器IP> "cd /var/teacher-api && tar -xzf /root/$(Split-Path $out -Leaf) && bash install-production.sh"

"@ -ForegroundColor Cyan
