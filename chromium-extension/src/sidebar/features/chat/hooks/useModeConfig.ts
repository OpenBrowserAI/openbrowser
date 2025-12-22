import { useState, useEffect } from "react";
import { config } from "@openbrowser-ai/core";

export const useModeConfig = () => {
  const [mode, setMode] = useState<"fast" | "normal" | "expert">(config.mode);
  const [markImageMode, setMarkImageMode] = useState<"dom" | "draw">(
    config.markImageMode
  );

  // Load agent config from storage on mount
  useEffect(() => {
    chrome.storage.sync.get(["agentConfig"], (result) => {
      if (result.agentConfig) {
        setMode(result.agentConfig.mode);
        setMarkImageMode(result.agentConfig.markImageMode);
        chrome.runtime.sendMessage({
          type: "update_mode",
          mode: result.agentConfig.mode,
          markImageMode: result.agentConfig.markImageMode
        });
      }
    });
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === "sync" && changes.agentConfig) {
        const newConfig = changes.agentConfig.newValue as {
          mode: "fast" | "normal" | "expert";
          markImageMode: "dom" | "draw";
        } | undefined;
        if (newConfig) {
          setMode(newConfig.mode);
          setMarkImageMode(newConfig.markImageMode);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return {
    mode,
    markImageMode,
  };
};
