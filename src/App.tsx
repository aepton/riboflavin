import { Global } from "@emotion/react";
import { ReactFlowProvider } from "reactflow";
import DocumentFlow from "./components/DocumentFlow";

const globalStyles = {
  body: {
    margin: 0,
    padding: 0,
    fontFamily: '"EB Garamond", Georgia, serif',
  },
};

function App() {
  return (
    <>
      <Global styles={globalStyles} />
      <ReactFlowProvider>
        <DocumentFlow />
      </ReactFlowProvider>
    </>
  );
}

export default App;
