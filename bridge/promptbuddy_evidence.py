from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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


def _runs_root() -> Path:
    override = os.environ.get("SOCA_RUNS_ROOT", "").strip()
    if override:
        return Path(override).expanduser().resolve()

    repo_root = _find_repo_root(Path(__file__).resolve())
    if repo_root:
        return (repo_root / "runs").resolve()
    return (Path.cwd() / "runs").resolve()


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def write_evidence_bundle(
    *,
    enhancement_id: str,
    req: Dict[str, Any],
    resp: Dict[str, Any],
    meta: Optional[Dict[str, Any]] = None,
    env_context: Optional[Dict[str, Any]] = None,
) -> Path:
    utc_now = dt.datetime.now(dt.timezone.utc)
    out_dir = _runs_root() / utc_now.strftime("%Y/%m/%d") / "promptbuddy" / enhancement_id
    out_dir.mkdir(parents=True, exist_ok=True)

    _write_json(out_dir / "request.json", req)
    _write_json(out_dir / "response.json", resp)
    _write_json(out_dir / "meta.json", meta or {})
    _write_json(
        out_dir / "env_context.json",
        env_context
        or {
            "approval_policy": os.environ.get("SOCA_APPROVAL_POLICY", "UNKNOWN"),
            "sandbox_mode": os.environ.get("SOCA_SANDBOX_MODE", "UNKNOWN"),
            "network_access": os.environ.get("SOCA_NETWORK_ACCESS", "UNKNOWN"),
        },
    )

    files = sorted([p for p in out_dir.glob("*") if p.is_file() and p.name != "sha256.txt"])
    manifest = "\n".join(f"{_sha256_file(p)}  {p.name}" for p in files) + "\n"
    (out_dir / "sha256.txt").write_text(manifest, encoding="utf-8")
    return out_dir
