import { threadColor as getThreadColor } from "../store/documentStore";

export interface EdgeProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  id?: string;
  data?: { colorIndex?: number; dimmed?: boolean };
}

function threadColor(colorIndex: number | undefined): string {
  if (colorIndex === undefined) return "#94a3b8";
  return getThreadColor(colorIndex).border;
}

const createBezierPath = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) => {
  const deltaX = targetX - sourceX;
  const controlPoint1X = sourceX + deltaX * 0.4;
  const controlPoint1Y = sourceY;
  const controlPoint2X = targetX - deltaX * 0.4;
  const controlPoint2Y = targetY;
  return `M ${sourceX} ${sourceY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${targetX} ${targetY}`;
};

export const CustomEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) => {
  const stroke = threadColor(data?.colorIndex);
  const path = createBezierPath(sourceX, sourceY, targetX, targetY);
  return (
    <g opacity={data?.dimmed ? 0.12 : 1} style={{ transition: "opacity 0.25s ease" }}>
      <path d={path} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </g>
  );
};

export const EllipsisEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) => {
  const stroke = threadColor(data?.colorIndex);
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;
  const path = createBezierPath(sourceX, sourceY, targetX, targetY);
  const gradId = `ellipsisGrad-${data?.colorIndex ?? "x"}`;
  return (
    <g opacity={data?.dimmed ? 0.12 : 1} style={{ transition: "opacity 0.25s ease" }}>
      <path d={path} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={symbolX} cy={symbolY} r="64" fill={`url(#${gradId})`} />
      <text
        x={symbolX} y={symbolY}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="32" fill={stroke}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        ...
      </text>
    </g>
  );
};

export const EdgeYes = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) => {
  const stroke = threadColor(data?.colorIndex);
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;
  const path = createBezierPath(sourceX, sourceY, targetX, targetY);
  const gradId = `yesGrad-${data?.colorIndex ?? "x"}`;
  return (
    <g opacity={data?.dimmed ? 0.12 : 1} style={{ transition: "opacity 0.25s ease" }}>
      <path d={path} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={symbolX} cy={symbolY} r="64" fill={`url(#${gradId})`} />
      <text
        x={symbolX} y={symbolY}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="32" fill={stroke}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        ✓
      </text>
    </g>
  );
};

export const EdgeNo = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) => {
  const stroke = threadColor(data?.colorIndex);
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;
  const path = createBezierPath(sourceX, sourceY, targetX, targetY);
  const gradId = `noGrad-${data?.colorIndex ?? "x"}`;
  return (
    <g opacity={data?.dimmed ? 0.12 : 1} style={{ transition: "opacity 0.25s ease" }}>
      <path d={path} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={symbolX} cy={symbolY} r="64" fill={`url(#${gradId})`} />
      <text
        x={symbolX} y={symbolY}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="32" fill={stroke}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        ✗
      </text>
    </g>
  );
};
