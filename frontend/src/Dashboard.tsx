import React, { FormEvent, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BookOpen, Check, ChevronDown,
  ExternalLink, FileText, History, Loader2, Search,
  ShieldCheck, LogOut, Download, FlaskConical,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type AgentState = "pending" | "running" | "complete" | "warning" | "error";
type AgentStatus = { name: string; label: string; state: AgentState; detail: string };
type TraceLog = { timestamp: string; agent: string; message: string; data: Record<string, unknown> };
type PaperMetadata = { title: string; authors: string[]; year: number | null; doi: string | null; abstract: string | null; source_url: string | null };
type EvidenceItem = { title: string; url: string | null; year: number | null; authors: string[]; snippet: string | null; source: string; kind: "citation" | "code" | "full_text" | "funding" | "patent" | string; citation_count: number | null; metric_label: string | null; metric_value: string | null };
type ImpactSection = { title: string; body: string };
type AnalyzeResponse = { metadata: PaperMetadata; summary: string; sections: ImpactSection[]; evidence: EvidenceItem[]; agent_statuses: AgentStatus[]; logs: TraceLog[]; faithfulness_score: number; citation_count: number; topics: string[]; model_provider: string; rag_context_count: number; guardrail_status: string; limitations: string[]; ref_report: string };

const sampleQueries = ["10.1038/nature14539", "Attention Is All You Need", "10.1145/3292500.3330701"];
const initialStatuses: AgentStatus[] = [
  { name: "metadata", label: "Metadata", state: "pending", detail: "Ready" },
  { name: "scholar",  label: "Scholar",  state: "pending", detail: "Ready" },
  { name: "content",  label: "Content",  state: "pending", detail: "Ready" },
  { name: "code",     label: "Code",     state: "pending", detail: "Ready" },
  { name: "rag",      label: "RAG",      state: "pending", detail: "Ready" },
  { name: "impact",   label: "Impact",   state: "pending", detail: "Ready" },
  { name: "synthesis",label: "Synthesis",state: "pending", detail: "Ready" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState(sampleQueries[0]);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => {
    const s = localStorage.getItem("searchHistory");
    return s ? JSON.parse(s) : [];
  });
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "Research Influence": true, Applications: true, "Technical Adoption": true, "Access & Funding": true,
  });

  const statuses = loading ? animateStatuses(result?.agent_statuses ?? initialStatuses) : result?.agent_statuses ?? initialStatuses;
  const filteredEvidence = useMemo(() => {
    const ev = result?.evidence ?? [];
    return evidenceFilter === "all" ? ev : ev.filter(e => e.kind === evidenceFilter);
  }, [evidenceFilter, result]);
  const evidenceKinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of result?.evidence ?? []) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return Array.from(m.entries());
  }, [result]);
  const faithfulnessLabel = useMemo(() => {
    const s = result?.faithfulness_score ?? 0;
    return s >= 0.85 ? "Strong" : s >= 0.7 ? "Developing" : "Needs evidence";
  }, [result]);

  function updateHistory(q: string) {
    const next = [q, ...history.filter(i => i !== q)].slice(0, 8);
    setHistory(next);
    localStorage.setItem("searchHistory", JSON.stringify(next));
  }

  async function analyze(event?: FormEvent, q?: string) {
    event?.preventDefault();
    const sq = (q || query).trim();
    if (!sq) return;
    setQuery(sq);
    const cacheKey = `cache_${sq}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setResult(JSON.parse(cached)); updateHistory(sq); return; } catch {}
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: sq }) });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json() as AnalyzeResponse;
      setResult(data); localStorage.setItem(cacheKey, JSON.stringify(data)); updateHistory(sq);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally { setLoading(false); }
  }

  function handleLogout() { localStorage.removeItem("isAuthenticated"); navigate("/"); }

  function downloadReport() {
    if (!result?.ref_report) return;
    const html = `<html><head><meta charset='utf-8'><title>REF Report</title></head><body>${result.ref_report.split("\n").map(l => l.startsWith("### ") ? `<h3>${l.slice(4)}</h3>` : l.trim() === "" ? "<br/>" : `<p>${l}</p>`).join("")}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `REF_${result.metadata.doi?.replace(/\//g, "_") || "Report"}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const citationsCount = result?.evidence.filter(e => e.kind === "citation").length || 0;
  const codeCount = result?.evidence.filter(e => e.kind === "code").length || 0;
  const patentsCount = result?.evidence.filter(e => e.kind === "patent").length || 0;
  const totalVisual = Math.max(1, citationsCount + codeCount + patentsCount);

  return (
    <div className="app-shell">

      {/* ── Top navbar ── */}
      <nav className="top-navbar">
        <div className="top-brand">
          <div className="top-brand-box"><FlaskConical size={16} /></div>
          <span className="top-brand-name">Impact Lab</span>
        </div>
        <form className="top-search-wrap" onSubmit={analyze}>
          <input
            className="top-search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="DOI, title, arXiv ID, or Semantic Scholar ID"
            aria-label="Search paper"
          />
          <button type="submit" className="top-search-btn" disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Analyze
          </button>
        </form>
        <div className="top-actions">
          <button className="top-link-btn">Help</button>
          <button className="top-logout-btn" onClick={handleLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </nav>

      <div className="app-body">

        {/* ── Left sidebar ── */}
        <aside className="left-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <History size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              Recent searches
            </div>
            {(history.length ? history : sampleQueries).map(item => (
              <button key={item} className="history-item" onClick={() => analyze(undefined, item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Sample queries</div>
            {sampleQueries.map(s => (
              <button key={s} className="history-item" onClick={() => analyze(undefined, s)}>{s}</button>
            ))}
          </div>

          <div className="sidebar-shield">
            <ShieldCheck size={14} />
            <p>Every generated claim is traceable to retrieved evidence.</p>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="main-content">

          {/* Agent status strip */}
          <div className="agent-strip" aria-label="Agent execution status">
            {statuses.map(item => (
              <div className={`agent-pill ${item.state}`} key={item.name}>
                <StatusIcon state={item.state} />
                <div><p>{item.label}</p><span>{item.detail}</span></div>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="error-bar" role="alert">
              <AlertTriangle size={16} />
              Backend error: {error}. Check that FastAPI is running on port 8000.
            </div>
          )}

          {/* Results grid */}
          <div className="results-grid">

            {/* ── Summary panel ── */}
            <div className="summary-panel">
              {result ? (
                <div className="summary-panel-inner">
                  {/* Paper header */}
                  <div className="paper-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="eyebrow">Impact Summary</p>
                      <h2>{result.metadata.title}</h2>
                      <p className="paper-meta">
                        {fmtAuthors(result.metadata.authors)}
                        {result.metadata.year ? ` · ${result.metadata.year}` : ""}
                        {result.metadata.doi ? ` · ${result.metadata.doi}` : ""}
                      </p>
                    </div>
                    <div className={`score-badge ${scoreClass(result.faithfulness_score)}`}>
                      <span>{result.faithfulness_score.toFixed(2)}</span>
                      <p>{faithfulnessLabel}</p>
                    </div>
                  </div>

                  {/* Abstract-style summary */}
                  <p className="summary-abstract">{result.summary}</p>

                  {/* Metrics */}
                  <div className="metrics-strip">
                    <MetricCell label="Citations" value={result.citation_count ? result.citation_count.toLocaleString() : "–"} />
                    <MetricCell label="Evidence" value={String(result.evidence.length)} />
                    <MetricCell label="Code Leads" value={String(codeCount)} />
                    <MetricCell label="Patents" value={String(patentsCount)} />
                    <MetricCell label="RAG Chunks" value={String(result.rag_context_count)} />
                  </div>

                  {/* Evidence bar */}
                  <div className="evidence-bar-wrap">
                    <div className="evidence-bar">
                      <div className="bar-seg citation" style={{ width: `${(citationsCount / totalVisual) * 100}%` }} />
                      <div className="bar-seg code" style={{ width: `${(codeCount / totalVisual) * 100}%` }} />
                      <div className="bar-seg patent" style={{ width: `${(patentsCount / totalVisual) * 100}%` }} />
                    </div>
                    <div className="bar-legend">
                      <span><span className="dot-legend citation" /> Citations ({citationsCount})</span>
                      <span><span className="dot-legend code" /> Code ({codeCount})</span>
                      <span><span className="dot-legend patent" /> Patents ({patentsCount})</span>
                    </div>
                  </div>

                  {/* Topics */}
                  {result.topics.length > 0 && (
                    <div className="topic-strip">
                      {result.topics.map(t => <span key={t} className="topic-tag">{t}</span>)}
                    </div>
                  )}

                  {/* Runtime */}
                  <div className="runtime-strip">
                    <span>Model: {runtimeLabel(result.model_provider)}</span>
                    <span>Guardrail: {result.guardrail_status}</span>
                  </div>

                  {/* Accordion sections */}
                  <div className="section-accordion">
                    {result.sections.map(section => (
                      <div className="fold-row" key={section.title}>
                        <button
                          className="fold-btn"
                          onClick={() => setOpenSections(prev => ({ ...prev, [section.title]: !prev[section.title] }))}
                        >
                          {section.title}
                          <ChevronDown size={16} className={openSections[section.title] ? "open" : ""} />
                        </button>
                        {openSections[section.title] && <p className="fold-body">{section.body}</p>}
                      </div>
                    ))}
                  </div>

                  {/* REF report */}
                  {result.ref_report && (
                    <div className="ref-card">
                      <div className="ref-card-header">
                        <div>
                          <h3>REF Impact Case Study</h3>
                          <p>Formatted to Research England compliance standards.</p>
                        </div>
                        <button className="ref-download-btn" onClick={downloadReport}>
                          <Download size={14} /> Download .doc
                        </button>
                      </div>
                      <div className="ref-card-body"><pre>{result.ref_report}</pre></div>
                    </div>
                  )}

                  {/* Limitations */}
                  {result.limitations.length > 0 && (
                    <div className="limitations-box">
                      <AlertTriangle size={16} />
                      <div>
                        <p>Current limitations</p>
                        {result.limitations.map(item => <span key={item}>{item}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <BookOpen size={36} />
                  <h2>Start with a DOI or paper title</h2>
                  <p>The agent retrieves metadata and citation evidence, then shows an auditable impact summary.</p>
                </div>
              )}
            </div>

            {/* ── Evidence & Trace panel ── */}
            <aside className="evidence-panel">
              <div className="evidence-panel-header">
                <p className="eyebrow">Glass Box</p>
                <h2>Evidence & Trace</h2>
              </div>

              {/* Trace log */}
              <div className="trace-log">
                {(result?.logs ?? [{ timestamp: "--:--:--", agent: "Supervisor", message: "Ready for analysis", data: {} }]).map((item, i) => (
                  <div className="log-line" key={`${item.timestamp}-${i}`}>
                    <span>{item.timestamp}</span>
                    <strong>{item.agent}</strong>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>

              {/* Evidence tabs */}
              {result && (
                <div className="evidence-tabs">
                  <button className={`evidence-tab-btn${evidenceFilter === "all" ? " active" : ""}`} onClick={() => setEvidenceFilter("all")}>
                    All {result.evidence.length}
                  </button>
                  {evidenceKinds.map(([kind, count]) => (
                    <button
                      key={kind}
                      className={`evidence-tab-btn${evidenceFilter === kind ? " active" : ""}`}
                      onClick={() => setEvidenceFilter(kind)}
                    >
                      {kindLabel(kind)} {count}
                    </button>
                  ))}
                </div>
              )}

              {/* Evidence list */}
              <div className="evidence-list">
                {filteredEvidence.map(item => (
                  <a
                    className="evidence-item"
                    href={item.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    key={`${item.source}-${item.title}`}
                  >
                    <div className="evidence-item-body">
                      <span className={`kind-badge ${item.kind}`}>{kindLabel(item.kind)}</span>
                      <h3>{item.title}</h3>
                      <p>{item.source}{fmtAuthors(item.authors) !== "Unknown authors" ? ` · ${fmtAuthors(item.authors)}` : ""}{item.year ? ` · ${item.year}` : ""}</p>
                      {item.metric_label && item.metric_value && <small>{item.metric_label}: {item.metric_value}</small>}
                      {item.snippet && <em>{item.snippet}</em>}
                    </div>
                    <ExternalLink size={13} />
                  </a>
                ))}
                {result && filteredEvidence.length === 0 && (
                  <div className="evidence-empty">
                    <FileText size={20} />
                    No evidence in this category yet.
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function animateStatuses(ss: AgentStatus[]): AgentStatus[] {
  if (ss.some(s => s.state === "running")) return ss;
  return ss.map((s, i) => i === 0 ? { ...s, state: "running", detail: "Starting" } : s);
}
function StatusIcon({ state }: { state: AgentState }) {
  if (state === "complete") return <Check size={14} />;
  if (state === "running") return <Loader2 size={14} className="spin" />;
  if (state === "warning" || state === "error") return <AlertTriangle size={14} />;
  return <span className="dot" />;
}
function MetricCell({ label, value }: { label: string; value: string }) {
  return <div className="metric-cell"><span>{label}</span><strong>{value}</strong></div>;
}
function fmtAuthors(authors: string[]): string {
  if (!authors.length) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}
function scoreClass(s: number) { return s >= 0.85 ? "strong" : s >= 0.7 ? "medium" : "low"; }
function kindLabel(kind: string) {
  return ({ citation: "Citations", code: "Code", full_text: "Full text", funding: "Funding", patent: "Patents" } as Record<string, string>)[kind] ?? kind;
}
function runtimeLabel(p: string) {
  if (p.startsWith("hf:")) return p.replace("hf:", "Hugging Face ");
  if (p.includes("hf-rag")) return "Deterministic + HF RAG";
  return p;
}
