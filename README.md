# OpenSurfer Browser

A Chromium-based browser that learns what software can do by watching you use it — then lets AI operate any app you've connected, compose cross-app workflows, and chat with full awareness of your software stack.

Built on [OpenBrowser](https://github.com/OpenBrowserAI/openbrowser).

---

## Architecture

```
OpenSurfer Browser
├── Chromium shell                ← OpenBrowser fork (branding, theme, UI patches)
│
├── chromium-extension/           ← Sidebar (React + TypeScript)
│   ├── Chat tab                  ← OpenBrowser's AI chat, unchanged
│   └── Capabilities tab          ← new: discovered apps, workflows, compose
│
├── packages/core                 ← OpenBrowser's AI layer (chat, agents, LLM providers)
├── packages/sunder-runtime       ← new: capability discovery + workflow engine
│   └── SunderClient              ← typed wrapper → opensurfer server (localhost:4173)
│
└── chromium/patches/
    ├── branding/                 ← OpenSurfer name + icons
    ├── theme/                    ← UI patches
    ├── openbrowser_integration/  ← sidebar injection
    └── opensurfer_observer/      ← planned: native network + DOM observation
```

The **Sunder Runtime** (`packages/sunder-runtime`) is the capability engine:
- Connects to the local [opensurfer](https://github.com/opensurfer/opensurfer) server
- Discovers what every connected app can do (no API docs, no connectors)
- Composes multi-step workflows across apps in natural language
- Executes capabilities through a trust gate (read/write/destructive)

The **chat tab** uses OpenBrowser's existing AI infrastructure (`packages/core`) with support for Anthropic, OpenAI, Gemini, Bedrock, and local models.

---

## Packages

| package | description |
|---|---|
| `packages/core` | OpenBrowser AI layer — LLM providers, agents, chat, memory |
| `packages/extension` | Shared browser utilities |
| `packages/sunder-runtime` | Sunder capability client — discovery, resolve, compose, run |
| `chromium-extension` | React sidebar — Chat + Capabilities tabs |

---

## Getting started

### Extension only (no Chromium build)

```bash
git clone https://github.com/opensurfer/browser
cd browser
pnpm install
cd chromium-extension && pnpm build
```

Load `chromium-extension/dist` as an unpacked extension in Chrome.

Start the opensurfer capability server:

```bash
git clone https://github.com/opensurfer/opensurfer
cd opensurfer && node server.mjs
```

### Full browser build

See [chromium/contributing.md](./chromium/contributing.md) for the full Chromium build setup (depot_tools, ~20GB source fetch, autoninja).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE). Forked from [OpenBrowserAI/openbrowser](https://github.com/OpenBrowserAI/openbrowser).
