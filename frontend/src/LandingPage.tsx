import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Activity, Zap, ShieldCheck } from "lucide-react";

export default function LandingPage({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <div className="landing-container">
      <header className="landing-header">
        <div className="brand-logo">
          <Activity size={24} className="accent-icon" />
          <span>Impact Lab</span>
        </div>
        <nav className="landing-nav">
          <button className="nav-link" onClick={onLoginClick}>Sign In</button>
          <button className="primary-button outline" onClick={onLoginClick}>
            Get Started <ArrowRight size={16} />
          </button>
        </nav>
      </header>

      <main className="landing-main">
        <div className="hero-section">
          <div className="badge">Version 2.0 Now Live</div>
          <h1 className="hero-title">
            Research Impact, <br />
            <span className="gradient-text">Transparently Measured.</span>
          </h1>
          <p className="hero-subtitle">
            Transform DOIs into comprehensive, evidence-backed impact analysis. Our agentic AI retrieves metadata, code adoptions, and funding signals to build a complete picture of academic influence.
          </p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={onLoginClick}>
              Try Demo Access <Zap size={18} />
            </button>
          </div>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="icon-wrapper"><ShieldCheck size={24} /></div>
            <h3>Glass Box Auditing</h3>
            <p>Every generated claim is completely traceable back to its retrieved evidence.</p>
          </div>
          <div className="feature-card">
            <div className="icon-wrapper"><Activity size={24} /></div>
            <h3>Real-time Synthesis</h3>
            <p>Aggregates data from CrossRef, Semantic Scholar, and GitHub in seconds.</p>
          </div>
          <div className="feature-card">
            <div className="icon-wrapper"><Zap size={24} /></div>
            <h3>Agentic Pipeline</h3>
            <p>Multiple AI agents coordinate seamlessly to fetch, filter, and synthesize your results.</p>
          </div>
        </div>
      </main>

      <div className="ambient-background">
        <div className="glow-orb primary"></div>
        <div className="glow-orb secondary"></div>
      </div>
    </div>
  );
}
