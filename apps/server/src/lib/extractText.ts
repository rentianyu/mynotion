/**
 * 从 BlockNote 的嵌套 inline content / props 递归抽取纯文本，喂给 FTS。
 * BN 换版本改 JSON 形状时只动这里，不动 SQL。
 */
export function extractText(node: unknown): string {
  const out: string[] = [];
  walk(node, out);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function walk(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === "string") out.push(obj.text);
    // link / styled 节点的子内容
    if (obj.content !== undefined) walk(obj.content, out);
    // table block 的 content = { type: 'tableContent', rows: [[cell,...],...] }
    if (Array.isArray(obj.rows)) walk(obj.rows, out);
    if (Array.isArray(obj.cells)) walk(obj.cells, out);
  }
}
