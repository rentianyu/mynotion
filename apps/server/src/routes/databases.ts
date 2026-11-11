import { Hono } from "hono";
import type { PropDef, PropertyValue } from "@mynotion/shared";
import {
  createDatabase,
  getDatabaseBundle,
  updateSchema,
  createRow,
  updateRow,
  softDeleteRow,
  restoreRow,
  createView,
  updateView,
  deleteView,
  updateDatabase,
} from "../repo/databases.ts";

export const databasesRoute = new Hono();

databasesRoute.post("/databases", async (c) => {
  const body = (await c.req.json()) as {
    id?: string;
    hostPageId: string;
    title?: string;
    icon?: string | null;
    schema?: PropDef[];
  };
  const bundle = createDatabase(body);
  return c.json(bundle, 201);
});

databasesRoute.get("/databases/:id", (c) => {
  const bundle = getDatabaseBundle(c.req.param("id"));
  if (!bundle) return c.json({ error: { code: 404, message: "database not found" } }, 404);
  return c.json(bundle);
});

databasesRoute.patch("/databases/:id/schema", async (c) => {
  const id = c.req.param("id");
  const { schema } = (await c.req.json()) as { schema: PropDef[] };
  return c.json(updateSchema(id, schema));
});

databasesRoute.patch("/databases/:id", async (c) => {
  const patch = (await c.req.json()) as { title?: string };
  const db = updateDatabase(c.req.param("id"), patch);
  if (!db) return c.json({ error: { code: 404, message: "database not found" } }, 404);
  return c.json(db);
});

databasesRoute.post("/databases/:id/rows", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as { id?: string; title?: string; values?: Record<string, PropertyValue> };
  return c.json(createRow(id, body), 201);
});

databasesRoute.patch("/rows/:rowId", async (c) => {
  const rowId = c.req.param("rowId");
  const patch = (await c.req.json()) as { title?: string; values?: Record<string, PropertyValue> };
  return c.json(updateRow(rowId, patch));
});

databasesRoute.delete("/rows/:rowId", (c) => {
  softDeleteRow(c.req.param("rowId"));
  return c.json({ ok: true });
});

databasesRoute.post("/rows/:rowId/restore", (c) => {
  const row = restoreRow(c.req.param("rowId"));
  if (!row) return c.json({ error: { code: 404, message: "row not found" } }, 404);
  return c.json(row);
});

databasesRoute.post("/databases/:id/views", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as { name?: string; type?: "table" | "board" | "calendar" };
  return c.json(createView(id, body), 201);
});

databasesRoute.patch("/views/:id", async (c) => {
  const patch = (await c.req.json()) as Parameters<typeof updateView>[1];
  return c.json(updateView(c.req.param("id"), patch));
});

databasesRoute.delete("/views/:id", (c) => {
  deleteView(c.req.param("id"));
  return c.json({ ok: true });
});
