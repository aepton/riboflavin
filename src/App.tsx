import { useState } from "react";
import { Global } from "@emotion/react";
import { ReactFlowProvider } from "reactflow";
import Flow from "./components/Flow";
import DocumentFlow from "./components/DocumentFlow";

const globalStyles = {
  body: {
    margin: 0,
    padding: 0,
    fontFamily: '"EB Garamond", Georgia, serif',
  },
};

type Mode = "document" | "transcript";

function App() {
  // Default to document mode on this branch
  const [mode, setMode] = useState<Mode>("document");

  return (
    <>
      <Global styles={globalStyles} />

      {mode === "document" ? (
        <ReactFlowProvider>
          <DocumentFlow />
        </ReactFlowProvider>
      ) : (
        <ReactFlowProvider>
          <Flow />
        </ReactFlowProvider>
      )}

      {/* Mode switcher — bottom-right corner */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          gap: "4px",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        {(["document", "transcript"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "5px 12px",
              borderRadius: "7px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
              fontFamily: "system-ui, -apple-system, sans-serif",
              letterSpacing: "0.01em",
              background: mode === m ? "#1e293b" : "transparent",
              color: mode === m ? "#fff" : "#64748b",
              transition: "all 0.15s ease",
            }}
          >
            {m === "document" ? "Document" : "Transcript"}
          </button>
        ))}
      </div>
    </>
  );
}

export default App;
