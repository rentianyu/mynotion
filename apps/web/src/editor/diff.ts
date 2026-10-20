import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { BlockRow } from "@mynotion/shared";

/** BlockNote 的 Block 结构（此处只取需要的字段，避免依赖泛型 cast）。 */
type BnBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children?: BnBlock[];
};

export type ChangeKind = "insert" | "update" | "move" | "delete";

/** getChanges() 返回的元素：我们只关心类型、块 id、以及块对象（delete 时可能缺）。 */
export type BnChange = {
  type: ChangeKind;
  block?: BnBlock;
};

/**
 * 客户端为每个块维护的 sort_key（服务端不下发；加载文档时按顺序播种）。
 * keyless 邻居用 generateNKeysBetween 局部补齐——只在插入/移动触发，非全量展平。
 */
export function seedKeys(document: BnBlock[]): Map<string, string> {
  const keys = new Map<string, string>();
  const assign = (siblings: BnBlock[]): void => {
    let prev: string | null = null;
    for (const b of siblings) {
      const k = generateKeyBetween(prev, null);
      keys.set(b.id, k);
      prev = k;
    }
    for (const b of siblings) if (b.children && b.children.length) assign(b.children);
  };
  assign(document);
  return keys;
}

type SiblingGroup = { parentId: string; children: BnBlock[] };

function collectGroups(document: BnBlock[], pageId: string): Map<string, SiblingGroup> {
  const groups = new Map<string, SiblingGroup>();
  const walk = (parent: string, children: BnBlock[]): void => {
    groups.set(parent, { parentId: parent, children });
    for (const c of children) if (c.children && c.children.length) walk(c.id, c.children);
  };
  walk(pageId, document);
  return groups;
}

/**
 * 把累加后的变化折算成 {upserts, deletes}。
 * changed = insert/update/move 的块 id；deleted = delete 的 id；moved = move 的 id（需重算键）。
 * 只对「受影响的兄弟组」重排：沿用已有键，缺键/移动的块局部补齐。拖一个块 → 该组里只有它一个变化 → 1 行。
 */
export function settle(
  document: BnBlock[],
  pageId: string,
  keys: Map<string, string>,
  changed: Set<string>,
  deleted: Set<string>,
  moved: Set<string>,
): { rows: BlockRow[]; deletes: string[] } {
  // 移动的块：丢弃旧键，让 repairGroup 在新邻居间重算，保证组内序正确。
  for (const id of moved) keys.delete(id);

  // 仍在文档里的块（删除后被撤销恢复）不能进 deletes，否则服务端会误级联。
  const alive = new Set<string>();
  const markAlive = (blocks: BnBlock[]): void => {
    for (const b of blocks) {
      alive.add(b.id);
      if (b.children?.length) markAlive(b.children);
    }
  };
  markAlive(document);

  const groups = collectGroups(document, pageId);
  const rows: BlockRow[] = [];

  for (const [parentId, group] of groups) {
    const sibs = group.children;
    if (!sibs.some((b) => changed.has(b.id))) continue; // 本组无变化，跳过

    // 补齐本组缺键的块：找出连续 keyless 段，用前后邻居既有键 bracket 后均分。
    repairGroup(sibs, keys);

    for (const b of sibs) {
      if (!changed.has(b.id)) continue;
      rows.push({
        id: b.id,
        parentId,
        type: b.type,
        props: b.props,
        content: (b.content ?? []) as unknown[],
        sortKey: keys.get(b.id)!,
      });
    }
  }
  return { rows, deletes: [...deleted].filter((id) => !alive.has(id)) };
}

function repairGroup(sibs: BnBlock[], keys: Map<string, string>): void {
  // 已有键的按 index 排好；给缺键的块找 bracket 并分配。
  let i = 0;
  while (i < sibs.length) {
    if (keys.has(sibs[i]!.id)) {
      i++;
      continue;
    }
    // 收集一段 keyless [i, j)
    let j = i;
    while (j < sibs.length && !keys.has(sibs[j]!.id)) j++;
    const before = i > 0 ? keys.get(sibs[i - 1]!.id)! : null;
    const after = j < sibs.length ? keys.get(sibs[j]!.id)! : null;
    const n = j - i;
    const generated = generateNKeysBetween(before, after, n);
    for (let k = 0; k < n; k++) keys.set(sibs[i + k]!.id, generated[k]!);
    i = j;
  }
}
