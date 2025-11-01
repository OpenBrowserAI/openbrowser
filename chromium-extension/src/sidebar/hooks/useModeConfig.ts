import { useState, useEffect } from "react";
import { config } from "@openbrowser-ai/core";

export const useModeConfig = () => {
  const [mode, setMode] = useState<"fast" | "normal" | "expert">(config.mode);
  const [markImageMode, setMarkImageMode] = useState<"dom" | "draw">(
    config.markImageMode
  );

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "update_mode", mode, markImageMode });
  }, [mode, markImageMode]);

  return {
    mode,
    markImageMode,
    setMode,
    setMarkImageMode
  };
};
