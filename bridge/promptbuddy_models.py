from __future__ import annotations

from enum import Enum
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

try:
    from .version import PROMPTBUDDY_SCHEMA_VERSION
except ImportError:  # pragma: no cover - script execution fallback
    from version import PROMPTBUDDY_SCHEMA_VERSION  # type: ignore


class Lane(str, Enum):
    OB_OFFLINE = "OB_OFFLINE"
    OB_ONLINE_PULSE = "OB_ONLINE_PULSE"


class Mode(str, Enum):
    clarify = "clarify"
    structure = "structure"
    compress = "compress"
    persona = "persona"
    safe_exec = "safe_exec"


class PromptContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tab_url: Optional[str] = None
    tab_title: Optional[str] = None
    intent: Optional[str] = None
    target_base_url: Optional[str] = None


class Constraints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_chars: Optional[int] = Field(default=None, ge=1, le=200_000)
    keep_language: bool = True
    preserve_code_blocks: bool = True
    allow_online_enrichment: bool = False


class Trace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["openbrowser", "mcp", "cli"] = "openbrowser"
    client_version: Optional[str] = None


class PromptEnhanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_version: Literal["v1"] = "v1"
    schema_version: str = PROMPTBUDDY_SCHEMA_VERSION

    lane: Lane
    prompt: str = Field(min_length=1)
    mode: Mode
    profile_id: Optional[str] = None

    context: PromptContext = Field(default_factory=PromptContext)
    constraints: Constraints = Field(default_factory=Constraints)
    trace: Trace = Field(default_factory=Trace)


class MutationInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["reorder", "clarify", "add_constraints", "compress", "persona", "safety", "profile"]
    note: str


class RedactionInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["secret_like", "credential", "token"]
    note: str


class ErrorItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class Provenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated_utc: str
    bridge_version: str
    retrieval_mode: str
    run_id: str


class PolicyInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lane_allowed: bool
    network_used: bool
    model: str


class DiffInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["spans", "unified"] = "unified"
    data: Any


class Stats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chars_before: int
    chars_after: int
    est_tokens_before: Optional[int] = None
    est_tokens_after: Optional[int] = None


class PromptEnhanceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_version: Literal["v1"] = "v1"
    schema_version: str = PROMPTBUDDY_SCHEMA_VERSION

    ok: bool
    enhancement_id: str
    original_prompt: str
    enhanced_prompt: str

    rationale: List[str] = Field(default_factory=list)
    mutations: List[MutationInfo] = Field(default_factory=list)
    redactions: List[RedactionInfo] = Field(default_factory=list)
    safety_flags: List[str] = Field(default_factory=list)

    mode: str
    lane: str
    profile_id: Optional[str] = None

    policy: PolicyInfo
    diff: Optional[DiffInfo] = None
    stats: Stats
    provenance: Provenance

    errors: Optional[List[ErrorItem]] = None
