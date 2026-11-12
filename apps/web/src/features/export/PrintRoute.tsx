import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { api, type DatabaseBundle } from "../../api/client.ts";
import { CellDisplay } from "../database/cells.tsx";
import { applyView, visibleColumns } from "../database/viewPipeline.ts";
import type { DocumentResponse, PageMeta } from "@mynotion/shared";

type InlineNode = {
  type?: string;
  text?: string;
  styles?: Record<string, boolean>;
  href?: string;
  content?: unknown;
};

type PrintBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: PrintBlock[];
};

type Ctx = { dbs: Record<string, DatabaseBundle>; pages: Record<string, PageMeta> };

function prop(b: PrintBlock, key: string): string {
  const v = b.props?.[key];
  return typeof v === "string" ? v : "";
}

function plainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((n) => (typeof n === "string" ? n : ((n as InlineNode).text ?? ""))).join("");
  }
  return "";
}

function renderInlineNode(n: InlineNode, key: string): ReactNode {
  if (n.type === "link") {
    return (
      <a key={key} href={n.href ?? "#"}>
        {renderInline(n.content, key)}
      </a>
    );
  }
  let body: ReactNode = n.text ?? "";
  const st = n.styles ?? {};
  if (st.code) body = <code>{body}</code>;
  if (st.italic) body = <em>{body}</em>;
  if (st.underline) body = <u>{body}</u>;
  if (st.strike) body = <s>{body}</s>;
  if (st.bold) body = <strong>{body}</strong>;
  return <span key={key}>{body}</span>;
}

function renderInline(content: unknown, key: string): ReactNode {
  const nodes = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : [];
  return nodes.map((n, i) => renderInlineNode(n as InlineNode, `${key}-${i}`));
}

/** BlockNote 表格块的单元格既可能是裸 inline content 数组，也可能是 TableCell 对象。 */
function cellContent(cell: unknown): unknown {
  if (Array.isArray(cell)) return cell;
  if (cell && typeof cell === "object") return (cell as { content?: unknown }).content;
  return undefined;
}

