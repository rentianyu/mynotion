import { useMemo } from "react";
import type { MouseEvent } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { generateKeyBetween } from "fractional-indexing";
import { useNavigate, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.ts";
import { uuidv7 } from "../../lib/uuid.ts";
import { Icon } from "../../ui/Icon.tsx";
import type { PageMeta } from "@mynotion/shared";

type Node = { id: string; title: string; icon: string | null; depth: number; parentId: string | null; sortKey: string };

/** DFS 展平：按 parentId 分组、组内按 sort_key，深度即缩进。 */
function buildFlat(pages: PageMeta[]): Node[] {
  const byParent = new Map<string | null, PageMeta[]>();
  for (const p of pages) {
    const list = byParent.get(p.parentId);
    if (list) list.push(p);
    else byParent.set(p.parentId, [p]);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
  const out: Node[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const p of byParent.get(parent) ?? []) {
      out.push({ id: p.id, title: p.title, icon: p.icon, depth, parentId: parent, sortKey: p.sortKey });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function subtreeEnd(flat: Node[], start: number): number {
  const d = flat[start]!.depth;
  let end = start + 1;
  while (end < flat.length && flat[end]!.depth > d) end++;
  return end;
}

function TreeRow({ node }: { node: Node }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onCurrent = location.pathname === `/p/${node.id}`;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id });
  const addSibling = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation();
    const id = uuidv7();
    await api.createPage({ id, parentId: node.parentId });
    navigate(`/p/${id}`);
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        display: "flex",
        alignItems: "center",
        paddingLeft: 4 + node.depth * 16,
      }}
      className="tree-row"
    >
      <span
        {...attributes}
        {...listeners}
        className="tree-grip"
        title="拖拽排序 / 拖到某页上作为其子页"
        style={{ cursor: "grab", color: "var(--ink-3)", opacity: 0, padding: "0 2px", display: "inline-flex", flexShrink: 0 }}
      >
        <Icon name="grip" size={14} />
      </span>
      <div
        onClick={() => navigate(`/p/${node.id}`)}
        className={"nav-item" + (onCurrent ? " active" : "")}
        style={{ flex: 1, minWidth: 0, padding: "4px 6px" }}
      >
        <span style={{ width: 18, textAlign: "center", fontSize: 15, flexShrink: 0 }}>{node.icon ?? "📄"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.title || "无标题"}</span>
      </div>
      <button onClick={addSibling} className="icon-btn tree-add" title="新建同级页" style={{ opacity: 0, width: 22, height: 22 }}>
        <Icon name="plus" size={15} />
      </button>
    </div>
  );
}

export function PageTree({ pages }: { pages: PageMeta[] }) {
  const qc = useQueryClient();
  const flat = useMemo(() => buildFlat(pages), [pages]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = async (e: DragEndEvent): Promise<void> => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const arr = [...flat];
    const aIndex = arr.findIndex((n) => n.id === activeId);
    const oIndex = arr.findIndex((n) => n.id === overId);
    if (aIndex < 0 || oIndex < 0) return;

    const subEnd = subtreeEnd(arr, aIndex);
    const moved = arr.slice(aIndex, subEnd);
    const overNode = arr[oIndex]!;
    const targetDepth = overNode.depth;
    const sameParent = moved[0]!.parentId === overNode.parentId;

    // 移出被移动子树后，计算插入点
    const withoutMoved = arr.slice(0, aIndex).concat(arr.slice(subEnd));
    let insertAt = withoutMoved.findIndex((n) => n.id === overId);
    if (insertAt < 0) return;
    if (!sameParent) {
      // 作为 over 的子页：插到 over 的子树末尾，深度 = over.depth + 1
      insertAt = subtreeEnd(withoutMoved, insertAt);
      reindent(moved, targetDepth + 1);
      moved[0]!.parentId = overId;
    } else {
      // 同父重排：插到 over 之前或之后（看方向），深度不变
      if (aIndex < oIndex) insertAt = subtreeEnd(withoutMoved, insertAt);
      reindent(moved, targetDepth);
    }
    const next = withoutMoved.slice(0, insertAt).concat(moved, withoutMoved.slice(insertAt));

    // 重算每个受影响父组的 sort_key，PATCH 变化项
    await persistOrder(next);
    qc.invalidateQueries({ queryKey: ["tree"] });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
      <SortableContext items={flat.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        {flat.map((n) => (
          <TreeRow key={n.id} node={n} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function reindent(moved: Node[], baseDepth: number): void {
  const delta = baseDepth - moved[0]!.depth;
  for (const n of moved) n.depth += delta;
}
/** 依据新展平顺序派生 parentId/depth，逐个 PATCH 变了 parentId 或 sortKey 的页。 */
async function persistOrder(next: Node[]): Promise<void> {
  const groupKeys = new Map<string, string[]>(); // parentId -> ordered ids
  for (let i = 0; i < next.length; i++) {
    const n = next[i]!;
    // parentId 由最近的前置浅一层节点决定
    let parent: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (next[j]!.depth < n.depth) {
        parent = next[j]!.id;
        break;
      }
    }
    if (parent !== n.parentId) n.parentId = parent;
    const key = parent ?? "ROOT";
    const ids = groupKeys.get(key);
    if (ids) ids.push(n.id);
    else groupKeys.set(key, [n.id]);
  }
  // 每组按新顺序生成连续键
  const newKey = new Map<string, string>();
  for (const ids of groupKeys.values()) {
    let prev: string | null = null;
    for (const id of ids) {
      const k = generateKeyBetween(prev, null);
      newKey.set(id, k);
      prev = k;
    }
  }
  const tasks: Promise<unknown>[] = [];
  for (const n of next) {
    const sk = newKey.get(n.id)!;
    if (sk !== n.sortKey) {
      tasks.push(api.reparent(n.id, n.parentId, sk));
    }
  }
  await Promise.all(tasks);
}

