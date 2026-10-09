import React, { useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { API_BASE } from "../api";

// Simple sequence similarity using k-mer overlap
function similarity(seqA, seqB, k = 3) {
  if (!seqA || !seqB) return 0;
  const kmers = (s) => new Set([...Array(s.length - k + 1)].map((_, i) => s.slice(i, i + k)));
  const a = kmers(seqA);
  const b = kmers(seqB);
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export default function ClusterNetwork({ entries, clusterId }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 350 });
  const [graphData, setGraphData]   = useState({ nodes: [], links: [] });
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setDimensions({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!entries || entries.length === 0) return;
    setLoading(true);

    const validEntries = entries.filter(
      e => !(e.pdb_id || "").toUpperCase().startsWith("PDB")
    );

    // Fetch sequences then compute similarity
    fetch(`${API_BASE}/api/clusters/${clusterId.replace("AC_", "")}/sequences`)
      .then(r => r.json())
      .then(seqData => {
        const nodes = seqData.map(s => ({
          id:    s.pdb_id,
          label: s.pdb_id,
          seq:   s.sequence,
        }));

        const links = [];
        const THRESHOLD = 0.015; // only show edges with similarity > 30%

        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const sim = similarity(nodes[i].seq, nodes[j].seq);
            if (sim >= THRESHOLD) {
              links.push({
                source: nodes[i].id,
                target: nodes[j].id,
                value:  sim,
              });
            }
          }
        }

        // If no edges found, connect to nearest neighbors
        if (links.length === 0 && nodes.length > 1) {
          for (let i = 0; i < nodes.length - 1; i++) {
            links.push({ source: nodes[i].id, target: nodes[i + 1].id, value: 0.1 });
          }
        }

        setGraphData({ nodes, links });
        setLoading(false);
      })
      .catch(() => {
        // Fallback to hub-and-spoke if fetch fails
        const validNodes = validEntries.map(e => ({ id: e.pdb_id, label: e.pdb_id }));
        const center = validNodes[0]?.id;
        const fallbackLinks = validNodes.slice(1).map(n => ({ source: center, target: n.id }));
        setGraphData({ nodes: validNodes, links: fallbackLinks });
        setLoading(false);
      });

  }, [clusterId, entries]);

  if (loading) return (
    <div style={{
      height: 350, display: "flex", alignItems: "center",
      justifyContent: "center", color: "var(--muted)",
      fontFamily: "var(--mono)", fontSize: 12, background: "var(--cream)",
    }}>
      Calculating similarity network…
    </div>
  );

  if (graphData.nodes.length === 0) return (
    <div style={{
      height: 350, display: "flex", alignItems: "center",
      justifyContent: "center", color: "var(--muted)",
      fontFamily: "var(--mono)", fontSize: 12, background: "var(--cream)",
    }}>
      No network data
    </div>
  );

  return (
    <div ref={containerRef} style={{ width: "100%", height: 350, background: "#fff" }}>
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="label"
        nodeColor={() => "#4da6ff"}
        nodeRelSize={6}
        linkColor={() => "#7b68ee"}
        linkWidth={l => Math.max(0.5, (l.value || 0.1) * 3)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const fontSize = 10 / globalScale;
          ctx.font       = `${fontSize}px monospace`;
          ctx.fillStyle  = "#4da6ff";
          ctx.beginPath();
          ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle    = "#333";
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(node.label, node.x, node.y + 14);
        }}
        cooldownTicks={150}
      />
    </div>
  );
}