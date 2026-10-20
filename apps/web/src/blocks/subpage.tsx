import { createReactBlockSpec } from "@blocknote/react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

function SubpageChip({ pageId }: { pageId: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["page-meta", pageId],
    queryFn: () => api.getDocument(pageId).then((d) => d.page),
    enabled: !!pageId,
  });
  if (!pageId) return null;
  return (
    <div
      contentEditable={false}
      onClick={() => navigate(`/p/${pageId}`)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        border: "1px solid #eee",
        borderRadius: 6,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span>{data?.icon ?? "📄"}</span>
      <span style={{ fontWeight: 500 }}>{data?.title || "无标题"}</span>
    </div>
  );
}

export const SubpageBlockSpec = createReactBlockSpec(
  {
    type: "subpage",
    propSchema: { pageId: { default: "", type: "string" } },
    content: "none",
  },
  {
    render: ({ block }) => <SubpageChip pageId={block.props.pageId} />,
  },
);
