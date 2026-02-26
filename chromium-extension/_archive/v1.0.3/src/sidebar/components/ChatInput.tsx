import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SendOutlined,
  StopOutlined,
  FileOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  PlusOutlined,
  HistoryOutlined,
  SettingOutlined,
  ApiOutlined,
  BookOutlined,
  StarFilled,
  StarOutlined
} from "@ant-design/icons";
import { uuidv4 } from "@openbrowser-ai/core";
import type { UploadedFile } from "../types";
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Input,
  Popover,
  Space,
  Image,
  Typography,
  Modal,
  Select,
  message,
  List,
  Tooltip
} from "antd";
import { WebpageMentionInput } from "./WebpageMentionInput";

const { Text } = Typography;

type SocaToolsConfig = {
  mcp: {
    webfetch: boolean;
    context7: boolean;
    github: boolean;
    nanobanapro: boolean;
    nt2l: boolean;
  };
  allowlistText: string;
};

const SOCA_TOOLS_CONFIG_STORAGE_KEY = "socaOpenBrowserToolsConfig";
const SOCA_PROMPTBUDDY_SETTINGS_KEY = "socaPromptBuddySettings";
const SOCA_PROMPTBUDDY_LIBRARY_KEY = "socaPromptBuddyLibraryV1";

type PromptBuddyMode =
  | "clarify"
  | "structure"
  | "compress"
  | "persona"
  | "safe_exec";
type PromptBuddyProfile = { id: string; name: string };
type PromptBuddySettings = {
  mode?: PromptBuddyMode;
  profileId?: string;
  recentEnhancementIds?: string[];
};
type PromptBuddyLibraryItem = {
  id: string;
  title: string;
  category?: string;
  prompt: string;
  favorite?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};
type PromptBuddyResponse = {
  enhancement_id?: string;
  enhanced_prompt: string;
  rationale?: string[];
  mutations?: Array<{ type: string; note: string }>;
  redactions?: Array<{ type: string; note: string }>;
  stats?: {
    chars_before?: number;
    chars_after?: number;
    est_tokens_before?: number;
    est_tokens_after?: number;
  };
  diff?: { type?: string; data?: string };
  policy?: { lane_allowed?: boolean; network_used?: boolean; model?: string };
};

const PROMPTBUDDY_MODES: PromptBuddyMode[] = [
  "clarify",
  "structure",
  "compress",
  "persona",
  "safe_exec"
];
const DEFAULT_SOCA_TOOLS_CONFIG: SocaToolsConfig = {
  mcp: {
    webfetch: false,
    context7: false,
    github: false,
    nanobanapro: false,
    nt2l: false
  },
  allowlistText: ""
};

