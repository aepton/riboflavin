/**
 * Shared decorative chrome for document-mode nodes.
 *
 * Each node is framed by:
 *   • A fine hairline border
 *   • A subtle inner rule (double-line effect via inset box-shadow)
 *   • A single bold L-shaped corner bracket at the top-right
 */
import type { CSSProperties, ReactNode } from "react";

// ── Corner Bracket (top-right only) ────────────────────────────────────────

interface BracketProps {
  color: string;
  size?: number;
  weight?: number;
}

function CornerBracket({ color, size = 18, weight = 1.5 }: BracketProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: -1,
        right: -1,
        width: size,
        height: size,
        borderTop: `${weight}px solid ${color}`,
        borderRight: `${weight}px solid ${color}`,
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}

// ── Node Frame ──────────────────────────────────────────────────────────────

interface NodeFrameProps {
  children: ReactNode;
  /** The fine outer border color */
  borderColor: string;
  /** The bold corner-bracket color (usually darker than borderColor) */
  bracketColor: string;
  /** Background fill */
  background: string;
  /** Inner-rule color for the double-line effect */
  innerRuleColor?: string;
  /** Additional inline styles on the outer wrapper */
  style?: CSSProperties;
  /** Width of the node */
  width?: number;
  /** Opacity */
  opacity?: number;
}

export function NodeFrame({
  children,
  borderColor,
  bracketColor,
  background,
  innerRuleColor,
  style,
  width = 360,
  opacity = 1,
}: NodeFrameProps) {
  const innerColor = innerRuleColor ?? borderColor;

  return (
    <div
      style={{
        position: "relative",
        width,
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 0,
        boxShadow: [
          `inset 0 0 0 3px ${background}`,
          `inset 0 0 0 3.5px ${innerColor}`,
          `0 1px 3px rgba(0,0,0,0.04)`,
          `0 2px 8px rgba(0,0,0,0.03)`,
        ].join(", "),
        transition: "box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.25s ease",
        opacity,
        ...style,
      }}
    >
      <CornerBracket color={bracketColor} size={18} weight={1.5} />
      <div style={{ position: "relative", zIndex: 0 }}>
        {children}
      </div>
    </div>
  );
}

export default NodeFrame;
