# opensurfer_observer patches

Native Chromium patches for deep observation — below MV3 extension limits.

## Planned patches

| file | purpose |
|---|---|
| `0001-network-observer.patch` | Hook `URLRequestJob` to intercept all HTTP(S) traffic before TLS stripping, capture request/response body + headers |
| `0002-dom-observer.patch` | V8 bindings to observe form submissions, input events, and navigation at the renderer process level |
| `0003-navigation-observer.patch` | Hook `NavigationHandle` in the browser process to capture SPA route changes and page lifecycle events |
| `0004-ipc-bridge.patch` | Expose a privileged IPC channel from renderer → browser process for the OpenSurfer sidebar to receive live trace events |

## Why native patches vs MV3

The Chrome extension (`chromium-extension/`) uses the MV3 `webRequest` API — sufficient for getting started, but limited:

- Cannot observe WebSocket frames
- Cross-origin requests may be blocked
- No access to request bodies on POST
- Extension context can be killed by the browser

Native patches have no such limits. The observer lives in the renderer/browser process and sees everything.

## Status

Not yet implemented. Current observation uses the MV3 extension in `chromium-extension/`.
These patches will be developed once the extension-based prototype is validated.
