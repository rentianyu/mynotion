import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** 与 db.ts 的 DATA_DIR 同目录；不 import db.ts，避免取 token 就把 SQLite 打开。 */
export const TOKEN_PATH = process.env.TOKEN_FILE ?? path.resolve(here, "..", "..", "..", "..", "data", "token");

export const COOKIE_NAME = "mynotion_token";

// 去掉 0/o、1/l/i 等易混字符：手机上手输一次凭证是真实场景。
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const LENGTH = 14;

function generate(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * 读一次、落盘、之后复用：每次重启都换 token 会让所有已登录浏览器集体失效。
 * MYNOTION_TOKEN 显式给了就用它（不落盘，方便临时演示）。
 */
export function loadToken(): string {
  const fromEnv = process.env.MYNOTION_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(TOKEN_PATH)) {
    const existing = readFileSync(TOKEN_PATH, "utf8").trim();
    if (existing) return existing;
  }
  mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  const fresh = generate();
  writeFileSync(TOKEN_PATH, `${fresh}\n`);
  return fresh;
}

export function verifyToken(candidate: string | undefined | null, expected: string): boolean {
  if (!candidate || candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
