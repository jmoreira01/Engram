"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import SearchPanel from "@/components/SearchPanel";
import TimelineView from "@/components/TimelineView";

const EngramGraph = dynamic(() => import("@/components/EngramGraph"), { ssr: false });

interface SelectedNode {
  id: string;
  appearances: string[];
  sources: string[];
}

type SidebarTab = "search" | "timeline";

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("search");

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* graph — 62% */}
      <div className="flex-1 relative">
        <EngramGraph onNodeSelect={(node) => { setSelectedNode(node); setSidebarTab("search"); }} />
      </div>

      {/* sidebar — 38% */}
      <div className="w-[38%] min-w-[320px] max-w-[480px] border-l border-gray-800 flex flex-col">
        {/* top-level tabs */}
        <div className="flex border-b border-gray-800 text-sm flex-shrink-0">
          <button
            onClick={() => setSidebarTab("search")}
            className={`flex-1 py-2 font-medium ${sidebarTab === "search" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            Engram
          </button>
          <button
            onClick={() => setSidebarTab("timeline")}
            className={`flex-1 py-2 font-medium ${sidebarTab === "timeline" ? "text-purple-400 border-b-2 border-purple-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            Timeline
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {sidebarTab === "search" ? (
            <SearchPanel selectedNode={selectedNode} />
          ) : (
            <TimelineView />
          )}
        </div>
      </div>
    </div>
  );
}
