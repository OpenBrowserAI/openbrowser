from __future__ import annotations

import datetime as dt
import json
import os
import traceback
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Header, HTTPException

try:
    from .promptbuddy_evidence import write_evidence_bundle
    from .promptbuddy_models import (
        ErrorItem,
        Mode,
        MutationInfo,
        PolicyInfo,
        PromptEnhanceRequest,
        PromptEnhanceResponse,
        Provenance,
        RedactionInfo,
        Stats,
    )
    from .promptbuddy_service import enhance_prompt_local, estimate_stats
    from .promptbuddy_static_gate import check_promptbuddy_offline_static_gate
    from .version import BRIDGE_VERSION, PROMPTBUDDY_SCHEMA_VERSION
except ImportError:  # pragma: no cover - script execution fallback
    from promptbuddy_evidence import write_evidence_bundle  # type: ignore
    from promptbuddy_models import (  # type: ignore
        ErrorItem,
        Mode,
        MutationInfo,
        PolicyInfo,
        PromptEnhanceRequest,
        PromptEnhanceResponse,
        Provenance,
        RedactionInfo,
        Stats,
    )
    from promptbuddy_service import enhance_prompt_local, estimate_stats  # type: ignore
    from promptbuddy_static_gate import check_promptbuddy_offline_static_gate  # type: ignore
    from version import BRIDGE_VERSION, PROMPTBUDDY_SCHEMA_VERSION  # type: ignore


router = APIRouter()
_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


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


def _repo_root() -> Path:
    root = _find_repo_root(Path(__file__).resolve())
    return root if root else Path.cwd()


def _profiles_root() -> Path:
    override = os.environ.get("SOCA_PROMPTBUDDY_PROFILES_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (_repo_root() / "core" / "promptbuddy" / "profiles").resolve()


def _hostname_from_url(raw_url: Optional[str]) -> Optional[str]:
    if not raw_url:
        return None
    try:
        parsed = urlparse(raw_url)
    except Exception:
        return None
    return (parsed.hostname or "").strip().lower() or None


def _is_local_hostname(hostname: Optional[str]) -> bool:
    if not hostname:
        return False
    if hostname in _LOCAL_HOSTS:
        return True
    parts = hostname.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        nums = [int(p) for p in parts]
        if nums[0] == 10:
            return True
        if nums[0] == 127:
            return True
        if nums[0] == 192 and nums[1] == 168:
            return True
        if nums[0] == 172 and 16 <= nums[1] <= 31:
            return True
        if nums[0] == 100 and 64 <= nums[1] <= 127:
            return True
    return False


def _require_token(authorization: Optional[str]) -> None:
    expected = os.environ.get("SOCA_OPENBROWSER_BRIDGE_TOKEN", "soca").strip()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="invalid bearer token")


def _load_profiles() -> List[Dict[str, Any]]:
    root = _profiles_root()
    if not root.exists():
        return []
    profiles: List[Dict[str, Any]] = []
    for file in sorted(root.glob("*.json")):
        try:
            payload = json.loads(file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict):
            payload.setdefault("id", file.stem)
            profiles.append(payload)
    return profiles


def _profiles_by_id() -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for profile in _load_profiles():
        profile_id = str(profile.get("id", "")).strip()
        if profile_id:
            result[profile_id] = profile
    return result


def _offline_constraints_guard(req: PromptEnhanceRequest) -> None:
    if req.lane.value != "OB_OFFLINE":
        return
    if req.constraints.allow_online_enrichment:
        raise HTTPException(status_code=403, detail="ob_offline_rejects_online_enrichment")
    target_host = _hostname_from_url(req.context.target_base_url)
    if target_host and not _is_local_hostname(target_host):
        raise HTTPException(status_code=403, detail=f"ob_offline_rejects_non_local_target:{target_host}")


@router.get("/soca/promptbuddy/health")
async def promptbuddy_health() -> Dict[str, Any]:
    return {
        "ok": True,
        "bridge_version": BRIDGE_VERSION,
        "schema_version": PROMPTBUDDY_SCHEMA_VERSION,
        "profiles_dir": str(_profiles_root()),
        "local_only": True,
    }


@router.get("/soca/promptbuddy/capabilities")
async def promptbuddy_capabilities() -> Dict[str, Any]:
    return {
        "ok": True,
        "modes": [mode.value for mode in Mode],
        "constraints": ["max_chars", "keep_language", "preserve_code_blocks", "allow_online_enrichment"],
        "lanes": ["OB_OFFLINE", "OB_ONLINE_PULSE"],
        "schema_version": PROMPTBUDDY_SCHEMA_VERSION,
    }


