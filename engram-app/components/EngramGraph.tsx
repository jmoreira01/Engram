"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface Node {
  id: string;
  appearances: string[];
  sources: string[];
  x?: number;
  y?: number;
}

interface Edge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: Node[];
  links: Edge[];
}

interface SelectedNode {
  id: string;
  appearances: string[];
  sources: string[];
}

// colour nodes by recency of last appearance
function nodeColor(node: Node): string {
  if (!node.appearances?.length) return "#4b5563";
  const last = node.appearances[node.appearances.length - 1];
  const days = Math.floor(
    (Date.now() - new Date(last).getTime()) / 86400000
  );
  if (days <= 7)  return "#34d399"; // green — very recent
  if (days <= 30) return "#60a5fa"; // blue — last month
  if (days <= 90) return "#a78bfa"; // purple — last quarter
  return "#6b7280";                  // grey — older
}

function nodeSize(node: Node): number {
  const count = node.appearances?.length ?? 1;
  return Math.max(3, Math.min(12, 3 + count * 1.5));
}

export default function EngramGraph({
  onNodeSelect,
}: {
  onNodeSelect: (node: SelectedNode | null) => void;
}) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [minAppearances, setMinAppearances] = useState(2);
  const [minWeight, setMinWeight] = useState(2);
  const [loading, setLoading] = useState(true);
  const graphRef = useRef<unknown>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/graph?min_appearances=${minAppearances}&min_weight=${minWeight}`
      );
      const data = await res.json();
      setGraphData({ nodes: data.nodes ?? [], links: data.edges ?? [] });
    } finally {
      setLoading(false);
    }
  }, [minAppearances, minWeight]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handleNodeClick = useCallback(
    (node: Node) => {
      onNodeSelect({
        id: node.id,
        appearances: node.appearances ?? [],
        sources: node.sources ?? [],
      });
    },
    [onNodeSelect]
  );

  return (
    <div className="relative w-full h-full bg-gray-950">
      {/* controls */}
      <div className="absolute top-3 left-3 z-10 flex gap-3 items-center bg-gray-900/80 backdrop-blur px-3 py-2 rounded-lg text-xs text-gray-300">
        <label className="flex items-center gap-1">
          Min. aparicoes
          <input
            type="range" min={1} max={10} value={minAppearances}
            onChange={(e) => setMinAppearances(Number(e.target.value))}
            className="w-20 accent-emerald-400"
          />
          <span className="w-4 text-right">{minAppearances}</span>
        </label>
        <label className="flex items-center gap-1">
          Min. peso
          <input
            type="range" min={1} max={10} value={minWeight}
            onChange={(e) => setMinWeight(Number(e.target.value))}
            className="w-20 accent-blue-400"
          />
          <span className="w-4 text-right">{minWeight}</span>
        </label>
        {loading && <span className="text-gray-500 animate-pulse">a carregar...</span>}
        {!loading && (
          <span className="text-gray-500">
            {graphData.nodes.length} nos · {graphData.links.length} arestas
          </span>
        )}
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 bg-gray-900/80 backdrop-blur px-3 py-2 rounded-lg text-xs">
        {[
          { color: "#34d399", label: "ultimos 7 dias" },
          { color: "#60a5fa", label: "ultimo mes" },
          { color: "#a78bfa", label: "ultimo trimestre" },
          { color: "#6b7280", label: "mais antigo" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="#030712"
        nodeLabel={(node) => `${(node as Node).id} (${(node as Node).appearances?.length ?? 0}x)`}
        nodeColor={(node) => nodeColor(node as Node)}
        nodeVal={(node) => nodeSize(node as Node)}
        linkColor={() => "#374151"}
        linkWidth={(link) => Math.min(3, ((link as Edge).weight ?? 1) / 3)}
        onNodeClick={(node) => handleNodeClick(node as Node)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as Node & { x: number; y: number };
          const r = nodeSize(n);
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = nodeColor(n);
          ctx.fill();

          if (globalScale >= 2.5) {
            const label = n.id;
            ctx.font = `${10 / globalScale}px Inter, sans-serif`;
            ctx.fillStyle = "#d1d5db";
            ctx.textAlign = "center";
            ctx.fillText(label, n.x, n.y + r + 8 / globalScale);
          }
        }}
        width={typeof window !== "undefined" ? window.innerWidth * 0.62 : 800}
        height={typeof window !== "undefined" ? window.innerHeight - 56 : 600}
      />
    </div>
  );
}
