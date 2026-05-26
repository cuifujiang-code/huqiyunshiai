# 华祺云师AI · Vercel 部署操作指南

本文档手把手教你把「华祺云师AI」演示版部署到 Vercel，让任何人通过网址访问。

> **说明**：当前 Vercel 部署为**纯前端静态站点**。AI 出题、学习诊断、模拟支付均使用**前端本地模拟数据**，无需 Express 后端即可完整演示。登录在无 Supabase 配置时会自动降级为本地模拟登录。

---

## 一、部署前检查清单

在推送代码前，请确认本地已通过：

```powershell
cd "e:\华祺云师AI"
npm install
npm run build
npm run dev
```

浏览器访问 http://localhost:5173 应看到全新首页，并测试：

- [ ] 首页 Hero 区两个按钮可跳转登录
- [ ] 教师登录 → AI 出题 → 生成模拟试卷
- [ ] 学生登录 → AI 诊断 → 2 秒后显示报告
- [ ] 会员中心 → 模拟支付 → 状态更新

---

## 二、GitHub 推送指南

### 2.1 前置条件

1. 已安装 [Git](https://git-scm.com/download/win)
2. 已注册 [GitHub](https://github.com) 账号
3. （推荐）已安装 [GitHub CLI](https://cli.github.com/) 或使用 GitHub 网页操作

### 2.2 若尚未创建 GitHub 仓库

**方式 A：在 GitHub 网页创建**

1. 打开 https://github.com/new
2. Repository name 填写：`huaqi-cloud-teacher-ai`（或任意名称）
3. 选择 **Public**（公开，方便 Vercel 免费部署）
4. **不要**勾选 “Add a README file”（避免与本地项目冲突）
5. 点击 **Create repository**
6. 记下仓库地址，例如：`https://github.com/你的用户名/huaqi-cloud-teacher-ai.git`

**方式 B：用 GitHub CLI 创建（在 PowerShell 中）**

```powershell
gh auth login
gh repo create huaqi-cloud-teacher-ai --public --source=. --remote=origin
```

### 2.3 在 Cursor 终端中初始化 Git 并推送

在项目根目录 `e:\华祺云师AI` 打开终端，**逐条复制执行**：

```powershell
cd "e:\华祺云师AI"
```

```powershell
git init
```

```powershell
git add .
```

```powershell
git commit -m "feat: 华祺云师AI 演示版，含首页与 Vercel 部署配置"
```

```powershell
git branch -M main
```

**将下面命令中的 `你的用户名` 和仓库名替换为你的实际地址：**

```powershell
git remote add origin https://github.com/你的用户名/huaqi-cloud-teacher-ai.git
```

```powershell
git push -u origin main
```

> 首次 push 可能弹出 GitHub 登录窗口，按提示用浏览器授权即可。

**若 remote 已存在，改用：**

```powershell
git remote set-url origin https://github.com/你的用户名/huaqi-cloud-teacher-ai.git
git push -u origin main
```

**若仓库已有内容（如 README），先拉再推：**

```powershell
git pull origin main --rebase
git push -u origin main
```

### 2.4 确保 `.env` 不会被提交

项目 `.gitignore` 应包含 `.env`。推送前可检查：

```powershell
git status
```

若看到 `.env` 出现在待提交列表中，**不要提交**，执行：

```powershell
git reset HEAD .env
```

---

## 三、Vercel 导入与部署

### 3.1 登录 Vercel

1. 打开 https://vercel.com
2. 点击 **Sign Up** 或 **Log In**
3. 选择 **Continue with GitHub**，授权 Vercel 访问你的 GitHub 仓库

### 3.2 导入项目

1. 登录后进入 Dashboard：https://vercel.com/dashboard
2. 点击 **Add New…** → **Project**
3. 在 **Import Git Repository** 列表中找到 `huaqi-cloud-teacher-ai`（或你的仓库名）
4. 若未显示，点击 **Adjust GitHub App Permissions**，给 Vercel 授权访问该仓库
5. 点击仓库右侧 **Import**

### 3.3 配置构建设置（通常保持默认）

Vercel 会自动识别为 **Vite** 项目，确认以下项：

| 配置项 | 推荐值 |
|--------|--------|
| Framework Preset | Vite |
| Root Directory | `./`（留空或根目录） |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

**直接点击 Deploy**，无需修改其他选项。

### 3.4 等待部署完成

- 首次部署通常需要 **1～3 分钟**
- 页面会显示构建日志；出现 **Congratulations!** 即表示成功
- 你会获得一个免费域名，格式类似：
  - `https://huaqi-cloud-teacher-ai.vercel.app`
  - 或 `https://huaqi-cloud-teacher-ai-你的用户名.vercel.app`

---

## 四、环境变量配置

### 4.1 进入环境变量页面

1. 打开 Vercel Dashboard → 点击你的项目
2. 顶部菜单 **Settings**
3. 左侧 **Environment Variables**

### 4.2 需要配置的变量清单

> **演示版最少配置**：即使不填任何变量，网站也能运行（本地模拟登录 + 模拟 AI 数据）。  
> 若希望使用真实 Supabase 登录，请配置以下 **VITE_** 前缀变量。

| 变量名 | 是否必填 | 说明 | 值（请自行填写） |
|--------|----------|------|------------------|
| `VITE_SUPABASE_URL` | 可选 | Supabase 项目 URL | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 可选 | Supabase anon 公钥 | `eyJhbG...` |

以下变量**仅本地 Express 后端使用**，Vercel 静态部署**不需要**配置：

| 变量名 | 说明 |
|--------|------|
| `SUPABASE_SERVICE_ROLE_KEY` | 后端 Admin API |
| `QINIUAI_API_KEY` | 七牛云 AI |
| `QINIUAI_API_URL` | 七牛 API 地址 |
| `QINIUAI_MODEL` | 模型名称 |
| `PORT` | 本地后端端口 |

### 4.3 添加变量的步骤

1. **Key** 输入：`VITE_SUPABASE_URL`
2. **Value** 粘贴你的 Supabase URL
3. **Environment** 勾选：Production、Preview、Development
4. 点击 **Save**
5. 同样方式添加 `VITE_SUPABASE_ANON_KEY`

### 4.4 重新部署

环境变量修改后**必须重新部署**才会生效：

1. 进入项目 → **Deployments** 标签
2. 最新一次部署右侧 **⋯** → **Redeploy**
3. 勾选 **Use existing Build Cache**（可选）→ **Redeploy**
4. 等待 1～2 分钟

---

## 五、自定义域名（可选）

### 5.1 Vercel 免费域名格式

- 默认：`https://<项目名>.vercel.app`
- 带用户名：`https://<项目名>-<github用户名>.vercel.app`
- 每次 push 到 main 还会产生 Preview URL：`https://<项目名>-<hash>.vercel.app`

### 5.2 绑定自己的域名

1. 项目 → **Settings** → **Domains**
2. 输入你的域名，如 `www.example.com`
3. 按 Vercel 提示在域名 DNS 服务商处添加记录：
   - **A 记录** 指向 `76.76.21.21`，或
   - **CNAME** 指向 `cname.vercel-dns.com`
4. 等待 DNS 生效（几分钟到 48 小时）
5. Vercel 会自动申请 HTTPS 证书

---

## 六、部署后验证清单

部署完成后，用**无痕窗口**打开你的 Vercel 网址，按顺序测试：

### 6.1 首页

- [ ] 打开 `https://你的域名.vercel.app/`
- [ ] 看到标题「华祺云师AI · 智能教学工具箱」
- [ ] 点击「我是教师，开始使用」→ 跳转登录页且角色为教师
- [ ] 返回首页，点击「我是学生，查看诊断」→ 登录页角色为学生
- [ ] 滚动到「价格方案」，四个方案卡片正常显示

### 6.2 登录

- [ ] 输入任意 11 位手机号（如 `13800138000`）
- [ ] 点击「发送验证码」，输入 `123456`
- [ ] 点击「确认登录」→ 进入对应工作台

### 6.3 教师 · AI 出题

- [ ] 进入教师工作台
- [ ] 点击「生成试卷」→ 约 1 秒后显示 20 题模拟试卷
- [ ] 尝试导出 PDF、保存题库
- [ ] 点击「会员中心」→ 模拟订阅年度方案 → 支付成功

### 6.4 学生 · AI 诊断

- [ ] 退出后用学生身份登录
- [ ] 进入 AI 学习诊断 →「开始智能诊断」
- [ ] 2 秒加载后显示完整 6 模块诊断报告
- [ ] 第二次诊断（免费额度用完后）应提示前往会员中心

### 6.5 路由与刷新

- [ ] 直接访问 `/login`、`/member-center`（需登录）不报错
- [ ] 在子页面按 F5 刷新，不出现 404（依赖 `vercel.json` SPA 重写）

---

## 七、常见问题

### Q1：构建失败 `缺少 Supabase 环境变量`

已修复：未配置 Supabase 时会自动使用本地模拟模式。若仍失败，在 Vercel 配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 后 Redeploy。

### Q2：刷新页面 404

确认项目根目录存在 `vercel.json`，内容为 SPA 重写规则，并已 push 到 GitHub 后重新部署。

### Q3：API 请求失败

Vercel 静态部署不含 Express 后端。出题与诊断已自动降级为**前端模拟数据**，属正常现象，不影响演示。

### Q4：如何更新线上网站

本地修改代码后：

```powershell
git add .
git commit -m "描述你的修改"
git push
```

Vercel 会自动触发新部署，约 1～3 分钟生效。

---

## 八、项目文件说明

| 文件 | 作用 |
|------|------|
| `vercel.json` | SPA 路由重写，防止刷新 404 |
| `.env.example` | 环境变量模板，不含真实密钥 |
| `src/pages/HomePage.tsx` | 正式产品首页 |
| `src/data/mockExamData.ts` | 前端模拟试卷 |
| `src/data/mockDiagnosisReport.ts` | 前端模拟诊断报告 |

---

**部署完成后，把 Vercel 提供的 URL 分享给任何人即可访问演示版。**

如有问题，可在 Cursor 中继续让 AI 助手协助排查构建日志。
