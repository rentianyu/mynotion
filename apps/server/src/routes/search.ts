import { Hono } from "hono";
import { search } from "../repo/search.ts";

export const searchRoute = new Hono();

searchRoute.get("/search", (c) => {
  const q = c.req.query("q") ?? "";
  const limit = Math.min(50, Number(c.req.query("limit") ?? 20) || 20);
  return c.json({ groups: search(q, limit) });
});
