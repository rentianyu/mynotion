/**
 * 一键启动：确保 MyNotion 的 API 服务（8791）和前端（5173）在跑，就绪后打开浏览器。
 * 已在运行的服务直接复用，不会重复启动；关闭窗口 / Ctrl+C 只停本次启动的进程。
 * 用法：node scripts/launch.mjs [--no-open]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SERVER_PORT = 8791;
const WEB_PORT = 5173;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/api/health`;
const OPEN_BROWSER = !process.argv.includes("--no-open");

const started = [];
let shuttingDown = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 复用已有服务时停住窗口，避免双击后一闪而过；无终端（自动化）环境直接跳过。 */
function waitForEnter(message) {
  if (!process.stdin.isTTY) return Promise.resolve();
  return new Promise((resolve) => {
    process.stdout.write(message);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    const done = (open) => {
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(400);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

function fetchText(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(res.statusCode && res.statusCode < 500 ? body : null));
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

async function serverReady() {
  const body = await fetchText(HEALTH_URL);
  if (!body) return false;
  try {
    return JSON.parse(body).ok === true;
  } catch {
    return false;
  }
}

async function webReady() {
  const html = await fetchText(WEB_URL);
  return !!html && html.includes('id="root"');
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(300);
  }
  throw new Error(`${label}在 ${Math.round(timeoutMs / 1000)} 秒内没有就绪`);
}

function track(child, label) {
  started.push(child);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(`\n[${label}] 已退出（code=${code ?? "?"}）。`);
    if (started.every((c) => c.exitCode !== null || c.signalCode !== null)) process.exit(0);
  });
}

function startServer() {
  track(
    spawn(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", "--watch", path.join(ROOT, "apps/server/src/index.ts")],
      { cwd: ROOT, stdio: "inherit" },
    ),
    "数据库服务",
  );
}

function startWeb() {
  const viteBin = path.join(ROOT, "apps/web/node_modules/vite/bin/vite.js");
  if (!existsSync(viteBin)) throw new Error("未找到 vite：请先在项目根目录运行 pnpm install");
  track(
    spawn(process.execPath, [viteBin, "--strictPort"], {
      cwd: path.join(ROOT, "apps/web"),
      stdio: "inherit",
    }),
    "前端页面",
  );
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", windowsHide: true });
  } else {
    spawn("xdg-open", [url], { stdio: "ignore" });
  }
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of started) {
    if (c.exitCode !== null || c.signalCode !== null || !c.pid) continue;
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      try {
        c.kill("SIGTERM");
      } catch {
        /* 已退出 */
      }
    }
  }
  const tail = started.length > 0 ? "，已停止本次启动的服务" : "";
  console.log(`\n${reason}${tail}。`);
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", () => shutdown("收到 Ctrl+C"));
process.on("SIGBREAK", () => shutdown("收到 Ctrl+C"));

/** 端口已被占用时给一点宽限：可能是同一次启动的服务还在起，等它就绪再判定。 */
async function detectExisting(readyFn, label, port) {
  console.log(`· 检测到 ${port} 端口已被占用，确认是否为${label}…`);
  try {
    await waitFor(readyFn, 6000, label);
    return true;
  } catch {
    return false;
  }
}

console.log("MyNotion 启动器\n");

if (await portOpen(SERVER_PORT)) {
  if (!(await detectExisting(serverReady, "数据库服务", SERVER_PORT))) {
    console.error(`端口 ${SERVER_PORT} 被其他程序占用（不是 MyNotion 服务），已停止。`);
    process.exit(1);
  }
  console.log(`· 数据库服务已在运行（${SERVER_PORT}），复用`);
} else {
  console.log(`· 启动数据库服务（${SERVER_PORT}）…`);
  startServer();
  try {
    await waitFor(serverReady, 20000, "数据库服务");
  } catch (err) {
    console.error(String(err.message ?? err));
    shutdown("启动失败");
    await sleep(600);
    process.exit(1);
  }
}

if (await portOpen(WEB_PORT)) {
  if (!(await detectExisting(webReady, "前端页面", WEB_PORT))) {
    console.error(`端口 ${WEB_PORT} 被其他程序占用（不是 MyNotion 页面），已停止。`);
    shutdown("端口冲突");
    await sleep(600);
    process.exit(1);
  }
  console.log(`· 前端页面已在运行（${WEB_PORT}），复用`);
} else {
  console.log(`· 启动前端页面（${WEB_PORT}）…`);
  try {
    startWeb();
  } catch (err) {
    console.error(String(err.message ?? err));
    shutdown("启动失败");
    await sleep(600);
    process.exit(1);
  }
  try {
    await waitFor(webReady, 30000, "前端页面");
  } catch (err) {
    console.error(String(err.message ?? err));
    shutdown("启动失败");
    await sleep(600);
    process.exit(1);
  }
}

if (OPEN_BROWSER) {
  openBrowser(WEB_URL);
  console.log(`· 已在浏览器打开 ${WEB_URL}`);
}

if (started.length === 0) {
  console.log("\nMyNotion 已在运行，无需重复启动。");
  await waitForEnter("按回车键关闭此窗口（服务会继续运行）。");
  process.exit(0);
}
console.log("\n启动完成。关闭此窗口或按 Ctrl+C 停止本次启动的服务。");
