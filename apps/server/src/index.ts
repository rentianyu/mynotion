import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, sqliteVersion } from "./db.ts";
import { migrate } from "./db/migrate.ts";
import { loadToken } from "./lib/token.ts";
import { authMiddleware, loginRoute } from "./middleware/auth.ts";
import { pagesRoute } from "./routes/pages.ts";
import { trashRoute } from "./routes/trash.ts";
import { searchRoute } from "./routes/search.ts";
import { databasesRoute } from "./routes/databases.ts";

migrate();

const app = new Hono();

// 在一次性 :memory: 库上算好，避免每次请求都建临时表导致重名失败。
function probeCapabilities() {
  const p = new DatabaseSync(":memory:");
  const tryExec = (sql: string): boolean => {
    try {
      p.exec(sql);
      return true;
    } catch {
      return false;
    }
  };
  const caps = {
    fts5: tryExec("CREATE VIRTUAL TABLE _p1 USING fts5(body)"),
    fts5Trigram: tryExec(`CREATE VIRTUAL TABLE _p2 USING fts5(body, tokenize="trigram")`),
    json1: (p.prepare(`SELECT json_extract('{"a":5}','$.a') AS v`).get() as { v: number }).v === 5,
    wal: (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode === "wal",
  };
  p.close();
  return caps;
}

const capabilities = probeCapabilities();

// 默认只监听回环；HOST=0.0.0.0（或某个网卡地址）才对外，届时非本机请求必须凭 token。
const hostname = process.env.HOST ?? "127.0.0.1";
const token = loadToken();

app.use("*", authMiddleware(token));
app.get("/login", loginRoute(token));

app.route("/api", pagesRoute);
app.route("/api", trashRoute);
app.route("/api", searchRoute);
app.route("/api", databasesRoute);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    sqliteVersion: sqliteVersion(),
    capabilities,
    dbPath: process.env.DATA_FILE ?? "data/mynotion.db",
  }),
);

const port = Number(process.env.PORT ?? 8791);

// 生产单进程：vite build 后用 serveStatic 托管前端产物，同源无 CORS。
// dev 期 apps/web/dist 不存在 → 跳过，前端由 vite dev server 提供。
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");
if (existsSync(webDist)) {
  app.use("*", serveStatic({ root: webDist }));
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api")) return c.notFound();
    const idx = path.join(webDist, "index.html");
    return existsSync(idx) ? c.html(readFileSync(idx, "utf8")) : c.notFound();
  });
  console.log(`serving static from ${webDist}`);
}

serve({ fetch: app.fetch, port, hostname }, (info) => {
  const shown = hostname === "0.0.0.0" || hostname === "::" ? "127.0.0.1" : hostname;
  console.log(`server listening on http://${shown}:${info.port}`);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    console.log(`局域网访问需带凭证：pnpm share`);
  }
});
