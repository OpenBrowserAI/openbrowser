import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Input,
  Tag,
  Spin,
  Typography,
  Space,
  Badge,
  Tooltip,
  Collapse,
} from "antd";
import {
  ThunderboltOutlined,
  ApiOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { Capability, WorkflowPlan, WorkflowResult } from "../services/opensurfer";
import * as opensurfer from "../services/opensurfer";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const EFFECT_COLOR: Record<string, string> = {
  read: "blue",
  write: "orange",
  destructive: "red",
};

function SystemCard({
  name,
  count,
  selected,
  onClick,
}: {
  name: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  const host = name.replace(/^https?:\/\//, "");
  const label = host.split(".")[0];
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-left w-full transition-colors",
        selected
          ? "border-blue-400 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
      ].join(" ")}
    >
      <span
        className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0"
        style={{ background: selected ? "#dbeafe" : "#f3f4f6", color: selected ? "#1d4ed8" : "#6b7280" }}
      >
        {label[0]?.toUpperCase() ?? "?"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium truncate" style={{ color: "var(--chrome-text-primary)" }}>
          {host}
        </span>
      </span>
      <Badge count={count} color={selected ? "#3b82f6" : "#9ca3af"} />
    </button>
  );
}

function CapabilityRow({ cap }: { cap: Capability }) {
  const inputs = Object.values(cap.inputs ?? {}).map((i) => i.as);
  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <Text className="text-xs font-mono font-medium" style={{ color: "var(--chrome-text-primary)" }}>
          {cap.capability}
        </Text>
        <Tag color={EFFECT_COLOR[cap.effect] ?? "default"} className="text-xs">
          {cap.effect}
        </Tag>
        <span className="ml-auto text-xs" style={{ color: "var(--chrome-text-primary)", opacity: 0.4 }}>
          {Math.round(cap.confidence * 100)}%
        </span>
      </div>
      {inputs.length > 0 && (
        <Text className="text-xs block mt-0.5" style={{ color: "var(--chrome-text-primary)", opacity: 0.5 }}>
          ({inputs.join(", ")})
        </Text>
      )}
    </div>
  );
}

