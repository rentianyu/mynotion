#!/usr/bin/env node
/**
 * 后端冒烟测试：拉起 .stage/server.cjs（源码 bundle）与 SEA 版 mynotion-server.exe，
 * 轮询 /api/health，失败时把子进程的 stdout/stderr 原样打出来。
 *
 * 用法：
 *   node tools/smoke.mjs                       # 只测 bundle（跨平台）
 *   node tools/smoke.mjs --exe src-tauri/bin/mynotion-server.exe   # 再测 SEA exe
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "..");
const webDist = path.join(root, "src-tauri/web");
const exeArg = process.argv.indexOf("--exe");
const exePath = exeArg > -1 ? path.resolve(root, process.argv[exeArg + 1]) : null;

async function health(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function run(label, command, args, port) {
  console.log(`\n======== ${label} ========`);
  console.log(`$ ${command} ${args.join(" ")}`);
  const dataDir = path.join(root, `.smoke-data-${port}`);
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });

  let out = "";
  let err = "";
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDir,
      DATA_FILE: path.join(dataDir, "mynotion.db"),
      TOKEN_FILE: path.join(dataDir, "token"),
      WEB_DIST: webDist,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (err += b));

  let exited = null;
  child.on("exit", (code, signal) => (exited = { code, signal }));

  let info = null;
  let indexOk = false;
  let indexNote = "";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await sleep(400);
    if (exited) break;
    info = await health(port);
    if (info) break;
  }

  if (info) {
    // 顺带确认前端产物真的由后端托管（必须在结束子进程之前做）
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) });
      const html = await res.text();
      indexOk = res.ok && html.includes('id="root"');
      indexNote = `${res.status}, ${html.length} bytes, has #root=${html.includes('id="root"')}`;
    } catch (e) {
      indexNote = e.message;
    }
  }

  if (!exited) {
    child.kill();
    await sleep(300);
  }

  const tail = (s) => (s.trim() ? s.trim().split("\n").slice(-15).join("\n") : "(空)");
  if (info) {
    console.log(`OK health: ${JSON.stringify(info)}`);
    console.log(`${indexOk ? "OK" : "FAIL"} index: ${indexNote}`);
    return indexOk;
  }

  console.log(`FAIL 进程退出: ${JSON.stringify(exited)}`);
  console.log(`--- stdout ---\n${tail(out)}`);
  console.log(`--- stderr ---\n${tail(err)}`);
  return false;
}

if (!existsSync(path.join(webDist, "index.html"))) {
  console.error(`缺少 ${webDist}/index.html`);
  process.exit(1);
}

let ok = await run("A: node + .stage/server.cjs", process.execPath, [path.join(root, ".stage/server.cjs")], 18891);
if (exePath) {
  if (!existsSync(exePath)) {
    console.error(`找不到 ${exePath}`);
    process.exit(1);
  }
  ok = (await run("B: SEA exe", exePath, [], 18892)) && ok;
}

console.log(ok ? "\nSMOKE PASS" : "\nSMOKE FAIL");
process.exit(ok ? 0 : 1);
