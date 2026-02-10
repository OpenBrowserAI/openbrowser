from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Set


@dataclass(frozen=True)
class ImportViolation:
    file: str
    lineno: int
    module: str
    reason: str


FORBIDDEN_TOPLEVEL: Set[str] = {"requests", "httpx", "socket", "urllib3"}
FORBIDDEN_SUBMODULES: Set[str] = {"urllib.request", "urllib.response"}


def scan_forbidden_imports(paths: Iterable[Path]) -> List[ImportViolation]:
    violations: List[ImportViolation] = []
    for path in paths:
        if not path.exists():
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module = alias.name
                    top = module.split(".")[0]
                    if module in FORBIDDEN_SUBMODULES:
                        violations.append(
                            ImportViolation(
                                file=str(path),
                                lineno=getattr(node, "lineno", 0),
                                module=module,
                                reason="forbidden urllib network submodule",
                            )
                        )
                    elif top in FORBIDDEN_TOPLEVEL:
                        violations.append(
                            ImportViolation(
                                file=str(path),
                                lineno=getattr(node, "lineno", 0),
                                module=module,
                                reason="forbidden network module",
                            )
                        )
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                top = module.split(".")[0] if module else ""
                if module in FORBIDDEN_SUBMODULES:
                    violations.append(
                        ImportViolation(
                            file=str(path),
                            lineno=getattr(node, "lineno", 0),
                            module=module,
                            reason="forbidden urllib network submodule",
                        )
                    )
                elif top in FORBIDDEN_TOPLEVEL:
                    violations.append(
                        ImportViolation(
                            file=str(path),
                            lineno=getattr(node, "lineno", 0),
                            module=module,
                            reason="forbidden network module",
                        )
                    )
    return violations


def check_promptbuddy_offline_static_gate() -> List[ImportViolation]:
    targets = [
        Path("core/tools/openbrowser/bridge/promptbuddy_models.py"),
        Path("core/tools/openbrowser/bridge/promptbuddy_service.py"),
        Path("core/tools/openbrowser/bridge/promptbuddy_evidence.py"),
    ]
    return scan_forbidden_imports(targets)
