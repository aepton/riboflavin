// Edge component props interface
export interface EdgeProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  id?: string;
}

// Helper function to create bezier curve path
const createBezierPath = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
) => {
  const deltaX = targetX - sourceX;

  // Control points for more pronounced curve
  const controlPoint1X = sourceX + deltaX * 0.4;
  const controlPoint1Y = sourceY;
  const controlPoint2X = targetX - deltaX * 0.4;
  const controlPoint2Y = targetY;

  return `M ${sourceX} ${sourceY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${targetX} ${targetY}`;
};

// Custom edge component that connects to the closest handles
export const CustomEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) => {
  const path = createBezierPath(sourceX, sourceY, targetX, targetY);

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#000000"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        style={{ zIndex: 1 }}
      />
    </g>
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

  const path = createBezierPath(sourceX, sourceY, targetX, targetY);

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#8b5cf6"
        strokeWidth={1.5}
        strokeLinecap="round"
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
        fill="#8b5cf6"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ...
      </text>
    </g>
  );
};

// Custom edge component with check mark
export const EdgeYes = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  const path = createBezierPath(sourceX, sourceY, targetX, targetY);

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#10b981"
        strokeWidth={1.5}
        strokeLinecap="round"
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
export const EdgeNo = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  const path = createBezierPath(sourceX, sourceY, targetX, targetY);

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#ef4444"
        strokeWidth={1.5}
        strokeLinecap="round"
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
