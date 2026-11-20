import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../api";
import PDBViewer from "./PDBViewer";

const FILE_URL = (dataset, file) => `${API_BASE}/api/research/file?dataset=${dataset}&file=${encodeURIComponent(file)}`;
const PAGE_SIZE = 24;

export default function ResearchResults() {
  const [tab, setTab] = useState("esmfold");
  const [catalog, setCatalog] = useState({ esmfold: [], alphafold: [] });
  const [analysis, setAnalysis] = useState([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const detailRef = useRef(null);

  // On a phone the details sit below the list, so jump to them after a tap.
  function choose(item) {
    setSelected(item);
    if (window.matchMedia("(max-width: 760px)").matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/research/catalog`).then((r) => { if (!r.ok) throw new Error("Could not load structure archives."); return r.json(); }),
      fetch(`${API_BASE}/api/research/sequence-analysis`).then((r) => { if (!r.ok) throw new Error("Could not load sequence analysis."); return r.json(); }),
    ]).then(([results, sequenceResults]) => {
      setCatalog(results);
      setAnalysis(sequenceResults);
      setError("");
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const list = tab === "sequence" ? analysis : (catalog[tab] || []);
    const needle = query.trim().toLowerCase();
    return needle ? list.filter((item) => `${item.id} ${item.sequence || ""}`.toLowerCase().includes(needle)) : list;
  }, [analysis, catalog, query, tab]);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function changeTab(next) { setTab(next); setQuery(""); setPage(0); setSelected(null); }

  return <div className="research-page">
    <style>{`
      .research-page{max-width:1200px;margin:0 auto;padding:52px 32px 80px;color:#272727;font-family:'IBM Plex Sans',sans-serif}
      .research-kicker{font:600 11px 'IBM Plex Mono',monospace;letter-spacing:.13em;text-transform:uppercase;color:#a80000}
      .research-page h1{font:500 clamp(32px,5vw,48px) 'Source Serif 4',Georgia,serif;margin:12px 0 10px}
      .research-intro{max-width:760px;color:#666;line-height:1.7;margin:0 0 28px}
      .research-tabs{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #ddd;margin-bottom:24px}
      .research-tab{background:none;border:0;padding:12px 16px;color:#666;font-family:inherit;font-size:14px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent}
      .research-tab.active{color:#a80000;border-color:#a80000}
      .research-tools{display:flex;gap:14px;align-items:center;justify-content:space-between;margin:20px 0;color:#777;font-size:13px}
      .research-search{width:min(420px,100%);padding:11px 13px;border:1px solid #d7d7d3;border-radius:7px;background:white;font-family:inherit;font-size:14px}
      .research-layout{display:grid;grid-template-columns:minmax(240px, .72fr) minmax(0,1.5fr);gap:20px;align-items:start}
      .research-list,.research-detail{background:#fff;border:1px solid #e5e3df;border-radius:10px;overflow:hidden}
      .research-list{max-height:710px;overflow:auto}
      .research-row{width:100%;text-align:left;padding:13px 15px;border:0;border-bottom:1px solid #efeeeb;background:white;cursor:pointer;color:#333}
      .research-row:hover,.research-row.selected{background:#fff7f5}.research-row strong{display:block;font:500 13px 'IBM Plex Mono',monospace;overflow-wrap:anywhere}
      .research-row span{display:block;color:#999;font-size:11px;margin-top:5px}
      .research-detail{padding:20px;min-height:360px}.research-detail h2{font:500 20px 'IBM Plex Mono',monospace;overflow-wrap:anywhere;margin:0 0 8px}
      .research-meta{font-size:12px;color:#777;line-height:1.7;margin-bottom:16px}.research-visual{background:#f6f6f3;border-radius:8px;overflow:hidden;margin:14px 0}.research-visual img{width:100%;display:block}
      .research-detail iframe{width:100%;height:480px;border:0;background:white}.research-structure{height:380px;border:1px solid #eee;border-radius:8px;overflow:hidden}
      .research-links{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.research-links a{color:#a80000;font-size:13px;text-decoration:none}.research-links a:hover{text-decoration:underline}
      .research-feature{border-top:1px solid #eee;padding:14px 0}.research-feature-head{display:flex;justify-content:space-between;gap:12px;font-size:13px}.research-feature p{font-size:12px;line-height:1.65;color:#666;white-space:pre-wrap;margin:8px 0}
      .research-bar{height:5px;background:#eee;border-radius:5px;margin-top:8px}.research-bar i{display:block;height:100%;background:#c93333;border-radius:5px}
      .research-pager{display:flex;justify-content:space-between;align-items:center;padding:12px;color:#777;font-size:12px}.research-pager button{background:white;border:1px solid #ddd;border-radius:5px;padding:6px 10px;cursor:pointer}
      .research-empty{padding:36px 18px;text-align:center;color:#888;font-size:13px;line-height:1.6}.research-error{padding:14px 16px;background:#fff1ee;border-radius:8px;color:#8c2020;font-size:13px}
      @media(max-width:760px){.research-page{padding:36px 18px 60px}.research-layout{grid-template-columns:1fr}.research-list{max-height:300px}.research-tools{align-items:stretch;flex-direction:column}.research-detail{padding:15px}
        .research-tabs{flex-wrap:nowrap;overflow-x:auto;gap:2px;scrollbar-width:none}.research-tabs::-webkit-scrollbar{display:none}
        .research-tab{padding:10px 12px;white-space:nowrap;flex-shrink:0}
        .research-detail{scroll-margin-top:72px}.research-detail h2{font-size:15px;line-height:1.4}
        .research-detail iframe{height:360px}.research-structure{height:300px}}
    `}</style>
    <div className="research-kicker">ADAM · Data Explorer</div>
    <h1>Research Results</h1>
    <p className="research-intro">Explore predicted protein structures, model confidence, feature plots, and sequence level analysis. Results are read from the project archives as needed; the large source ZIP files stay intact.</p>
    <div className="research-tabs" role="tablist" aria-label="Result collections">
      {[ ["esmfold","ESMFold"],["alphafold","AlphaFold"],["sequence","Sequence analysis"] ].map(([id,label]) => <button key={id} role="tab" aria-selected={tab===id} className={`research-tab${tab===id?" active":""}`} onClick={()=>changeTab(id)}>{label}</button>)}
    </div>
    {error && <div className="research-error">{error} Start the project backend with the usual project launcher, then reload this page.</div>}
    <div className="research-tools"><input className="research-search" value={query} onChange={(event)=>{setQuery(event.target.value);setPage(0);setSelected(null)}} placeholder={tab === "sequence" ? "Search by sequence" : "Search by peptide sequence or result ID"} aria-label="Search research results"/><span>{loading ? "Reading archives…" : `${rows.length.toLocaleString()} results`}</span></div>
    {!loading && !error && <div className="research-layout">
      <section className="research-list" aria-label="Available results">
        {pageRows.map((item,index)=><button key={`${item.id}-${index}`} className={`research-row${selected===item?" selected":""}`} onClick={()=>choose(item)}><strong>{tab === "sequence" ? `Sequence ${item.sequence_index}` : item.id}</strong><span>{tab === "sequence" ? `${item.sequence_length} residues · ${item.top_features?.length || 0} feature descriptions` : `${item.sequence ? `${item.sequence.length} residues` : "Predicted structure"} · ${(item.available || Object.keys(item.files || {})).join(" · ")}`}</span></button>)}
        {!pageRows.length&&<div className="research-empty">No matching results. Try a shorter search term.</div>}
        <div className="research-pager"><span>{rows.length ? `${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,rows.length)} of ${rows.length}` : "0 results"}</span><div><button disabled={page===0} onClick={()=>setPage((p)=>Math.max(0,p-1))}>Previous</button> <button disabled={(page+1)*PAGE_SIZE>=rows.length} onClick={()=>setPage((p)=>p+1)}>Next</button></div></div>
      </section>
      <section className="research-detail" aria-live="polite" ref={detailRef}>
        {!selected ? <div className="research-empty">Choose a result to view its structure, plots, confidence data, or feature descriptions.</div> : tab === "sequence" ? <SequenceDetail item={selected}/> : <StructureDetail item={selected} dataset={tab}/>}
      </section>
    </div>}
  </div>;
}

function StructureDetail({item,dataset}) {
  const [confidence,setConfidence]=useState(null);
  useEffect(()=>{
    setConfidence(null);
    if(dataset!=="alphafold"||!item.files.confidence)return;
    fetch(FILE_URL(dataset,item.files.confidence)).then((r)=>r.json()).then(setConfidence).catch(()=>setConfidence({error:true}));
  },[dataset,item]);
  const structure=item.files.structure;
  const plot=item.files.plot;
  const viewer=item.files.viewer;
  return <>
    <h2>{item.sequence || item.id}</h2>
    <div className="research-meta">{dataset === "esmfold" ? `ESMFold prediction · ${item.sequence?.length || ""} residues` : `AlphaFold prediction · ${item.id}`}<br/>{item.sequence && `Sequence: ${item.sequence}`}</div>
    {structure&&<><div className="research-structure"><PDBViewer clusterId={item.id} structureUrl={FILE_URL(dataset,structure)} height={378}/></div><div className="research-links"><a href={FILE_URL(dataset,structure)} download={`${item.id}.${structure.toLowerCase().endsWith(".cif")?"cif":"pdb"}`}>Download structure</a>{item.files.confidence&&<a href={FILE_URL(dataset,item.files.confidence)} target="_blank" rel="noreferrer">Open confidence JSON</a>}</div></>}
    {plot&&<div className="research-visual"><img src={FILE_URL(dataset,plot)} alt={`ESMFold feature plots for ${item.id}`} loading="lazy"/></div>}
    {viewer&&<div className="research-visual"><iframe title={`Structure report for ${item.id}`} src={FILE_URL(dataset,viewer)}/></div>}
    {confidence&&<div className="research-feature"><strong>Model confidence summary</strong><p>{confidence.error ? "Confidence data could not be loaded." : Object.entries(confidence).filter(([,value])=>typeof value === "number" || (Array.isArray(value)&&value.length<12)).map(([key,value])=>`${key.replaceAll("_"," ")}: ${Array.isArray(value)?value.map((v)=>typeof v==="number"?v.toFixed(2):v).join(", "):value.toFixed(2)}`).join("\n")}</p></div>}
    {!structure&&!plot&&!viewer&&<div className="research-empty">This result has summary data but no displayable structure or plot file.</div>}
  </>;
}

function SequenceDetail({item}) {
  const top=item.top_features || [];
  return <>
    <h2>Sequence {item.sequence_index}</h2>
    <div className="research-meta">{item.sequence_length} residues<br/><strong>Sequence</strong><br/>{item.sequence}</div>
    <div className="research-feature-head"><strong>Top sequence feature descriptions</strong><span>{top.length}</span></div>
    {top.map((feature)=><article className="research-feature" key={`${feature.rank}-${feature.feature_id}`}>
      <div className="research-feature-head"><strong>Feature {feature.feature_id} · rank {feature.rank}</strong><span>Activation {Number(feature.max_activation).toFixed(3)}</span></div>
      <div className="research-bar" aria-label={`Maximum activation ${feature.max_activation}`}><i style={{width:`${Math.max(0,Math.min(100,Number(feature.max_activation)*100))}%`}}/></div>
      <p>{feature.description}</p>
      {feature.top_uniref?.uniref_id&&<small>Top UniRef: {feature.top_uniref.uniref_id} · activation {Number(feature.top_uniref.activation).toFixed(2)}</small>}
    </article>)}
  </>;
}
