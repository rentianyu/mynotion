// 一次性快照备份：用 node:sqlite 在线备份 API，生成 data/backup-YYYYMMDD.db。
// 与并发读写安全（走 SQLite backup 接口，非文件复制）。
import { DatabaseSync, backup } from "node:sqlite";
import path from "node:path";

const root = path.resolve();
const dbPath = process.env.DATA_FILE ?? path.join(root, "data", "mynotion.db");
const d = new Date();
const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const out = process.argv[2] ?? path.join(root, "data", `backup-${stamp}.db`);

const src = new DatabaseSync(dbPath);
await backup(src, out);
src.close();
console.log(`backup written: ${out}`);
