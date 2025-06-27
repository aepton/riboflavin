import React from "react";

// Edge component props interface
export interface EdgeProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  id?: string;
}

// Custom edge component that connects to the closest handles
export const CustomEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) => {
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <path
      d={path}
      stroke="#3b82f6"
      strokeWidth={2}
      fill="none"
      style={{ zIndex: 1 }}
    />
  );
};

// Custom edge component with ellipsis overlay
export const EllipsisEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#3b82f6"
        strokeWidth={2}
        fill="none"
        style={{ zIndex: 1 }}
      />
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="ellipsisGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={symbolX}
        cy={symbolY}
        r="64"
        fill="url(#ellipsisGradient)"
        style={{ zIndex: 2 }}
      />
      <text
        x={symbolX}
        y={symbolY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="32"
        fill="#3b82f6"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ...
      </text>
    </g>
  );
};

// Custom edge component with check mark
export const EdgeYes = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#10b981"
        strokeWidth={2}
        fill="none"
        style={{ zIndex: 1 }}
      />
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="checkGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={symbolX}
        cy={symbolY}
        r="64"
        fill="url(#checkGradient)"
        style={{ zIndex: 2 }}
      />
      <text
        x={symbolX}
        y={symbolY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="32"
        fill="#10b981"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ✓
      </text>
    </g>
  );
};

// Custom edge component with X mark
export const EdgeNo = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#ef4444"
        strokeWidth={2}
        fill="none"
        style={{ zIndex: 1 }}
      />
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="xGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={symbolX}
        cy={symbolY}
        r="64"
        fill="url(#xGradient)"
        style={{ zIndex: 2 }}
      />
      <text
        x={symbolX}
        y={symbolY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="32"
        fill="#ef4444"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ✗
      </text>
    </g>
  );
};

// Edge types configuration
export const edgeTypes = {
  articleLink: CustomEdge,
  smoothstep: CustomEdge,
  ellipsis: EllipsisEdge,
  yes: EdgeYes,
  no: EdgeNo,
  default: CustomEdge, // Fallback for any unmapped types
  // Add any other edge types that might come from the backend
  straight: CustomEdge,
  step: CustomEdge,
  bezier: CustomEdge,
};
