import React, { useEffect, useRef, useState } from "react";

export default function PDBViewer({ clusterId, height = 350 }) {
  const viewerRef  = useRef(null);
  const stageRef   = useRef(null);
  const [error, setError]     = useState(false);
  const [ready, setReady]     = useState(false);

  useEffect(() => {
    if (!viewerRef.current) return;

    // If stage already exists from previous run, dispose it first
    if (stageRef.current) {
      stageRef.current.dispose();
      stageRef.current = null;
    }

    setError(false);
    setReady(false);

    let cancelled = false;

    import("ngl").then(NGL => {
      if (cancelled) return;

      const stage = new NGL.Stage(viewerRef.current, {
        backgroundColor: "white",
      });
      stageRef.current = stage;

      stage.loadFile(`/pdb/${clusterId}.pdb`, { ext: "pdb" })
        .then(component => {
          if (cancelled) return;
          component.addRepresentation("cartoon", {
            colorScheme: "residueindex",
          });
          component.autoView();
          setReady(true);
        })
        .catch(err => {
          if (cancelled) return;
          console.error("PDB load error:", err);
          setError(true);
        });

    }).catch(err => {
      if (cancelled) return;
      console.error("NGL import error:", err);
      setError(true);
    });

    return () => {
      cancelled = true;
      if (stageRef.current) {
        stageRef.current.dispose();
        stageRef.current = null;
      }
    };
  }, [clusterId]);

  if (error) return (
    <div style={{
      height,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--muted)",
      fontFamily: "var(--mono)",
      fontSize: 12,
      background: "var(--cream)",
    }}>
      No structure available
    </div>
  );

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={viewerRef} style={{ width: "100%", height, display: "block" }} />
      {!ready && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--cream)",
          fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)",
        }}>
          Loading structure…
        </div>
      )}
    </div>
  );
}