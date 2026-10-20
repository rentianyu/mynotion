import { Hono } from "hono";
import { tx } from "../db.ts";
import { listTrash, hardDeletePageTree, restorePageTree } from "../repo/pages.ts";

export const trashRoute = new Hono();

trashRoute.get("/trash", (c) => c.json(listTrash()));

trashRoute.delete("/trash/:id", (c) => {
  const id = c.req.param("id");
  tx(() => hardDeletePageTree(id));
  return c.json({ ok: true });
});

trashRoute.post("/trash/:id/restore", (c) => {
  const id = c.req.param("id");
  tx(() => restorePageTree(id));
  return c.json({ ok: true });
});
