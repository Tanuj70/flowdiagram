"use client";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/** Same curve as React Flow's default edge. While a run is active on this connection, small dots travel along it. */
export function PulseEdge(p: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: p.sourceX, sourceY: p.sourceY, sourcePosition: p.sourcePosition,
    targetX: p.targetX, targetY: p.targetY, targetPosition: p.targetPosition,
  });
  const active = !!(p.data as any)?.active;
  return (
    <>
      <BaseEdge id={p.id} path={path} style={p.style} markerEnd={p.markerEnd} interactionWidth={20} />
      {active && [0, 1, 2].map((i) => (
        <circle key={i} r="4.5" className="edgedot"><animateMotion dur="0.9s" begin={`${i * 0.3}s`} repeatCount="indefinite" path={path} /></circle>
      ))}
    </>
  );
}
