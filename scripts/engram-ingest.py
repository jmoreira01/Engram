#!/usr/bin/env python3
"""
engram-ingest.py — Pipeline de ingestao do Engram

Para cada ficheiro fonte:
  1. Chunk semantico (via rag_lib)
  2. Embedding via Ollama (nomic-embed-text, 768d)
  3. Armazenar em Qdrant (coleccao 'engram')
  4. Extrair conceitos e actualizar grafo NetworkX (JSON)

Incremental por SHA256 — so reprocessa ficheiros alterados.

Uso:
  python3 engram-ingest.py [--reindex] [--verbose]
"""

import sys
import json
import hashlib
import re
import argparse
import requests
from pathlib import Path
from datetime import datetime
from collections import Counter

import networkx as nx
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter,
    FieldCondition, MatchValue
)

sys.path.insert(0, str(Path.home() / "scripts"))
from rag_lib import chunk_text, tokenize

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_URL   = "http://localhost:11434/api/embeddings"
OLLAMA_MODEL = "nomic-embed-text"
QDRANT_URL   = "http://localhost:6333"
COLLECTION   = "engram"
VECTOR_SIZE  = 768

ENGRAM_DIR   = Path.home() / ".engram"
STATE_FILE   = ENGRAM_DIR / "ingest-state.json"
GRAPH_FILE   = ENGRAM_DIR / "graph.json"

# Fontes de dados (ficheiros ou diretorios)
SOURCES = [
    Path.home() / "memory" / "diario",
    Path.home() / "memory" / "MEMORY.md",
    Path.home() / "memory" / "projetos",
    Path.home() / "llm-library",
]


# ── Utilitarios ───────────────────────────────────────────────────────────────

def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chunk_id(filepath: str, chunk_index: int) -> str:
    return hashlib.sha256(f"{filepath}:{chunk_index}".encode()).hexdigest()


def get_embedding(text: str) -> list[float]:
    resp = requests.post(OLLAMA_URL, json={"model": OLLAMA_MODEL, "prompt": text}, timeout=60)
    resp.raise_for_status()
    return resp.json()["embedding"]


def extract_date(path: Path) -> str:
    """Data do ficheiro: nome (YYYY-MM-DD.md) ou mtime como fallback."""
    m = re.match(r"(\d{4}-\d{2}-\d{2})", path.stem)
    if m:
        return m.group(1)
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")


def extract_concepts(text: str, top_n: int = 15) -> list[str]:
    """
    Extrai conceitos de um chunk de texto.
    Heuristica: tokens com >4 chars, mais frequentes, filtrados de stopwords.
    Inclui bigramas relevantes.
    """
    tokens = tokenize(text)
    # unigrams com pelo menos 4 chars
    unigrams = [t for t in tokens if len(t) >= 4]

    # bigramas de tokens com >4 chars
    bigrams = []
    for i in range(len(tokens) - 1):
        if len(tokens[i]) >= 4 and len(tokens[i+1]) >= 4:
            bigrams.append(f"{tokens[i]}_{tokens[i+1]}")

    counts = Counter(unigrams + bigrams)
    return [term for term, _ in counts.most_common(top_n)]


def collect_files() -> list[Path]:
    """Recolhe todos os ficheiros .md das fontes (recursivo em diretorios)."""
    files = []
    for source in SOURCES:
        if source.is_file():
            files.append(source)
        elif source.is_dir():
            files.extend(sorted(source.rglob("*.md")))
    return files


# ── Estado incremental ────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict):
    ENGRAM_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── Grafo ─────────────────────────────────────────────────────────────────────

def load_graph() -> nx.Graph:
    if GRAPH_FILE.exists():
        data = json.loads(GRAPH_FILE.read_text())
        return nx.node_link_graph(data)
    return nx.Graph()


def save_graph(G: nx.Graph):
    """Persiste o grafo, omitindo arestas de peso 1 (co-ocorrencia unica = ruido)."""
    ENGRAM_DIR.mkdir(parents=True, exist_ok=True)
    data = nx.node_link_data(G)
    data["edges"] = [e for e in data["edges"] if e.get("weight", 1) >= 2]
    GRAPH_FILE.write_text(json.dumps(data, indent=2))


def update_graph(G: nx.Graph, concepts: list[str], source: str, date: str | None):
    """
    Actualiza o grafo:
    - Cada conceito e um no (com lista de aparicoes)
    - Conceitos co-ocorrentes no mesmo chunk ficam ligados
    """
    timestamp = date or datetime.now().strftime("%Y-%m-%d")

    for concept in concepts:
        if not G.has_node(concept):
            G.add_node(concept, appearances=[], sources=[])
        node = G.nodes[concept]
        if timestamp not in node["appearances"]:
            node["appearances"].append(timestamp)
        if source not in node["sources"]:
            node["sources"].append(source)

    # arestas por co-ocorrencia
    for i, c1 in enumerate(concepts):
        for c2 in concepts[i+1:]:
            if G.has_edge(c1, c2):
                G[c1][c2]["weight"] = G[c1][c2].get("weight", 0) + 1
            else:
                G.add_edge(c1, c2, weight=1)