const DEFAULT_PROMPTBUDDY_LIBRARY: PromptBuddyLibraryItem[] = [
  {
    id: "engineering_spec_v1",
    title: "Engineering Spec",
    category: "Engineering",
    prompt:
      "Write an engineering specification for the following change.\n\n" +
      "Include:\n" +
      "- Goal and non-goals\n" +
      "- Current behavior\n" +
      "- Proposed design\n" +
      "- Risks and mitigations\n" +
      "- Rollback plan\n" +
      "- Verification steps\n\n" +
      "Change:\n",
    favorite: true,
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "bug_triage_v1",
    title: "Bug Triage",
    category: "Engineering",
    prompt:
      "Triage this bug report.\n\n" +
      "Return:\n" +
      "1. Suspected root cause\n" +
      "2. Minimal reproduction steps\n" +
      "3. Proposed fix\n" +
      "4. Tests to add\n" +
      "5. Risk assessment\n\n" +
      "Bug:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "safe_exec_v1",
    title: "Safe Execution Plan",
    category: "Ops",
    prompt:
      "Create a safe execution plan for the task below.\n\n" +
      "Constraints:\n" +
      "- Prefer read-only / dry-run first\n" +
      "- Avoid destructive actions without explicit confirmation\n" +
      "- Include rollback\n\n" +
      "Task:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "aa_daily_triage_v1",
    title: "AA Daily Triage",
    category: "AA",
    prompt:
      "AA Daily Email Triage (paste emails below)\n\n" +
      "Return a table with columns: From | Subject | Priority (Urgent/Today/Week/Later/Archive) | Decision | Next Action | Owner | Due Date | Draft Reply.\n" +
      "Rules:\n" +
      "- If unclear, list questions in a final 'Open Questions' section.\n" +
      "- Keep draft replies concise and action-oriented.\n\n" +
      "Emails:\n",
    favorite: true,
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "aa_followup_queue_v1",
    title: "AA Follow-up Queue",
    category: "AA",
    prompt:
      "Build a follow-up queue from the emails below.\n\n" +
      "Output as a checklist with: Who | Topic | Next Action | Due Date | Status.\n" +
      "End with a short summary of top 3 follow-ups.\n\n" +
      "Emails:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "aa_decision_draft_v1",
    title: "AA Decision Draft",
    category: "AA",
    prompt:
      "Draft a decision summary from the content below.\n\n" +
      "Include:\n" +
      "- Decision statement\n" +
      "- Rationale\n" +
      "- Risks\n" +
      "- Next steps\n\n" +
      "Content:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "aa_second_brain_capture_v1",
    title: "AA Second Brain Capture",
    category: "AA",
    prompt:
      "Second Brain Capture (paste content below)\n\n" +
      "Extract:\n" +
      "- Key facts (bullets)\n" +
      "- Projects and status\n" +
      "- People and roles\n" +
      "- Decisions and rationale\n" +
      "- Follow-ups and deadlines\n" +
      "- Tags (5-10)\n\n" +
      "Content:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "soca_pulse_openai_daily_v1",
    title: "SOCA Pulse OpenAI Daily",
    category: "SOCA Pulse",
    prompt:
      "SOCA Pulse Daily (paste signals/notes below)\n\n" +
      "Return:\n" +
      "1. Top 5 signals\n" +
      "2. Risks (max 5)\n" +
      "3. Opportunities (max 5)\n" +
      "4. Recommended actions for today (max 5)\n\n" +
      "Signals:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "soca_pulse_delta_v1",
    title: "SOCA Pulse Delta",
    category: "SOCA Pulse",
    prompt:
      "SOCA Pulse Delta (paste yesterday summary and today's notes below)\n\n" +
      "Output:\n" +
      "- New signals\n" +
      "- Signals that weakened\n" +
      "- Signals that strengthened\n" +
      "- Action changes\n\n" +
      "Input:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "soca_pulse_action_plan_v1",
    title: "SOCA Pulse Action Plan",
    category: "SOCA Pulse",
    prompt:
      "SOCA Pulse Action Plan (paste signals below)\n\n" +
      "Return a top-5 action list with owner, due date, and expected impact.\n\n" +
      "Signals:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  },
  {
    id: "nt2l_plan_execute_v1",
    title: "NT2L Plan + Dry Run",
    category: "NT2L",
    prompt:
      "Generate an NT2L plan for the task below. Use nt2lPlan, then nt2lValidatePlan, then nt2lExecuteDryRun. Summarize approvals needed.\n\n" +
      "Task:\n",
    createdAtMs: 0,
    updatedAtMs: 0
  }
];

const QUICK_ACTIONS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: "aa_daily_triage",
    label: "AA Triage",
    prompt:
      "AA Daily Email Triage (paste emails below)\n\n" +
      "Return a table with columns: From | Subject | Priority (Urgent/Today/Week/Later/Archive) | Decision | Next Action | Owner | Due Date | Draft Reply.\n" +
      "Rules:\n" +
      "- If unclear, list questions in a final 'Open Questions' section.\n" +
      "- Keep draft replies concise and action-oriented.\n\n" +
      "Emails:\n"
  },
  {
    id: "aa_second_brain",
    label: "Second Brain",
    prompt:
      "Second Brain Capture (paste content below)\n\n" +
      "Extract:\n" +
      "- Key facts (bullets)\n" +
      "- Projects and status\n" +
      "- People and roles\n" +
      "- Decisions and rationale\n" +
      "- Follow-ups and deadlines\n" +
      "- Tags (5-10)\n\n" +
      "Content:\n"
  },
  {
    id: "soca_pulse_daily",
    label: "SOCA Pulse",
    prompt:
      "SOCA Pulse Daily (paste signals/notes below)\n\n" +
      "Return:\n" +
      "1. Top 5 signals\n" +
      "2. Risks (max 5)\n" +
      "3. Opportunities (max 5)\n" +
      "4. Recommended actions for today (max 5)\n\n" +
      "Signals:\n"
  },
  {
    id: "nt2l_plan",
    label: "NT2L Plan",
    prompt:
      "Generate an NT2L plan for the task below. Use nt2lPlan, then nt2lValidatePlan, then nt2lExecuteDryRun. Summarize approvals needed.\n\n" +
      "Task:\n"
  }
];

const SOCAKIT_STEPS = [
  "1) Preflight (policy + scope + sandbox)",
  "2) Clarify",
  "3) Condition",
  "4) Specify",
  "5) Expectations",
  "6) Plan",
  "7) Tasks",
  "8) Reflect",
  "9) Iterate",
  "10) Execute (HIL)",
  "11) Test",
  "12) Go / No-Go",
  "13) ZHV (evidence)",
  "14) ZHDEEV (drift/entropy)",
  "15) Delivery"
];