@router.get("/soca/promptbuddy/profiles")
async def promptbuddy_profiles(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> Dict[str, Any]:
    _require_token(authorization)
    return {"ok": True, "profiles": _load_profiles()}


@router.get("/soca/promptbuddy/selftest")
async def promptbuddy_selftest(authorization: Optional[str] = Header(default=None, alias="Authorization")) -> Dict[str, Any]:
    _require_token(authorization)

    payload: Dict[str, Any] = {
        "ok": True,
        "bridge_version": BRIDGE_VERSION,
        "static_gate": {"ok": True, "violations": []},
        "offline_dry_run": {"ok": True},
    }

    violations = check_promptbuddy_offline_static_gate()
    if violations:
        payload["ok"] = False
        payload["static_gate"]["ok"] = False
        payload["static_gate"]["violations"] = [
            {"file": v.file, "lineno": v.lineno, "module": v.module, "reason": v.reason}
            for v in violations
        ]

    try:
        req = PromptEnhanceRequest(
            lane="OB_OFFLINE",
            prompt="Selftest prompt for deterministic prompt enhancement.",
            mode="structure",
            trace={"source": "cli"},
        )
        enhanced, rationale, _mutations, redactions, flags, model_name, _diff = await enhance_prompt_local(req)
        payload["offline_dry_run"] = {
            "ok": True,
            "model": model_name,
            "chars_after": len(enhanced),
            "rationale": rationale[:3],
            "redactions": [r.model_dump() for r in redactions],
            "safety_flags": flags,
        }
    except Exception:
        payload["ok"] = False
        payload["offline_dry_run"] = {
            "ok": False,
            "error": traceback.format_exc().splitlines()[-1],
        }

    return payload


@router.post(
    "/soca/promptbuddy/enhance",
    response_model=PromptEnhanceResponse,
    response_model_exclude_none=True,
)
async def promptbuddy_enhance(
    req: PromptEnhanceRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> PromptEnhanceResponse:
    _require_token(authorization)
    _offline_constraints_guard(req)

    profile_map = _profiles_by_id()
    profile: Optional[Dict[str, Any]] = None
    if req.profile_id:
        profile = profile_map.get(req.profile_id)
        if profile is None:
            raise HTTPException(status_code=400, detail=f"unknown_profile_id:{req.profile_id}")

    enhancement_id = str(uuid.uuid4())
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    network_used = False

    try:
        (
            enhanced_prompt,
            rationale,
            mutations,
            redactions,
            safety_flags,
            model_name,
            diff,
        ) = await enhance_prompt_local(req, profile=profile)
        errors: Optional[List[ErrorItem]] = None
        ok = True
    except Exception as exc:
        enhanced_prompt = req.prompt
        rationale = []
        mutations = [MutationInfo(type="safety", note="enhancement_failed_fallback")]
        redactions = []
        safety_flags = ["enhance_failed"]
        model_name = "local:unavailable"
        diff = None
        errors = [ErrorItem(code="ENHANCE_FAILED", message=str(exc))]
        ok = False

    stat_values = estimate_stats(req.prompt, enhanced_prompt)
    response = PromptEnhanceResponse(
        ok=ok,
        enhancement_id=enhancement_id,
        original_prompt=req.prompt,
        enhanced_prompt=enhanced_prompt,
        rationale=rationale,
        mutations=mutations,
        redactions=redactions,
        safety_flags=safety_flags,
        mode=req.mode.value,
        lane=req.lane.value,
        profile_id=req.profile_id,
        policy=PolicyInfo(lane_allowed=True, network_used=network_used, model=model_name),
        diff=diff,
        stats=Stats(**stat_values),
        provenance=Provenance(
            generated_utc=now,
            bridge_version=BRIDGE_VERSION,
            retrieval_mode="local_only",
            run_id=enhancement_id,
        ),
        errors=errors,
    )

    write_evidence_bundle(
        enhancement_id=enhancement_id,
        req=req.model_dump(),
        resp=response.model_dump(exclude_none=False),
        meta={
            "bridge_version": BRIDGE_VERSION,
            "schema_version": PROMPTBUDDY_SCHEMA_VERSION,
            "lane": req.lane.value,
            "mode": req.mode.value,
            "model": model_name,
            "network_used": network_used,
            "ok": ok,
        },
    )
    return response
