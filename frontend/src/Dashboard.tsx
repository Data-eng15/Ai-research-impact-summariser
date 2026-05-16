import React, { FormEvent, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  FlaskConical,
  History,
  Loader2,
  Moon,
  Search,
  ShieldCheck,
  LogOut,
  Download
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type AgentState = "pending" | "running" | "complete" | "warning" | "error";

type AgentStatus = {
  name: string;
  label: string;
  state: AgentState;
  detail: string;
};

type TraceLog = {
  timestamp: string;
  agent: string;
  message: string;
  data: Record<string, unknown>;
};

type PaperMetadata = {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  source_url: string | null;
};

type EvidenceItem = {
  title: string;
  url: string | null;
  year: number | null;
  authors: string[];
  snippet: string | null;
  source: string;
  kind: "citation" | "code" | "full_text" | "funding" | "patent" | string;
  citation_count: number | null;
  metric_label: string | null;
  metric_value: string | null;
};

type ImpactSection = {
  title: string;
  body: string;
};

type AnalyzeResponse = {
  metadata: PaperMetadata;
  summary: string;
  sections: ImpactSection[];
  evidence: EvidenceItem[];
  agent_statuses: AgentStatus[];
  logs: TraceLog[];
  faithfulness_score: number;
  citation_count: number;
  topics: string[];
  model_provider: string;
  rag_context_count: number;
  guardrail_status: string;
  limitations: string[];
  ref_report: string;
};

const sampleQueries = [
  "10.1038/nature14539",
  "Attention Is All You Need",
  "10.1145/3292500.3330701",
];

const initialStatuses: AgentStatus[] = [
  { name: "metadata", label: "Metadata", state: "pending", detail: "Ready" },
  { name: "scholar", label: "Scholar", state: "pending", detail: "Ready" },
  { name: "content", label: "Content", state: "pending", detail: "Ready" },
  { name: "code", label: "Code", state: "pending", detail: "Ready" },
  { name: "rag", label: "RAG", state: "pending", detail: "Ready" },
  { name: "impact", label: "Impact", state: "pending", detail: "Ready" },
  { name: "synthesis", label: "Synthesis", state: "pending", detail: "Ready" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState(sampleQueries[0]);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem("searchHistory");
    return saved ? JSON.parse(saved) : [];
  });
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "Research Influence": true,
    Applications: true,
    "Technical Adoption": true,
    "Access & Funding": true,
  });

  const statuses = loading ? activeStatuses(result?.agent_statuses ?? initialStatuses) : result?.agent_statuses ?? initialStatuses;
  const filteredEvidence = useMemo(() => {
    const evidence = result?.evidence ?? [];
    if (evidenceFilter === "all") return evidence;
    return evidence.filter((item) => item.kind === evidenceFilter);
  }, [evidenceFilter, result]);
  const evidenceKinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of result?.evidence ?? []) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [result]);
  const faithfulnessLabel = useMemo(() => {
    const score = result?.faithfulness_score ?? 0;
    if (score >= 0.85) return "Strong";
    if (score >= 0.7) return "Developing";
    return "Needs evidence";
  }, [result]);

  function updateHistory(searchQuery: string) {
    const newHistory = [searchQuery, ...history.filter((item) => item !== searchQuery)].slice(0, 8);
    setHistory(newHistory);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));
  }

  async function analyze(event?: FormEvent, q?: string) {
    event?.preventDefault();
    const searchQuery = (q || query).trim();
    if (!searchQuery) return;
    
    setQuery(searchQuery);

    // Check Cache First
    const cacheKey = `cache_${searchQuery}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const data = JSON.parse(cached) as AnalyzeResponse;
        setResult(data);
        updateHistory(searchQuery);
        return;
      } catch (e) {
        // If cache is invalid, proceed to fetch
      }
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const data = (await response.json()) as AnalyzeResponse;
      setResult(data);
      localStorage.setItem(cacheKey, JSON.stringify(data));
      updateHistory(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("isAuthenticated");
    navigate("/");
  }

  function downloadReport() {
    if (!result?.ref_report) return;
    
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>REF Impact Case Study</title></head>
      <body>
        ${result.ref_report.split('\n').map(line => {
          if (line.startsWith('### ')) return `<h3>${line.replace('### ', '')}</h3>`;
          if (line.startsWith('- **')) {
            const boldMatch = line.match(/- \*\*(.*?)\*\*(.*)/);
            if (boldMatch) return `<ul><li><b>${boldMatch[1]}</b>${boldMatch[2]}</li></ul>`;
          }
          if (line.startsWith('- ')) return `<ul><li>${line.replace('- ', '')}</li></ul>`;
          if (line.trim() === '') return '<br/>';
          return `<p>${line}</p>`;
        }).join('')}
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `REF_Impact_Case_Study_${result.metadata.doi?.replace(/\//g, "_") || "Report"}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const citationsCount = result?.evidence.filter(e => e.kind === "citation").length || 0;
  const patentsCount = result?.evidence.filter(e => e.kind === "patent").length || 0;
  const codeCount = result?.evidence.filter(e => e.kind === "code").length || 0;
  const totalVisual = Math.max(1, citationsCount + patentsCount + codeCount);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Query history">
        <div className="brand">
          <div className="brand-icon">
            <FlaskConical size={20} />
          </div>
          <div>
            <p>Impact Lab</p>
            <span>Agentic research evidence</span>
          </div>
        </div>

        <div className="side-section">
          <div className="side-title">
            <History size={16} />
            Recent
          </div>
          <div className="history-list">
            {(history.length ? history : sampleQueries).map((item) => (
              <button key={item} onClick={() => analyze(undefined, item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="side-section status-note">
          <ShieldCheck size={18} />
          <p>Every generated claim is designed to remain traceable to retrieved evidence.</p>
        </div>
        
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Research Impact Summariser</h1>
            <p>DOI to transparent, evidence-backed impact analysis.</p>
          </div>
          <button className="icon-button" aria-label="Toggle theme">
            <Moon size={18} />
          </button>
        </header>

        <form className="query-panel" onSubmit={analyze}>
          <label htmlFor="query">Paper DOI, title, arXiv ID, or Semantic Scholar ID</label>
          <div className="query-row">
            <div className="input-wrap input-with-icon">
              <Search size={18} />
              <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="10.1038/nature14539" />
            </div>
            <button className="primary-button" disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <Activity size={18} />}
              Analyze
            </button>
          </div>
          <div className="samples">
            {sampleQueries.map((sample) => (
              <button type="button" key={sample} onClick={() => analyze(undefined, sample)}>
                {sample}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={18} />
            Backend error: {error}. Check that FastAPI is running on port 8000.
          </div>
        )}

        <section className="agent-strip" aria-label="Agent execution status">
          {statuses.map((item) => (
            <div className={`agent-pill ${item.state}`} key={item.name}>
              <StatusIcon state={item.state} />
              <div>
                <p>{item.label}</p>
                <span>{item.detail}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="content-grid">
          <article className="summary-panel">
            {result ? (
              <>
                <div className="paper-header">
                  <div>
                    <p className="eyebrow">Impact Summary</p>
                    <h2>{result.metadata.title}</h2>
                    <p className="meta-line">
                      {formatAuthors(result.metadata.authors)} {result.metadata.year ? `• ${result.metadata.year}` : ""}{" "}
                      {result.metadata.doi ? `• ${result.metadata.doi}` : ""}
                    </p>
                  </div>
                  <div className={`score ${scoreClass(result.faithfulness_score)}`}>
                    <span>{result.faithfulness_score.toFixed(2)}</span>
                    <p>{faithfulnessLabel}</p>
                  </div>
                </div>

                <p className="summary-text">{result.summary}</p>

                <div className="metrics-row">
                  <Metric label="Citations" value={result.citation_count ? result.citation_count.toLocaleString() : "Unknown"} />
                  <Metric label="Evidence" value={String(result.evidence.length)} />
                  <Metric label="Code Leads" value={String(codeCount)} />
                  <Metric label="Patents" value={String(patentsCount)} />
                  <Metric label="RAG Chunks" value={String(result.rag_context_count)} />
                </div>

                <div className="evidence-visual-bar" aria-label="Evidence Distribution">
                  <div className="bar-segment citation" style={{ width: `${(citationsCount / totalVisual) * 100}%` }} title="Citations"></div>
                  <div className="bar-segment code" style={{ width: `${(codeCount / totalVisual) * 100}%` }} title="Code Leads"></div>
                  <div className="bar-segment patent" style={{ width: `${(patentsCount / totalVisual) * 100}%` }} title="Patents"></div>
                </div>
                <div className="visual-legend">
                  <span><span className="dot citation"></span> Citations ({citationsCount})</span>
                  <span><span className="dot code"></span> Code Leads ({codeCount})</span>
                  <span><span className="dot patent"></span> Patents ({patentsCount})</span>
                </div>

                <div className="runtime-row" aria-label="AI runtime status">
                  <span>Model: {runtimeLabel(result.model_provider)}</span>
                  <span>Guardrail: {result.guardrail_status}</span>
                </div>

                {result.topics.length > 0 && (
                  <div className="topic-row" aria-label="Detected research topics">
                    {result.topics.map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                )}

                <div className="section-list">
                  {result.sections.map((section) => (
                    <div className="fold-section" key={section.title}>
                      <button onClick={() => setOpenSections((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}>
                        <ChevronDown className={openSections[section.title] ? "open" : ""} size={18} />
                        {section.title}
                      </button>
                      {openSections[section.title] && <p>{section.body}</p>}
                    </div>
                  ))}
                </div>

                {result.ref_report && (
                  <div className="ref-report-card">
                    <div className="ref-header">
                      <div>
                        <h3>REF Impact Case Study</h3>
                        <p>Formatted to Research England compliance standards.</p>
                      </div>
                      <button className="primary-button outline" onClick={downloadReport}>
                        <Download size={16} /> Download .doc
                      </button>
                    </div>
                    <div className="ref-preview">
                      <pre>{result.ref_report}</pre>
                    </div>
                  </div>
                )}

                {result.limitations.length > 0 && (
                  <div className="limitations">
                    <AlertTriangle size={18} />
                    <div>
                      <p>Current limitations</p>
                      {result.limitations.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <BookOpen size={36} />
                <h2>Start with a DOI or paper title</h2>
                <p>The first build retrieves metadata and citation evidence, then shows an auditable impact summary.</p>
              </div>
            )}
          </article>

          <aside className="evidence-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Glass Box</p>
                <h2>Evidence & Trace</h2>
              </div>
            </div>

            <div className="trace-log">
              {(result?.logs ?? [{ timestamp: "--:--:--", agent: "Supervisor", message: "Ready for analysis", data: {} }]).map((item, index) => (
                <div className="log-line" key={`${item.timestamp}-${index}`}>
                  <span>{item.timestamp}</span>
                  <strong>{item.agent}</strong>
                  <p>{item.message}</p>
                </div>
              ))}
            </div>

            {result && (
              <div className="evidence-tabs" aria-label="Evidence filters">
                <button className={evidenceFilter === "all" ? "active" : ""} onClick={() => setEvidenceFilter("all")}>
                  All {result.evidence.length}
                </button>
                {evidenceKinds.map(([kind, count]) => (
                  <button className={evidenceFilter === kind ? "active" : ""} key={kind} onClick={() => setEvidenceFilter(kind)}>
                    {kindLabel(kind)} {count}
                  </button>
                ))}
              </div>
            )}

            <div className="evidence-list">
              {filteredEvidence.map((item) => (
                <a className="evidence-item" href={item.url ?? "#"} target="_blank" rel="noreferrer" key={`${item.source}-${item.title}`}>
                  <div>
                    <span className={`kind ${item.kind}`}>{kindLabel(item.kind)}</span>
                    <h3>{item.title}</h3>
                    <p>
                      {item.source} {formatAuthors(item.authors) !== "Unknown authors" ? `• ${formatAuthors(item.authors)}` : ""} {item.year ? `• ${item.year}` : ""}
                    </p>
                    {item.metric_label && item.metric_value && (
                      <small>
                        {item.metric_label}: {item.metric_value}
                      </small>
                    )}
                    {item.snippet && <em>{item.snippet}</em>}
                  </div>
                  <ExternalLink size={16} />
                </a>
              ))}
              {result && filteredEvidence.length === 0 && (
                <div className="empty-evidence">
                  <FileText size={22} />
                  No evidence in this category yet.
                </div>
              )}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

function activeStatuses(statuses: AgentStatus[]): AgentStatus[] {
  if (statuses.some((item) => item.state === "running")) return statuses;
  return statuses.map((item, index) => (index === 0 ? { ...item, state: "running", detail: "Starting" } : item));
}

function StatusIcon({ state }: { state: AgentState }) {
  if (state === "complete") return <Check size={16} />;
  if (state === "running") return <Loader2 className="spin" size={16} />;
  if (state === "warning" || state === "error") return <AlertTriangle size={16} />;
  return <span className="dot" />;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatAuthors(authors: string[]): string {
  if (!authors.length) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function scoreClass(score: number): string {
  if (score >= 0.85) return "strong";
  if (score >= 0.7) return "medium";
  return "low";
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    citation: "Citations",
    code: "Code",
    full_text: "Full text",
    funding: "Funding",
    patent: "Patents",
  };
  return labels[kind] ?? kind;
}

function runtimeLabel(provider: string): string {
  if (provider.startsWith("hf:")) return provider.replace("hf:", "Hugging Face ");
  if (provider.includes("hf-rag")) return "Deterministic + HF RAG";
  return provider;
}
