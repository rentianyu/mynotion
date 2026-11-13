#!/usr/bin/env node
/**
 * 把 apps/server 打包成单文件 CJS（.stage/server.cjs），供 Node SEA 打包成 mynotion-server.exe。
 * 前端产物（apps/web/dist）不打进 bundle，运行时通过 WEB_DIST 指向安装目录下的 web/。
 */
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "apps/web/dist");
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("[build-server] 缺少 apps/web/dist/index.html，先跑 pnpm build");
  process.exit(1);
}

const schemaSql = readFileSync(path.join(root, "apps/server/src/db/schema.sql"), "utf8");

const stage = path.join(root, ".stage");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

await build({
  entryPoints: [path.join(root, "apps/server/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile: path.join(stage, "server.cjs"),
  // SEA 里没有可信的 import.meta.url；运行时一律走环境变量（DATA_DIR / TOKEN_FILE / WEB_DIST）。
  define: { "import.meta.url": '"file:///__sea__/"' },
  // schema.sql 在这里内嵌，sealed exe 里不需要伴随文件。
  banner: { js: `globalThis.__MYNOTION_SCHEMA_SQL__ = ${JSON.stringify(schemaSql)};` },
  legalComments: "none",
  logLevel: "info",
});

writeFileSync(
  path.join(stage, "sea-config.json"),
  `${JSON.stringify(
    {
      main: path.join(stage, "server.cjs"),
      output: path.join(stage, "server.blob"),
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  )}\n`,
);
console.log("[build-server] 完成：.stage/server.cjs + .stage/sea-config.json");