interface ChatInputProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: (overrideInputValue?: string) => void;
  onStop: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (fileId: string) => void;
  uploadedFiles: UploadedFile[];
  sending: boolean;
  currentMessageId: string | null;
  onNewSession: () => void;
  onShowSessionHistory: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onStop,
  onFileSelect,
  onRemoveFile,
  uploadedFiles,
  sending,
  currentMessageId,
  onNewSession,
  onShowSessionHistory
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEmpty = !inputValue.trim() && uploadedFiles.length === 0;

  const [toolsConfig, setToolsConfig] = useState<SocaToolsConfig>(
    DEFAULT_SOCA_TOOLS_CONFIG
  );
  const [toolsPopoverOpen, setToolsPopoverOpen] = useState(false);
  const [pbMode, setPbMode] = useState<PromptBuddyMode>("structure");
  const [pbProfileId, setPbProfileId] = useState<string | undefined>(undefined);
  const [pbProfiles, setPbProfiles] = useState<PromptBuddyProfile[]>([]);
  const [pbBusy, setPbBusy] = useState(false);
  const [pbPreviewOpen, setPbPreviewOpen] = useState(false);
  const [pbPreviewDraft, setPbPreviewDraft] = useState("");
  const [pbResult, setPbResult] = useState<PromptBuddyResponse | null>(null);

  const [pbLibraryOpen, setPbLibraryOpen] = useState(false);
  const [pbLibrarySearch, setPbLibrarySearch] = useState("");
  const [pbLibraryItems, setPbLibraryItems] = useState<
    PromptBuddyLibraryItem[]
  >([]);
  const [pbSavePromptOpen, setPbSavePromptOpen] = useState(false);
  const [pbSaveTitle, setPbSaveTitle] = useState("");
  const [pbSaveCategory, setPbSaveCategory] = useState("");

  const requestBackground = async (
    type: string,
    data: Record<string, unknown>,
    resultType: string,
    timeoutMs = 20_000
  ): Promise<any> =>
    new Promise((resolve, reject) => {
      const requestId = uuidv4();
      const timer = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error(`${type} timeout`));
      }, timeoutMs);

      const listener = (message: any) => {
        if (message.type === resultType && message.requestId === requestId) {
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          if (message?.data?.error) {
            reject(new Error(String(message.data.error)));
          } else {
            resolve(message?.data);
          }
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      chrome.runtime.sendMessage({
        requestId,
        type,
        data
      });
    });

  const persistPromptBuddySettings = async (
    updater: (current: PromptBuddySettings) => PromptBuddySettings
  ) => {
    try {
      if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
      const current = (
        await chrome.storage.local.get([SOCA_PROMPTBUDDY_SETTINGS_KEY])
      )[SOCA_PROMPTBUDDY_SETTINGS_KEY] as PromptBuddySettings | undefined;
      const next = updater(current || {});
      await chrome.storage.local.set({ [SOCA_PROMPTBUDDY_SETTINGS_KEY]: next });
    } catch (error) {
      console.warn("Failed to persist PromptBuddy settings:", error);
    }
  };

  const persistPromptBuddyLibrary = async (items: PromptBuddyLibraryItem[]) => {
    try {
      if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
      await chrome.storage.local.set({ [SOCA_PROMPTBUDDY_LIBRARY_KEY]: items });
    } catch (error) {
      console.warn("Failed to persist PromptBuddy library:", error);
    }
  };

  const normalizeLibraryItems = (raw: any): PromptBuddyLibraryItem[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => {
        const id = String(item?.id || "").trim();
        const title = String(item?.title || "").trim();
        const prompt = String(item?.prompt || "").trim();
        if (!id || !title || !prompt) return null;

        const category = String(item?.category || "").trim() || undefined;
        const favorite = Boolean(item?.favorite);
        const createdAtMs = Number.isFinite(Number(item?.createdAtMs))
          ? Number(item.createdAtMs)
          : Date.now();
        const updatedAtMs = Number.isFinite(Number(item?.updatedAtMs))
          ? Number(item.updatedAtMs)
          : createdAtMs;

        return {
          id,
          title,
          category,
          prompt,
          favorite,
          createdAtMs,
          updatedAtMs
        } as PromptBuddyLibraryItem;
      })
      .filter(Boolean) as PromptBuddyLibraryItem[];
  };

  const ensureDefaultLibrary = async (): Promise<PromptBuddyLibraryItem[]> => {
    try {
      if (typeof chrome === "undefined" || !chrome?.storage?.local) {
        const now = Date.now();
        return DEFAULT_PROMPTBUDDY_LIBRARY.map((item) => ({
          ...item,
          createdAtMs: item.createdAtMs || now,
          updatedAtMs: item.updatedAtMs || now
        }));
      }

      const result = await chrome.storage.local.get([
        SOCA_PROMPTBUDDY_LIBRARY_KEY
      ]);
      const stored = result[SOCA_PROMPTBUDDY_LIBRARY_KEY];
      const normalized = normalizeLibraryItems(stored);
      if (normalized.length > 0) return normalized;

      const now = Date.now();
      const seeded = DEFAULT_PROMPTBUDDY_LIBRARY.map((item) => ({
        ...item,
        createdAtMs: item.createdAtMs || now,
        updatedAtMs: item.updatedAtMs || now
      }));
      await chrome.storage.local.set({
        [SOCA_PROMPTBUDDY_LIBRARY_KEY]: seeded
      });
      return seeded;
    } catch (error) {
      console.warn("Failed to load PromptBuddy library:", error);
      return DEFAULT_PROMPTBUDDY_LIBRARY;
    }
  };

  const openSaveCurrentPrompt = () => {
    const prompt = inputValue.trim();
    if (!prompt || sending || currentMessageId !== null) return;
    const firstLine =
      prompt
        .split("\n")
        .map((s) => s.trim())
        .find(Boolean) || "Saved prompt";
    setPbSaveTitle(firstLine.slice(0, 80));
    setPbSaveCategory("");
    setPbSavePromptOpen(true);
  };

  const saveCurrentPromptToLibrary = async () => {
    const prompt = inputValue.trim();
    if (!prompt) {
      message.error("Nothing to save (prompt is empty).");
      return;
    }

    const title = pbSaveTitle.trim();
    if (!title) {
      message.error("Title is required.");
      return;
    }

    // Keep storage lean: cap size + count.
    const MAX_ITEMS = 200;
    const MAX_PROMPT_CHARS = 20_000;
    const safePrompt =
      prompt.length > MAX_PROMPT_CHARS
        ? `${prompt.slice(0, MAX_PROMPT_CHARS - 3)}...`
        : prompt;

    const now = Date.now();
    const nextItem: PromptBuddyLibraryItem = {
      id: uuidv4(),
      title,
      category: pbSaveCategory.trim() || undefined,
      prompt: safePrompt,
      favorite: false,
      createdAtMs: now,
      updatedAtMs: now
    };

    const next = [nextItem, ...pbLibraryItems].slice(0, MAX_ITEMS);
    setPbLibraryItems(next);
    await persistPromptBuddyLibrary(next);
    setPbSavePromptOpen(false);
    message.success("Saved to Prompt Library");
  };

  const deleteLibraryItem = async (id: string) => {
    const next = pbLibraryItems.filter((item) => item.id !== id);
    setPbLibraryItems(next);
    await persistPromptBuddyLibrary(next);
  };

  const toggleFavorite = async (id: string) => {
    const now = Date.now();
    const next = pbLibraryItems.map((item) =>
      item.id === id
        ? { ...item, favorite: !item.favorite, updatedAtMs: now }
        : item
    );
    setPbLibraryItems(next);
    await persistPromptBuddyLibrary(next);
  };

  const applyLibraryItem = (
    item: PromptBuddyLibraryItem,
    sendAfter: boolean
  ) => {
    onInputChange(item.prompt);
    setPbLibraryOpen(false);
    if (sendAfter) {
      onSend(item.prompt);
    }
  };

  const exportLibraryJson = async () => {
    try {
      if (typeof chrome === "undefined" || !chrome?.downloads?.download) {
        message.error("Export is not available in this environment.");
        return;
      }
      const payload = {
        version: 1,
        exportedAtUtc: new Date().toISOString(),
        items: pbLibraryItems
      };
      const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download(
        {
          url,
          filename: `soca-promptbuddy-library-${new Date()
            .toISOString()
            .slice(0, 10)}.json`,
          saveAs: true
        },
        () => {
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
      );
      message.success("Export started");
    } catch (error) {
      message.error(`Export failed: ${String(error)}`);
    }
  };

  const handlePromptBuddyEnhance = async () => {
    const prompt = inputValue.trim();
    if (!prompt || sending || currentMessageId !== null) return;

    setPbBusy(true);
    try {
      const data = (await requestBackground(
        "promptbuddy_enhance",
        {
          prompt,
          mode: pbMode,
          profile_id: pbProfileId
        },
        "promptbuddy_enhance_result"
      )) as PromptBuddyResponse;

      if (!data?.enhanced_prompt) {
        throw new Error("enhanced_prompt missing in response");
      }

      setPbResult(data);
      setPbPreviewDraft(data.enhanced_prompt);
      setPbPreviewOpen(true);
      await persistPromptBuddySettings((current) => {
        const recent = [
          data.enhancement_id,
          ...(current.recentEnhancementIds || [])
        ]
          .filter(Boolean)
          .slice(0, 20) as string[];
        return {
          ...current,
          mode: pbMode,
          profileId: pbProfileId,
          recentEnhancementIds: recent
        };
      });
    } catch (error) {
      message.error(`Prompt Buddy failed: ${String(error)}`);
    } finally {
      setPbBusy(false);
    }
  };

  const applyPromptBuddy = (sendAfter: boolean) => {
    onInputChange(pbPreviewDraft);
    setPbPreviewOpen(false);
    if (sendAfter) {
      onSend(pbPreviewDraft);
    }
  };

  useEffect(() => {
    const loadToolsConfig = async () => {
      try {
        if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
        const result = await chrome.storage.local.get([
          SOCA_TOOLS_CONFIG_STORAGE_KEY
        ]);
        const stored = result[SOCA_TOOLS_CONFIG_STORAGE_KEY] as
          | SocaToolsConfig
          | undefined;
        if (!stored || typeof stored !== "object") return;

        setToolsConfig({
          ...DEFAULT_SOCA_TOOLS_CONFIG,
          ...stored,
          mcp: {
            ...DEFAULT_SOCA_TOOLS_CONFIG.mcp,
            ...(stored as SocaToolsConfig).mcp
          }
        });
      } catch (error) {
        console.warn("Failed to load tools config:", error);
      }
    };

    loadToolsConfig();
  }, []);

  useEffect(() => {
    const loadPromptBuddySettings = async () => {
      try {
        if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
        const result = await chrome.storage.local.get([
          SOCA_PROMPTBUDDY_SETTINGS_KEY
        ]);
        const stored = result[SOCA_PROMPTBUDDY_SETTINGS_KEY] as
          | PromptBuddySettings
          | undefined;
        if (!stored || typeof stored !== "object") return;
        if (stored.mode && PROMPTBUDDY_MODES.includes(stored.mode)) {
          setPbMode(stored.mode);
        }
        if (stored.profileId) {
          setPbProfileId(stored.profileId);
        }
      } catch (error) {
        console.warn("Failed to load PromptBuddy settings:", error);
      }
    };

    loadPromptBuddySettings();
  }, []);

  useEffect(() => {
    ensureDefaultLibrary()
      .then((items) => setPbLibraryItems(items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const loadPromptBuddyProfiles = async () => {
      try {
        const data = await requestBackground(
          "promptbuddy_profiles",
          {},
          "promptbuddy_profiles_result",
          10_000
        );
        const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
        const normalized = profiles
          .map((profile: any) => ({
            id: String(profile?.id || "").trim(),
            name: String(profile?.name || profile?.id || "").trim()
          }))
          .filter((profile: PromptBuddyProfile) => profile.id && profile.name);
        setPbProfiles(normalized);
      } catch (error) {
        console.warn("Failed to load PromptBuddy profiles:", error);
      }
    };

    loadPromptBuddyProfiles();
  }, []);

  useEffect(() => {
    persistPromptBuddySettings((current) => ({
      ...current,
      mode: pbMode,
      profileId: pbProfileId
    })).catch(() => undefined);
  }, [pbMode, pbProfileId]);

  const enabledToolsCount = useMemo(() => {
    const { webfetch, context7, github, nanobanapro, nt2l } = toolsConfig.mcp;
    return (
      Number(webfetch) +
      Number(context7) +
      Number(github) +
      Number(nanobanapro) +
      Number(nt2l)
    );
  }, [toolsConfig.mcp]);

  const persistToolsConfig = async (next: SocaToolsConfig) => {
    setToolsConfig(next);
    try {
      if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
      await chrome.storage.local.set({
        [SOCA_TOOLS_CONFIG_STORAGE_KEY]: next
      });
    } catch (error) {
      console.warn("Failed to persist tools config:", error);
    }
  };

  const toolsPopoverContent = (
    <div style={{ width: 320 }}>
      <div className="text-theme-primary font-medium">Tool connections</div>
      <div
        className="text-theme-primary"
        style={{ opacity: 0.7, fontSize: 12 }}
      >
        Stored locally. Enforced by SOCA Bridge / lane policy.
      </div>

      <Divider className="border-theme-input" style={{ margin: "10px 0" }} />

      <div className="flex flex-col gap-2">
        <Checkbox
          checked={toolsConfig.mcp.webfetch}
          onChange={(e) =>
            persistToolsConfig({
              ...toolsConfig,
              mcp: { ...toolsConfig.mcp, webfetch: e.target.checked }
            })
          }
          className="checkbox-theme text-theme-primary"
        >
          <span className="text-theme-primary">MCP: webfetch</span>
        </Checkbox>
        <Checkbox
          checked={toolsConfig.mcp.context7}
          onChange={(e) =>
            persistToolsConfig({
              ...toolsConfig,
              mcp: { ...toolsConfig.mcp, context7: e.target.checked }
            })
          }
          className="checkbox-theme text-theme-primary"
        >
          <span className="text-theme-primary">MCP: context7</span>
        </Checkbox>
        <Checkbox
          checked={toolsConfig.mcp.github}
          onChange={(e) =>
            persistToolsConfig({
              ...toolsConfig,
              mcp: { ...toolsConfig.mcp, github: e.target.checked }
            })
          }
          className="checkbox-theme text-theme-primary"
        >
          <span className="text-theme-primary">MCP: github</span>
        </Checkbox>
        <Checkbox
          checked={toolsConfig.mcp.nanobanapro}
          onChange={(e) =>
            persistToolsConfig({
              ...toolsConfig,
              mcp: { ...toolsConfig.mcp, nanobanapro: e.target.checked }
            })
          }
          className="checkbox-theme text-theme-primary"
        >
          <span className="text-theme-primary">Tool: nanobanapro</span>
        </Checkbox>
        <Checkbox
          checked={toolsConfig.mcp.nt2l}
          onChange={(e) =>
            persistToolsConfig({
              ...toolsConfig,
              mcp: { ...toolsConfig.mcp, nt2l: e.target.checked }
            })
          }
          className="checkbox-theme text-theme-primary"
        >
          <span className="text-theme-primary">Tool: nt2l</span>
        </Checkbox>
      </div>

      <Divider className="border-theme-input" style={{ margin: "10px 0" }} />

      <div className="text-theme-primary font-medium">Allowlisted domains</div>
      <div
        className="text-theme-primary"
        style={{ opacity: 0.7, fontSize: 12 }}
      >
        One domain per line (e.g. <code>api.github.com</code>).
      </div>
      <Input.TextArea
        value={toolsConfig.allowlistText}
        onChange={(e) =>
          persistToolsConfig({ ...toolsConfig, allowlistText: e.target.value })
        }
        rows={4}
        placeholder={"api.github.com\ncontext7.com"}
        className="bg-theme-input border-theme-input text-theme-primary radius-8px"
        style={{ marginTop: 8 }}
      />
    </div>
  );

  const filteredLibraryItems = useMemo(() => {
    const q = pbLibrarySearch.trim().toLowerCase();
    const items = [...pbLibraryItems];
    items.sort(
      (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))
    );

    if (!q) return items;
    return items.filter((item) => {
      const hay =
        `${item.title} ${item.category || ""} ${item.prompt}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pbLibraryItems, pbLibrarySearch]);

  return (
    <div className="p-4">
      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="mb-3">
          <Space wrap>
            {uploadedFiles.map((file) => {
              const isImage = file.mimeType.startsWith("image/");
              return (
                <div
                  key={file.id}
                  className="inline-flex items-center px-2 py-1 bg-theme-input rounded border-theme-input"
                >
                  {isImage ? (
                    <Image
                      src={
                        file.url
                          ? file.url
                          : `data:${file.mimeType};base64,${file.base64Data}`
                      }
                      alt={file.filename}
                      className="w-10 h-10 object-cover rounded mr-2"
                      preview={false}
                    />
                  ) : (
                    <FileOutlined className="mr-2 fill-theme-icon" />
                  )}
                  <Text className="text-xs mr-2 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap text-theme-primary">
                    {file.filename}
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => onRemoveFile(file.id)}
                    className="p-0 w-5 h-5"
                  />
                </div>
              );
            })}
          </Space>
        </div>
      )}

      <details className="soca-socakit mb-3" open>
        <summary className="text-xs font-medium text-theme-primary">
          SOCaKit 15 Steps (embedded)
        </summary>
        <ol className="mt-2 text-xs text-theme-primary">
          {SOCAKIT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>

      <div className="mb-3">
        <div
          className="text-xs text-theme-primary"
          style={{ opacity: 0.7, marginBottom: 6 }}
        >
          Quick Actions
        </div>
        <Space size="small" wrap>
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.id}
              size="small"
              onClick={() => onInputChange(action.prompt)}
              disabled={sending || currentMessageId !== null}
              className="soca-quick-action-btn"
            >
              {action.label}
            </Button>
          ))}
        </Space>
      </div>

      {/* Floating Chat Input Box */}
      <div
        className="bg-theme-input border-theme-input relative shadow-sm hover:shadow-md transition-shadow radius-8px"
        style={{ borderWidth: "1px", borderStyle: "solid", overflow: "hidden" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx,.xlsx,.txt,.md,.json"
          onChange={onFileSelect}
          className="hidden"
        />

        {/* Input Area */}
        <div className="px-4 pt-3 pb-12">
          <WebpageMentionInput
            value={inputValue}
            onChange={onInputChange}
            disabled={sending || currentMessageId !== null}
            onSend={() => onSend()}
          />
        </div>

        {/* Bottom Action Bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2">
          {/* Left: Attachment, History, and Settings Buttons */}
          <Space size="small">
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || currentMessageId !== null}
              className="text-theme-icon"
            />
            <Button
              type="text"
              icon={<HistoryOutlined />}
              onClick={onShowSessionHistory}
              disabled={sending || currentMessageId !== null}
              className="text-theme-icon"
            />
            <Popover
              content={toolsPopoverContent}
              trigger="click"
              open={toolsPopoverOpen}
              onOpenChange={setToolsPopoverOpen}
              placement="topLeft"
              overlayClassName="soca-tools-popover"
            >
              <Badge dot={enabledToolsCount > 0} offset={[-2, 2]}>
                <Button
                  type="text"
                  icon={<ApiOutlined />}
                  disabled={sending || currentMessageId !== null}
                  className="text-theme-icon"
                />
              </Badge>
            </Popover>
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => chrome.runtime.openOptionsPage()}
              disabled={sending || currentMessageId !== null}
              className="text-theme-icon"
            />
          </Space>

          <Space size="small">
            <Select
              size="small"
              value={pbMode}
              onChange={(value) => setPbMode(value as PromptBuddyMode)}
              disabled={sending || currentMessageId !== null || pbBusy}
              style={{ width: 112 }}
              className="bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
              classNames={{
                popup: {
                  root: "bg-theme-input border-theme-input dropdown-theme-items"
                }
              }}
              options={PROMPTBUDDY_MODES.map((mode) => ({
                value: mode,
                label: mode
              }))}
            />
            <Select
              size="small"
              allowClear
              placeholder="profile"
              value={pbProfileId}
              onChange={(value) => setPbProfileId(value)}
              disabled={sending || currentMessageId !== null || pbBusy}
              style={{ width: 120 }}
              className="bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
              classNames={{
                popup: {
                  root: "bg-theme-input border-theme-input dropdown-theme-items"
                }
              }}
              options={pbProfiles.map((profile) => ({
                value: profile.id,
                label: profile.name
              }))}
            />
            <Tooltip title="Prompt Library (local)">
              <Button
                type="text"
                icon={<BookOutlined />}
                onClick={() => setPbLibraryOpen(true)}
                disabled={sending || currentMessageId !== null || pbBusy}
                className="text-theme-icon"
                aria-label="Open Prompt Library"
              />
            </Tooltip>
            <Button
              type="text"
              onClick={handlePromptBuddyEnhance}
              disabled={
                sending ||
                currentMessageId !== null ||
                pbBusy ||
                !inputValue.trim()
              }
              className="text-theme-icon"
            >
              {pbBusy ? "Enhancing..." : "Enhance"}
            </Button>

            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={onNewSession}
              disabled={sending || currentMessageId !== null}
              className="soca-secondary-btn"
            >
              New (+)
            </Button>
            {currentMessageId ? (
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={onStop}
                className="soca-danger-btn"
              >
                Stop
              </Button>
            ) : (
              <Button
                size="small"
                icon={<SendOutlined />}
                onClick={() => onSend()}
                loading={sending}
                disabled={sending || isEmpty}
                className="soca-primary-btn"
              >
                Send (Enter)
              </Button>
            )}
          </Space>
        </div>
      </div>

      <Modal
        title="Prompt Buddy Preview"
        open={pbPreviewOpen}
        onCancel={() => setPbPreviewOpen(false)}
        footer={[
          <Button key="discard" onClick={() => setPbPreviewOpen(false)}>
            Discard
          </Button>,
          <Button key="apply" onClick={() => applyPromptBuddy(false)}>
            Apply
          </Button>,
          <Button
            key="apply-send"
            type="primary"
            onClick={() => applyPromptBuddy(true)}
          >
            Apply & Send
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <Input.TextArea
            value={pbPreviewDraft}
            onChange={(event) => setPbPreviewDraft(event.target.value)}
            rows={10}
          />
          {pbResult?.stats && (
            <Text type="secondary">
              chars {pbResult.stats.chars_before || 0} →{" "}
              {pbResult.stats.chars_after || 0} | tokens{" "}
              {pbResult.stats.est_tokens_before || 0} →{" "}
              {pbResult.stats.est_tokens_after || 0}
            </Text>
          )}
          {pbResult?.policy && (
            <Text type="secondary">
              policy lane_allowed={String(pbResult.policy.lane_allowed)}{" "}
              network_used=
              {String(pbResult.policy.network_used)} model=
              {pbResult.policy.model || "unknown"}
            </Text>
          )}
          {pbResult?.rationale && pbResult.rationale.length > 0 && (
            <div>
              <Text strong>Rationale</Text>
              <ul>
                {pbResult.rationale.slice(0, 6).map((item, index) => (
                  <li key={`rationale-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {pbResult?.mutations && pbResult.mutations.length > 0 && (
            <div>
              <Text strong>Mutations</Text>
              <ul>
                {pbResult.mutations.slice(0, 8).map((item, index) => (
                  <li key={`mutation-${index}`}>
                    {item.type}: {item.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pbResult?.redactions && pbResult.redactions.length > 0 && (
            <div>
              <Text strong>Redactions</Text>
              <ul>
                {pbResult.redactions.slice(0, 6).map((item, index) => (
                  <li key={`redaction-${index}`}>
                    {item.type}: {item.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pbResult?.diff?.data && (
            <Input.TextArea value={pbResult.diff.data} readOnly rows={6} />
          )}
        </Space>
      </Modal>

      <Modal
        title="Prompt Library"
        open={pbLibraryOpen}
        onCancel={() => setPbLibraryOpen(false)}
        footer={[
          <Button key="export" onClick={exportLibraryJson}>
            Export
          </Button>,
          <Button
            key="save"
            onClick={openSaveCurrentPrompt}
            disabled={
              !inputValue.trim() || sending || currentMessageId !== null
            }
          >
            Save Current
          </Button>,
          <Button
            key="close"
            type="primary"
            onClick={() => setPbLibraryOpen(false)}
          >
            Close
          </Button>
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={10}>
          <Input
            value={pbLibrarySearch}
            onChange={(e) => setPbLibrarySearch(e.target.value)}
            placeholder="Search prompts..."
            allowClear
          />
          <List
            bordered
            dataSource={filteredLibraryItems}
            locale={{ emptyText: "No prompts saved yet." }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Tooltip
                    key="favorite"
                    title={item.favorite ? "Unfavorite" : "Favorite"}
                  >
                    <Button
                      type="text"
                      icon={item.favorite ? <StarFilled /> : <StarOutlined />}
                      onClick={() => toggleFavorite(item.id)}
                      aria-label={
                        item.favorite ? "Unfavorite prompt" : "Favorite prompt"
                      }
                    />
                  </Tooltip>,
                  <Button
                    key="apply"
                    onClick={() => applyLibraryItem(item, false)}
                  >
                    Apply
                  </Button>,
                  <Button
                    key="apply-send"
                    type="primary"
                    onClick={() => applyLibraryItem(item, true)}
                  >
                    Apply & Send
                  </Button>,
                  <Button
                    key="delete"
                    danger
                    onClick={() =>
                      Modal.confirm({
                        title: "Delete prompt?",
                        content: item.title,
                        okText: "Delete",
                        okButtonProps: { danger: true },
                        onOk: () => deleteLibraryItem(item.id)
                      })
                    }
                  >
                    Delete
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={8}>
                      <Text strong>{item.title}</Text>
                      {item.category && (
                        <Text type="secondary">{item.category}</Text>
                      )}
                    </Space>
                  }
                  description={
                    <Text type="secondary">
                      {item.prompt.slice(0, 160)}
                      {item.prompt.length > 160 ? "..." : ""}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </Space>
      </Modal>

      <Modal
        title="Save Prompt"
        open={pbSavePromptOpen}
        onCancel={() => setPbSavePromptOpen(false)}
        onOk={saveCurrentPromptToLibrary}
        okText="Save"
        okButtonProps={{ disabled: !pbSaveTitle.trim() || !inputValue.trim() }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <div>
            <Text strong>Title</Text>
            <Input
              value={pbSaveTitle}
              onChange={(e) => setPbSaveTitle(e.target.value)}
            />
          </div>
          <div>
            <Text strong>Category (optional)</Text>
            <Input
              value={pbSaveCategory}
              onChange={(e) => setPbSaveCategory(e.target.value)}
            />
          </div>
          <Text type="secondary">
            Stored locally in the extension (not synced).
          </Text>
        </Space>
      </Modal>
    </div>
  );
};
