import os from "node:os";
import { getConnInfo } from "@hono/node-server/conninfo";
import { getCookie, setCookie } from "hono/cookie";
import type { Context, Handler, MiddlewareHandler } from "hono";
import { COOKIE_NAME, verifyToken } from "../lib/token.ts";

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "[localhost]"]);
// 构建产物本身没有秘密：登录页要能独立渲染，静态资源不能一起挡。
const ASSET = /\.(?:js|css|map|svg|png|jpe?g|gif|webp|ico|woff2?|txt|xml|webmanifest)$/i;

function hostOf(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
  const colon = value.lastIndexOf(":");
  return colon > 0 ? value.slice(0, colon) : value;
}

function localAddresses(): Set<string> {
  const out = new Set<string>();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) out.add(net.address);
  }
  return out;
}

const OWN_ADDRESSES = localAddresses();

/**
 * 「本机请求」= 连接确实来自回环 且 Host 是本机自称。
 * 只查前一条会被 DNS rebinding 绕过：恶意页面把域名重新解析到 127.0.0.1，
 * 浏览器随后发出的连接对端就是回环，但 Host 仍是那个外域。
 */
export function isLocalRequest(c: Context): boolean {
  const remote = getConnInfo(c).remote?.address;
  if (!remote || !LOOPBACK_IPS.has(remote)) return false;
  const host = hostOf(c.req.header("host") ?? "");
  return LOOPBACK_HOSTS.has(host) || OWN_ADDRESSES.has(host);
}

function loginPage(error?: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MyNotion 访问验证</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f6f3;
             font-family: ui-sans-serif, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; color: #37352f; }
      main { width: min(420px, 90vw); background: #fff; border: 1px solid rgba(55,53,47,.12);
             border-radius: 8px; padding: 28px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
      h1 { font-size: 19px; margin: 0 0 6px; }
      p { font-size: 13px; line-height: 1.6; color: rgba(55,53,47,.65); margin: 0 0 16px; }
      input { width: 100%; padding: 9px 11px; font-size: 15px; font-family: inherit;
              border: 1px solid rgba(55,53,47,.24); border-radius: 5px; box-sizing: border-box; }
      button { margin-top: 12px; width: 100%; padding: 9px; font-size: 14px; font-family: inherit;
               border: none; border-radius: 5px; background: #2383e2; color: #fff; cursor: pointer; }
      .err { color: #eb5757; font-size: 13px; margin: 0 0 10px; }
    </style>
  </head>
  <body>
    <main>
      <h1>MyNotion 访问验证</h1>
      ${error ? `<p class="err">${error}</p>` : ""}
      <p>这不是公网服务，凭证由提供这台机器的用户在本地生成：
         在 MyNotion 所在机器上运行 <code>pnpm share</code>，把输出的凭证填进来。</p>
      <form method="get" action="/login">
        <input name="token" autofocus autocomplete="off" spellcheck="false" placeholder="访问凭证" />
        <button type="submit">进入</button>
      </form>
    </main>
  </body>
</html>`;
}

export function authMiddleware(token: string): MiddlewareHandler {
  return async (c, next) => {
    if (isLocalRequest(c)) return next();
    if (verifyToken(getCookie(c, COOKIE_NAME), token)) return next();
    const path = c.req.path;
    if (path === "/login" || ASSET.test(path)) return next();
    if (path.startsWith("/api")) {
      return c.json({ error: { message: "未授权：请在运行 MyNotion 的机器上执行 pnpm share 获取访问凭证" } }, 401);
    }
    return c.html(loginPage());
  };
}

/** 一次性用 token 换 cookie：URL 里的凭证只在这条请求出现，之后全靠 cookie。 */
export function loginRoute(token: string): Handler {
  return (c) => {
    const given = c.req.query("token") ?? "";
    if (!verifyToken(given, token)) return c.html(loginPage("凭证不正确，请重新复制"));
    setCookie(c, COOKIE_NAME, given, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 31536000 });
    return c.redirect("/");
  };
}
