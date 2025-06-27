import styled from "@emotion/styled";

// Add CSS for spinner animation
const spinnerStyle = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Inject the CSS
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = spinnerStyle;
  document.head.appendChild(style);
}

// Modal component
export const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const ModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

export const ModalText = styled.p`
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 1rem;
  color: #333;
`;

export const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  margin-top: 1rem;
`;

export const ColumnHeader = styled.div`
  position: absolute;
  top: 20px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%); /* Center the header */
  pointer-events: auto; /* Re-enable pointer events for the header itself */
`;

export const ColumnHeadersContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px; /* Only cover the top area where headers are */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5; /* Lower z-index so it doesn't interfere with notes */
  pointer-events: none; /* Allow clicks to pass through to notes */
`;

export const NoteModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const NoteModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

export const NoteModalTitle = styled.h3`
  margin: 0 0 1rem 0;
  font-size: 18px;
  color: #333;
`;

export const NoteModalTextarea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 1rem;
`;

export const NoteModalSelect = styled.select`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 1rem;
`;

export const NoteModalButton = styled.button`
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-right: 0.5rem;

  &:hover {
    background-color: #2563eb;
  }
`;

export const NoteModalCancelButton = styled.button`
  padding: 0.5rem 1rem;
  background-color: #6b7280;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background-color: #4b5563;
  }
`;