import { Global } from "@emotion/react";
import { ReactFlowProvider } from "reactflow";
import DocumentFlow from "./components/DocumentFlow";
import { useFontStore } from "./store/fontStore";

function App() {
  const fontFamily = useFontStore((s) => s.current.family);

  return (
    <>
      <Global
        styles={{
          body: {
            margin: 0,
            padding: 0,
            fontFamily,
          },
          "button:hover:not(:disabled)": {
            background: "rgba(0,0,0,0.04) !important",
          },
          "select:hover": {
            background: "rgba(0,0,0,0.04) !important",
          },
        }}
      />
      <ReactFlowProvider>
        <DocumentFlow />
      </ReactFlowProvider>
    </>
  );
}

export default App;
