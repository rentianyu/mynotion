import { Hono } from "hono";
import type { SaveBlocksRequest } from "@mynotion/shared";
import { run, tx } from "../db.ts";
import {
  createPage,
  getPageMeta,
  syncPageTitle,
  listTree,
  softDeletePageTree,
  restorePageTree,
  reparentPage,
} from "../repo/pages.ts";
import { getDocumentBlocks, saveDocument } from "../repo/blocks.ts";

export const pagesRoute = new Hono();

pagesRoute.get("/tree", (c) => c.json(listTree()));

pagesRoute.post("/pages", async (c) => {
  const body = (await c.req.json()) as Parameters<typeof createPage>[0];
  return c.json(createPage(body), 201);
});

pagesRoute.patch("/pages/:id/reparent", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as { parentId: string | null; sortKey: string };
  return c.json(reparentPage(id, body.parentId, body.sortKey));
});

pagesRoute.delete("/pages/:id", (c) => {
  const id = c.req.param("id");
  tx(() => softDeletePageTree(id));
  return c.json({ ok: true });
});

pagesRoute.post("/pages/:id/restore", (c) => {
  const id = c.req.param("id");
  tx(() => restorePageTree(id));
  return c.json(getPageMeta(id));
});

pagesRoute.get("/pages/:id/document", (c) => {
  const id = c.req.param("id");
  const page = getPageMeta(id);
  if (!page) return c.json({ error: { code: 404, message: "page not found" } }, 404);
  return c.json({ page, blocks: getDocumentBlocks(id) });
});

pagesRoute.put("/pages/:id/blocks", async (c) => {
  const id = c.req.param("id");
  if (!getPageMeta(id)) return c.json({ error: { code: 404, message: "page not found" } }, 404);
  const body = (await c.req.json()) as SaveBlocksRequest;
  return c.json(saveDocument(id, body.upserts ?? [], body.deletes ?? []));
});

pagesRoute.patch("/pages/:id", async (c) => {
  const id = c.req.param("id");
  const patch = (await c.req.json()) as { title?: string; icon?: string | null; cover?: string | null; isFavorite?: boolean };
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  let i = 1;
  if (patch.title !== undefined) {
    sets.push(`title = ?${i++}`);
    args.push(patch.title);
  }
  if (patch.icon !== undefined) {
    sets.push(`icon = ?${i++}`);
    args.push(patch.icon);
  }
  if (patch.cover !== undefined) {
    sets.push(`cover = ?${i++}`);
    args.push(patch.cover);
  }
  if (patch.isFavorite !== undefined) {
    sets.push(`is_favorite = ?${i++}`);
    args.push(patch.isFavorite ? 1 : 0);
  }
  if (sets.length > 0) {
    args.push(Date.now(), id);
    run(`UPDATE pages SET ${sets.join(", ")}, updated_at = ?${i} WHERE id = ?${i + 1}`, ...args);
    if (patch.title !== undefined) syncPageTitle(id);
  }
  return c.json(getPageMeta(id));
});
