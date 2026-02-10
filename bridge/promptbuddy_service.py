from __future__ import annotations

import difflib
import math
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    from .promptbuddy_models import (
        DiffInfo,
        Mode,
        MutationInfo,
        PromptEnhanceRequest,
        RedactionInfo,
    )
except ImportError:  # pragma: no cover - script execution fallback
    from promptbuddy_models import (  # type: ignore
        DiffInfo,
        Mode,
        MutationInfo,
        PromptEnhanceRequest,
        RedactionInfo,
    )


_SECRET_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    ("token", re.compile(r"\b(sk-[A-Za-z0-9_-]{12,})\b")),
    ("credential", re.compile(r"(?i)\b(api[_-]?key|password|secret)\s*[:=]\s*([^\s,;\"']+)")),
    ("token", re.compile(r"(?i)\b(token|bearer)\s*[:=]\s*([^\s,;\"']+)")),
]


def _estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def _truncate(text: str, max_chars: Optional[int]) -> str:
    if max_chars is None or len(text) <= max_chars:
        return text
    return f"{text[: max_chars - 3]}..."


def _build_diff(original: str, enhanced: str, max_lines: int = 250) -> DiffInfo:
    lines = list(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            enhanced.splitlines(keepends=True),
            fromfile="original",
            tofile="enhanced",
        )
    )
    if len(lines) > max_lines:
        lines = lines[:max_lines] + ["\n... (diff truncated)\n"]
    return DiffInfo(type="unified", data="".join(lines))


def _compress_plain_text(text: str) -> str:
    return " ".join(text.split())


def _compress_preserving_code_fences(text: str) -> str:
    chunks = text.split("```")
    if len(chunks) == 1:
        return _compress_plain_text(text)

    rebuilt: List[str] = []
    for idx, chunk in enumerate(chunks):
        if idx % 2 == 0:
            rebuilt.append(_compress_plain_text(chunk))
        else:
            rebuilt.append(chunk.strip("\n"))
    return "```".join(rebuilt).strip()


def _redact_secret_like_text(text: str) -> Tuple[str, List[RedactionInfo]]:
    redactions: List[RedactionInfo] = []
    redacted = text
    for redaction_type, pattern in _SECRET_PATTERNS:
        if not pattern.search(redacted):
            continue
        if redaction_type == "credential":
            redacted = pattern.sub(lambda m: f"{m.group(1)}=[REDACTED]", redacted)
        else:
            redacted = pattern.sub("[REDACTED]", redacted)
        redactions.append(
            RedactionInfo(
                type=redaction_type,  # type: ignore[arg-type]
                note=f"removed_{redaction_type}_like_pattern",
            )
        )
    return redacted, redactions


def _profile_style_rules(profile: Optional[Dict[str, Any]]) -> List[str]:
    if not isinstance(profile, dict):
        return []
    rules = profile.get("style_rules")
    if not isinstance(rules, list):
        return []
    return [str(rule).strip() for rule in rules if str(rule).strip()]


