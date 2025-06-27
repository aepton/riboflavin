import { Global } from "@emotion/react";
import { ReactFlowProvider } from "reactflow";
import Flow from "./components/Flow";

const globalStyles = {
  body: {
    margin: 0,
    padding: 0,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
};

function App() {
  return (
    <>
      <Global styles={globalStyles} />
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </>
  );
}

export default App;
