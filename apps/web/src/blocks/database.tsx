import { createReactBlockSpec } from "@blocknote/react";
import { DatabaseViewHost } from "../features/database/DatabaseViewHost.tsx";

export const DatabaseBlockSpec = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      databaseId: { default: "", type: "string" },
      viewId: { default: "", type: "string" },
    },
    content: "none",
  },
  {
    render: ({ block }) => <DatabaseViewHost databaseId={block.props.databaseId} />,
  },
);
