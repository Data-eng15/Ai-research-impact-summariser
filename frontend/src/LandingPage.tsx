import React, { FormEvent, useState } from "react";
import { Search, BookOpen, ShieldCheck, Activity, Zap } from "lucide-react";

export default function LandingPage({ onLogin }: { onLogin: () => void }) {
  const [q, setQ] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onLogin();
  }

  return (
    <div className="landing-page">
      {/* ── Header ── */}
      <header className="land-header">
        <div className="land-brand">
          <div className="land-brand-icon">
            <BookOpen size={18} />
          </div>
          <span className="land-brand-name">Impact Lab</span>
        </div>
        <nav className="land-nav">
          <button className="land-nav-link" onClick={onLogin}>Sign In</button>
          <button className="land-nav-btn" onClick={onLogin}>
            <Search size={14} /> Get Started
          </button>
        </nav>
      </header>

      {/* ── Hero / search ── */}
      <div className="land-hero">
        <div className="land-hero-inner">
          <p className="land-hero-label">
            Search for <strong>peer-reviewed</strong> research impact data including{" "}
            <a href="#" onClick={e => { e.preventDefault(); onLogin(); }}>open access</a> content.
          </p>

          <form className="land-search-row" onSubmit={handleSubmit}>
            <input
              className="land-search-input"
              placeholder="Enter DOI, paper title, arXiv ID, or Semantic Scholar ID..."
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label="Search papers"
            />
            <button type="submit" className="land-search-btn">
              <Search size={16} /> Search
            </button>
          </form>

          <a href="#" className="land-advanced" onClick={e => { e.preventDefault(); onLogin(); }}>
            ▾ Advanced search
          </a>
        </div>
      </div>

      {/* ── Feature strip ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
        <div className="land-features">
          <div className="land-feature">
            <div className="land-feature-icon"><ShieldCheck size={22} /></div>
            <h3>Glass Box Auditing</h3>
            <p>Every generated claim is completely traceable back to its retrieved evidence from CrossRef and Semantic Scholar.</p>
          </div>
          <div className="land-feature">
            <div className="land-feature-icon"><Activity size={22} /></div>
            <h3>Multi-source Synthesis</h3>
            <p>Aggregates metadata, citations, code repositories, and funding signals in seconds using agentic AI.</p>
          </div>
          <div className="land-feature">
            <div className="land-feature-icon"><Zap size={22} /></div>
            <h3>REF-ready Reports</h3>
            <p>Exports formatted impact case studies aligned with Research England compliance standards.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
