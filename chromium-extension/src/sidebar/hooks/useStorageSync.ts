import { useState, useEffect } from "react";

export const useStorageSync = () => {
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState(
    'Open Twitter, search for "OpenBrowserAI" and follow'
  );

  useEffect(() => {
    chrome.storage.local.get(["running", "prompt"], (result) => {
      if (result.running !== undefined) {
        setRunning(result.running);
      }
      if (result.prompt !== undefined) {
        setPrompt(result.prompt);
      }
    });
  }, []);

  useEffect(() => {
    const messageListener = (message: any) => {
      if (message?.type === "stop") {
        setRunning(false);
        chrome.storage.local.set({ running: false });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const updateRunningState = (isRunning: boolean, currentPrompt: string) => {
    setRunning(isRunning);
    chrome.storage.local.set({ running: isRunning, prompt: currentPrompt });
  };

  const updatePrompt = (newPrompt: string) => {
    setPrompt(newPrompt);
  };

  return {
    running,
    prompt,
    updateRunningState,
    updatePrompt,
  };
};
