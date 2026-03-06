import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";

const GRAPH_FILE = path.join(homedir(), ".engram", "graph.json");

interface RawNode {
  id: string;
  appearances: string[];
}

export interface DiffConcept {
  concept: string;
  countA: number;
  countB: number;
  delta: number;      // countB - countA
  status: "new" | "gone" | "grew" | "shrank" | "stable";
}

export interface DiffResponse {
  periodA: string;
  periodB: string;
  concepts: DiffConcept[];
  summary: { new: number; grew: number; shrank: number; gone: number; stable: number };
}

function countInPeriod(appearances: string[], from: string, to: string): number {
  return appearances.filter((d) => d >= from && d <= to).length;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Periods as "YYYY-MM" (month granularity)
  const monthA = searchParams.get("a") ?? "";
  const monthB = searchParams.get("b") ?? "";

  if (!monthA || !monthB) {
    return NextResponse.json({ error: "params ?a=YYYY-MM&b=YYYY-MM required" }, { status: 400 });
  }

  const fromA = `${monthA}-01`, toA = `${monthA}-31`;
  const fromB = `${monthB}-01`, toB = `${monthB}-31`;

  let nodes: RawNode[];
  try {
    nodes = JSON.parse(readFileSync(GRAPH_FILE, "utf-8")).nodes ?? [];
  } catch {
    return NextResponse.json({ error: "graph.json not found" }, { status: 404 });
  }

  const concepts: DiffConcept[] = [];
  const summary = { new: 0, grew: 0, shrank: 0, gone: 0, stable: 0 };

  for (const node of nodes) {
    if (!node.appearances?.length) continue;
    const cA = countInPeriod(node.appearances, fromA, toA);
    const cB = countInPeriod(node.appearances, fromB, toB);
    if (cA === 0 && cB === 0) continue;

    let status: DiffConcept["status"];
    if (cA === 0)         status = "new";
    else if (cB === 0)    status = "gone";
    else if (cB > cA)     status = "grew";
    else if (cB < cA)     status = "shrank";
    else                  status = "stable";

    summary[status]++;
    concepts.push({ concept: node.id, countA: cA, countB: cB, delta: cB - cA, status });
  }

  // Sort: new first, then by abs(delta) desc
  concepts.sort((a, b) => {
    const order = { new: 0, grew: 1, shrank: 2, gone: 3, stable: 4 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  return NextResponse.json({
    periodA: monthA,
    periodB: monthB,
    concepts: concepts.slice(0, 80),
    summary,
  } satisfies DiffResponse);
}
