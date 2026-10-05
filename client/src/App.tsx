import Hud from "@/pages/hud";
import OutputPage from "@/output/OutputPage";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/output") return <OutputPage />;
  return <Hud />;
}