def remove_file_from_graph(G: nx.Graph, source: str):
    """Remove contribuicoes de um ficheiro do grafo (ao reindexar)."""
    to_remove = []
    for node in G.nodes:
        sources = G.nodes[node].get("sources", [])
        if source in sources:
            sources.remove(source)
        if not sources:
            to_remove.append(node)
    G.remove_nodes_from(to_remove)


# ── Qdrant ────────────────────────────────────────────────────────────────────

def init_qdrant() -> QdrantClient:
    client = QdrantClient(url=QDRANT_URL)
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        print(f"Coleccao '{COLLECTION}' criada.")
    return client


def delete_file_from_qdrant(client: QdrantClient, filepath: str):
    """Remove todos os pontos de um ficheiro da coleccao."""
    client.delete(
        collection_name=COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="filepath", match=MatchValue(value=filepath))]
        ),
    )


# ── Pipeline principal ────────────────────────────────────────────────────────

def ingest_file(
    path: Path,
    client: QdrantClient,
    G: nx.Graph,
    state: dict,
    reindex: bool,
    verbose: bool,
) -> bool:
    """
    Processa um ficheiro. Devolve True se foi (re)indexado.
    """
    filepath = str(path)
    current_hash = file_hash(path)

    if not reindex and state.get(filepath) == current_hash:
        if verbose:
            print(f"  [skip] {path.name}")
        return False

    if verbose:
        print(f"  [ingest] {path.name}")

    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.strip():
        return False

    date = extract_date(path)
    source_label = path.parent.name + "/" + path.name

    # Limpar entradas antigas
    delete_file_from_qdrant(client, filepath)
    remove_file_from_graph(G, source_label)

    chunks = chunk_text(text)
    points = []

    for i, chunk in enumerate(chunks):
        cid = chunk_id(filepath, i)
        embedding = get_embedding(chunk)
        concepts = extract_concepts(chunk)
        update_graph(G, concepts, source_label, date)

        points.append(PointStruct(
            id=int(hashlib.sha256(cid.encode()).hexdigest()[:15], 16),
            vector=embedding,
            payload={
                "filepath":  filepath,
                "filename":  path.name,
                "source":    source_label,
                "date":      date or "",
                "chunk_idx": i,
                "text":      chunk,
                "concepts":  concepts,
            },
        ))

    if points:
        client.upsert(collection_name=COLLECTION, points=points)

    state[filepath] = current_hash

    if verbose:
        print(f"    -> {len(chunks)} chunks, {len(points)} pontos")

    return True


def status():
    try:
        client = QdrantClient(url=QDRANT_URL)
        count = client.count(collection_name=COLLECTION).count
        print(f"Qdrant '{COLLECTION}': {count} pontos")
    except Exception as e:
        print(f"Qdrant: erro — {e}")

    state = load_state()
    print(f"Ficheiros indexados: {len(state)}")
    for k in sorted(state.keys()):
        print(f"  {k}")

    G = load_graph()
    print(f"Grafo: {G.number_of_nodes()} nos, {G.number_of_edges()} arestas")


def main():
    parser = argparse.ArgumentParser(description="Engram ingest pipeline")
    parser.add_argument("--reindex", action="store_true", help="Reindexar tudo")
    parser.add_argument("--verbose", "-v", action="store_true", help="Output detalhado")
    parser.add_argument("--status", action="store_true", help="Mostra estado actual")
    args = parser.parse_args()

    if args.status:
        status()
        return

    ENGRAM_DIR.mkdir(parents=True, exist_ok=True)

    print("Engram ingest — a iniciar...")
    client = init_qdrant()
    G = load_graph()
    state = {} if args.reindex else load_state()

    files = collect_files()
    print(f"Ficheiros encontrados: {len(files)}")

    processed = 0
    for path in files:
        if ingest_file(path, client, G, state, args.reindex, args.verbose):
            processed += 1

    save_state(state)
    save_graph(G)

    total_points = client.count(collection_name=COLLECTION).count
    print(f"\nFeito. {processed} ficheiros processados.")
    print(f"Qdrant: {total_points} pontos em '{COLLECTION}'")
    print(f"Grafo: {G.number_of_nodes()} nos, {G.number_of_edges()} arestas")
    print(f"Estado: {STATE_FILE}")
    print(f"Grafo: {GRAPH_FILE}")


if __name__ == "__main__":
    main()
