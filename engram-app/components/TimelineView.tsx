"use client";

import { useEffect, useState } from "react";

interface ConceptMonth {
  concept: string;
  count: number;
  months: Record<string, number>;
  first: string;
  last: string;
}

interface TimelineData {
  months: string[];
  concepts: ConceptMonth[];
}

interface DiffConcept {
  concept: string;
  countA: number;
  countB: number;
  delta: number;
  status: "new" | "gone" | "grew" | "shrank" | "stable";
}

interface DiffData {
  periodA: string;
  periodB: string;
  concepts: DiffConcept[];
  summary: { new: number; grew: number; shrank: number; gone: number; stable: number };
}

const STATUS_COLOR: Record<string, string> = {
  new:    "text-emerald-400",
  grew:   "text-blue-400",
  shrank: "text-amber-400",
  gone:   "text-red-400",
  stable: "text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  new: "novo", grew: "cresceu", shrank: "diminuiu", gone: "desapareceu", stable: "estável",
};

function cellColor(count: number, max: number): string {
  if (count === 0) return "bg-gray-800";
  const intensity = Math.ceil((count / max) * 4);
  return ["", "bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-emerald-400"][intensity] ?? "bg-emerald-400";
}

export default function TimelineView() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [monthA, setMonthA] = useState("");
  const [monthB, setMonthB] = useState("");
  const [view, setView] = useState<"heatmap" | "diff">("heatmap");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/timeline").then((r) => r.json()).then((d) => {
      setData(d);
      if (d.months?.length >= 2) {
        setMonthA(d.months[0]);
        setMonthB(d.months[d.months.length - 1]);
      }
    });
  }, []);

  async function fetchDiff() {
    if (!monthA || !monthB || monthA === monthB) return;
    setLoading(true);
    const r = await fetch(`/api/diff?a=${monthA}&b=${monthB}`);
    setDiff(await r.json());
    setLoading(false);
    setView("diff");
  }

  if (!data) return <p className="text-gray-600 text-sm p-4">A carregar timeline...</p>;

  const maxCount = Math.max(...data.concepts.map((c) =>
    Math.max(...Object.values(c.months))
  ), 1);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* tab bar */}
      <div className="flex border-b border-gray-800 text-sm flex-shrink-0">
        <button
          onClick={() => setView("heatmap")}
          className={`flex-1 py-2 ${view === "heatmap" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500 hover:text-gray-300"}`}
        >
          Heatmap
        </button>
        <button
          onClick={() => setView("diff")}
          className={`flex-1 py-2 ${view === "diff" ? "text-purple-400 border-b-2 border-purple-400" : "text-gray-500 hover:text-gray-300"}`}
        >
          Diff
        </button>
      </div>

      {/* diff controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 text-xs flex-shrink-0">
        <select
          value={monthA}
          onChange={(e) => setMonthA(e.target.value)}
          className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs"
        >
          {data.months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-gray-600">→</span>
        <select
          value={monthB}
          onChange={(e) => setMonthB(e.target.value)}
          className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs"
        >
          {data.months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button
          onClick={fetchDiff}
          disabled={loading || monthA === monthB}
          className="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded disabled:opacity-40 transition-colors"
        >
          {loading ? "..." : "Comparar"}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {view === "heatmap" ? (
          <HeatmapView data={data} maxCount={maxCount} />
        ) : diff ? (
          <DiffView diff={diff} />
        ) : (
          <p className="text-gray-600 text-sm p-4 text-center">
            Selecciona dois meses e clica Comparar.
          </p>
        )}
      </div>
    </div>
  );
}

function HeatmapView({ data, maxCount }: { data: TimelineData; maxCount: number }) {
  return (
    <div className="overflow-auto">
      <table className="text-xs w-full border-collapse">
        <thead className="sticky top-0 bg-gray-950 z-10">
          <tr>
            <th className="text-left px-3 py-1.5 text-gray-500 font-normal w-32">conceito</th>
            {data.months.map((m) => (
              <th key={m} className="px-1 py-1.5 text-gray-500 font-normal min-w-[40px] text-center">
                {m.slice(5)}
              </th>
            ))}
            <th className="px-2 py-1.5 text-gray-500 font-normal">total</th>
          </tr>
        </thead>
        <tbody>
          {data.concepts.map((c) => (
            <tr key={c.concept} className="hover:bg-gray-900/50">
              <td className="px-3 py-0.5 text-gray-300 truncate max-w-[128px]">{c.concept}</td>
              {data.months.map((m) => {
                const count = c.months[m] ?? 0;
                return (
                  <td key={m} className={`text-center py-0.5`}>
                    <span
                      className={`inline-block w-6 h-4 rounded-sm ${cellColor(count, maxCount)}`}
                      title={count > 0 ? `${c.concept} em ${m}: ${count}x` : undefined}
                    />
                  </td>
                );
              })}
              <td className="px-2 py-0.5 text-gray-500 text-right">{c.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiffView({ diff }: { diff: DiffData }) {
  const { summary } = diff;
  const filters = ["new", "grew", "shrank", "gone"] as const;
  const [active, setActive] = useState<string | null>(null);

  const shown = active
    ? diff.concepts.filter((c) => c.status === active)
    : diff.concepts.filter((c) => c.status !== "stable");

  return (
    <div className="p-3 space-y-3">
      {/* summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {filters.map((s) => (
          <button
            key={s}
            onClick={() => setActive(active === s ? null : s)}
            className={`px-2 py-0.5 rounded-full border transition-colors ${
              active === s
                ? `${STATUS_COLOR[s]} border-current`
                : "text-gray-500 border-gray-700 hover:border-gray-500"
            }`}
          >
            {STATUS_LABEL[s]} <span className="font-mono">{summary[s]}</span>
          </button>
        ))}
        <span className="text-gray-600 self-center">
          {diff.periodA} → {diff.periodB}
        </span>
      </div>

      {/* concept list */}
      <div className="space-y-1">
        {shown.slice(0, 50).map((c) => (
          <div key={c.concept} className="flex items-center gap-2 text-xs">
            <span className={`w-16 text-right font-mono ${STATUS_COLOR[c.status]}`}>
              {c.status === "new" ? "novo" :
               c.status === "gone" ? "gone" :
               c.delta > 0 ? `+${c.delta}` : `${c.delta}`}
            </span>
            <span className="text-gray-300 flex-1">{c.concept}</span>
            <span className="text-gray-600 font-mono">
              {c.countA}→{c.countB}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
