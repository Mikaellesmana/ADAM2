import { Link, useLocation } from "react-router-dom";

// Shown for any address the router does not know. Before this existed, a
// mistyped or stale link rendered an empty page between header and footer.
export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <section style={{ background: "#F3F3F1", padding: "96px 24px 120px", minHeight: "55vh" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c93333", marginBottom: 12 }}>
          404 · Page not found
        </p>
        <h1 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 32, fontWeight: 400, color: "#2a2a2a", marginBottom: 12 }}>
          There is no page here
        </h1>
        <p style={{ fontSize: 14, color: "#6b6b6b", lineHeight: 1.7, marginBottom: 28 }}>
          Nothing lives at <code style={{ fontFamily: "'IBM Plex Mono', monospace", background: "#e9e7e2", padding: "1px 6px", borderRadius: 4 }}>{pathname}</code>.
          The link may be out of date or mistyped.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/" style={{ background: "#2a2a2a", color: "#fff", padding: "10px 22px", borderRadius: 6, textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
            Go to the home page
          </Link>
          <Link to="/search" style={{ border: "1px solid #cccac4", color: "#2a2a2a", padding: "10px 22px", borderRadius: 6, textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
            Search peptides
          </Link>
        </div>
      </div>
    </section>
  );
}
