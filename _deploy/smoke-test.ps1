# =============================================================================
# 华祺云师AI · 部署冒烟测试（PowerShell 一键执行）
# 用法：修改下方 3 个变量后，在 PowerShell 中执行：
#   Set-Location "e:\华祺云师AI\_deploy"
#   .\smoke-test.ps1
# =============================================================================

$TeacherApiBase = "https://api.huqiyunshiai.online"
$MainSiteBase   = "https://huqiyunshiai.online"   # 改成你的主站域名
$StudentUserId  = "00000000-0000-0000-0000-000000000000"  # 改成 Supabase 学生用户 UUID
$PlanId         = "demo-plan-1"                  # 规划进度测试用，可随意字符串

function Test-Api {
  param([string]$Name, [string]$Method, [string]$Url, [hashtable]$Body = $null)
  try {
    $params = @{ Method = $Method; Uri = $Url; TimeoutSec = 60 }
    if ($Body) {
      $params.ContentType = "application/json"
      $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    $r = Invoke-RestMethod @params
    $ok = $r.success -eq $true -or $r.status -eq "ok" -or $r.checks
    if ($ok) { Write-Host "[OK] $Name" -ForegroundColor Green }
    else { Write-Host "[??] $Name" -ForegroundColor Yellow; $r | ConvertTo-Json -Depth 3 }
    return $ok
  } catch {
    Write-Host "[FAIL] $Name — $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

Write-Host "`n=== teacher-api ($TeacherApiBase) ===" -ForegroundColor Cyan

Test-Api "batch health" GET "$TeacherApiBase/api/batch/health"
Test-Api "diagnosis-history" GET "$TeacherApiBase/api/student/diagnosis-history?userId=$StudentUserId&subject=物理&limit=5"
Test-Api "class-comparison" GET "$TeacherApiBase/api/student/class-comparison?userId=$StudentUserId&subject=物理"
Test-Api "planning-progress GET" GET "$TeacherApiBase/api/student/planning-progress?planId=$PlanId&userId=$StudentUserId"
Test-Api "planning-progress POST" POST "$TeacherApiBase/api/student/planning-progress" @{
  planId = $PlanId
  userId = $StudentUserId
  phaseIndex = 0
  taskIndex = 0
  taskKey = "0-0"
  taskName = "冒烟测试任务"
  completed = $true
}

Write-Host "`n=== 主站 ($MainSiteBase) ===" -ForegroundColor Cyan

Test-Api "photo-search history" GET "$MainSiteBase/api/student/photo-search-history?userId=$StudentUserId"

Write-Host "`n完成。若 StudentUserId 仍为占位 UUID，部分接口返回空数据属正常。" -ForegroundColor Gray
Write-Host "拍照搜题 POST 需上传图片，请在前端 /student/photo-search 手动测。" -ForegroundColor Gray
