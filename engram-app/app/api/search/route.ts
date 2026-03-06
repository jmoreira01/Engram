import { NextRequest, NextResponse } from "next/server";

const OLLAMA_URL = "http://localhost:11434/api/embeddings";
const QDRANT_URL = "http://localhost:6333";
const COLLECTION = "engram";

// Pre-warm Ollama on module load — absorbs cold-start (~1.7s) before first user request
fetch(OLLAMA_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "nomic-embed-text", prompt: "memória identidade conhecimento grafo conceitos", keep_alive: "30m" }),
}).catch(() => {});

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query?.trim()) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  // get embedding from Ollama
  let embedding: number[];
  try {
    const ollamaRes = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: query, keep_alive: "30m" }),
    });
    const ollamaData = await ollamaRes.json();
    embedding = ollamaData.embedding;
  } catch (e) {
    return NextResponse.json({ error: "Ollama unavailable" }, { status: 503 });
  }

  // search Qdrant
  try {
    const qdrantRes = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: embedding, limit: 8, with_payload: true }),
      }
    );
    const qdrantData = await qdrantRes.json();
    const results = (qdrantData.result ?? []).map((r: QdrantResult) => ({
      score: r.score,
      text: r.payload.text,
      source: r.payload.source,
      date: r.payload.date,
      concepts: r.payload.concepts ?? [],
    }));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: "Qdrant unavailable" }, { status: 503 });
  }
}

interface QdrantResult {
  score: number;
  payload: {
    text: string;
    source: string;
    date: string;
    concepts: string[];
  };
}
