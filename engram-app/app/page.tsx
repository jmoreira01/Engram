"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import SearchPanel from "@/components/SearchPanel";

const EngramGraph = dynamic(() => import("@/components/EngramGraph"), { ssr: false });

interface SelectedNode {
  id: string;
  appearances: string[];
  sources: string[];
}

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* graph — 62% */}
      <div className="flex-1 relative">
        <EngramGraph onNodeSelect={setSelectedNode} />
      </div>

      {/* sidebar — 38% */}
      <div className="w-[38%] min-w-[320px] max-w-[480px] border-l border-gray-800">
        <SearchPanel selectedNode={selectedNode} />
      </div>
    </div>
  );
}
