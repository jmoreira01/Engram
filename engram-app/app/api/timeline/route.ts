import { NextResponse } from "next/server";
import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";

const GRAPH_FILE = path.join(homedir(), ".engram", "graph.json");

let cache: TimelineResponse | null = null;
let cacheMtime = 0;

interface RawNode {
  id: string;
  appearances: string[];
  sources: string[];
}

export interface ConceptMonth {
  concept: string;
  count: number;  // total appearances
  months: Record<string, number>; // "YYYY-MM" → count in that month
  first: string;  // first appearance date
  last: string;   // last appearance date
}

export interface TimelineResponse {
  months: string[];           // sorted list of all months present
  concepts: ConceptMonth[];   // sorted by total count desc
}

function build(): TimelineResponse {
  const mtime = statSync(GRAPH_FILE).mtimeMs;
  if (cache && mtime === cacheMtime) return cache;

  const data = JSON.parse(readFileSync(GRAPH_FILE, "utf-8"));
  const nodes: RawNode[] = data.nodes ?? [];

  const allMonths = new Set<string>();
  const concepts: ConceptMonth[] = [];

  for (const node of nodes) {
    if (!node.appearances?.length) continue;
    const months: Record<string, number> = {};
    for (const d of node.appearances) {
      const m = d.slice(0, 7); // "YYYY-MM"
      allMonths.add(m);
      months[m] = (months[m] ?? 0) + 1;
    }
    concepts.push({
      concept: node.id,
      count: node.appearances.length,
      months,
      first: node.appearances[0],
      last: node.appearances[node.appearances.length - 1],
    });
  }

  concepts.sort((a, b) => b.count - a.count);
  const months = [...allMonths].sort();

  cache = { months, concepts };
  cacheMtime = mtime;
  return cache;
}

export async function GET() {
  try {
    const data = build();
    // Return top 60 concepts (enough for a useful view)
    return NextResponse.json({ ...data, concepts: data.concepts.slice(0, 60) });
  } catch {
    return NextResponse.json({ error: "graph.json not found" }, { status: 404 });
  }
}
