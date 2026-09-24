// ── OpenSurfer isolated-world bridge ─────────────────────────────────────────
// Runs in the isolated world (has chrome.runtime access).
// Listens for trace events from the MAIN world and relays to the background.

window.addEventListener("__opensurfer_trace", (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (!detail) return;
  try {
    chrome.runtime.sendMessage({ type: "os_trace", data: detail });
  } catch {
    // extension context invalidated
  }
});
