import { useEffect } from "react";
import { unlockChing } from "@/lib/ching";
import { OutputWidget } from "./OutputWidget";
import { useOutput } from "./useOutput";
import "./output.css";

export default function OutputPage() {
  const controller = useOutput();

  useEffect(() => {
    document.title = "OUTPUT";
    document.body.classList.add("output-page");
    const unlock = () => unlockChing();
    window.addEventListener("pointerdown", unlock);
    return () => {
      document.body.classList.remove("output-page");
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);

  return (
    <div className="output-root">
      <main className="output-landing">
        <p className="wordmark">OUTPUT</p>
        <h1>Send work. Receive work.</h1>
        <p className="lede">Drop a file when you need something made. Get a ping when there is work you can make.</p>
        <p>
          OUTPUT is a production network for independent print shops. This pilot takes production-ready SVG contour-cut
          decals on gloss-white vinyl, with an optional gloss laminate. The shop accepts before anyone funds the job.
        </p>
        <button type="button" className="primary" onClick={controller.openInbox}>
          Open OUTPUT
        </button>
        <p className="fine">The strip at the bottom right is the app. This delivery runs in the browser. There is no installer.</p>
      </main>
      <OutputWidget controller={controller} />
    </div>
  );
}
