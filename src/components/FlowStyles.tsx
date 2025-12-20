import styled from "@emotion/styled";

// Design System Colors
const colors = {
  // Primary palette
  primary: "#3b82f6", // Blue
  primaryHover: "#2563eb",

  // Edge colors - cohesive palette
  edgeYes: "#10b981", // Emerald green
  edgeNo: "#ef4444", // Red
  edgeEllipsis: "#8b5cf6", // Purple
  edgeDefault: "#6b7280", // Gray

  // Neutral colors
  white: "#ffffff",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",

  // Background colors
  background: "#ffffff",
  surface: "#f9fafb",

  // Text colors
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",

  // Border colors
  border: "#e5e7eb",
  borderFocus: "#3b82f6",

  // Shadow
  shadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  shadowMd: "0 4px 6px rgba(0, 0, 0, 0.05)",
  shadowLg: "0 10px 15px rgba(0, 0, 0, 0.1)",
};

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
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

export const ModalContent = styled.div`
  background: ${colors.white};
  padding: 2rem;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  box-shadow: ${colors.shadowLg};
  border: 1px solid ${colors.border};
`;

export const ModalText = styled.p`
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 1rem;
  color: ${colors.textPrimary};
  font-weight: 400;
`;

export const ModalInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-size: 14px;
  margin-top: 1rem;
  background: ${colors.white};
  color: ${colors.textPrimary};

  &:focus {
    outline: none;
    border-color: ${colors.borderFocus};
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

export const ColumnHeader = styled.div`
  position: absolute;
  top: 20px;
  background: ${colors.white};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 13px;
  font-weight: 600;
  color: ${colors.textPrimary};
  z-index: 10;
  box-shadow: ${colors.shadowMd};
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%);
  letter-spacing: 0.025em;
`;

export const ColumnHeadersContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
`;

export const NoteModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

export const NoteModalContent = styled.div`
  background: ${colors.white};
  padding: 2rem;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  box-shadow: ${colors.shadowLg};
  border: 1px solid ${colors.border};
`;

export const NoteModalTitle = styled.h3`
  margin: 0 0 1.5rem 0;
  font-size: 18px;
  color: ${colors.textPrimary};
  font-weight: 600;
  letter-spacing: -0.025em;
`;

export const NoteModalTextarea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 0.75rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 1rem;
  background: ${colors.white};
  color: ${colors.textPrimary};
  line-height: 1.5;

  &:focus {
    outline: none;
    border-color: ${colors.borderFocus};
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: ${colors.textMuted};
  }
`;

export const NoteModalSelect = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 1.5rem;
  background: ${colors.white};
  color: ${colors.textPrimary};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${colors.borderFocus};
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

export const NoteModalButton = styled.button`
  padding: 0.75rem 1.5rem;
  background-color: ${colors.primary};
  color: ${colors.white};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  margin-right: 0.75rem;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${colors.primaryHover};
    transform: translateY(-1px);
    box-shadow: ${colors.shadowMd};
  }

  &:active {
    transform: translateY(0);
  }
`;

export const NoteModalCancelButton = styled.button`
  padding: 0.75rem 1.5rem;
  background-color: ${colors.gray500};
  color: ${colors.white};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${colors.gray600};
    transform: translateY(-1px);
    box-shadow: ${colors.shadowMd};
  }

  &:active {
    transform: translateY(0);
  }
`;
