from __future__ import annotations

import base64
import hashlib
import html
import io
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Sequence, Set, Tuple
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.responses import Response

try:
    from .promptbuddy_routes import router as promptbuddy_router
    from .version import BRIDGE_VERSION as APP_VERSION
except ImportError:  # pragma: no cover - script execution fallback
    from promptbuddy_routes import router as promptbuddy_router  # type: ignore
    from version import BRIDGE_VERSION as APP_VERSION  # type: ignore


def _utc_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_text(text: str) -> str:
    return _sha256_bytes(text.encode("utf-8", errors="replace"))


def _find_repo_root(start: Path) -> Optional[Path]:
    current = start
    for _ in range(12):
        if (
            (current / "runs").is_dir()
            and (current / "core").is_dir()
            and (current / ".git").exists()
        ):
            return current
        if current.parent == current:
            return None
        current = current.parent
    return None


def _evidence_root() -> Optional[Path]:
    override = os.environ.get("SOCA_OPENBROWSER_BRIDGE_EVIDENCE_ROOT", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    repo_root = _find_repo_root(Path(__file__).resolve())
    if not repo_root:
        return None
    return repo_root / "runs" / "_local" / "openbrowser_bridge"


def _openbrowser_exports_root(repo_root: Path) -> Path:
    override = os.environ.get("SOCA_OPENBROWSER_EXPORTS_ROOT", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return repo_root / "runs" / "_local" / "openbrowser_exports"


_SENSITIVE_HEADERS: Set[str] = {
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-openai-api-key",
    "x-openrouter-api-key",
}


def _redact_headers(headers: Dict[str, str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for key, value in headers.items():
        lk = key.lower()
        if lk in _SENSITIVE_HEADERS:
            out[key] = "***REDACTED***"
            continue
        text = str(value)
        if len(text) > 256:
            text = text[:256] + "…"
        out[key] = text
    return out


def _require_token(authorization: Optional[str]) -> None:
    expected = os.environ.get("SOCA_OPENBROWSER_BRIDGE_TOKEN", "soca").strip()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="invalid bearer token")


def _ollama_base_url() -> str:
    base = os.environ.get("SOCA_OPENBROWSER_BRIDGE_OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1").strip()
    return base.rstrip("/")


def _openrouter_base_url() -> str:
    base = (
        os.environ.get("SOCA_OPENBROWSER_BRIDGE_OPENROUTER_BASE_URL", "").strip()
        or os.environ.get("OPENROUTER_BASE_URL", "").strip()
        or "https://openrouter.ai/api/v1"
    )
    return base.rstrip("/")


def _openrouter_api_key() -> str:
    return (
        os.environ.get("SOCA_OPENBROWSER_BRIDGE_OPENROUTER_API_KEY", "").strip()
        or os.environ.get("OPENROUTER_API_KEY", "").strip()
    )


def _opa_url() -> Optional[str]:
    url = (
        os.environ.get("SOCA_OPENBROWSER_BRIDGE_OPA_URL", "").strip()
        or os.environ.get("OPA_URL", "").strip()
    )
    return url or None


_LANE_RANK: Dict[str, int] = {
    "L0_SHADOW": 0,
    "L1_ASSISTED": 1,
    "L2_CONTROLLED": 2,
    "L2_CONTROLLED_WRITE": 2,
    "L3_AUTONOMOUS": 3,
    # OpenBrowser lanes (bridge clients)
    "OB_OFFLINE": 0,
    "OB_ONLINE_PULSE": 2,
}


def _lane_rank(lane: str) -> int:
    return _LANE_RANK.get((lane or "").strip(), -1)


async def _policy_decide_chat(
    *,
    lane: str,
    task_family: str,
    requested_model: str,
) -> Dict[str, Any]:
    requires_network = requested_model.startswith("openrouter/")
    opa_url = _opa_url()
    input_obj = {
        "lane": lane,
        "task_family": task_family,
        "requested_model": requested_model,
        "requires_network": requires_network,
    }

    if opa_url:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(opa_url, json={"input": input_obj})
            resp.raise_for_status()
            data = resp.json()
            decision = data.get("result", data)
            return decision if isinstance(decision, dict) else {"allow": False, "reason": "invalid_opa_response"}
        except Exception as e:
            if requires_network:
                return {"allow": False, "reason": f"opa_unavailable:{type(e).__name__}"}

    # Fallback (fail-closed for network unless lane >= L2)
    if requires_network and _lane_rank(lane) < _lane_rank("L2_CONTROLLED_WRITE"):
        return {"allow": False, "reason": "network_requires_L2_CONTROLLED_WRITE"}

    return {
        "allow": True,
        "upstream": "openrouter" if requires_network else "local",
        "model": requested_model,
        "provider": {"require_parameters": True, "allow_fallbacks": True, "sort": {"by": "latency", "partition": "model"}},
        "reasoning": {"effort": "high"},
    }


def _repo_root_or_500() -> Path:
    repo_root = _find_repo_root(Path(__file__).resolve())
    if not repo_root:
        raise HTTPException(status_code=500, detail="repo root not found (expected runs/, core/, .git)")
    return repo_root


def _is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def _resolve_under(root: Path, candidate: Path) -> Path:
    root_resolved = root.expanduser().resolve()
    candidate_resolved = candidate.expanduser().resolve()
    if not _is_relative_to(candidate_resolved, root_resolved):
        raise HTTPException(status_code=403, detail="path resolves outside allowed root")
    return candidate_resolved


def _read_text_limited(path: Path, *, max_bytes: int = 256_000) -> str:
    with path.open("rb") as f:
        data = f.read(max_bytes + 1)
    if len(data) > max_bytes:
        data = data[:max_bytes]
    return data.decode("utf-8", errors="replace")


def _read_text_tail(path: Path, *, max_bytes: int = 256_000) -> str:
    size = path.stat().st_size
    with path.open("rb") as f:
        if size > max_bytes:
            f.seek(max(0, size - max_bytes))
        data = f.read(max_bytes)
    return data.decode("utf-8", errors="replace")


_STOPWORDS: Set[str] = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "if",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "then",
    "there",
    "these",
    "this",
    "to",
    "was",
    "were",
    "will",
    "with",
    "you",
    "your",
}


def _query_terms(query: str, *, max_terms: int = 10) -> List[str]:
    tokens = [t.lower() for t in re.findall(r"[A-Za-z0-9]{3,}", query)]
    terms: List[str] = []
    for tok in tokens:
        if tok in _STOPWORDS:
            continue
        if tok not in terms:
            terms.append(tok)
        if len(terms) >= max_terms:
            break
    return terms


def _score_line(line_lc: str, terms: Sequence[str]) -> int:
    return sum(1 for t in terms if t in line_lc)


def _extract_line_snippets(
    text: str,
    terms: Sequence[str],
    *,
    max_snippets: int = 6,
    window_lines: int = 2,
    max_chars_per_snippet: int = 1200,
) -> List[Tuple[str, int]]:
    lines = text.splitlines()
    if not lines:
        return []

    if not terms:
        snippet = "\n".join(lines[: min(len(lines), 6)]).strip()
        return [(snippet[:max_chars_per_snippet], 0)] if snippet else []

    scored: List[Tuple[int, int]] = []
    for idx, line in enumerate(lines):
        s = _score_line(line.lower(), terms)
        if s:
            scored.append((s, idx))

    if not scored:
        snippet = "\n".join(lines[: min(len(lines), 6)]).strip()
        return [(snippet[:max_chars_per_snippet], 0)] if snippet else []

    scored.sort(key=lambda x: (x[0], -x[1]), reverse=True)
    chosen: List[Tuple[str, int]] = []
    used_indices: Set[int] = set()
    for score, idx in scored:
        if len(chosen) >= max_snippets:
            break
        if any(abs(idx - u) <= window_lines for u in used_indices):
            continue
        start = max(0, idx - window_lines)
        end = min(len(lines), idx + window_lines + 1)
        snippet = "\n".join(lines[start:end]).strip()
        if not snippet:
            continue
        chosen.append((snippet[:max_chars_per_snippet], score))
        used_indices.add(idx)
    return chosen


def _safe_relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


class ContextPackRequest(BaseModel):
    lane: str = Field(..., description="OpenBrowser lane identifier (e.g. OB_OFFLINE, OB_ONLINE_PULSE)")
    query: str = Field(..., description="User query / task statement")
    page_text: str = Field("", description="Visible page text or extracted content")
    tab_meta: Dict[str, Any] = Field(default_factory=dict, description="Tab metadata (url/title/tabId/etc.)")
    requested_layers: List[str] = Field(default_factory=list, description="Subset of 5LM layers to retrieve")
    ssot_scopes: List[str] = Field(default_factory=list, description="Allowlisted SSOT scopes under core/SOCAcore")


class WebFetchRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    url: str = Field(..., description="URL to fetch (http/https)")
    prompt: str = Field("", description="Extraction prompt (optional)")
    max_bytes: int = Field(512_000, description="Maximum bytes to fetch")


class PdfExtractRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    url: str = Field(..., description="PDF URL to fetch (http/https)")
    max_bytes: int = Field(15_000_000, description="Maximum bytes to fetch for the PDF")
    max_pages: int = Field(50, description="Maximum number of pages to extract")
    max_chars: int = Field(60_000, description="Maximum number of characters to return")


class Context7DocsRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    library_id: str = Field(..., description="Context7 library id, e.g. /octokit/octokit.js")
    topic: str = Field("", description="Topic focus (optional)")
    max_chars: int = Field(20_000, description="Maximum characters to return")


class GitHubGetRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    path: str = Field(..., description="GitHub REST path, e.g. /repos/octokit/octokit.js or /search/repositories")
    query: Dict[str, Any] = Field(default_factory=dict, description="Query parameters")
    max_chars: int = Field(20_000, description="Maximum characters to return")


class Nt2lPlanBridgeRequest(BaseModel):
    prompt: str = Field(..., description="Natural-language prompt to convert into an NT2L plan")
    fake_model: bool = Field(False, description="Force SOCA_FAKE_MODEL=1 for deterministic stub output")


class OpenBrowserPanelDumpRequest(BaseModel):
    exported_utc: str = Field(..., description="UTC ISO timestamp for when the panel was exported")
    source_tab_url: Optional[str] = Field(default=None, description="Active tab URL when export occurred")
    title: Optional[str] = Field(default=None, description="Panel title at export time")
    panel_text: str = Field(..., description="Full panel text content")
    panel_html: Optional[str] = Field(default=None, description="Panel HTML snapshot (optional)")


class Nt2lPlanPayloadRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    plan: Dict[str, Any] = Field(..., description="NT2L plan JSON object")


class Nt2lScheduleRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    routine_type: Optional[str] = Field(default=None, description="Routine type: A, B, or C (optional)")
    date: Optional[str] = Field(default=None, description="Date in YYYY-MM-DD (optional)")


class Nt2lCarnetRequest(BaseModel):
    lane: str = Field("OB_OFFLINE", description="OpenBrowser lane identifier (OB_OFFLINE or OB_ONLINE_PULSE)")
    date: Optional[str] = Field(default=None, description="Date in YYYY-MM-DD (optional)")
    count: int = Field(1, description="Number of recent handoffs to return (optional)")


class ContextSnippet(BaseModel):
    layer: str
    text: str
    source: Dict[str, Any]
    score: int = 0


class ContextPackResponse(BaseModel):
    snippets: List[ContextSnippet]
    ssot_refs: List[Dict[str, Any]]
    provenance: Dict[str, Any]
    compression_summary: Dict[str, Any]


def _normalize_ssot_scope(scope: str) -> str:
    s = scope.strip().lstrip("/")
    if s in {"SOCAcore", "core/SOCAcore"}:
        return ""
    if s.startswith("SOCAcore/"):
        return s[len("SOCAcore/") :]
    if s.startswith("core/SOCAcore/"):
        return s[len("core/SOCAcore/") :]
    return s


def _collect_text_files(root: Path, *, max_files: int = 64, max_size_bytes: int = 512_000) -> List[Path]:
    allowed_suffixes = {".md", ".txt", ".json", ".yaml", ".yml"}
    files: List[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for name in filenames:
            if len(files) >= max_files:
                return files
            p = Path(dirpath) / name
            if p.suffix.lower() not in allowed_suffixes:
                continue
            try:
                if p.stat().st_size > max_size_bytes:
                    continue
            except OSError:
                continue
            files.append(p)
    return files


def _ssot_snippets(
    *,
    repo_root: Path,
    scopes: Sequence[str],
    terms: Sequence[str],
    max_total_snippets: int = 10,
) -> Tuple[List[ContextSnippet], List[Dict[str, Any]]]:
    ssot_root = _resolve_under(repo_root, repo_root / "core" / "SOCAcore")
    normalized = [_normalize_ssot_scope(s) for s in scopes if s.strip()]
    if not normalized:
        normalized = [""]

    candidate_files: List[Path] = []
    for scope in normalized:
        target = _resolve_under(repo_root, ssot_root / scope)
        if not _is_relative_to(target, ssot_root):
            continue
        if target.is_dir():
            candidate_files.extend(_collect_text_files(target))
        elif target.is_file():
            candidate_files.append(target)

    seen: Set[Path] = set()
    files: List[Path] = []
    for f in candidate_files:
        if f in seen:
            continue
        seen.add(f)
        files.append(f)

    snippets: List[ContextSnippet] = []
    ssot_refs: List[Dict[str, Any]] = []
    for f in files:
        if len(snippets) >= max_total_snippets:
            break
        try:
            f_resolved = _resolve_under(repo_root, f)
        except HTTPException:
            continue
        if not _is_relative_to(f_resolved, ssot_root):
            continue
        text = _read_text_limited(f_resolved, max_bytes=256_000)
        extracted = _extract_line_snippets(text, terms, max_snippets=2)
        if not extracted:
            continue
        sha = _sha256_file(f_resolved)
        ssot_refs.append({"path": _safe_relpath(f_resolved, repo_root), "sha256": sha})
        for snippet_text, score in extracted:
            if len(snippets) >= max_total_snippets:
                break
            snippets.append(
                ContextSnippet(
                    layer="ssot",
                    text=snippet_text,
                    score=score,
                    source={
                        "type": "file",
                        "path": _safe_relpath(f_resolved, repo_root),
                        "sha256": sha,
                    },
                )
            )
    return snippets, ssot_refs


def _hot_snippets(*, page_text: str, tab_meta: Dict[str, Any], terms: Sequence[str]) -> List[ContextSnippet]:
    snippets: List[ContextSnippet] = []
    url = str(tab_meta.get("url") or "")
    title = str(tab_meta.get("title") or "")
    header_parts = [p for p in [title, url] if p]
    if header_parts:
        snippets.append(
            ContextSnippet(
                layer="hot",
                text="\n".join(header_parts)[:600],
                score=0,
                source={"type": "tab_meta"},
            )
        )

    extracted = _extract_line_snippets(page_text, terms, max_snippets=2)
    for snippet_text, score in extracted:
        snippets.append(
            ContextSnippet(
                layer="hot",
                text=snippet_text,
                score=score,
                source={"type": "page_text"},
            )
        )
    return snippets


_PIECES_TABLES: Tuple[str, ...] = (
    "summaries_annotation_summary",
    "summaries_annotation_description",
    "annotations",
    "conversation_messages",
)


def _extract_text_from_pieces_json(obj: Any) -> Optional[str]:
    if not isinstance(obj, dict):
        return None
    if isinstance(obj.get("text"), str) and obj["text"].strip():
        return obj["text"]
    os_obj = obj.get("os")
    if isinstance(os_obj, dict) and isinstance(os_obj.get("text"), str) and os_obj["text"].strip():
        return os_obj["text"]
    msg = obj.get("message")
    if isinstance(msg, dict):
        frag = msg.get("fragment")
        if isinstance(frag, dict):
            string = frag.get("string")
            if isinstance(string, dict) and isinstance(string.get("raw"), str) and string["raw"].strip():
                return string["raw"]
    return None


def _pieces_snippets(
    *,
    repo_root: Path,
    terms: Sequence[str],
    query: str,
    max_total_snippets: int = 8,
) -> List[ContextSnippet]:
    db_path = repo_root / "memory" / "pieces_library" / "pieces_client_sqlite.db"
    if not db_path.exists():
        return []

    db_path = _resolve_under(repo_root, db_path)

    patterns: List[str] = []
    if query.strip():
        patterns.append(query.strip())
    patterns.extend([t for t in terms if t not in patterns])
    patterns = patterns[:3]

    where = " OR ".join(["json LIKE ?"] * len(patterns)) if patterns else "1=0"
    params: List[Any] = [f"%{p}%" for p in patterns]

    snippets: List[ContextSnippet] = []
    seen_hashes: Set[str] = set()

    con = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=0.2)
    try:
        cur = con.cursor()
        for table in _PIECES_TABLES:
            if len(snippets) >= max_total_snippets:
                break
            sql = f"SELECT key, json FROM {table} WHERE {where} LIMIT ?"
            cur.execute(sql, [*params, max_total_snippets * 3])
            for key, raw_json in cur.fetchall():
                if len(snippets) >= max_total_snippets:
                    break
                if not isinstance(raw_json, str) or not raw_json.strip():
                    continue
                row_hash = _sha256_text(raw_json)
                if row_hash in seen_hashes:
                    continue
                seen_hashes.add(row_hash)
                try:
                    obj = json.loads(raw_json)
                except Exception:
                    continue
                text = _extract_text_from_pieces_json(obj)
                if not text:
                    continue
                extracted = _extract_line_snippets(text, terms, max_snippets=1)
                snippet_text, score = extracted[0] if extracted else (text.strip()[:1200], 0)
                snippets.append(
                    ContextSnippet(
                        layer="ltm",
                        text=snippet_text,
                        score=score,
                        source={
                            "type": "sqlite_row",
                            "db": _safe_relpath(db_path, repo_root),
                            "table": table,
                            "key": key,
                            "row_sha256": row_hash,
                        },
                    )
                )
    finally:
        con.close()
    return snippets


_SOCA_ALIAS_MODELS: List[Dict[str, Any]] = [
    {
        "id": "soca/auto",
        "name": "SOCA Auto",
        "provider": "soca",
        "source": "bridge_alias",
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"],
    },
    {
        "id": "soca/fast",
        "name": "SOCA Fast",
        "provider": "soca",
        "source": "bridge_alias",
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"],
    },
    {
        "id": "soca/best",
        "name": "SOCA Best",
        "provider": "soca",
        "source": "bridge_alias",
        "input_modalities": ["text", "image"],
        "output_modalities": ["text"],
    },
]

_FALLBACK_MODELS: List[Dict[str, str]] = [
    {"id": "qwen3-vl:2b", "name": "Qwen3-VL 2B"},
    {"id": "qwen3-vl:4b", "name": "Qwen3-VL 4B"},
    {"id": "qwen3-vl:8b", "name": "Qwen3-VL 8B"},
]

_OLLAMA_MODELS_CACHE: Dict[str, Any] = {"ts": 0.0, "models": []}
_OPENROUTER_MODELS_CACHE: Dict[str, Any] = {"ts": 0.0, "models": []}
_DEFAULT_OLLAMA_MODELS_TTL_SECONDS = float(
    os.environ.get("SOCA_OPENBROWSER_BRIDGE_MODELS_TTL_SECONDS", "15")
)
_DEFAULT_OPENROUTER_MODELS_TTL_SECONDS = float(
    os.environ.get("SOCA_OPENBROWSER_BRIDGE_OPENROUTER_MODELS_TTL_SECONDS", "45")
)


def _env_nonempty(key: str) -> Optional[str]:
    val = os.environ.get(key, "").strip()
    return val or None


def _has_image_payload(body: Any) -> bool:
    if not isinstance(body, dict):
        return False
    messages = body.get("messages")
    if not isinstance(messages, list):
        return False
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                part_type = str(part.get("type") or "").lower()
                if part_type in {"image", "image_url", "input_image"}:
                    return True
                if "image_url" in part or "image" in part:
                    return True
        elif isinstance(content, dict):
            part_type = str(content.get("type") or "").lower()
            if part_type in {"image", "image_url", "input_image"}:
                return True
            if "image_url" in content or "image" in content:
                return True
    return False


def _cache_age_seconds(cache: Dict[str, Any]) -> Optional[float]:
    ts = float(cache.get("ts") or 0.0)
    if ts <= 0:
        return None
    return round(max(0.0, time.time() - ts), 3)


def _normalize_modalities(value: Any) -> List[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip().lower()]
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            normalized = item.strip().lower()
            if normalized and normalized not in out:
                out.append(normalized)
        return out
    return []


def _guess_modalities_from_model_id(model_id: str) -> Tuple[List[str], List[str]]:
    lower = (model_id or "").lower()
    has_image = any(
        token in lower
        for token in (
            "vl",
            "vision",
            "llava",
            "pixtral",
            "multimodal",
            "gpt-4o",
            "gemini",
            "claude",
        )
    )
    input_modalities = ["text", "image"] if has_image else ["text"]
    return input_modalities, ["text"]


def _normalize_ollama_model(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    model_id = (item.get("id") or "").strip()
    if not model_id:
        return None
    name = str(item.get("name") or model_id).strip() or model_id
    input_modalities, output_modalities = _guess_modalities_from_model_id(model_id)
    return {
        "id": model_id,
        "name": name,
        "provider": "ollama",
        "source": "ollama",
        "input_modalities": input_modalities,
        "output_modalities": output_modalities,
    }


def _normalize_openrouter_model(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw_id = str(item.get("id") or "").strip()
    if not raw_id:
        return None
    model_id = raw_id if raw_id.startswith("openrouter/") else f"openrouter/{raw_id}"
    name = str(item.get("name") or raw_id).strip() or raw_id

    architecture = item.get("architecture")
    input_modalities: List[str] = []
    output_modalities: List[str] = []
    if isinstance(architecture, dict):
        input_modalities = _normalize_modalities(
            architecture.get("input_modalities")
            or architecture.get("input")
            or architecture.get("modality")
        )
        output_modalities = _normalize_modalities(
            architecture.get("output_modalities") or architecture.get("output")
        )

    if not input_modalities or not output_modalities:
        guessed_input, guessed_output = _guess_modalities_from_model_id(raw_id)
        if not input_modalities:
            input_modalities = guessed_input
        if not output_modalities:
            output_modalities = guessed_output

    context_length_raw = item.get("context_length")
    context_length = context_length_raw if isinstance(context_length_raw, int) else None
    pricing = item.get("pricing") if isinstance(item.get("pricing"), dict) else None
    model_type = item.get("type") if isinstance(item.get("type"), str) else None

    normalized: Dict[str, Any] = {
        "id": model_id,
        "name": name,
        "provider": "openrouter",
        "source": "openrouter",
        "input_modalities": input_modalities,
        "output_modalities": output_modalities,
    }
    if context_length is not None:
        normalized["context_length"] = context_length
    if pricing:
        normalized["pricing"] = pricing
    if model_type:
        normalized["type"] = model_type
    return normalized


async def _fetch_ollama_models(
    *, ttl_seconds: float = _DEFAULT_OLLAMA_MODELS_TTL_SECONDS
) -> List[Dict[str, Any]]:
    now = time.time()
    cached_ts = float(_OLLAMA_MODELS_CACHE.get("ts") or 0.0)
    cached_models = _OLLAMA_MODELS_CACHE.get("models")
    if isinstance(cached_models, list) and cached_models and (now - cached_ts) < ttl_seconds:
        return cached_models

    fallback_models: List[Dict[str, Any]] = []
    for fallback in _FALLBACK_MODELS:
        normalized = _normalize_ollama_model(fallback)
        if normalized:
            fallback_models.append(normalized)

    url = f"{_ollama_base_url()}/models"
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(url)
        if resp.status_code >= 400:
            raise RuntimeError(f"status={resp.status_code}")
        payload = resp.json()
        data = payload.get("data")
        models: List[Dict[str, Any]] = []
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                normalized = _normalize_ollama_model(item)
                if normalized:
                    models.append(normalized)
        if not models:
            models = fallback_models
        _OLLAMA_MODELS_CACHE["ts"] = now
        _OLLAMA_MODELS_CACHE["models"] = models
        return models
    except Exception:
        return cached_models if isinstance(cached_models, list) and cached_models else fallback_models


async def _fetch_openrouter_models(
    *, ttl_seconds: float = _DEFAULT_OPENROUTER_MODELS_TTL_SECONDS
) -> List[Dict[str, Any]]:
    api_key = _openrouter_api_key()
    if not api_key:
        return []

    now = time.time()
    cached_ts = float(_OPENROUTER_MODELS_CACHE.get("ts") or 0.0)
    cached_models = _OPENROUTER_MODELS_CACHE.get("models")
    if isinstance(cached_models, list) and cached_models and (now - cached_ts) < ttl_seconds:
        return cached_models

    url = f"{_openrouter_base_url()}/models"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "User-Agent": f"soca-openbrowser-bridge/{APP_VERSION}",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"status={resp.status_code}")
        payload = resp.json()
        data = payload.get("data")
        models: List[Dict[str, Any]] = []
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                normalized = _normalize_openrouter_model(item)
                if normalized:
                    models.append(normalized)
        _OPENROUTER_MODELS_CACHE["ts"] = now
        _OPENROUTER_MODELS_CACHE["models"] = models
        return models
    except Exception:
        return cached_models if isinstance(cached_models, list) else []


async def _fetch_upstream_models() -> List[Dict[str, Any]]:
    ollama_models = await _fetch_ollama_models()
    openrouter_models = await _fetch_openrouter_models()
    return [*ollama_models, *openrouter_models]


async def _upstream_model_ids() -> Set[str]:
    models = await _fetch_upstream_models()
    return {str(m.get("id", "")).strip() for m in models if isinstance(m, dict)}


def _pick_first_available(candidates: Sequence[str], available: Set[str]) -> Optional[str]:
    for c in candidates:
        if c and c in available:
            return c
    for c in candidates:
        if c:
            return c
    return None


async def _resolve_soca_alias_model(*, requested_model: Any, request_body: Any) -> Tuple[Any, Optional[Dict[str, Any]]]:
    if not isinstance(requested_model, str):
        return requested_model, None
    model = requested_model.strip()
    if not model.startswith("soca/"):
        return requested_model, None

    variant = model.split("/", 1)[1].strip().lower()
    has_image = _has_image_payload(request_body)
    available = await _upstream_model_ids()

    if has_image:
        env_map = {
            "fast": _env_nonempty("SOCA_BRIDGE_VISION_FAST_MODEL"),
            "auto": _env_nonempty("SOCA_BRIDGE_VISION_AUTO_MODEL"),
            "best": _env_nonempty("SOCA_BRIDGE_VISION_BEST_MODEL"),
        }
        defaults = {
            "fast": ["qwen3-vl:2b", "qwen3-vl:8b"],
            "auto": ["qwen3-vl:8b", "qwen3-vl:2b"],
            "best": ["qwen3-vl:8b", "qwen3-vl:2b"],
        }
    else:
        env_map = {
            "fast": _env_nonempty("SOCA_BRIDGE_TEXT_FAST_MODEL"),
            "auto": _env_nonempty("SOCA_BRIDGE_TEXT_AUTO_MODEL"),
            "best": _env_nonempty("SOCA_BRIDGE_TEXT_BEST_MODEL"),
        }
        defaults = {
            "fast": ["qwen3:8b", "qwen2.5-coder:7b", "qwen3-vl:2b"],
            "auto": ["qwen3:32b", "qwen3:8b", "qwen3-vl:8b"],
            "best": ["qwen2.5-coder:32b", "qwen3:32b", "qwen3:8b", "qwen3-vl:8b"],
        }

    explicit = env_map.get(variant)
    candidates = ([explicit] if explicit else []) + defaults.get(variant, [])
    resolved = _pick_first_available([c for c in candidates if c], available)
    if not resolved:
        return requested_model, {"requested": requested_model, "resolved": requested_model, "alias": variant, "has_image": has_image}
    return resolved, {"requested": requested_model, "resolved": resolved, "alias": variant, "has_image": has_image}


class PrivateNetworkAccessMiddleware:
    """
    Chrome Private Network Access (PNA) preflights require:
      Access-Control-Allow-Private-Network: true

    Without this header, Chrome may block extension requests to 127.0.0.1 even
    when standard CORS is configured.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.lower(): v for k, v in (scope.get("headers") or [])}
        wants_pna = headers.get(b"access-control-request-private-network", b"").lower() == b"true"
        if not wants_pna:
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                response_headers = message.setdefault("headers", [])
                if not any(
                    k.lower() == b"access-control-allow-private-network" for k, _v in response_headers
                ):
                    response_headers.append((b"access-control-allow-private-network", b"true"))
            await send(message)

        await self.app(scope, receive, send_wrapper)


app = FastAPI(title="SOCA OpenBrowser Bridge", version=APP_VERSION)

# CORS middleware for Chrome extension support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Ensure Chrome Private Network Access (PNA) preflights succeed for localhost calls.
app.add_middleware(PrivateNetworkAccessMiddleware)
app.include_router(promptbuddy_router)


@app.get("/health")
async def health() -> Dict[str, Any]:
    import socket
    hostname = socket.gethostname()
    bind_host = os.environ.get("SOCA_OPENBROWSER_BRIDGE_HOST", "0.0.0.0")
    bind_port = int(os.environ.get("SOCA_OPENBROWSER_BRIDGE_PORT", "9834"))
    return {
        "status": "ok",
        "version": APP_VERSION,
        "hostname": hostname,
        "bind": f"{bind_host}:{bind_port}",
        "token_required": bool(os.environ.get("SOCA_OPENBROWSER_BRIDGE_TOKEN", "soca").strip()),
        "ollama_configured": bool(os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")),
    }


def _policy_packs_path(repo_root: Path) -> Path:
    return repo_root / "core" / "policy" / "openbrowser.policy_packs.json"


@app.get("/capabilities")
async def capabilities() -> Dict[str, Any]:
    """
    Lightweight, no-auth endpoint used by local clients to discover bridge behavior.
    Intended for localhost usage only (network exposure is a deployment concern).
    """
    repo_root = _repo_root_or_500()
    policy_path = _policy_packs_path(repo_root)
    policy_sha = _sha256_file(policy_path) if policy_path.exists() else None
    token_expected = os.environ.get("SOCA_OPENBROWSER_BRIDGE_TOKEN", "soca").strip()
    token_required = bool(token_expected)
    port = int(os.environ.get("SOCA_OPENBROWSER_BRIDGE_PORT", "9834"))

    return {
        "bridge_version": APP_VERSION,
        "token_required": token_required,
        "port": port,
        "supported_lanes": ["OB_OFFLINE", "OB_ONLINE_PULSE"],
        "endpoints": [
            "/health",
            "/capabilities",
            "/soca/bridge/status",
            "/v1/models",
            "/v1/chat/completions",
            "/soca/context-pack",
            "/soca/policy/packs",
            "/soca/webfetch",
            "/soca/pdf/extract",
            "/soca/nt2l/plan",
            "/soca/nt2l/validate",
            "/soca/nt2l/approval-preview",
            "/soca/nt2l/execute-dry-run",
            "/soca/nt2l/schedule",
            "/soca/nt2l/carnet-handoff",
        ],
        "policy_packs": {"path": _safe_relpath(policy_path, repo_root), "sha256": policy_sha},
    }


@app.get("/soca/bridge/status")
async def soca_bridge_status(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    ollama_models = await _fetch_ollama_models()
    openrouter_models = await _fetch_openrouter_models()
    merged_models = await _fetch_upstream_models()

    return {
        "ok": True,
        "bridge_up": True,
        "version": APP_VERSION,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "supported_lanes": ["OB_OFFLINE", "OB_ONLINE_PULSE"],
        "ollama_up": bool(ollama_models),
        "ollama_models_count": len(ollama_models),
        "openrouter_key_present": bool(_openrouter_api_key()),
        "openrouter_models_count": len(openrouter_models),
        "merged_models_count": len(merged_models),
        "cache": {
            "ollama_age_seconds": _cache_age_seconds(_OLLAMA_MODELS_CACHE),
            "openrouter_age_seconds": _cache_age_seconds(_OPENROUTER_MODELS_CACHE),
        },
    }


@app.get("/soca/policy/packs")
async def soca_policy_packs(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    path = _policy_packs_path(repo_root)
    if not path.exists():
        raise HTTPException(status_code=404, detail="policy_packs_not_found")
    raw = path.read_bytes()
    sha = _sha256_bytes(raw)
    try:
        packs = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        raise HTTPException(status_code=500, detail="policy_packs_invalid_json")

    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
    return {
        "ok": True,
        "sha256": sha,
        "effective_at": mtime,
        "packs": packs,
    }


@app.get("/v1/models")
async def list_models(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> Dict[str, Any]:
    _require_token(authorization)
    now = int(time.time())
    upstream = await _fetch_upstream_models()
    merged: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for entry in [*_SOCA_ALIAS_MODELS, *upstream]:
        model_id = str(entry.get("id") or "").strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        normalized: Dict[str, Any] = {"id": model_id}
        for key in (
            "name",
            "provider",
            "source",
            "input_modalities",
            "output_modalities",
            "context_length",
            "pricing",
            "type",
        ):
            value = entry.get(key)
            if value in (None, "", [], {}):
                continue
            normalized[key] = value
        merged.append(normalized)
    return {
        "object": "list",
        "data": [
            {
                "id": model["id"],
                "object": "model",
                "created": now,
                "owned_by": "soca-openbrowser-bridge",
                **(
                    {"name": model["name"]}
                    if isinstance(model.get("name"), str) and model.get("name")
                    else {}
                ),
                **(
                    {"provider": model["provider"]}
                    if isinstance(model.get("provider"), str) and model.get("provider")
                    else {}
                ),
                **(
                    {"source": model["source"]}
                    if isinstance(model.get("source"), str) and model.get("source")
                    else {}
                ),
                **(
                    {"input_modalities": model["input_modalities"]}
                    if isinstance(model.get("input_modalities"), list)
                    else {}
                ),
                **(
                    {"output_modalities": model["output_modalities"]}
                    if isinstance(model.get("output_modalities"), list)
                    else {}
                ),
                **(
                    {"context_length": model["context_length"]}
                    if isinstance(model.get("context_length"), int)
                    else {}
                ),
                **(
                    {"pricing": model["pricing"]}
                    if isinstance(model.get("pricing"), dict)
                    else {}
                ),
                **(
                    {"type": model["type"]}
                    if isinstance(model.get("type"), str) and model.get("type")
                    else {}
                ),
            }
            for model in merged
        ],
    }


def _model_dump(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        # Pydantic v2
        return model.model_dump(exclude_none=True)
    # Pydantic v1
    return model.dict(exclude_none=True)


def _file_source_provenance(
    path: Path,
    *,
    repo_root: Path,
    hash_limit_bytes: int = 1_000_000,
    sample_tail_bytes: int = 256_000,
) -> Dict[str, Any]:
    size = path.stat().st_size
    rel = _safe_relpath(path, repo_root)
    if size <= hash_limit_bytes:
        return {"type": "file", "path": rel, "sha256": _sha256_file(path), "bytes": size}

    with path.open("rb") as f:
        if size > sample_tail_bytes:
            f.seek(max(0, size - sample_tail_bytes))
        sample = f.read(sample_tail_bytes)

    return {
        "type": "file_sample",
        "path": rel,
        "bytes": size,
        "sample_bytes": len(sample),
        "sample_sha256": _sha256_bytes(sample),
        "sample_strategy": "tail",
    }


def _warm_snippets(*, repo_root: Path, terms: Sequence[str]) -> List[ContextSnippet]:
    sources = [
        repo_root / "logs" / "soca" / "launch_metrics_latest.json",
        repo_root / "logs" / "soca" / "soca_health_summary_latest.json",
        repo_root / "logs" / "soca" / "memory_continuity_latest.json",
    ]
    snippets: List[ContextSnippet] = []
    for p in sources:
        if not p.exists() or not p.is_file():
            continue
        text = _read_text_limited(p, max_bytes=128_000)
        extracted = _extract_line_snippets(text, terms, max_snippets=1)
        if not extracted:
            continue
        snippet_text, score = extracted[0]
        snippets.append(
            ContextSnippet(
                layer="warm",
                text=snippet_text,
                score=score,
                source=_file_source_provenance(p, repo_root=repo_root),
            )
        )
    return snippets


def _cold_snippets(*, repo_root: Path, terms: Sequence[str]) -> List[ContextSnippet]:
    sources = [
        repo_root / "logs" / "soca" / "AUDIT_REPORT.md",
        repo_root / "logs" / "soca" / "CRITICAL_IMPROVEMENTS_REQUIRED.md",
        repo_root / "logs" / "soca" / "mcp_guardian.log",
    ]
    snippets: List[ContextSnippet] = []
    for p in sources:
        if not p.exists() or not p.is_file():
            continue
        text = _read_text_tail(p, max_bytes=192_000) if p.suffix.lower() == ".log" else _read_text_limited(p, max_bytes=192_000)
        extracted = _extract_line_snippets(text, terms, max_snippets=1)
        if not extracted:
            continue
        snippet_text, score = extracted[0]
        snippets.append(
            ContextSnippet(
                layer="cold",
                text=snippet_text,
                score=score,
                source=_file_source_provenance(p, repo_root=repo_root),
            )
        )
    return snippets


_LOCAL_HOSTS: Set[str] = {"127.0.0.1", "localhost", "::1"}

_ALLOWLIST_HEADER = "x-soca-allowlist"
_ALLOWLIST_ENV_VAR = "SOCA_OPENBROWSER_BRIDGE_ALLOWLIST_DOMAINS"


def _parse_allowlist_text(text: str) -> Set[str]:
    """
    Accept newline and comma separated domain entries.

    Supported forms:
    - example.com
    - api.github.com
    - https://api.github.com/
    - *.example.com (treated as example.com suffix match)
    - host:port (port ignored)

    Returned entries are lowercased hostnames without trailing dots.
    """
    items: Set[str] = set()
    if not text:
        return items

    for raw in re.split(r"[,\n]", text):
        entry = (raw or "").strip()
        if not entry or entry.startswith("#"):
            continue

        entry = entry.replace("http://", "").replace("https://", "")
        entry = entry.split("/", 1)[0].strip()
        if not entry:
            continue

        if entry.startswith("*."):
            entry = entry[2:]

        # Strip port if present (and not an IPv6 literal).
        if entry.startswith("[") and "]" in entry:
            host = entry[1 : entry.index("]")]
        else:
            host = entry.split(":", 1)[0]

        host = host.strip().lower().rstrip(".")
        if host:
            items.add(host)

    return items


def _effective_allowlist_domains(request: Request) -> Set[str]:
    """
    SSOT policy: if the bridge host sets an env allowlist, it is authoritative.
    Otherwise, accept allowlist from the client request header.
    """
    env_text = os.environ.get(_ALLOWLIST_ENV_VAR, "").strip()
    if env_text:
        return _parse_allowlist_text(env_text)
    header_text = request.headers.get(_ALLOWLIST_HEADER, "") or ""
    return _parse_allowlist_text(header_text)


def _host_is_allowlisted(host: str, allowlist: Set[str]) -> bool:
    host = (host or "").strip().lower().rstrip(".")
    if not host:
        return False
    if host in allowlist:
        return True
    for domain in allowlist:
        if domain and host.endswith("." + domain):
            return True
    return False


def _normalize_lane(lane: str) -> str:
    return (lane or "").strip()


def _lane_requires_network(lane: str) -> bool:
    return _normalize_lane(lane) == "OB_ONLINE_PULSE"


def _require_online_lane(lane: str) -> None:
    if not _lane_requires_network(lane):
        raise HTTPException(status_code=403, detail="lane_requires_network: switch to OB_ONLINE_PULSE")


def _require_url_allowed_for_lane(
    lane: str,
    url: str,
    *,
    allowlist_domains: Optional[Set[str]] = None,
) -> None:
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_url")

    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="unsupported_url_scheme")

    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise HTTPException(status_code=400, detail="invalid_url_host")

    if not _lane_requires_network(lane):
        if host not in _LOCAL_HOSTS:
            raise HTTPException(status_code=403, detail=f"lane_offline_blocks_host:{host}")
        return

    allowlist = allowlist_domains or set()
    if not allowlist:
        raise HTTPException(status_code=403, detail="lane_online_missing_allowlist")
    if not _host_is_allowlisted(host, allowlist):
        raise HTTPException(status_code=403, detail=f"lane_online_blocks_host:{host}")


def _start_evidence_dir(*, evidence_root: Optional[Path], prefix: str) -> Tuple[Optional[Path], Optional[str]]:
    if not evidence_root:
        return None, None
    run_id = f"{_utc_ts()}-{uuid4().hex[:8]}-{prefix}"
    evidence_dir = (evidence_root / run_id).resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)
    return evidence_dir, run_id


_HTML_TAG_RE = re.compile(r"(?s)<[^>]+>")
_HTML_SCRIPT_STYLE_RE = re.compile(r"(?is)<(script|style)[^>]*>.*?</\\1>")


def _html_to_text(html_text: str) -> str:
    cleaned = _HTML_SCRIPT_STYLE_RE.sub(" ", html_text)
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


async def _fetch_url_text(*, url: str, max_bytes: int) -> Tuple[str, bool, Optional[str], int]:
    headers = {"user-agent": f"soca-openbrowser-bridge/{APP_VERSION}"}
    truncated = False
    chunks: List[bytes] = []
    captured = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        async with client.stream("GET", url, headers=headers) as resp:
            content_type = resp.headers.get("content-type")
            status_code = resp.status_code
            async for chunk in resp.aiter_bytes():
                if not chunk:
                    continue
                if captured + len(chunk) > max_bytes:
                    chunk = chunk[: max(0, max_bytes - captured)]
                    truncated = True
                chunks.append(chunk)
                captured += len(chunk)
                if truncated:
                    break

    data = b"".join(chunks)
    text = data.decode("utf-8", errors="replace")
    if content_type and "text/html" in content_type.lower():
        text = _html_to_text(text)
    return text, truncated, content_type, status_code


def _ensure_core_on_syspath(repo_root: Path) -> None:
    root_dir = repo_root.resolve()
    root_str = str(root_dir)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    core_dir = (repo_root / "core").resolve()
    core_str = str(core_dir)
    if core_str not in sys.path:
        sys.path.insert(0, core_str)


def _resolve_1password_ref(value: str) -> str:
    if not value.startswith("op://"):
        return value
    try:
        out = subprocess.check_output(["op", "read", value], text=True).strip()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail="secret_unavailable: op_cli_missing") from e
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail="secret_unavailable: op_read_failed") from e
    if not out:
        raise HTTPException(status_code=500, detail="secret_unavailable: empty_secret")
    return out


def _github_token_or_500() -> str:
    for key in ("GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"):
        raw = os.environ.get(key, "").strip()
        if raw:
            return _resolve_1password_ref(raw)
    raise HTTPException(status_code=500, detail="missing_env: GITHUB_TOKEN")


@app.post("/soca/context-pack", response_model=ContextPackResponse)
async def context_pack(
    payload: ContextPackRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> ContextPackResponse:
    _require_token(authorization)

    repo_root = _repo_root_or_500()
    terms = _query_terms(payload.query)

    requested_layers = [s.strip().lower() for s in payload.requested_layers if s and s.strip()]
    if not requested_layers:
        requested_layers = ["hot", "warm", "ltm"]

    allowed_layers = {"hot", "warm", "cold", "vector", "ltm"}
    unknown = [l for l in requested_layers if l not in allowed_layers]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown requested_layers: {unknown}")

    ssot_scopes = payload.ssot_scopes or ["SOCAcore"]
    for scope in ssot_scopes:
        norm = _normalize_ssot_scope(scope)
        parts = Path(norm).parts if norm else ()
        if any(p == ".." for p in parts):
            raise HTTPException(status_code=400, detail="invalid ssot_scope")

    snippets: List[ContextSnippet] = []
    ssot_refs: List[Dict[str, Any]] = []

    if "hot" in requested_layers:
        snippets.extend(_hot_snippets(page_text=payload.page_text, tab_meta=payload.tab_meta, terms=terms))

    ssot_snips, ssot_refs = _ssot_snippets(repo_root=repo_root, scopes=ssot_scopes, terms=terms)
    snippets.extend(ssot_snips)

    if "warm" in requested_layers:
        snippets.extend(_warm_snippets(repo_root=repo_root, terms=terms))

    if "cold" in requested_layers:
        snippets.extend(_cold_snippets(repo_root=repo_root, terms=terms))

    if "ltm" in requested_layers:
        snippets.extend(_pieces_snippets(repo_root=repo_root, terms=terms, query=payload.query))

    layer_status: Dict[str, str] = {"vector": "unavailable"} if "vector" in requested_layers else {}

    evidence_root = _evidence_root()
    run_id: Optional[str] = None
    evidence_dir: Optional[Path] = None
    if evidence_root:
        run_id = f"{_utc_ts()}-{uuid4().hex[:8]}-context-pack"
        evidence_dir = (evidence_root / run_id).resolve()
        evidence_dir.mkdir(parents=True, exist_ok=True)

    provenance: Dict[str, Any] = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "bridge_version": APP_VERSION,
        "lane": payload.lane,
        "retrieval_mode": "local-only",
        "requested_layers": requested_layers,
        "ssot_scopes": ssot_scopes,
        "query_terms": terms,
        "layer_status": layer_status,
        "run_id": run_id,
    }

    compression_summary: Dict[str, Any] = {
        "input_chars": {
            "query": len(payload.query),
            "page_text": len(payload.page_text),
            "tab_meta": len(json.dumps(payload.tab_meta, ensure_ascii=False)),
        },
        "output_chars": {
            "snippets": sum(len(s.text) for s in snippets),
        },
        "limits": {
            "ssot_max_total_snippets": 10,
            "page_text_snippets": 2,
            "pieces_max_total_snippets": 8,
        },
    }

    response = ContextPackResponse(
        snippets=snippets,
        ssot_refs=ssot_refs,
        provenance=provenance,
        compression_summary=compression_summary,
    )

    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        (evidence_dir / "context_pack.json").write_text(
            json.dumps(_model_dump(response), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/openbrowser/panel-dump")
async def soca_openbrowser_panel_dump(
    payload: OpenBrowserPanelDumpRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)

    repo_root = _repo_root_or_500()
    exports_root = _openbrowser_exports_root(repo_root)
    exports_root.mkdir(parents=True, exist_ok=True)

    run_id = f"{_utc_ts()}-{uuid4().hex[:8]}-panel-dump"
    evidence_dir = (exports_root / run_id).resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)

    panel_text = payload.panel_text or ""
    (evidence_dir / "panel.txt").write_text(panel_text, encoding="utf-8")

    if payload.panel_html and payload.panel_html.strip():
        (evidence_dir / "panel.html").write_text(payload.panel_html, encoding="utf-8")

    meta = {
        "run_id": run_id,
        "exported_utc": payload.exported_utc,
        "received_utc": datetime.now(timezone.utc).isoformat(),
        "source_tab_url": payload.source_tab_url,
        "title": payload.title,
        "panel_text_bytes": len(panel_text.encode("utf-8", errors="replace")),
        "panel_html_bytes": len(payload.panel_html.encode("utf-8", errors="replace"))
        if payload.panel_html
        else 0,
        "bridge_version": APP_VERSION,
        "client_headers": _redact_headers(dict(request.headers)),
    }
    (evidence_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    files = [p for p in evidence_dir.glob("*") if p.is_file()]
    (evidence_dir / "sha256.txt").write_text(
        "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
        encoding="utf-8",
    )

    rel_paths = [_safe_relpath(p, repo_root) for p in sorted(files)]
    return {"run_id": run_id, "paths": rel_paths}


@app.post("/soca/webfetch")
async def soca_webfetch(
    payload: WebFetchRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)

    lane = _normalize_lane(payload.lane) or "OB_OFFLINE"
    _require_url_allowed_for_lane(
        lane,
        payload.url,
        allowlist_domains=_effective_allowlist_domains(request),
    )

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="webfetch")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    text, truncated, content_type, status_code = await _fetch_url_text(url=payload.url, max_bytes=payload.max_bytes)
    if status_code >= 400:
        raise HTTPException(status_code=502, detail=f"webfetch_upstream_error: status={status_code}")

    terms = _query_terms(payload.prompt)
    snippets = _extract_line_snippets(text, terms, max_snippets=6)
    excerpt = "\n\n---\n\n".join(s for s, _score in snippets).strip() if snippets else text[:12000].strip()

    response = {
        "ok": True,
        "lane": lane,
        "url": payload.url,
        "status_code": status_code,
        "content_type": content_type,
        "truncated": truncated or len(excerpt) < len(text),
        "text": excerpt[:20000],
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


async def _fetch_url_bytes(*, url: str, max_bytes: int) -> Tuple[bytes, bool, Optional[str], int]:
    headers = {"user-agent": f"soca-openbrowser-bridge/{APP_VERSION}"}
    truncated = False
    chunks: List[bytes] = []
    captured = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=45) as client:
        async with client.stream("GET", url, headers=headers) as resp:
            status_code = resp.status_code
            content_type = resp.headers.get("content-type")
            if status_code >= 400:
                # Preserve status_code for callers.
                return b"", False, content_type, status_code

            async for chunk in resp.aiter_bytes():
                if not chunk:
                    continue
                remaining = max_bytes - captured
                if remaining <= 0:
                    truncated = True
                    break
                if len(chunk) > remaining:
                    chunks.append(chunk[:remaining])
                    captured += remaining
                    truncated = True
                    break
                chunks.append(chunk)
                captured += len(chunk)

    return b"".join(chunks), truncated, content_type, 200


@app.post("/soca/pdf/extract")
async def soca_pdf_extract(
    payload: PdfExtractRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)

    lane = _normalize_lane(payload.lane) or "OB_OFFLINE"
    _require_url_allowed_for_lane(
        lane,
        payload.url,
        allowlist_domains=_effective_allowlist_domains(request),
    )

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="pdf-extract")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    pdf_bytes, truncated_bytes, content_type, status_code = await _fetch_url_bytes(
        url=payload.url, max_bytes=int(payload.max_bytes or 0) or 15_000_000
    )
    if status_code >= 400:
        raise HTTPException(status_code=502, detail=f"pdf_fetch_upstream_error: status={status_code}")
    if not pdf_bytes:
        raise HTTPException(status_code=502, detail="pdf_fetch_empty")

    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"missing_dep:pypdf:{type(e).__name__}")

    sha = _sha256_bytes(pdf_bytes)
    pages_total: Optional[int] = None
    pages_extracted = 0
    text_parts: List[str] = []
    out_chars = 0
    truncated_text = False

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages_total = len(reader.pages)
        max_pages = max(1, int(payload.max_pages or 0) or 50)
        max_chars = max(1000, int(payload.max_chars or 0) or 60_000)

        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                truncated_text = True
                break
            t = page.extract_text() or ""
            if not t:
                continue
            remaining = max_chars - out_chars
            if remaining <= 0:
                truncated_text = True
                break
            if len(t) > remaining:
                text_parts.append(t[:remaining])
                out_chars += remaining
                truncated_text = True
                pages_extracted = i + 1
                break
            text_parts.append(t)
            out_chars += len(t)
            pages_extracted = i + 1
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"pdf_parse_failed:{type(e).__name__}")

    text = "\n\n".join(text_parts).strip()
    response = {
        "ok": True,
        "lane": lane,
        "url": payload.url,
        "content_type": content_type,
        "sha256": sha,
        "pages_total": pages_total,
        "pages_extracted": pages_extracted,
        "truncated": bool(truncated_bytes or truncated_text),
        "text": text,
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/context7/get-library-docs")
async def soca_context7_get_library_docs(
    payload: Context7DocsRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    lane = _normalize_lane(payload.lane) or "OB_OFFLINE"
    _require_online_lane(lane)

    library = payload.library_id.strip().lstrip("/")
    if not library:
        raise HTTPException(status_code=400, detail="invalid_library_id")

    url = f"https://context7.com/{library}/llms.txt"
    _require_url_allowed_for_lane(
        lane,
        url,
        allowlist_domains=_effective_allowlist_domains(request),
    )

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="context7")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                    "resolved_url": url,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    text, truncated, content_type, status_code = await _fetch_url_text(url=url, max_bytes=512_000)
    if status_code >= 400:
        raise HTTPException(status_code=502, detail=f"context7_upstream_error: status={status_code}")

    terms = _query_terms(payload.topic or "")
    snippets = _extract_line_snippets(text, terms, max_snippets=8)
    excerpt = "\n\n---\n\n".join(s for s, _score in snippets).strip() if snippets else text[: payload.max_chars].strip()

    response = {
        "ok": True,
        "lane": lane,
        "library_id": payload.library_id,
        "topic": payload.topic,
        "url": url,
        "status_code": status_code,
        "content_type": content_type,
        "truncated": truncated or len(excerpt) < len(text),
        "text": excerpt[: payload.max_chars],
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/github/get")
async def soca_github_get(
    payload: GitHubGetRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    lane = _normalize_lane(payload.lane) or "OB_OFFLINE"
    _require_online_lane(lane)

    path = payload.path.strip()
    if not path.startswith("/") or "://" in path:
        raise HTTPException(status_code=400, detail="invalid_github_path")

    url = f"https://api.github.com{path}"
    _require_url_allowed_for_lane(
        lane,
        url,
        allowlist_domains=_effective_allowlist_domains(request),
    )
    token = _github_token_or_500()

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="github")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                    "resolved_url": url,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    headers = {
        "authorization": f"Bearer {token}",
        "accept": "application/vnd.github+json",
        "user-agent": f"soca-openbrowser-bridge/{APP_VERSION}",
        "x-github-api-version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers, params=payload.query)

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"github_upstream_error: status={resp.status_code} body={resp.text[:400]}")

    content_type = resp.headers.get("content-type")
    decoded_text: Optional[str] = None

    data: Any
    try:
        data = resp.json()
        if isinstance(data, dict) and data.get("encoding") == "base64" and isinstance(data.get("content"), str):
            try:
                decoded_bytes = base64.b64decode(data["content"], validate=False)
                decoded_text = decoded_bytes.decode("utf-8", errors="replace")
            except Exception:
                decoded_text = None
    except Exception:
        data = resp.text

    response = {
        "ok": True,
        "lane": lane,
        "path": path,
        "url": url,
        "status_code": resp.status_code,
        "content_type": content_type,
        "data": data,
        "decoded_text": decoded_text[: payload.max_chars] if isinstance(decoded_text, str) else None,
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/nt2l/plan")
async def soca_nt2l_plan(
    payload: Nt2lPlanBridgeRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    _ensure_core_on_syspath(repo_root)

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="nt2l_plan")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    prev_fake = os.getenv("SOCA_FAKE_MODEL")
    if payload.fake_model:
        os.environ["SOCA_FAKE_MODEL"] = "1"
    try:
        from orchestrators import nt2l_prompt_to_plan

        plan = nt2l_prompt_to_plan.prompt_to_nt2l_plan(payload.prompt)
        response = plan.model_dump(mode="json")
    finally:
        if payload.fake_model:
            if prev_fake is None:
                os.environ.pop("SOCA_FAKE_MODEL", None)
            else:
                os.environ["SOCA_FAKE_MODEL"] = prev_fake

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/nt2l/validate")
async def soca_nt2l_validate(
    payload: Nt2lPlanPayloadRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    _ensure_core_on_syspath(repo_root)

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="nt2l_validate")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    try:
        from orchestrators import nt2l_execute_core

        plan = nt2l_execute_core.validate_plan_payload(payload.plan)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"nt2l_validate_failed:{e}") from e

    response = {
        "ok": True,
        "plan_id": plan.plan_id,
        "plan": plan.model_dump(mode="json"),
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/nt2l/approval-preview")
async def soca_nt2l_approval_preview(
    payload: Nt2lPlanPayloadRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    _ensure_core_on_syspath(repo_root)

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="nt2l_approval_preview")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    try:
        from orchestrators import nt2l_execute_core

        plan = nt2l_execute_core.validate_plan_payload(payload.plan)
        run_id = nt2l_execute_core.run_id_for_plan(plan)
        approvals = []
        for step in plan.steps:
            if step.hil.required:
                approvals.append(nt2l_execute_core.build_hil_approval(plan=plan, step=step, run_id=run_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"nt2l_approval_failed:{e}") from e

    response = {
        "ok": True,
        "plan_id": plan.plan_id,
        "run_id": run_id,
        "approvals": [a.model_dump(mode="json") for a in approvals],
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/nt2l/execute-dry-run")
async def soca_nt2l_execute_dry_run(
    payload: Nt2lPlanPayloadRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    _ensure_core_on_syspath(repo_root)

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="nt2l_execute_dry_run")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    try:
        from orchestrators import nt2l_execute_core

        plan = nt2l_execute_core.validate_plan_payload(payload.plan)
        run_id = nt2l_execute_core.run_id_for_plan(plan)
        steps = []
        approvals = []
        for step in plan.steps:
            steps.append(nt2l_execute_core.execute_step_stub(step))
            if step.hil.required:
                approvals.append(nt2l_execute_core.build_hil_approval(plan=plan, step=step, run_id=run_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"nt2l_execute_failed:{e}") from e

    response = {
        "ok": True,
        "plan_id": plan.plan_id,
        "run_id": run_id,
        "steps": steps,
        "approvals": [a.model_dump(mode="json") for a in approvals],
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/nt2l/schedule")
async def soca_nt2l_schedule(
    payload: Nt2lScheduleRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    _ensure_core_on_syspath(repo_root)

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="nt2l_schedule")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    try:
        from orchestrators.nt2l_schedule_engine import NT2LScheduleEngine, RoutineType

        routine_raw = (payload.routine_type or "").strip().upper()
        routine = RoutineType.A
        if routine_raw:
            routine = RoutineType(routine_raw)
        engine = NT2LScheduleEngine(routine_type=routine)
        schedule = engine.get_daily_schedule(date=payload.date)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"nt2l_schedule_failed:{e}") from e

    response = {
        "ok": True,
        "schedule": schedule.model_dump(mode="json"),
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


@app.post("/soca/nt2l/carnet-handoff")
async def soca_nt2l_carnet_handoff(
    payload: Nt2lCarnetRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    _require_token(authorization)
    repo_root = _repo_root_or_500()
    _ensure_core_on_syspath(repo_root)

    evidence_dir, run_id = _start_evidence_dir(evidence_root=_evidence_root(), prefix="nt2l_carnet")
    if evidence_dir:
        (evidence_dir / "request.json").write_text(
            json.dumps(_model_dump(payload), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0] if run_id else None,
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    try:
        from orchestrators.nt2l_carnet_injector import CarnetInjector

        injector = CarnetInjector()
        handoffs = []
        if payload.date:
            carnets = injector.get_carnets_for_date(payload.date)
        else:
            count = max(1, int(payload.count or 1))
            carnets = injector.get_recent_carnets(count) if count > 1 else [injector.get_latest_carnet()]

        for carnet in carnets:
            if not carnet:
                continue
            handoff = injector.parse_carnet(carnet)
            handoffs.append(
                {
                    "handoff": handoff.to_dict(),
                    "prompt_injection": handoff.to_prompt_injection(),
                }
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"nt2l_carnet_failed:{e}") from e

    response = {
        "ok": True,
        "count": len(handoffs),
        "items": handoffs,
    }

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return response


async def _proxy_stream_to_upstream(
    *,
    upstream_url: str,
    request_headers: Dict[str, str],
    request_body: Any,
    evidence_dir: Optional[Path],
    capture_limit_bytes: int = 256_000,
) -> StreamingResponse:
    client = httpx.AsyncClient(timeout=None)
    cm = client.stream(
        "POST",
        upstream_url,
        headers=request_headers,
        json=request_body,
    )

    upstream = await cm.__aenter__()
    captured = 0
    capture_path: Optional[Path] = None
    if evidence_dir:
        capture_path = evidence_dir / "response_sample.bin"
        capture_path.parent.mkdir(parents=True, exist_ok=True)

    async def iterator() -> AsyncIterator[bytes]:
        nonlocal captured
        try:
            if capture_path:
                with capture_path.open("wb") as f:
                    async for chunk in upstream.aiter_raw():
                        if captured < capture_limit_bytes:
                            part = chunk[: max(0, capture_limit_bytes - captured)]
                            f.write(part)
                            captured += len(part)
                        yield chunk
            else:
                async for chunk in upstream.aiter_raw():
                    yield chunk
        finally:
            await cm.__aexit__(None, None, None)
            await client.aclose()
            if evidence_dir:
                files = [p for p in evidence_dir.glob("*") if p.is_file()]
                (evidence_dir / "sha256.txt").write_text(
                    "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
                    encoding="utf-8",
                )

    headers = {}
    content_type = upstream.headers.get("content-type")
    if content_type:
        headers["content-type"] = content_type
    return StreamingResponse(
        iterator(),
        status_code=upstream.status_code,
        headers=headers,
    )


@app.post("/v1/chat/completions", response_model=None)
async def chat_completions(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Response:
    _require_token(authorization)

    body = await request.json()
    requested_model = body.get("model") if isinstance(body, dict) else None
    resolved_model, alias_meta = await _resolve_soca_alias_model(
        requested_model=requested_model,
        request_body=body,
    )
    effective_model = resolved_model if isinstance(resolved_model, str) else (requested_model or "")

    lane = request.headers.get("x-soca-lane") or os.environ.get("SOCA_LANE") or "L1_ASSISTED"
    task_family = request.headers.get("x-soca-task-family") or "TRIAGE"
    decision = await _policy_decide_chat(
        lane=lane,
        task_family=task_family,
        requested_model=str(effective_model),
    )
    if not decision.get("allow"):
        raise HTTPException(status_code=403, detail=str(decision.get("reason") or "blocked"))

    policy_model = str(decision.get("model") or effective_model)
    upstream_kind = str(decision.get("upstream") or ("openrouter" if policy_model.startswith("openrouter/") else "local"))
    upstream_url = (
        f"{_openrouter_base_url()}/chat/completions"
        if upstream_kind == "openrouter"
        else f"{_ollama_base_url()}/chat/completions"
    )

    upstream_body = body if isinstance(body, dict) else {}
    if isinstance(body, dict):
        upstream_body = dict(body)
        upstream_model = policy_model
        if upstream_kind == "openrouter" and upstream_model.startswith("openrouter/"):
            upstream_model = upstream_model.replace("openrouter/", "", 1)
        upstream_body["model"] = upstream_model

        if upstream_kind == "openrouter":
            provider = decision.get("provider")
            if provider and "provider" not in upstream_body:
                upstream_body["provider"] = provider
            reasoning = decision.get("reasoning")
            if reasoning and "reasoning" not in upstream_body:
                upstream_body["reasoning"] = reasoning

    evidence_root = _evidence_root()
    evidence_dir: Optional[Path] = None
    if evidence_root:
        run_id = f"{_utc_ts()}-{uuid4().hex[:8]}"
        evidence_dir = (evidence_root / run_id).resolve()
        evidence_dir.mkdir(parents=True, exist_ok=True)
        (evidence_dir / "request.json").write_text(
            json.dumps(body, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (evidence_dir / "meta.json").write_text(
            json.dumps(
                {
                    "timestamp": run_id.split("-", 1)[0],
                    "upstream_url": upstream_url,
                    "policy": {"lane": lane, "task_family": task_family, "decision": decision},
                    "model": {
                        "requested": requested_model,
                        "resolved": resolved_model,
                        "resolution": alias_meta,
                    },
                    "client_headers": _redact_headers(dict(request.headers)),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    upstream_headers = {"content-type": "application/json"}
    if upstream_kind == "openrouter":
        api_key = _openrouter_api_key()
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY missing")
        upstream_headers["Authorization"] = f"Bearer {api_key}"
        http_referer = os.environ.get("OPENROUTER_HTTP_REFERER", "").strip()
        if http_referer:
            upstream_headers["HTTP-Referer"] = http_referer
        x_title = os.environ.get("OPENROUTER_X_TITLE", "").strip()
        if x_title:
            upstream_headers["X-Title"] = x_title

    stream = bool(body.get("stream"))
    if stream:
        response = await _proxy_stream_to_upstream(
            upstream_url=upstream_url,
            request_headers=upstream_headers,
            request_body=upstream_body,
            evidence_dir=evidence_dir,
        )
        return response

    timeout = 180 if upstream_kind == "openrouter" else 90
    async with httpx.AsyncClient(timeout=timeout) as client:
        upstream = await client.post(upstream_url, headers=upstream_headers, json=upstream_body)

    if evidence_dir:
        (evidence_dir / "response.json").write_text(
            json.dumps(upstream.json(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        files = [p for p in evidence_dir.glob("*") if p.is_file()]
        (evidence_dir / "sha256.txt").write_text(
            "\n".join(f"{_sha256_file(p)}  {p.name}" for p in sorted(files)),
            encoding="utf-8",
        )

    return JSONResponse(content=upstream.json(), status_code=upstream.status_code)

class CoworkingTask(BaseModel):
    action: str
    target: str = ""
    value: str = ""
    timeout: int = 15000

connected_coworking_clients: List[WebSocket] = []

@app.websocket("/soca/bridge/coworking")
async def coworking_ws(websocket: WebSocket):
    await websocket.accept()
    if websocket not in connected_coworking_clients:
        connected_coworking_clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        if websocket in connected_coworking_clients:
            connected_coworking_clients.remove(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if websocket in connected_coworking_clients:
            connected_coworking_clients.remove(websocket)

@app.post("/soca/bridge/coworking/task")
async def send_coworking_task(
    task: CoworkingTask,
    authorization: Optional[str] = Header(default=None, alias="Authorization")
):
    _require_token(authorization)
    if not connected_coworking_clients:
        raise HTTPException(status_code=503, detail="No active browser extensions connected.")
    
    dead_clients = []
    dispatched = 0
    for client in connected_coworking_clients:
        try:
            await client.send_json(task.dict())
            dispatched += 1
        except Exception:
            dead_clients.append(client)
            
    for dc in dead_clients:
        if dc in connected_coworking_clients:
            connected_coworking_clients.remove(dc)
            
    return {"status": "dispatched", "clients": dispatched}

if __name__ == "__main__":
    import uvicorn

    # Default to 0.0.0.0 so the bridge is reachable over Tailscale / VPS HOLO.
    # Set SOCA_OPENBROWSER_BRIDGE_HOST=127.0.0.1 to restrict to localhost only.
    default_host = "0.0.0.0"
    host = os.environ.get("SOCA_OPENBROWSER_BRIDGE_HOST", default_host).strip() or default_host
    port = int(os.environ.get("SOCA_OPENBROWSER_BRIDGE_PORT", "9834"))
    uvicorn.run(app, host=host, port=port, log_level="info")
