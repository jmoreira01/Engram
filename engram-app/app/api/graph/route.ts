import { NextRequest, NextResponse } from "next/server";
import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";

const GRAPH_FILE = path.join(homedir(), ".engram", "graph.json");
const CACHE_TTL_MS = 60_000; // 60s

let graphCache: { nodes: RawNode[]; edges: RawEdge[] } | null = null;
let cacheTime = 0;
let cacheMtime = 0;

function loadGraph(): { nodes: RawNode[]; edges: RawEdge[] } {
  const now = Date.now();
  try {
    const mtime = statSync(GRAPH_FILE).mtimeMs;
    if (graphCache && mtime === cacheMtime && now - cacheTime < CACHE_TTL_MS) {
      return graphCache;
    }
    graphCache = JSON.parse(readFileSync(GRAPH_FILE, "utf-8"));
    cacheTime = now;
    cacheMtime = mtime;
    return graphCache!;
  } catch {
    throw new Error("graph.json not found — run engram-ingest.py first");
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const minAppearances = parseInt(searchParams.get("min_appearances") ?? "2");
  const minWeight = parseInt(searchParams.get("min_weight") ?? "2");
  const nodeId = searchParams.get("node"); // filter to neighbourhood of a node

  let raw: { nodes: RawNode[]; edges: RawEdge[] };
  try {
    raw = loadGraph();
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }

  // filter nodes
  let nodes: RawNode[] = raw.nodes.filter(
    (n) => (n.appearances?.length ?? 0) >= minAppearances
  );

  if (nodeId) {
    // neighbourhood: the node itself + its direct neighbours
    const neighbours = new Set<string>();
    neighbours.add(nodeId);
    for (const e of raw.edges) {
      if (e.source === nodeId) neighbours.add(e.target);
      if (e.target === nodeId) neighbours.add(e.source);
    }
    nodes = nodes.filter((n) => neighbours.has(n.id));
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // filter edges
  const edges = raw.edges.filter(
    (e) =>
      (e.weight ?? 1) >= minWeight &&
      nodeIds.has(e.source) &&
      nodeIds.has(e.target)
  );

  return NextResponse.json({ nodes, edges });
}

interface RawNode {
  id: string;
  appearances: string[];
  sources: string[];
}

interface RawEdge {
  source: string;
  target: string;
  weight: number;
}