function PlanView({
  plan,
  running,
  result,
  onRun,
}: {
  plan: WorkflowPlan;
  running: boolean;
  result: WorkflowResult | null;
  onRun: () => void;
}) {
  const stepResult = (id: string) => result?.steps.find((s) => s.id === id);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <Text className="text-xs font-semibold" style={{ color: "var(--chrome-text-primary)" }}>
          Workflow plan
        </Text>
        <Button
          type="primary"
          size="small"
          icon={<PlayCircleOutlined />}
          loading={running}
          onClick={onRun}
          className="text-xs"
        >
          Run
        </Button>
      </div>

      {plan.trigger && (
        <div className="px-3 py-2 border-b border-gray-100 bg-blue-50">
          <Text className="text-xs" style={{ color: "#1d4ed8" }}>
            <ThunderboltOutlined className="mr-1" />
            trigger: {plan.trigger.system} / {plan.trigger.capability}
          </Text>
        </div>
      )}

      {(plan.steps ?? []).map((step, i) => {
        const res = stepResult(step.id);
        return (
          <div key={step.id}>
            <div className="px-3 py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-start gap-2">
                <span
                  className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "#f3f4f6", color: "#6b7280" }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Text className="text-xs font-medium" style={{ color: "var(--chrome-text-primary)" }}>
                      {step.system}
                    </Text>
                    <span style={{ color: "var(--chrome-text-primary)", opacity: 0.3 }}>/</span>
                    <Text className="text-xs font-mono" style={{ color: "var(--chrome-text-primary)" }}>
                      {step.capability}
                    </Text>
                    {step.forEach && (
                      <Tag color="purple" className="text-xs">forEach</Tag>
                    )}
                  </div>
                  {step.description && (
                    <Text className="text-xs block mt-0.5" style={{ color: "var(--chrome-text-primary)", opacity: 0.5 }}>
                      {step.description}
                    </Text>
                  )}
                  {res && (
                    <div className="mt-1">
                      {res.skipped ? (
                        <Text className="text-xs" style={{ color: "#f59e0b" }}>
                          <ExclamationCircleOutlined className="mr-1" />
                          skipped: {res.reason}
                        </Text>
                      ) : (
                        <Text className="text-xs" style={{ color: "#16a34a" }}>
                          <CheckCircleOutlined className="mr-1" />
                          {res.forEach ? `ran ${res.count} times` : "done"}
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {i < plan.steps.length - 1 && (
              <div className="flex justify-center py-0.5" style={{ color: "var(--chrome-text-primary)", opacity: 0.2 }}>
                ↓
              </div>
            )}
          </div>
        );
      })}

      {plan.missing && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
          <Text className="text-xs" style={{ color: "#b45309" }}>
            Note: {plan.missing}
          </Text>
        </div>
      )}
    </div>
  );
}

export function CapabilitiesTab() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [systems, setSystems] = useState<Record<string, number>>({});
  const [caps, setCaps] = useState<Capability[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [goal, setGoal] = useState("");
  const [composing, setComposing] = useState(false);
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setConnected(null);
    const ok = await opensurfer.ping();
    setConnected(ok);
    if (!ok) return;
    const [s, c] = await Promise.all([opensurfer.getSystems(), opensurfer.getCapabilities()]);
    setSystems(s);
    setCaps(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCompose = useCallback(async () => {
    if (!goal.trim()) return;
    setComposing(true);
    setComposeError(null);
    setPlan(null);
    setResult(null);
    try {
      const p = await opensurfer.compose(goal);
      if (p.error) { setComposeError(p.error); } else { setPlan(p); }
    } catch (e: any) {
      setComposeError(e.message ?? "compose failed");
    } finally {
      setComposing(false);
    }
  }, [goal]);

  const handleRun = useCallback(async () => {
    if (!plan) return;
    setRunning(true);
    try {
      const r = await opensurfer.runWorkflow(plan, true);
      setResult(r);
    } catch (e: any) {
      setComposeError(e.message ?? "run failed");
    } finally {
      setRunning(false);
    }
  }, [plan]);

  const visibleCaps = caps.filter((c) => {
    if (selectedSystem && c.source !== selectedSystem) return false;
    if (search && !c.capability.includes(search.toLowerCase())) return false;
    return true;
  });

  // ── Not connected ──────────────────────────────────────────────────────────
  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <ApiOutlined style={{ fontSize: 40, color: "var(--chrome-text-primary)", opacity: 0.2 }} />
        <div className="text-center">
          <Text className="text-sm font-medium block" style={{ color: "var(--chrome-text-primary)" }}>
            OpenSurfer server not running
          </Text>
          <Text className="text-xs block mt-1" style={{ color: "var(--chrome-text-primary)", opacity: 0.5 }}>
            Start it to see discovered capabilities
          </Text>
        </div>
        <div className="w-full rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs" style={{ color: "var(--chrome-text-primary)" }}>
          node server.mjs
        </div>
        <Button icon={<ReloadOutlined />} size="small" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="default" />
      </div>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  const systemCount = Object.keys(systems).length;
  const totalCaps = Object.values(systems).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compose bar */}
      <div className="px-3 pt-3 pb-2 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          <TextArea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What do you want to automate?"
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) { e.preventDefault(); handleCompose(); }
            }}
            className="text-sm rounded-lg"
            style={{
              background: "var(--chrome-input-background)",
              borderColor: "var(--chrome-input-border)",
              color: "var(--chrome-text-primary)",
              resize: "none",
            }}
          />
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={composing}
            onClick={handleCompose}
            disabled={!goal.trim()}
            className="shrink-0 self-end"
          />
        </div>
        {composeError && (
          <Text className="text-xs block mt-1" style={{ color: "#ef4444" }}>
            {composeError}
          </Text>
        )}
        {plan && (
          <PlanView plan={plan} running={running} result={result} onRun={handleRun} />
        )}
      </div>

      {/* Systems strip */}
      <div className="px-3 py-2 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <Text className="text-xs font-semibold" style={{ color: "var(--chrome-text-primary)" }}>
            Connected apps
          </Text>
          <Text className="text-xs" style={{ color: "var(--chrome-text-primary)", opacity: 0.4 }}>
            {systemCount} apps · {totalCaps} capabilities
          </Text>
          <Tooltip title="Refresh">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={load} className="ml-auto" />
          </Tooltip>
        </div>
        {systemCount === 0 ? (
          <Text className="text-xs" style={{ color: "var(--chrome-text-primary)", opacity: 0.4 }}>
            Use apps with the OpenSurfer extension active to discover capabilities.
          </Text>
        ) : (
          <div className="flex flex-col gap-1.5">
            {Object.entries(systems).map(([sys, count]) => (
              <SystemCard
                key={sys}
                name={sys}
                count={count}
                selected={selectedSystem === sys}
                onClick={() => setSelectedSystem(selectedSystem === sys ? null : sys)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Capability list */}
      {totalCaps > 0 && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 py-2 bg-white border-b border-gray-100">
            <Input
              prefix={<SearchOutlined style={{ color: "var(--chrome-text-primary)", opacity: 0.3 }} />}
              placeholder="Search capabilities…"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{
                background: "var(--chrome-input-background)",
                borderColor: "var(--chrome-input-border)",
                color: "var(--chrome-text-primary)",
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {visibleCaps.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Text className="text-xs" style={{ color: "var(--chrome-text-primary)", opacity: 0.3 }}>
                  No capabilities match
                </Text>
              </div>
            ) : (
              visibleCaps.map((c) => <CapabilityRow key={`${c.source}/${c.capability}`} cap={c} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
