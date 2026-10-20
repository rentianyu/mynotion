import { useEffect } from "react";
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client.ts";
import { uuidv7 } from "./lib/uuid.ts";
import { Sidebar } from "./features/sidebar/Sidebar.tsx";
import { PageRoute } from "./features/page/Route.tsx";
import { TrashPage } from "./features/trash/TrashPage.tsx";
import { SearchDialog } from "./features/search/SearchDialog.tsx";

function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: "auto" }}>
        <Outlet />
      </main>
      <SearchDialog />
    </div>
  );
}

// 根路由：有页则跳第一个，否则建一页再跳。
function SmartRoot() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["tree"], queryFn: api.getTree });
  useEffect(() => {
    if (!data) return;
    if (data.length > 0) void navigate(`/p/${data[0]!.id}`, { replace: true });
    else {
      const id = uuidv7();
      void api.createPage({ id, parentId: null, title: "欢迎页" }).then(() => navigate(`/p/${id}`, { replace: true }));
    }
  }, [data, navigate]);
  return <div style={{ padding: 24, color: "#888" }}>加载中…</div>;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <SmartRoot /> },
      { path: "/p/:pageId", element: <PageRoute /> },
      { path: "/trash", element: <TrashPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
