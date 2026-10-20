import { useEffect, useRef, useState } from "react";
import type { AppBlockNoteEditor } from "../blocks/schema.ts";
import { seedKeys, settle } from "./diff.ts";
import type { BnChange } from "./diff.ts";
import { saveBlocksKeepalive, api } from "../api/client.ts";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 500;

/**
 * onChange → getChanges() 累加 → 防抖 flush → PUT。
 * 移动块的重算、缺键补齐都在 settle 内；这里只负责累加与调度。
 */
export function useDocumentAutosave(editor: AppBlockNoteEditor, pageId: string): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const keys = useRef<Map<string, string>>(new Map());
  const changed = useRef<Set<string>>(new Set());
  const moved = useRef<Set<string>>(new Set());
  const deleted = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载后播种 sort_key（服务端不下发键，客户端按文档顺序生成一份）。
  useEffect(() => {
    keys.current = seedKeys(editor.document as never);
  }, [editor]);

  const flush = (): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (changed.current.size === 0 && deleted.current.size === 0) return;
    const { rows, deletes } = settle(
      editor.document as never,
      pageId,
      keys.current,
      changed.current,
      deleted.current,
      moved.current,
    );
    changed.current = new Set();
    moved.current = new Set();
    deleted.current = new Set();
    if (rows.length === 0 && deletes.length === 0) return;
    setStatus("saving");
    void api
      .saveBlocks(pageId, { upserts: rows, deletes })
      .then(() => setStatus("saved"))
      .catch(() => setStatus("error"));
  };

  useEffect(() => {
    const unsubscribe = editor.onChange((_ed, ctx) => {
      for (const c of ctx.getChanges() as unknown as BnChange[]) {
        const id = c.block?.id;
        if (!id) continue;
        if (c.type === "delete") {
          deleted.current.add(id);
          changed.current.delete(id);
          moved.current.delete(id);
          keys.current.delete(id);
        } else {
          // 撤销恢复同名块：删除标记作废，走 upsert。
          deleted.current.delete(id);
          changed.current.add(id);
          if (c.type === "move") moved.current.add(id);
        }
      }
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pageId]);

  // 卸载 / 关页面前立即落库（keepalive 不被导航取消）。
  useEffect(() => {
    const onLeave = (): void => {
      if (changed.current.size === 0 && deleted.current.size === 0) return;
      const { rows, deletes } = settle(
        editor.document as never,
        pageId,
        keys.current,
        changed.current,
        deleted.current,
        moved.current,
      );
      if (rows.length || deletes.length) void saveBlocksKeepalive(pageId, { upserts: rows, deletes });
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      onLeave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pageId]);

  return status;
}
