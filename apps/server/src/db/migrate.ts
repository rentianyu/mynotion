import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export function migrate(): void {
  const ddl = readFileSync(path.join(here, "schema.sql"), "utf8");
  db.exec(ddl);
}
