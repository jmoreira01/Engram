"use client";

import { useState } from "react";

interface SearchResult {
  score: number;
  text: string;
  source: string;
  date: string;
  concepts: string[];
}

interface SelectedNode {
  id: string;
  appearances: string[];
  sources: string[];
}

export default function SearchPanel({ selectedNode }: { selectedNode: SelectedNode | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"search" | "node">("search");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setView("search");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }

  const showNode = selectedNode && view === "node";

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* header */}
      <div className="p-3 border-b border-gray-800">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca semantica..."
            className="flex-1 bg-gray-800 text-sm px-3 py-1.5 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-sm rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : "Buscar"}
          </button>
        </form>
      </div>

      {/* tabs (when node is selected) */}
      {selectedNode && (
        <div className="flex border-b border-gray-800 text-sm">
          <button
            onClick={() => setView("search")}
            className={`flex-1 py-2 ${view === "search" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            Resultados
          </button>
          <button
            onClick={() => setView("node")}
            className={`flex-1 py-2 ${view === "node" ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            {selectedNode.id}
          </button>
        </div>
      )}

      {/* content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {showNode ? (
          <NodeDetail node={selectedNode} />
        ) : results.length > 0 ? (
          results.map((r, i) => <SearchResultCard key={i} result={r} />)
        ) : (
          <p className="text-gray-600 text-sm text-center mt-8">
            Clica num no do grafo ou faz uma busca.
          </p>
        )}
      </div>
    </div>
  );
}

function NodeDetail({ node }: { node: SelectedNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-blue-300 mb-1">{node.id}</h2>
        <p className="text-xs text-gray-500">
          {node.appearances.length} {node.appearances.length !== 1 ? "aparicoes" : "aparicao"}
        </p>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Timeline</h3>
        <div className="space-y-1">
          {[...node.appearances].sort().map((date) => (
            <div key={date} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-sm text-gray-300">{date}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Fontes</h3>
        <div className="space-y-1">
          {node.sources.map((src) => (
            <div key={src} className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
              {src}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{result.source}</span>
        <span className="text-xs font-mono text-emerald-500">
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>
      <p className="text-sm text-gray-200 leading-relaxed line-clamp-4">{result.text}</p>
      {result.concepts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.concepts.slice(0, 6).map((c) => (
            <span key={c} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