def _apply_mode(
    req: PromptEnhanceRequest,
    prompt: str,
    profile: Optional[Dict[str, Any]],
) -> Tuple[str, List[str], List[MutationInfo], List[str]]:
    mode = req.mode
    rationale: List[str] = [f"mode={mode.value}", "local_only", "deterministic_v1"]
    mutations: List[MutationInfo] = []
    safety_flags: List[str] = []

    style_rules = _profile_style_rules(profile)
    intent = req.context.intent or "N/A"
    tab_title = req.context.tab_title or "N/A"
    tab_url = req.context.tab_url or "N/A"

    if mode == Mode.compress:
        if req.constraints.preserve_code_blocks:
            enhanced = _compress_preserving_code_fences(prompt)
        else:
            enhanced = _compress_plain_text(prompt)
        rationale.append("compressed_whitespace")
        mutations.append(MutationInfo(type="compress", note="reduced_whitespace_and_noise"))
    elif mode == Mode.structure:
        rules_block = "\n".join(f"- {rule}" for rule in style_rules) or "- Be precise and actionable."
        enhanced = (
            "## Goal\n"
            f"{prompt}\n\n"
            "## Context / Inputs\n"
            f"- intent: {intent}\n"
            f"- tab_title: {tab_title}\n"
            f"- tab_url: {tab_url}\n\n"
            "## Constraints\n"
            f"{rules_block}\n"
            "- List assumptions explicitly.\n"
            "- Keep output deterministic.\n\n"
            "## Output Format\n"
            "1. Final answer first.\n"
            "2. Short rationale/checklist.\n"
        )
        rationale.append("added_structure_sections")
        mutations.append(MutationInfo(type="reorder", note="reframed_prompt_into_sections"))
        mutations.append(MutationInfo(type="add_constraints", note="inserted_output_constraints"))
    elif mode == Mode.clarify:
        enhanced = (
            f"{prompt}\n\n"
            "If key details are missing, ask up to 5 clarifying questions:\n"
            "1. What is the exact goal and success criteria?\n"
            "2. What constraints are non-negotiable?\n"
            "3. What environment/context should be assumed?\n"
            "4. What risks must be avoided?\n"
            "5. What output format is required?\n\n"
            "If no clarifications are required, proceed with explicit assumptions."
        )
        rationale.append("added_clarification_block")
        mutations.append(MutationInfo(type="clarify", note="added_pre_answer_questions"))
    elif mode == Mode.persona:
        persona_header = "You are a rigorous, evidence-first SOCA assistant."
        if profile and isinstance(profile.get("persona"), str):
            persona_header = str(profile["persona"]).strip() or persona_header
        enhanced = (
            f"{persona_header}\n"
            "Use deterministic reasoning, explicit assumptions, and concise outputs.\n\n"
            f"{prompt}"
        )
        rationale.append("added_persona_header")
        mutations.append(MutationInfo(type="persona", note="prepended_persona_constraints"))
    else:  # Mode.safe_exec
        enhanced = (
            "Safety / execution constraints:\n"
            "- Never expose or request secrets.\n"
            "- Avoid destructive actions without explicit confirmation.\n"
            "- Prefer read-only or dry-run first.\n\n"
            f"{prompt}\n\n"
            "Return:\n"
            "1. Safe plan\n"
            "2. Minimal command set (dry-run first)\n"
            "3. Rollback steps\n"
        )
        safety_flags.append("safe_exec")
        rationale.append("added_safe_execution_guardrails")
        mutations.append(MutationInfo(type="safety", note="inserted_safe_execution_policy"))

    if style_rules:
        mutations.append(MutationInfo(type="profile", note=f"applied_profile_rules={len(style_rules)}"))
        rationale.append("applied_profile_style_rules")

    return enhanced.strip(), rationale, mutations, safety_flags


async def enhance_prompt_local(
    req: PromptEnhanceRequest,
    profile: Optional[Dict[str, Any]] = None,
) -> Tuple[str, List[str], List[MutationInfo], List[RedactionInfo], List[str], str, DiffInfo]:
    original = req.prompt.strip()
    prompt_for_mode = original
    redactions: List[RedactionInfo] = []

    if req.mode == Mode.safe_exec:
        prompt_for_mode, redactions = _redact_secret_like_text(prompt_for_mode)

    enhanced, rationale, mutations, safety_flags = _apply_mode(req, prompt_for_mode, profile)
    enhanced = _truncate(enhanced, req.constraints.max_chars)
    diff = _build_diff(req.prompt, enhanced)
    return (
        enhanced,
        rationale,
        mutations,
        redactions,
        safety_flags,
        "local:deterministic_v1",
        diff,
    )


def estimate_stats(before: str, after: str) -> Dict[str, int]:
    return {
        "chars_before": len(before),
        "chars_after": len(after),
        "est_tokens_before": _estimate_tokens(before),
        "est_tokens_after": _estimate_tokens(after),
    }
