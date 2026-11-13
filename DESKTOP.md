# 桌面版（Windows exe）

把 MyNotion 装成 Windows 上的一个桌面程序：双击图标就有窗口，不用开浏览器、不用装 Node、不用敲命令。

## 装什么

| 产物 | 用途 |
| --- | --- |
| `MyNotion_1.0.0_x64-setup.exe` | 安装版，双击安装（当前用户，不需要管理员），出现快捷方式 |
| `MyNotion_1.0.0_portable.zip` | 便携版，解压后直接双击 `mynotion.exe`，不写注册表 |

下载渠道：

- GitHub Releases：`https://github.com/rentianyu/mynotion/releases/latest`
- 国内镜像（只有安装版）：`https://f.xbta.cc/mynotion/MyNotion_1.0.0_x64-setup.exe`

首次启动会显示启动页，等后端就绪后自动切到应用界面。

| 项目 | 位置 |
| --- | --- |
| 笔记数据 | `%APPDATA%\MyNotion\mynotion.db`（含 `-wal` / `-shm`） |
| 访问凭证 | `%APPDATA%\MyNotion\token` |
| 后端日志 | `%APPDATA%\MyNotion\logs\server.log` |

迁移到另一台电脑：退出程序后把整个 `%APPDATA%\MyNotion` 目录拷过去即可。

## 打包原理

```
Tauri 壳 (mynotion.exe，WebView2)
   │  ① 找一个空闲端口
   │  ② 起随包分发的 bin\mynotion-server.exe
   │      （Node 24 + 后端 bundle，通过 Node SEA 打成单文件，自带运行时）
   │  ③ 轮询 /api/health，就绪后把窗口从启动页导航到 http://127.0.0.1:<port>/
   └─ ④ 退出时结束子进程
```

- 后端：`tools/build-server.mjs` 用 esbuild 把 `apps/server` 打成单文件 CJS，`schema.sql` 以 banner 方式内嵌；随后用 Node 的 **SEA（Single Executable Applications）** 把 bundle 注入 `node.exe`，产出 `mynotion-server.exe`。所以目标机器不需要安装 Node。
- 前端：`pnpm build` 产出 `apps/web/dist`，作为 Tauri resource 装到 `<安装目录>\web\`，由后端 `serveStatic` 托管（同源，无 CORS）。
- 数据位置由环境变量 `DATA_DIR` / `DATA_FILE` / `TOKEN_FILE` / `WEB_DIST` 显式传给后端，不依赖 exe 所在目录的源码结构。

## 相对上游的改动

为让后端能在「没有源码目录」的环境里跑，改动很小、都在读路径这一步：

| 文件 | 改动 |
| --- | --- |
| `apps/server/src/index.ts` | 前端产物目录支持 `WEB_DIST`，未设置时仍按原逻辑找 `../../web/dist` |
| `apps/server/src/db.ts` | 数据目录支持 `DATA_DIR`，未设置时仍等价于 `<cwd>/data` |
| `apps/server/src/lib/token.ts` | token 路径跟随 `DATA_DIR`，仍支持 `TOKEN_FILE` |
| `apps/server/src/db/migrate.ts` | 优先读 `globalThis.__MYNOTION_SCHEMA_SQL__`（打包时注入），回退到读 `schema.sql` |

以上都不改变 `pnpm dev` / `pnpm serve` 的原有用法。

## 自己构建

需要 Windows（Tauri 的 NSIS 打包与 WebView2 都是 Windows 侧工具）。推荐直接跑 CI：

```powershell
# 在 Windows 上一键（需要 Node 24、pnpm 12、Rust 工具链、Tauri CLI）
pnpm install
pnpm build
node tools/build-server.mjs
node --experimental-sea-config .stage/sea-config.json

mkdir src-tauri\bin, src-tauri\web
copy (Get-Command node).Source src-tauri\bin\mynotion-server.exe
# 注入前先移除 node.exe 的 Authenticode 签名
signtool remove /s src-tauri\bin\mynotion-server.exe
npx postject src-tauri\bin\mynotion-server.exe NODE_SEA_BLOB .stage\server.blob `
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
xcopy /E /Y apps\web\dist\* src-tauri\web\

cd src-tauri
tauri build       # 产物：target\release\bundle\nsis\*.exe
```

CI 见 `.github/workflows/build-windows.yml`：它会先在 `windows-latest` 上跑一次后端冒烟测试（起 `mynotion-server.exe` 打 `/api/health`），通过后才编 Tauri。

## 已知限制

- 只出 x64 安装包，未签名 —— 首次运行 SmartScreen 会提示「更多信息 → 仍要运行」。
- 依赖系统 WebView2（Windows 11 自带；Windows 10 由安装包内置的引导器补装）。
- 单实例：重复打开会聚焦已有窗口（`tauri-plugin-single-instance`），避免两个进程同时写同一个 SQLite 文件。
- 局域网共享（`pnpm share`）仍需在命令行里跑，桌面壳只覆盖本机单用户场景。
