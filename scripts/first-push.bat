@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set REMOTE=https://github.com/cuifujiang-code/huqiyunshiai.git

echo ========================================
echo  华祺云师AI - 推送到 GitHub
echo  仓库: %REMOTE%
echo ========================================
echo.

if not exist ".git" (
  echo [1] 初始化 Git...
  git init
  git branch -M main
) else (
  echo [1] Git 仓库已存在
)

echo [2] git add .
git add .

echo [3] git commit
git commit -m "首次部署：华祺云师AI v1.0"
if errorlevel 1 echo （若无新改动会提示 nothing to commit，可继续）

echo [4] 设置远程仓库
git remote remove origin 2>nul
git remote add origin %REMOTE%

echo [5] git push -u origin main
git push -u origin main

if errorlevel 1 (
  echo.
  echo 推送失败时，请在本机终端手动执行：
  echo   cd /d "e:\华祺云师AI"
  echo   git remote add origin %REMOTE%
  echo   git push -u origin main
) else (
  echo.
  echo 推送成功！下一步：打开 https://vercel.com 导入 huqiyunshiai 仓库并 Deploy
)

pause
