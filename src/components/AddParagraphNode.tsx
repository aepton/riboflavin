import { memo } from "react";
import { useDocumentStore } from "../store/documentStore";
import { useAuthStore } from "../store/authStore";

interface AddParagraphNodeProps {
  data: {
    afterNodeId: string | null;
  };
}

const AddParagraphNode = memo(({ data }: AddParagraphNodeProps) => {
  const { addParagraph } = useDocumentStore();
  const { username } = useAuthStore();

  return (
    <button
      onClick={() => addParagraph(data.afterNodeId, username ?? undefined)}
      style={{
        width: 360,
        padding: "12px",
        border: "1px dashed #cbd5e1",
        borderRadius: "6px",
        background: "#f8fafc",
        color: "#94a3b8",
        fontSize: "14px",
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "center",
      }}
    >
      + Add paragraph
    </button>
  );
});

AddParagraphNode.displayName = "AddParagraphNode";
export default AddParagraphNode;