function renderBnTable(b: PrintBlock): ReactNode {
  const c = b.content as { rows?: { cells?: unknown[] }[]; headerRows?: number } | undefined;
  const rows = c?.rows ?? [];
  if (rows.length === 0) return null;
  const headerRows = c?.headerRows ?? 0;
  return (
    <table className="print-table print-bn-table">
      <tbody>
        {rows.map((row, ri) => {
          const Cell = ri < headerRows ? "th" : "td";
          return (
            <tr key={ri}>
              {(row.cells ?? []).map((cell, ci) => (
                <Cell key={ci}>{renderInline(cellContent(cell), `${b.id}-${ri}-${ci}`)}</Cell>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 数据库：整表静态输出，含被筛选/排序后的全部行（编辑器里的虚拟列表只渲染可视行，不能直接打印）。 */
function renderDatabase(b: PrintBlock, ctx: Ctx): ReactNode {
  const bundle = ctx.dbs[prop(b, "databaseId")];
  const view = bundle?.views[0];
  if (!bundle || !view) return null;
  const cols = visibleColumns(bundle.database.schema, view.config);
  const rows = applyView(bundle.rows, bundle.database.schema, view.config);
  return (
    <section className="print-db">
      <h3 className="print-db-title">
        {bundle.database.icon ? `${bundle.database.icon} ` : ""}
        {bundle.database.title || "未命名数据库"}
      </h3>
      {rows.length === 0 ? (
        <p className="print-empty">（无记录）</p>
      ) : (
        <table className="print-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => (
                  <td key={c.id}>
                    <CellDisplay prop={c} row={r} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function renderBlock(b: PrintBlock, ctx: Ctx): ReactNode {
  switch (b.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(b.props?.level) || 1));
      const H = (level === 1 ? "h2" : level === 2 ? "h3" : "h4") as "h2" | "h3" | "h4";
      return <H className="print-h">{renderInline(b.content, b.id)}</H>;
    }
    case "quote":
      return <blockquote className="print-quote">{renderInline(b.content, b.id)}</blockquote>;
    case "callout":
      return (
        <div className="print-callout">
          <span className="print-callout-icon">{prop(b, "icon") || "💡"}</span>
          <div>{renderInline(b.content, b.id)}</div>
        </div>
      );
    case "codeBlock":
      return (
        <pre className="print-code">
          <code>{plainText(b.content)}</code>
        </pre>
      );
    case "separator":
      return <hr className="print-hr" />;
    case "image": {
      const url = prop(b, "url");
      if (!url) return null;
      const caption = renderInline(b.props?.caption, `${b.id}-caption`);
      return (
        <figure className="print-figure">
          <img className="print-img" src={url} alt="" />
          {caption ? <figcaption className="print-caption">{caption}</figcaption> : null}
        </figure>
      );
    }
    case "table":
      return renderBnTable(b);
    case "subpage": {
      const target = ctx.pages[prop(b, "pageId")];
      return (
        <div className="print-subpage">
          <span className="print-subpage-icon">{target?.icon ?? "📄"}</span>
          <span>{target?.title || "无标题"}</span>
        </div>
      );
    }
    case "database":
      return renderDatabase(b, ctx);
    default:
      return <p className="print-p">{renderInline(b.content, b.id)}</p>;
  }
}

function renderBlocks(blocks: PrintBlock[], ctx: Ctx): ReactNode {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    const isBullet = b.type === "bulletListItem";
    const isNumbered = b.type === "numberedListItem";
    if (isBullet || isNumbered) {
      const List = (isNumbered ? "ol" : "ul") as "ol" | "ul";
      let j = i;
      while (j < blocks.length && blocks[j]!.type === b.type) j += 1;
      out.push(
        <List key={`list-${b.id}`}>
          {blocks.slice(i, j).map((x) => (
            <li key={x.id}>
              {renderInline(x.content, x.id)}
              {x.children?.length ? renderBlocks(x.children, ctx) : null}
            </li>
          ))}
        </List>,
      );
      i = j;
      continue;
    }
    out.push(
      <Fragment key={b.id}>
        {renderBlock(b, ctx)}
        {b.children?.length ? renderBlocks(b.children, ctx) : null}
      </Fragment>,
    );
    i += 1;
  }
  return out;
}

function flatten(blocks: PrintBlock[], out: PrintBlock[] = []): PrintBlock[] {
  for (const b of blocks) {
    out.push(b);
    if (b.children) flatten(b.children, out);
  }
  return out;
}

/**
 * 打印视图：/p/:pageId/print。没有侧栏与编辑器 chrome，窗口打印即"另存为 PDF"。
 * 数据直接来自 REST（不碰编辑器实例），数据库块按当前视图配置全量静态渲染。
 */
export function PrintRoute() {
  const { pageId = "" } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentResponse | null>(null);
  const [ctx, setCtx] = useState<Ctx>({ dbs: {}, pages: {} });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await api.getDocument(pageId);
        const blocks = d.blocks as PrintBlock[];
        const dbIds = [...new Set(flatten(blocks).filter((b) => b.type === "database").map((b) => prop(b, "databaseId")))];
        const [bundles, tree] = await Promise.all([
          Promise.all(dbIds.map((id) => api.getDatabase(id).catch(() => null))),
          api.getTree(),
        ]);
        if (!alive) return;
        const dbs: Record<string, DatabaseBundle> = {};
        for (const bundle of bundles) if (bundle) dbs[bundle.database.id] = bundle;
        const pages: Record<string, PageMeta> = {};
        for (const p of tree) pages[p.id] = p;
        setDoc(d);
        setCtx({ dbs, pages });
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [pageId]);

  // 图片/字体就绪后再拉起打印对话框，否则 PDF 里会缺图。打印结束回原页面。
  useEffect(() => {
    if (!doc) return;
    const prevTitle = document.title;
    document.title = doc.page.title || "未命名页面";
    let cancelled = false;
    const pending = [...document.images].filter((img) => !img.complete);
    const settle = (p: Promise<unknown>) => Promise.race([p, new Promise((r) => setTimeout(r, 5000))]);
    void settle(
      Promise.all([
        ...pending.map((img) => new Promise((r) => {
          img.addEventListener("load", r, { once: true });
          img.addEventListener("error", r, { once: true });
        })),
        document.fonts?.ready ?? Promise.resolve(),
      ]),
    ).then(() => {
      if (!cancelled) window.print();
    });
    const back = () => navigate(`/p/${pageId}`, { replace: true });
    window.addEventListener("afterprint", back);
    return () => {
      cancelled = true;
      document.title = prevTitle;
      window.removeEventListener("afterprint", back);
    };
  }, [doc, pageId, navigate]);

  if (error) return <div className="print-note">导出失败：{error}</div>;
  if (!doc) return <div className="print-note">准备导出…</div>;

  return (
    <div className="print-root">
      <div className="print-toolbar">
        <span>在打印对话框的「目标」里选择「另存为 PDF」即可保存文件。</span>
        <button type="button" onClick={() => window.print()}>
          打开打印对话框
        </button>
        <button type="button" onClick={() => navigate(`/p/${pageId}`)}>
          返回页面
        </button>
      </div>
      <article className="print-sheet">
        {doc.page.icon && <div className="print-page-icon">{doc.page.icon}</div>}
        <h1 className="print-title">{doc.page.title || "无标题"}</h1>
        {renderBlocks(doc.blocks as PrintBlock[], ctx)}
      </article>
    </div>
  );
}
