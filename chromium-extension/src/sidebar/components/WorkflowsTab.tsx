import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Input,
  Switch,
  Typography,
  Tooltip,
  Spin,
  Popconfirm
} from "antd";
import {
  ThunderboltOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  ApiOutlined
} from "@ant-design/icons";
import type { Trigger } from "../services/opensurfer";
import * as opensurfer from "../services/opensurfer";

const { Text } = Typography;
const { TextArea } = Input;

function TriggerCard({
  trigger,
  onToggle,
  onDelete
}: {
  trigger: Trigger;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = trigger.trigger;
  const subtitle =
    t.type === "poll"
      ? `polls ${t.system}/${t.capability} every ${t.interval ?? 30}s`
      : `webhook → ${
          trigger.composeGoal ?? trigger.workflowPlan?.goal ?? "workflow"
        }`;

  return (
    <div className="px-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        <ThunderboltOutlined
          style={{
            fontSize: 14,
            marginTop: 2,
            color: trigger.enabled ? "#3b82f6" : "#9ca3af"
          }}
        />
        <div className="flex-1 min-w-0">
          <Text
            className="text-xs font-medium block truncate"
            style={{ color: "var(--chrome-text-primary)" }}
          >
            {trigger.name}
          </Text>
          <Text
            className="text-xs block mt-0.5 truncate"
            style={{ color: "var(--chrome-text-primary)", opacity: 0.5 }}
          >
            {subtitle}
          </Text>
          {trigger.lastFired && (
            <Text
              className="text-xs block mt-0.5"
              style={{ color: "var(--chrome-text-primary)", opacity: 0.35 }}
            >
              <ClockCircleOutlined className="mr-1" />
              last fired {new Date(trigger.lastFired).toLocaleString()}
            </Text>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch size="small" checked={trigger.enabled} onChange={onToggle} />
          <Popconfirm
            title="Delete this workflow?"
            onConfirm={onDelete}
            okText="Delete"
            cancelText="Cancel"
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

export function WorkflowsTab() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [newGoal, setNewGoal] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setConnected(null);
    try {
      const ok = await opensurfer.ping();
      setConnected(ok);
      if (!ok) return;
      setTriggers(await opensurfer.getTriggers());
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        setTriggers(await opensurfer.getTriggers());
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      await opensurfer.updateTrigger(id, { enabled });
      setTriggers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, enabled } : t))
      );
    } catch {}
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await opensurfer.deleteTrigger(id);
      setTriggers((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newGoal.trim()) return;
    setCreating(true);
    try {
      const plan = await opensurfer.compose(newGoal);
      if (plan.error) return;

      const trigger: Trigger["trigger"] = plan.trigger
        ? {
            type: "poll",
            system: plan.trigger.system,
            capability: plan.trigger.capability,
            interval: 60
          }
        : { type: "webhook" };

      const t = await opensurfer.createTrigger({
        name: newGoal.slice(0, 80),
        trigger,
        composeGoal: newGoal
      });
      setTriggers((prev) => [...prev, t]);
      setNewGoal("");
    } catch {}
    setCreating(false);
  }, [newGoal]);

  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <ApiOutlined
          style={{
            fontSize: 40,
            color: "var(--chrome-text-primary)",
            opacity: 0.2
          }}
        />
        <Text
          className="text-sm font-medium block"
          style={{ color: "var(--chrome-text-primary)" }}
        >
          OpenSurfer server not running
        </Text>
        <Button icon={<ReloadOutlined />} size="small" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (connected === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="default" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Create bar */}
      <div className="px-3 pt-3 pb-2 bg-white border-b border-gray-100">
        <div className="flex gap-2">
          <TextArea
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="Describe a recurring automation…"
            autoSize={{ minRows: 1, maxRows: 3 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleCreate();
              }
            }}
            className="text-sm rounded-lg"
            style={{
              background: "var(--chrome-input-background)",
              borderColor: "var(--chrome-input-border)",
              color: "var(--chrome-text-primary)",
              resize: "none"
            }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={creating}
            onClick={handleCreate}
            disabled={!newGoal.trim()}
            className="shrink-0 self-end"
          />
        </div>
      </div>

      {/* Trigger list */}
      <div className="flex-1 overflow-y-auto bg-white">
        {triggers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <ThunderboltOutlined
              style={{
                fontSize: 32,
                color: "var(--chrome-text-primary)",
                opacity: 0.15
              }}
            />
            <Text
              className="text-xs"
              style={{ color: "var(--chrome-text-primary)", opacity: 0.4 }}
            >
              No workflows yet
            </Text>
          </div>
        ) : (
          triggers.map((t) => (
            <TriggerCard
              key={t.id}
              trigger={t}
              onToggle={(enabled) => handleToggle(t.id, enabled)}
              onDelete={() => handleDelete(t.id)}
            />
          ))
        )}
      </div>

      {/* Footer count */}
      {triggers.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <Text
            className="text-xs"
            style={{ color: "var(--chrome-text-primary)", opacity: 0.4 }}
          >
            {triggers.filter((t) => t.enabled).length} active ·{" "}
            {triggers.length} total
          </Text>
          <Tooltip title="Refresh">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={load}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
}
