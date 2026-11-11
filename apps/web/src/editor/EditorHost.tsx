import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { appSchema } from "../blocks/schema.ts";
import { getAppSlashItems } from "../features/page/slashItems.tsx";
import { useDocumentAutosave } from "./useDocumentAutosave.ts";
import type { SaveStatus } from "./useDocumentAutosave.ts";
import { Icon } from "../ui/Icon.tsx";
import type { PageMeta } from "@mynotion/shared";

const LABEL: Record<SaveStatus, string> = {
  idle: "",
  pending: "正在输入…",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

function SaveIndicator({ status }: { status: SaveStatus }) {
  // saved 是瞬时态：显示 2 秒后淡出，避免常驻视觉噪音（Notion 只在动作时提示）。
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "pending" || status === "saving" || status === "error") {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
    } else if (status === "saved") {
      setVisible(true);
      hideTimer.current = setTimeout(() => setVisible(false), 2000);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [status]);

  if (!visible || status === "idle") return null;

  const color = status === "error" ? "var(--danger)" : "var(--ink-3)";
  return (
    <div
      data-testid="save-status"
      style={{
        position: "absolute",
        top: 10,
        right: 16,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color,
        opacity: status === "saved" ? 0.9 : 1,
        transition: "opacity 0.4s ease",
        pointerEvents: "none",
      }}
    >
      {status === "error" ? <Icon name="more" size={13} /> : <Icon name={status === "saved" ? "cloudCheck" : "cloud"} size={14} />}
      {LABEL[status]}
    </div>
  );
}

export function EditorHost({
  page,
  initialBlocks,
  initialKeys,
}: {
  page: PageMeta;
  initialBlocks: unknown[];
  initialKeys: Record<string, string>;
}) {
  const editor = useCreateBlockNote({
    schema: appSchema,
    initialContent: (initialBlocks.length ? initialBlocks : [{ type: "paragraph" }]) as never,
  });
  const status = useDocumentAutosave(editor, page.id, initialKeys);
  return (
    <div style={{ position: "relative" }}>
      <SaveIndicator status={status} />
      <BlockNoteView editor={editor} slashMenu={false}>
        <SuggestionMenuController triggerCharacter="/" getItems={getAppSlashItems(editor, page.id)} />
      </BlockNoteView>
    </div>
  );
}
