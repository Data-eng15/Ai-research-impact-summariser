from __future__ import annotations

import os
import re
from typing import Any

from .models import EvidenceItem, PaperMetadata, TraceLog
from .services_support import log


DEFAULT_GENERATION_MODEL = os.getenv("HF_GENERATION_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")


class HFSynthesizer:
    def __init__(self) -> None:
        self.model_name = DEFAULT_GENERATION_MODEL
        self._pipeline: Any | None = None
        self._load_error: str | None = None

    def enabled(self) -> bool:
        return os.getenv("ENABLE_HF_GENERATION", "0").lower() in {"1", "true", "yes", "on"}

    def generate(
        self,
        metadata: PaperMetadata,
        citation_count: int,
        evidence: list[EvidenceItem],
        topics: list[str],
        rag_contexts: list[str],
    ) -> tuple[str | None, str, list[TraceLog]]:
        logs: list[TraceLog] = []
        if not self.enabled():
            logs.append(log("SLM", "HF SLM generation disabled; set ENABLE_HF_GENERATION=1 to use local Hugging Face generation"))
            return None, "deterministic+hf-rag", logs

        if self._pipeline is None and self._load_error is None:
            try:
                from transformers import pipeline

                self._pipeline = pipeline(
                    "text-generation",
                    model=self.model_name,
                    device_map="auto",
                    max_new_tokens=180,
                )
                logs.append(log("SLM", "Loaded Hugging Face SLM", model=self.model_name))
            except Exception as exc:
                self._load_error = str(exc)
                logs.append(log("SLM", "HF SLM unavailable; falling back to deterministic synthesis", error=str(exc)))
                return None, "deterministic+hf-rag", logs

        prompt = build_prompt(metadata, citation_count, evidence, topics, rag_contexts)
        try:
            output = self._pipeline(prompt, do_sample=False, max_new_tokens=180, return_full_text=False)
            text = output[0]["generated_text"].strip()
            summary = clean_generation(text)
            logs.append(log("SLM", "Generated summary with Hugging Face SLM", model=self.model_name))
            return summary, f"hf:{self.model_name}", logs
        except Exception as exc:
            logs.append(log("SLM", "HF SLM generation failed; falling back to deterministic synthesis", error=str(exc)))
            return None, "deterministic+hf-rag", logs

    def generate_ref_report(
        self,
        metadata: PaperMetadata,
        evidence: list[EvidenceItem],
        summary: str,
        topics: list[str],
    ) -> tuple[str | None, list[TraceLog]]:
        logs: list[TraceLog] = []
        if not self.enabled():
            return None, logs

        if self._pipeline is None and self._load_error is None:
            try:
                from transformers import pipeline
                self._pipeline = pipeline(
                    "text-generation",
                    model=self.model_name,
                    device_map="auto",
                    max_new_tokens=500,
                )
            except Exception as exc:
                self._load_error = str(exc)
                return None, logs

        prompt = build_ref_prompt(metadata, evidence, summary, topics)
        try:
            output = self._pipeline(prompt, do_sample=False, max_new_tokens=600, return_full_text=False)
            text = output[0]["generated_text"].strip()
            # Clean up the output to make sure it looks nice
            report = clean_ref_generation(text)
            logs.append(log("SLM", "Generated REF report with Hugging Face SLM"))
            return report, logs
        except Exception as exc:
            logs.append(log("SLM", "HF SLM REF report generation failed", error=str(exc)))
            return None, logs

    def evaluate_faithfulness(self, summary: str, evidence: list[EvidenceItem], rag_contexts: list[str]) -> tuple[float, list[TraceLog]]:
        logs: list[TraceLog] = []
        if not self.enabled():
            return -1.0, logs

        if self._pipeline is None and self._load_error is None:
            try:
                from transformers import pipeline
                self._pipeline = pipeline("text-generation", model=self.model_name, device_map="auto")
            except Exception as exc:
                self._load_error = str(exc)
                return -1.0, logs

        if self._pipeline is None:
            return -1.0, logs

        logs.append(log("Judge", "Evaluating faithfulness using local SLM (RAGAS methodology)"))
        evidence_lines = "\n".join(f"- {item.title}: {item.snippet}" for item in evidence[:10])
        prompt = f"""You are a strict academic judge evaluating a summary against source evidence.
Rate the faithfulness of the summary on a scale from 0 to 10.
0 means entirely hallucinated or unsupported. 10 means perfectly supported by evidence.
Output ONLY the integer rating. Do not provide any other text.

Summary to evaluate:
{summary}

Evidence:
{evidence_lines}

Rating:"""
        try:
            output = self._pipeline(prompt, do_sample=False, max_new_tokens=5, return_full_text=False)
            text = output[0]["generated_text"].strip()
            match = re.search(r'\d+', text)
            if match:
                score = min(10, max(0, int(match.group(0)))) / 10.0
                logs.append(log("Judge", f"SLM assigned faithfulness score: {score}"))
                return score, logs
            else:
                logs.append(log("Judge", "SLM failed to output a numerical rating, falling back to heuristic"))
                return -1.0, logs
        except Exception as exc:
            logs.append(log("Judge", "SLM evaluation failed", error=str(exc)))
            return -1.0, logs

hf_synthesizer = HFSynthesizer()


def build_prompt(metadata: PaperMetadata, citation_count: int, evidence: list[EvidenceItem], topics: list[str], rag_contexts: list[str]) -> str:
    evidence_lines = "\n".join(f"- {item.kind}: {item.title} ({item.source})" for item in evidence[:8])
    context_lines = "\n".join(f"- {context[:500]}" for context in rag_contexts[:5])
    return f"""You are a careful research impact summariser.
Write one concise evidence-grounded paragraph under 120 words.
Do not invent facts. Mention uncertainty when evidence is weak.

Paper: {metadata.title}
Authors: {", ".join(metadata.authors[:5])}
Year: {metadata.year}
Citations: {citation_count}
Topics: {", ".join(topics)}

Retrieved evidence:
{evidence_lines}

RAG context:
{context_lines}

Summary:"""


def clean_generation(text: str) -> str:
    text = re.sub(r"^Summary:\s*", "", text.strip(), flags=re.IGNORECASE)
    text = text.split("\n\n")[0].strip()
    return text[:900]

def build_ref_prompt(metadata: PaperMetadata, evidence: list[EvidenceItem], summary: str, topics: list[str]) -> str:
    evidence_lines = "\n".join(f"- {item.kind}: {item.title} ({item.source})" for item in evidence[:10])
    return f"""You are an expert academic research evaluator writing a formal REF Impact Case Study.
Write a narrative, human-sounding report. Do NOT use AI phrases like 'The agent found' or 'As an AI'.
Structure the report strictly with the following markdown headings:
### 1. Summary of Impact
### 2. Underpinning Research
### 3. Details of Impact
### 4. References to the Research

Use the following data:
Paper: {metadata.title}
Authors: {", ".join(metadata.authors[:5])}
Year: {metadata.year}
Topics: {", ".join(topics)}
Summary: {summary}

Evidence retrieved:
{evidence_lines}

Generate the REF Impact Case Study Report below:"""

def clean_ref_generation(text: str) -> str:
    # Ensure it doesn't get cut off mid-sentence and remove any intro text
    text = re.sub(r"^Generate the REF Impact Case Study Report below:\s*", "", text.strip(), flags=re.IGNORECASE)
    return text.strip()

