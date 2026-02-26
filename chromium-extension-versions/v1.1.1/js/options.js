/******/ (() => {
  // webpackBootstrap
  /******/ "use strict";
  /******/ var __webpack_modules__ = {
    /***/ "./src/llm/endpointPolicy.ts":
      /*!***********************************!*\
  !*** ./src/llm/endpointPolicy.ts ***!
  \***********************************/
      /***/ (
        __unused_webpack_module,
        __webpack_exports__,
        __webpack_require__
      ) => {
        __webpack_require__.r(__webpack_exports__);
        /* harmony export */ __webpack_require__.d(__webpack_exports__, {
          /* harmony export */ buildBridgeCandidates: () =>
            /* binding */ buildBridgeCandidates,
          /* harmony export */ classifyHost: () => /* binding */ classifyHost,
          /* harmony export */ isAllowedDirectURL: () =>
            /* binding */ isAllowedDirectURL,
          /* harmony export */ isTrustedBridgeURL: () =>
            /* binding */ isTrustedBridgeURL,
          /* harmony export */ normalizeBaseURL: () =>
            /* binding */ normalizeBaseURL
          /* harmony export */
        });
        const DEFAULT_BRIDGE_V1_BASE_URL = "http://127.0.0.1:9834/v1";
        function hasExplicitScheme(value) {
          return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
        }
        function parseIPv4(hostname) {
          const parts = hostname.split(".");
          if (parts.length !== 4) return null;
          const nums = parts.map((p) => Number(p));
          if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
            return null;
          return nums;
        }
        function parseURLLike(raw) {
          const input = String(raw || "").trim();
          if (!input) return null;
          const candidate = hasExplicitScheme(input)
            ? input
            : `http://${input}`;
          try {
            return new URL(candidate);
          } catch {
            return null;
          }
        }
        function toNormalizedURLString(url) {
          const pathname =
            url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
          const search = url.search || "";
          const hash = url.hash || "";
          return `${url.protocol}//${url.host}${pathname}${search}${hash}`;
        }
        function toV1BaseURL(raw) {
          const parsed = parseURLLike(raw);
          if (!parsed) return "";
          const pathname = parsed.pathname.replace(/\/+$/, "");
          const v1Path = pathname.endsWith("/v1") ? pathname : `${pathname}/v1`;
          return `${parsed.protocol}//${parsed.host}${v1Path || "/v1"}`;
        }
        function normalizeBaseURL(raw) {
          const parsed = parseURLLike(raw);
          if (!parsed) return String(raw || "").trim();
          return toNormalizedURLString(parsed);
        }
        function classifyHost(host) {
          const hostname = String(host || "")
            .trim()
            .toLowerCase();
          if (!hostname) return "invalid";
          if (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1"
          ) {
            return "localhost";
          }
          if (hostname.endsWith(".ts.net")) {
            return "tailscale";
          }
          const ipv4 = parseIPv4(hostname);
          if (!ipv4) {
            if (hostname.includes(" ")) return "invalid";
            return "public";
          }
          const [a, b] = ipv4;
          if (a === 127) return "localhost";
          if (a === 100 && b >= 64 && b <= 127) return "tailscale";
          if (a === 10) return "private";
          if (a === 172 && b >= 16 && b <= 31) return "private";
          if (a === 192 && b === 168) return "private";
          return "public";
        }
        function isTrustedBridgeURL(url) {
          const parsed = parseURLLike(url);
          if (!parsed) return false;
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
            return false;
          if (parsed.username || parsed.password) return false;
          const classification = classifyHost(parsed.hostname);
          return (
            classification === "localhost" ||
            classification === "private" ||
            classification === "tailscale"
          );
        }
        function isAllowedDirectURL(url) {
          const parsed = parseURLLike(url);
          if (!parsed) return false;
          if (parsed.protocol !== "https:") return false;
          if (parsed.username || parsed.password) return false;
          return classifyHost(parsed.hostname) === "public";
        }
        function buildBridgeCandidates(config) {
          const out = [];
          const push = (candidate) => {
            const normalized = toV1BaseURL(candidate);
            if (!normalized) return;
            const parsed = parseURLLike(normalized);
            if (!parsed) return;
            const hostType = classifyHost(parsed.hostname);
            if (!["localhost", "private", "tailscale"].includes(hostType))
              return;
            if (!out.includes(normalized)) out.push(normalized);
          };
          push(String(config.savedBaseURL || "").trim());
          const tailscaleHost = String(config.tailscaleHost || "").trim();
          if (tailscaleHost) {
            const normalized = normalizeBaseURL(tailscaleHost);
            const parsed = parseURLLike(normalized);
            if (parsed && classifyHost(parsed.hostname) === "tailscale") {
              push(normalized);
            }
          }
          push(config.fallbackBaseURL || DEFAULT_BRIDGE_V1_BASE_URL);
          if (!out.length) {
            out.push(DEFAULT_BRIDGE_V1_BASE_URL);
          }
          return out;
        }

        /***/
      },

    /***/ "./src/llm/llm.ts":
      /*!************************!*\
  !*** ./src/llm/llm.ts ***!
  \************************/
      /***/ (
        __unused_webpack_module,
        __webpack_exports__,
        __webpack_require__
      ) => {
        __webpack_require__.r(__webpack_exports__);
        /* harmony export */ __webpack_require__.d(__webpack_exports__, {
          /* harmony export */ fetchModelsData: () =>
            /* binding */ fetchModelsData,
          /* harmony export */ filterImageSupportedModels: () =>
            /* binding */ filterImageSupportedModels,
          /* harmony export */ getDefaultBaseURL: () =>
            /* binding */ getDefaultBaseURL,
          /* harmony export */ getProvidersWithImageSupport: () =>
            /* binding */ getProvidersWithImageSupport,
          /* harmony export */ isTrustedBridgeURL: () =>
            /* reexport safe */ _endpointPolicy__WEBPACK_IMPORTED_MODULE_0__.isTrustedBridgeURL,
          /* harmony export */ modelsToOptions: () =>
            /* binding */ modelsToOptions,
          /* harmony export */ providersToOptions: () =>
            /* binding */ providersToOptions,
          /* harmony export */ supportsImageInput: () =>
            /* binding */ supportsImageInput
          /* harmony export */
        });
        /* harmony import */ var _endpointPolicy__WEBPACK_IMPORTED_MODULE_0__ =
          __webpack_require__(
            /*! ./endpointPolicy */ "./src/llm/endpointPolicy.ts"
          );
        /**
         * LLM Model Fetching and Filtering Utilities
         */

        const MODELS_CACHE_STORAGE_KEY = "socaBridgeModelsCache";
        const PROVIDER_MODELS_CACHE_STORAGE_KEY =
          "socaProviderModelsCatalogCache";
        const BRIDGE_MODELS_MESSAGE_TYPE = "SOCA_BRIDGE_GET_MODELS";
        const OPENROUTER_PROVIDER_ID = "openrouter";
        const GENERIC_CUSTOM_MODEL = {
          id: "custom",
          name: "SOCA Agent SDK (Custom)",
          modalities: { input: ["text", "image"], output: ["text"] }
        };
        function normalizeModelOrigin(value) {
          const raw = String(value || "")
            .trim()
            .toLowerCase();
          if (raw === "local") return "local";
          if (raw === "vps_holo" || raw === "vps-holo" || raw === "vps") {
            return "vps_holo";
          }
          if (raw === "cloud") return "cloud";
          return undefined;
        }
        function inferModelOrigin(modelId, providerHint) {
          const id = String(modelId || "")
            .trim()
            .toLowerCase();
          const provider = String(providerHint || "")
            .trim()
            .toLowerCase();
          if (
            provider === "openrouter" ||
            provider === "openai" ||
            provider === "anthropic" ||
            provider === "google" ||
            provider === "azure" ||
            provider === "bedrock" ||
            id.startsWith("openrouter/") ||
            id.startsWith("openai/") ||
            id.startsWith("anthropic/") ||
            id.startsWith("google/")
          ) {
            return "cloud";
          }
          if (provider === "vps-holo" || provider === "vps_holo") {
            return "vps_holo";
          }
          if (!id) return undefined;
          return "local";
        }
        function withCatalogDefaultOrigin(model, provider) {
          if (model.modelOrigin) return model;
          const defaultOrigin =
            provider.catalogMode === "cloud_only" ? "cloud" : "local";
          return { ...model, modelOrigin: defaultOrigin };
        }
        function modelAllowedByCatalog(model, provider) {
          if (provider.catalogMode === "cloud_only") {
            return model.modelOrigin === "cloud";
          }
          if (provider.catalogMode === "local_only") {
            return (
              model.modelOrigin === "local" || model.modelOrigin === "vps_holo"
            );
          }
          return true;
        }
        function projectProviderModels(provider, models) {
          const projected = {};
          for (const [modelId, model] of Object.entries(models || {})) {
            const withOrigin = withCatalogDefaultOrigin(model, provider);
            if (!modelAllowedByCatalog(withOrigin, provider)) continue;
            projected[modelId] = withOrigin;
          }
          return projected;
        }
        const LOCAL_OLLAMA_PROVIDER = {
          ollama: {
            id: "ollama",
            name: "Ollama (Local)",
            npm: "@ai-sdk/openai-compatible",
            api: "http://127.0.0.1:11434/v1",
            authModes: ["api_key"],
            modelSource: "static",
            catalogMode: "local_only",
            requiresBaseURL: false,
            supportsLiveCatalog: true,
            models: {
              "qwen3-vl:2b": {
                id: "qwen3-vl:2b",
                name: "Qwen3-VL 2B",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "qwen3-vl:4b": {
                id: "qwen3-vl:4b",
                name: "Qwen3-VL 4B",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "qwen3-vl:8b": {
                id: "qwen3-vl:8b",
                name: "Qwen3-VL 8B",
                modalities: { input: ["text", "image"], output: ["text"] }
              }
            }
          }
        };
        const LOCAL_SOCA_BRIDGE_PROVIDER = {
          "soca-bridge": {
            id: "soca-bridge",
            name: "SOCA Bridge (Local)",
            npm: "@ai-sdk/openai-compatible",
            api: "http://127.0.0.1:9834/v1",
            authModes: ["api_key"],
            modelSource: "bridge",
            catalogMode: "local_only",
            requiresBaseURL: false,
            supportsLiveCatalog: true,
            models: {
              "soca/auto": {
                id: "soca/auto",
                name: "SOCA Auto (via Bridge)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "soca/fast": {
                id: "soca/fast",
                name: "SOCA Fast (via Bridge)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "soca/best": {
                id: "soca/best",
                name: "SOCA Best (via Bridge)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "qwen3-vl:2b": {
                id: "qwen3-vl:2b",
                name: "Qwen3-VL 2B (via Bridge)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "qwen3-vl:4b": {
                id: "qwen3-vl:4b",
                name: "Qwen3-VL 4B (via Bridge)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "qwen3-vl:8b": {
                id: "qwen3-vl:8b",
                name: "Qwen3-VL 8B (via Bridge)",
                modalities: { input: ["text", "image"], output: ["text"] }
              }
            }
          }
        };
        const OPENAI_COMPAT_PROVIDER = (id, name, api, options) => {
          var _a, _b;
          return {
            id,
            name,
            npm: "@ai-sdk/openai-compatible",
            api,
            authModes: (options === null || options === void 0
              ? void 0
              : options.authModes) || ["api_key"],
            modelSource:
              (options === null || options === void 0
                ? void 0
                : options.modelSource) || "static",
            catalogMode:
              (options === null || options === void 0
                ? void 0
                : options.catalogMode) || "local_only",
            requiresBaseURL:
              (_a =
                options === null || options === void 0
                  ? void 0
                  : options.requiresBaseURL) !== null && _a !== void 0
                ? _a
                : false,
            supportsLiveCatalog:
              (_b =
                options === null || options === void 0
                  ? void 0
                  : options.supportsLiveCatalog) !== null && _b !== void 0
                ? _b
                : false,
            models: {
              custom: GENERIC_CUSTOM_MODEL
            }
          };
        };
        const LOCAL_OPENAI_COMPAT_PROVIDERS = {
          "openai-compatible": OPENAI_COMPAT_PROVIDER(
            "openai-compatible",
            "OpenAI-Compatible (Custom)",
            "http://127.0.0.1:1234/v1",
            { requiresBaseURL: true }
          ),
          lmstudio: OPENAI_COMPAT_PROVIDER(
            "lmstudio",
            "LM Studio (Local)",
            "http://127.0.0.1:1234/v1"
          ),
          vllm: OPENAI_COMPAT_PROVIDER(
            "vllm",
            "vLLM (Local)",
            "http://127.0.0.1:8000/v1"
          ),
          localai: OPENAI_COMPAT_PROVIDER(
            "localai",
            "LocalAI (Local)",
            "http://127.0.0.1:8080/v1"
          )
        };
        const DIRECT_PROVIDER_CATALOG = {
          openai: {
            id: "openai",
            name: "OpenAI (Direct)",
            npm: "@ai-sdk/openai",
            api: "https://api.openai.com/v1",
            authModes: ["api_key"],
            modelSource: "direct_api",
            catalogMode: "cloud_only",
            requiresBaseURL: false,
            supportsLiveCatalog: true,
            models: {
              "gpt-4.1": {
                id: "gpt-4.1",
                name: "GPT-4.1",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gpt-4.1-mini": {
                id: "gpt-4.1-mini",
                name: "GPT-4.1 Mini",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gpt-4.1-nano": {
                id: "gpt-4.1-nano",
                name: "GPT-4.1 Nano",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gpt-4o": {
                id: "gpt-4o",
                name: "GPT-4o",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gpt-4o-mini": {
                id: "gpt-4o-mini",
                name: "GPT-4o Mini",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              o3: {
                id: "o3",
                name: "o3",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "o3-mini": {
                id: "o3-mini",
                name: "o3 Mini",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "o4-mini": {
                id: "o4-mini",
                name: "o4 Mini",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              o1: {
                id: "o1",
                name: "o1",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gpt-4-turbo": {
                id: "gpt-4-turbo",
                name: "GPT-4 Turbo",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              custom: GENERIC_CUSTOM_MODEL
            }
          },
          anthropic: {
            id: "anthropic",
            name: "Anthropic (Direct)",
            npm: "@ai-sdk/anthropic",
            api: "https://api.anthropic.com/v1",
            authModes: ["api_key"],
            modelSource: "direct_api",
            catalogMode: "cloud_only",
            requiresBaseURL: false,
            supportsLiveCatalog: true,
            models: {
              "claude-opus-4-20250514": {
                id: "claude-opus-4-20250514",
                name: "Claude Opus 4",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "claude-sonnet-4-20250514": {
                id: "claude-sonnet-4-20250514",
                name: "Claude Sonnet 4",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "claude-3-7-sonnet-latest": {
                id: "claude-3-7-sonnet-latest",
                name: "Claude 3.7 Sonnet",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "claude-3-5-sonnet-latest": {
                id: "claude-3-5-sonnet-latest",
                name: "Claude 3.5 Sonnet",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "claude-3-5-haiku-latest": {
                id: "claude-3-5-haiku-latest",
                name: "Claude 3.5 Haiku",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "claude-3-opus-20240229": {
                id: "claude-3-opus-20240229",
                name: "Claude 3 Opus",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              custom: GENERIC_CUSTOM_MODEL
            }
          },
          google: {
            id: "google",
            name: "Google Gemini (Direct)",
            npm: "@ai-sdk/openai-compatible",
            api: "https://generativelanguage.googleapis.com/v1beta/openai",
            authModes: ["api_key", "oauth"],
            modelSource: "direct_api",
            catalogMode: "cloud_only",
            requiresBaseURL: false,
            supportsLiveCatalog: true,
            models: {
              "gemini-2.5-pro": {
                id: "gemini-2.5-pro",
                name: "Gemini 2.5 Pro",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gemini-2.5-flash": {
                id: "gemini-2.5-flash",
                name: "Gemini 2.5 Flash",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gemini-2.0-flash": {
                id: "gemini-2.0-flash",
                name: "Gemini 2.0 Flash",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gemini-1.5-pro": {
                id: "gemini-1.5-pro",
                name: "Gemini 1.5 Pro",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "gemini-1.5-flash": {
                id: "gemini-1.5-flash",
                name: "Gemini 1.5 Flash",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              custom: GENERIC_CUSTOM_MODEL
            }
          },
          azure: {
            id: "azure",
            name: "Azure OpenAI (Direct)",
            npm: "@ai-sdk/azure",
            api: "https://YOUR_RESOURCE_NAME.openai.azure.com",
            authModes: ["api_key"],
            modelSource: "direct_api",
            catalogMode: "cloud_only",
            requiresBaseURL: true,
            supportsLiveCatalog: false,
            models: {
              custom: GENERIC_CUSTOM_MODEL
            }
          },
          bedrock: {
            id: "bedrock",
            name: "AWS Bedrock (Direct)",
            npm: "@ai-sdk/amazon-bedrock",
            api: "https://bedrock-runtime.us-west-2.amazonaws.com",
            authModes: ["api_key"],
            modelSource: "direct_api",
            catalogMode: "cloud_only",
            requiresBaseURL: false,
            supportsLiveCatalog: false,
            models: {
              custom: GENERIC_CUSTOM_MODEL
            }
          },
          "opencode-zen": OPENAI_COMPAT_PROVIDER(
            "opencode-zen",
            "Opencode Zen (Direct)",
            "",
            {
              authModes: ["api_key", "oauth"],
              modelSource: "direct_api",
              catalogMode: "cloud_only",
              requiresBaseURL: true,
              supportsLiveCatalog: true
            }
          ),
          openrouter: {
            id: "openrouter",
            name: "OpenRouter (Direct)",
            npm: "@openrouter/ai-sdk-provider",
            api: "https://openrouter.ai/api/v1",
            authModes: ["api_key"],
            modelSource: "direct_api",
            catalogMode: "cloud_only",
            requiresBaseURL: false,
            supportsLiveCatalog: true,
            models: {
              "openrouter/auto": {
                id: "openrouter/auto",
                name: "OpenRouter Auto",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "anthropic/claude-sonnet-4": {
                id: "anthropic/claude-sonnet-4",
                name: "Claude Sonnet 4 (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "anthropic/claude-3.5-sonnet": {
                id: "anthropic/claude-3.5-sonnet",
                name: "Claude 3.5 Sonnet (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "google/gemini-2.5-pro": {
                id: "google/gemini-2.5-pro",
                name: "Gemini 2.5 Pro (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "google/gemini-2.5-flash": {
                id: "google/gemini-2.5-flash",
                name: "Gemini 2.5 Flash (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "openai/gpt-4.1": {
                id: "openai/gpt-4.1",
                name: "GPT-4.1 (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "openai/gpt-4o": {
                id: "openai/gpt-4o",
                name: "GPT-4o (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "openai/o3": {
                id: "openai/o3",
                name: "o3 (OpenRouter)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              custom: GENERIC_CUSTOM_MODEL
            }
          }
        };
        /**
         * VPS HOLO provider — connects to the SOCA Bridge via Tailscale.
         * The base URL is a Tailscale MagicDNS address (*.ts.net) or a
         * Tailscale IP (100.x.y.z) pointing to the VPS HOLO bridge.
         * Users MUST set their Tailscale hostname in the Base URL field.
         */
        const VPS_HOLO_PROVIDER = {
          "vps-holo": {
            id: "vps-holo",
            name: "VPS HOLO (Tailscale Bridge)",
            npm: "@ai-sdk/openai-compatible",
            api: "http://127.0.0.1:9834/v1",
            authModes: ["api_key"],
            modelSource: "bridge",
            catalogMode: "local_only",
            requiresBaseURL: true,
            supportsLiveCatalog: true,
            models: {
              "soca/auto": {
                id: "soca/auto",
                name: "SOCA Auto (VPS HOLO)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "soca/fast": {
                id: "soca/fast",
                name: "SOCA Fast (VPS HOLO)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "soca/best": {
                id: "soca/best",
                name: "SOCA Best (VPS HOLO)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              "qwen3-vl:8b": {
                id: "qwen3-vl:8b",
                name: "Qwen3-VL 8B (VPS HOLO)",
                modalities: { input: ["text", "image"], output: ["text"] }
              },
              custom: GENERIC_CUSTOM_MODEL
            }
          }
        };
        const DEFAULT_FALLBACK_MODELS = {
          ...LOCAL_OLLAMA_PROVIDER,
          ...LOCAL_SOCA_BRIDGE_PROVIDER,
          ...VPS_HOLO_PROVIDER,
          ...LOCAL_OPENAI_COMPAT_PROVIDERS,
          ...DIRECT_PROVIDER_CATALOG
        };
        function guessVisionSupport(modelId) {
          const id = (modelId || "").toLowerCase();
          // Heuristic: prefer false-positives (more models shown) over missing likely vision models.
          return (
            id.startsWith("soca/") ||
            id.includes("vl") ||
            id.includes("vision") ||
            id.includes("llava") ||
            id.includes("pixtral") ||
            id.includes("gpt-4o") ||
            id.includes("gpt-4.1") ||
            id.includes("gpt-image") ||
            id.includes("o1") ||
            id.includes("o3") ||
            id.includes("o4") ||
            id.includes("claude") ||
            id.includes("gemini") ||
            id.includes("gemma") ||
            id.includes("deepseek") ||
            id.includes("phi-4") ||
            id.includes("phi-5") ||
            id.includes("molmo") ||
            id.includes("qwq") ||
            id.includes("qwen2.5") ||
            id.includes("qwen3") ||
            id.includes("minicpm") ||
            id.includes("internvl") ||
            id.includes("cogvlm") ||
            id.includes("moondream") ||
            id.includes("bakllava") ||
            id.includes("llama-3") ||
            id.includes("mistral") ||
            id.includes("nous-hermes")
          );
        }
        function normalizeModalities(value) {
          if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            return normalized ? [normalized] : [];
          }
          if (!Array.isArray(value)) return [];
          const out = [];
          for (const item of value) {
            if (typeof item !== "string") continue;
            const normalized = item.trim().toLowerCase();
            if (normalized && !out.includes(normalized)) {
              out.push(normalized);
            }
          }
          return out;
        }
        function modelFromBridgeDescriptor(desc) {
          const modelId = String(desc.id || "").trim();
          const name = String(desc.name || modelId || "").trim() || modelId;
          const providerHint = String(desc.provider || "").trim();
          const modelOrigin =
            normalizeModelOrigin(desc.model_origin) ||
            inferModelOrigin(modelId, providerHint);
          const input = normalizeModalities(desc.input_modalities);
          const output = normalizeModalities(desc.output_modalities);
          const fallbackHasVision = guessVisionSupport(modelId);
          const modalities =
            input.length || output.length
              ? {
                  input: input.length
                    ? input
                    : fallbackHasVision
                      ? ["text", "image"]
                      : ["text"],
                  output: output.length ? output : ["text"]
                }
              : fallbackHasVision
                ? { input: ["text", "image"], output: ["text"] }
                : { input: ["text"], output: ["text"] };
          return {
            id: modelId,
            name,
            modelOrigin,
            modalities
          };
        }
        function cloneModelsData(data) {
          const cloned = {};
          for (const [providerId, provider] of Object.entries(data)) {
            const nextProvider = {
              ...provider,
              models: {
                ...(provider.models || {})
              }
            };
            cloned[providerId] = {
              ...nextProvider,
              models: projectProviderModels(nextProvider, nextProvider.models)
            };
          }
          return cloned;
        }
        async function fetchBridgeModels(timeoutMs) {
          var _a, _b;
          if (
            typeof chrome === "undefined" ||
            !((_a =
              chrome === null || chrome === void 0
                ? void 0
                : chrome.runtime) === null || _a === void 0
              ? void 0
              : _a.sendMessage)
          )
            return [];
          const resp = await Promise.race([
            chrome.runtime.sendMessage({ type: BRIDGE_MODELS_MESSAGE_TYPE }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("bridge_models_timeout")),
                timeoutMs
              )
            )
          ]);
          if (!(resp === null || resp === void 0 ? void 0 : resp.ok)) {
            throw new Error(
              String(
                (resp === null || resp === void 0 ? void 0 : resp.err) ||
                  "bridge_models_failed"
              )
            );
          }
          const list =
            (_b = resp === null || resp === void 0 ? void 0 : resp.data) ===
              null || _b === void 0
              ? void 0
              : _b.data;
          if (!Array.isArray(list)) return [];
          return list
            .map((m) => {
              var _a;
              return {
                id: String(
                  (m === null || m === void 0 ? void 0 : m.id) || ""
                ).trim(),
                name:
                  typeof (m === null || m === void 0 ? void 0 : m.name) ===
                  "string"
                    ? m.name
                    : undefined,
                provider:
                  typeof (m === null || m === void 0 ? void 0 : m.provider) ===
                  "string"
                    ? m.provider
                    : undefined,
                model_origin:
                  (_a =
                    m === null || m === void 0 ? void 0 : m.model_origin) !==
                    null && _a !== void 0
                    ? _a
                    : m === null || m === void 0
                      ? void 0
                      : m.modelOrigin,
                input_modalities:
                  m === null || m === void 0 ? void 0 : m.input_modalities,
                output_modalities:
                  m === null || m === void 0 ? void 0 : m.output_modalities
              };
            })
            .filter((m) => Boolean(m.id));
        }
        async function readModelsCache() {
          var _a;
          try {
            if (
              typeof chrome === "undefined" ||
              !((_a =
                chrome === null || chrome === void 0
                  ? void 0
                  : chrome.storage) === null || _a === void 0
                ? void 0
                : _a.local)
            ) {
              return null;
            }
            const result = await chrome.storage.local.get([
              MODELS_CACHE_STORAGE_KEY
            ]);
            const cached = result[MODELS_CACHE_STORAGE_KEY];
            if (!cached || typeof cached !== "object") {
              return null;
            }
            return cached;
          } catch (error) {
            console.warn("Failed to read models cache:", error);
            return null;
          }
        }
        async function writeModelsCache(data) {
          var _a;
          try {
            if (
              typeof chrome === "undefined" ||
              !((_a =
                chrome === null || chrome === void 0
                  ? void 0
                  : chrome.storage) === null || _a === void 0
                ? void 0
                : _a.local)
            ) {
              return;
            }
            await chrome.storage.local.set({
              [MODELS_CACHE_STORAGE_KEY]: data
            });
          } catch (error) {
            console.warn("Failed to write models cache:", error);
          }
        }
        async function readProviderCatalogCache() {
          var _a;
          try {
            if (
              typeof chrome === "undefined" ||
              !((_a =
                chrome === null || chrome === void 0
                  ? void 0
                  : chrome.storage) === null || _a === void 0
                ? void 0
                : _a.local)
            ) {
              return null;
            }
            const result = await chrome.storage.local.get([
              PROVIDER_MODELS_CACHE_STORAGE_KEY
            ]);
            const cached = result[PROVIDER_MODELS_CACHE_STORAGE_KEY];
            if (!cached || typeof cached !== "object") {
              return null;
            }
            return cached;
          } catch (error) {
            console.warn("Failed to read provider catalog cache:", error);
            return null;
          }
        }
        async function mergeProviderCatalogCache(data) {
          const payload = await readProviderCatalogCache();
          if (!payload) return data;
          const merged = cloneModelsData(data);
          const now = Date.now();
          for (const entry of Object.values(payload)) {
            if (!entry || typeof entry !== "object") continue;
            const providerId = String(entry.providerId || "").trim();
            if (!providerId || !merged[providerId]) continue;
            const expiresAt = Number(entry.expiresAt || 0);
            if (expiresAt > 0 && expiresAt < now) continue;
            const cachedModels = Array.isArray(entry.models)
              ? entry.models
              : [];
            if (!cachedModels.length) continue;
            const nextModels = { ...merged[providerId].models };
            for (const descriptor of cachedModels) {
              const normalized = modelFromBridgeDescriptor(descriptor);
              if (!normalized.id) continue;
              nextModels[normalized.id] = normalized;
            }
            const nextProvider = merged[providerId];
            merged[providerId] = {
              ...nextProvider,
              models: projectProviderModels(nextProvider, nextModels)
            };
          }
          return merged;
        }
        async function fetchModelsData(options) {
          var _a, _b;
          const fallbackModels = await mergeProviderCatalogCache(
            cloneModelsData(DEFAULT_FALLBACK_MODELS)
          );
          if (
            (options === null || options === void 0 ? void 0 : options.lane) !==
            "OB_ONLINE_PULSE"
          ) {
            return fallbackModels;
          }
          try {
            const descriptors = await fetchBridgeModels(8000);
            if (!descriptors.length) {
              return fallbackModels;
            }
            const bridgeModels = {};
            for (const descriptor of descriptors) {
              const model = modelFromBridgeDescriptor(descriptor);
              if (!model.id) continue;
              bridgeModels[model.id] = model;
            }
            const data = {
              ...fallbackModels,
              "soca-bridge": {
                ...fallbackModels["soca-bridge"],
                models: projectProviderModels(fallbackModels["soca-bridge"], {
                  ...(((_a = fallbackModels["soca-bridge"]) === null ||
                  _a === void 0
                    ? void 0
                    : _a.models) || {}),
                  ...bridgeModels
                })
              },
              "vps-holo": {
                ...fallbackModels["vps-holo"],
                models: projectProviderModels(fallbackModels["vps-holo"], {
                  ...(((_b = fallbackModels["vps-holo"]) === null ||
                  _b === void 0
                    ? void 0
                    : _b.models) || {}),
                  ...bridgeModels
                })
              }
            };
            await writeModelsCache(data);
            return data;
          } catch (error) {
            console.error("Error fetching models:", error);
            const cached = await readModelsCache();
            if (cached) {
              return mergeProviderCatalogCache(cloneModelsData(cached));
            }
            return fallbackModels;
          }
        }
        /**
         * Check if a model supports image input (vision capabilities)
         */
        function supportsImageInput(model) {
          var _a, _b, _c, _d;
          return (
            ((_b =
              (_a = model.modalities) === null || _a === void 0
                ? void 0
                : _a.input) === null || _b === void 0
              ? void 0
              : _b.includes("image")) ||
            ((_d =
              (_c = model.modalities) === null || _c === void 0
                ? void 0
                : _c.input) === null || _d === void 0
              ? void 0
              : _d.includes("video")) ||
            false
          );
        }
        /**
         * Filter models that support image input
         */
        function filterImageSupportedModels(provider) {
          const filtered = {};
          for (const [modelId, model] of Object.entries(provider.models)) {
            if (supportsImageInput(model)) {
              filtered[modelId] = model;
            }
          }
          return filtered;
        }
        /**
         * Get all providers with at least one image-supporting model
         */
        function getProvidersWithImageSupport(data) {
          const filtered = {};
          for (const [providerId, provider] of Object.entries(data)) {
            const imageSupportedModels = filterImageSupportedModels(provider);
            if (Object.keys(imageSupportedModels).length > 0) {
              filtered[providerId] = {
                ...provider,
                models: imageSupportedModels
              };
            }
          }
          return filtered;
        }
        /**
         * Convert providers to dropdown options
         */
        function providersToOptions(providers) {
          return Object.entries(providers)
            .map(([id, provider]) => ({
              value: id,
              label: provider.name,
              api: provider.api,
              authModes: provider.authModes,
              modelSource: provider.modelSource,
              catalogMode: provider.catalogMode,
              requiresBaseURL: provider.requiresBaseURL,
              supportsLiveCatalog: provider.supportsLiveCatalog
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        }
        /**
         * Convert models to dropdown options
         */
        function modelsToOptions(models, providerId) {
          const options = Object.entries(models)
            .map(([id, model]) => ({
              value: id,
              label: model.name,
              provider: providerId
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
          if (providerId !== OPENROUTER_PROVIDER_ID) {
            return options;
          }
          return options.sort((a, b) => {
            const aPinned = a.value === "openrouter/auto" ? 0 : 1;
            const bPinned = b.value === "openrouter/auto" ? 0 : 1;
            if (aPinned !== bPinned) return aPinned - bPinned;
            return a.label.localeCompare(b.label);
          });
        }
        /**
         * Get default base URL for a provider
         */
        function getDefaultBaseURL(providerId, api) {
          // Use provider-advertised API base URL if available.
          if (api) {
            return api;
          }
          // Fallback to known defaults
          const defaults = {
            anthropic: "https://api.anthropic.com/v1",
            openai: "https://api.openai.com/v1",
            openrouter: "https://openrouter.ai/api/v1",
            google: "https://generativelanguage.googleapis.com/v1beta/openai",
            azure: "https://YOUR_RESOURCE_NAME.openai.azure.com",
            "opencode-zen": ""
          };
          return defaults[providerId] || "";
        }

        /***/
      },

    /***/ "./src/options/index.tsx":
      /*!*******************************!*\
  !*** ./src/options/index.tsx ***!
  \*******************************/
      /***/ (
        __unused_webpack_module,
        __webpack_exports__,
        __webpack_require__
      ) => {
        __webpack_require__.r(__webpack_exports__);
        /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ =
          __webpack_require__(
            /*! react */ "../node_modules/.pnpm/react@18.3.1/node_modules/react/index.js"
          );
        /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default =
          /*#__PURE__*/ __webpack_require__.n(
            react__WEBPACK_IMPORTED_MODULE_0__
          );
        /* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_1__ =
          __webpack_require__(
            /*! react-dom/client */ "../node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/client.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_2__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/alert/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_3__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/button/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_4__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/form/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_5__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/input/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_6__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/message/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_7__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/select/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_8__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/spin/index.js"
          );
        /* harmony import */ var antd__WEBPACK_IMPORTED_MODULE_9__ =
          __webpack_require__(
            /*! antd */ "../node_modules/.pnpm/antd@5.27.6_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/es/switch/index.js"
          );
        /* harmony import */ var _ant_design_icons__WEBPACK_IMPORTED_MODULE_10__ =
          __webpack_require__(
            /*! @ant-design/icons */ "../node_modules/.pnpm/@ant-design+icons@6.1.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@ant-design/icons/es/icons/LoadingOutlined.js"
          );
        /* harmony import */ var _ant_design_icons__WEBPACK_IMPORTED_MODULE_11__ =
          __webpack_require__(
            /*! @ant-design/icons */ "../node_modules/.pnpm/@ant-design+icons@6.1.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@ant-design/icons/es/icons/SaveOutlined.js"
          );
        /* harmony import */ var _sidebar_index_css__WEBPACK_IMPORTED_MODULE_12__ =
          __webpack_require__(
            /*! ../sidebar/index.css */ "./src/sidebar/index.css"
          );
        /* harmony import */ var _sidebar_providers_ThemeProvider__WEBPACK_IMPORTED_MODULE_13__ =
          __webpack_require__(
            /*! ../sidebar/providers/ThemeProvider */ "./src/sidebar/providers/ThemeProvider.tsx"
          );
        /* harmony import */ var _llm_llm__WEBPACK_IMPORTED_MODULE_14__ =
          __webpack_require__(/*! ../llm/llm */ "./src/llm/llm.ts");
        /* harmony import */ var _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__ =
          __webpack_require__(
            /*! ../llm/endpointPolicy */ "./src/llm/endpointPolicy.ts"
          );

        const { Option } = antd__WEBPACK_IMPORTED_MODULE_7__["default"];
        const SOCA_LANE_STORAGE_KEY = "socaOpenBrowserLane";
        const DEFAULT_SOCA_LANE = "OB_OFFLINE";
        const SOCA_PROVIDER_SECRETS_SESSION_KEY = "socaProviderSecretsSession";
        const SOCA_GOOGLE_OAUTH_SESSION_KEY = "socaGoogleOAuthSession";
        const GOOGLE_OAUTH_DEFAULT_SCOPE =
          "https://www.googleapis.com/auth/generative-language";
        const SOCA_PROVIDER_POLICY_MODE_KEY = "socaProviderPolicyMode";
        const SOCA_DIRECT_PROVIDER_GATE_KEY =
          "socaOpenBrowserAllowDirectProviders";
        const DEFAULT_PROVIDER_POLICY_MODE = "all_providers_bridge_governed";
        const SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY =
          "socaBridgeAutoFallbackOllama";
        const DIRECT_PROVIDER_HOST_PERMISSIONS = [
          "https://api.openai.com/*",
          "https://api.anthropic.com/*",
          "https://generativelanguage.googleapis.com/*",
          "https://openrouter.ai/*",
          "https://oauth2.googleapis.com/*",
          "https://*.openai.azure.com/*",
          "https://bedrock-runtime.*.amazonaws.com/*"
        ];
        const BRIDGE_ROUTED_PROVIDER_IDS = new Set(["soca-bridge", "vps-holo"]);
        const DIRECT_PROVIDER_IDS = new Set([
          "openai",
          "anthropic",
          "google",
          "openrouter",
          "opencode-zen",
          "azure",
          "bedrock"
        ]);
        function normalizeProviderPolicyMode(value) {
          return value === "local_only"
            ? "local_only"
            : "all_providers_bridge_governed";
        }
        function runtimeSendMessage(msg) {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(msg, (resp) => {
              const err = chrome.runtime.lastError;
              if (err) return reject(new Error(String(err.message || err)));
              resolve(resp);
            });
          });
        }
        function normalizeAuthMode(value) {
          return String(value || "")
            .trim()
            .toLowerCase() === "oauth"
            ? "oauth"
            : "api_key";
        }
        async function getProviderSessionSecret(providerId) {
          const key = String(providerId || "")
            .trim()
            .toLowerCase();
          if (!key) return "";
          const sess = await chrome.storage.session.get([
            SOCA_PROVIDER_SECRETS_SESSION_KEY
          ]);
          const map =
            (sess === null || sess === void 0
              ? void 0
              : sess[SOCA_PROVIDER_SECRETS_SESSION_KEY]) || {};
          return String(
            (map === null || map === void 0 ? void 0 : map[key]) || ""
          ).trim();
        }
        async function setProviderSessionSecret(providerId, secret) {
          const key = String(providerId || "")
            .trim()
            .toLowerCase();
          if (!key) return;
          const sess = await chrome.storage.session.get([
            SOCA_PROVIDER_SECRETS_SESSION_KEY
          ]);
          const map = {
            ...((sess === null || sess === void 0
              ? void 0
              : sess[SOCA_PROVIDER_SECRETS_SESSION_KEY]) || {})
          };
          const value = String(secret || "").trim();
          if (value) {
            map[key] = value;
          } else {
            delete map[key];
          }
          await chrome.storage.session.set({
            [SOCA_PROVIDER_SECRETS_SESSION_KEY]: map
          });
        }
        // isLocalBaseURL is delegated to endpoint policy, including
        // localhost/private/Tailscale (.ts.net and 100.64-127.x) addresses.
        const isLocalBaseURL =
          _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.isTrustedBridgeURL;
        async function ensureOriginPermission(baseURL) {
          var _a, _b;
          if (
            !((_a = chrome.permissions) === null || _a === void 0
              ? void 0
              : _a.contains) ||
            !((_b = chrome.permissions) === null || _b === void 0
              ? void 0
              : _b.request)
          )
            return true;
          let originPattern = "";
          try {
            const url = new URL(baseURL);
            if (url.protocol !== "http:" && url.protocol !== "https:")
              return false;
            originPattern = `${url.origin}/*`;
          } catch {
            return false;
          }
          const hasPermission = await new Promise((resolve) => {
            var _a;
            (_a = chrome.permissions) === null || _a === void 0
              ? void 0
              : _a.contains({ origins: [originPattern] }, (result) =>
                  resolve(Boolean(result))
                );
          });
          if (hasPermission) return true;
          const granted = await new Promise((resolve) => {
            var _a;
            (_a = chrome.permissions) === null || _a === void 0
              ? void 0
              : _a.request({ origins: [originPattern] }, (result) =>
                  resolve(Boolean(result))
                );
          });
          return granted;
        }
        const OptionsPage = () => {
          var _a;
          const [form] = antd__WEBPACK_IMPORTED_MODULE_4__["default"].useForm();
          const [laneLoaded, setLaneLoaded] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
          const [socaOpenBrowserLane, setSocaOpenBrowserLane] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(DEFAULT_SOCA_LANE);
          const [configLoaded, setConfigLoaded] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
          const [providerPolicyMode, setProviderPolicyMode] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(
            DEFAULT_PROVIDER_POLICY_MODE
          );
          const [autoFallbackOllama, setAutoFallbackOllama] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(true);
          const [useCustomModelName, setUseCustomModelName] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
          const [bridgeStatus, setBridgeStatus] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)({
            state: "idle",
            message: ""
          });
          const [config, setConfig] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)({
            llm: "ollama",
            authMode: "api_key",
            oauthClientId: "",
            oauthScopes: GOOGLE_OAUTH_DEFAULT_SCOPE,
            apiKey: "",
            modelName: "qwen3-vl:2b",
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: "http://127.0.0.1:11434/v1"
            }
          });
          const [historyLLMConfig, setHistoryLLMConfig] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)({});
          const [loading, setLoading] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(true);
          const [oauthLoading, setOauthLoading] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
          const [googleOAuthStatus, setGoogleOAuthStatus] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)({
            connected: false,
            expiresAt: 0,
            issuedAt: 0,
            scope: GOOGLE_OAUTH_DEFAULT_SCOPE
          });
          const [refreshingModels, setRefreshingModels] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
          const [modelsCacheStatus, setModelsCacheStatus] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)("");
          const [providersData, setProvidersData] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)({});
          const [providerOptions, setProviderOptions] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)([]);
          const [modelOptions, setModelOptions] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)({});
          const [modelSearchValue, setModelSearchValue] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)("");
          const [isDarkMode, setIsDarkMode] = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useState)(
            window.matchMedia("(prefers-color-scheme: dark)").matches
          );
          const watchedProvider = antd__WEBPACK_IMPORTED_MODULE_4__[
            "default"
          ].useWatch("llm", form);
          const watchedAuthMode = antd__WEBPACK_IMPORTED_MODULE_4__[
            "default"
          ].useWatch("authMode", form);
          const watchedBaseURL = antd__WEBPACK_IMPORTED_MODULE_4__[
            "default"
          ].useWatch(["options", "baseURL"], form);
          // Listen for theme changes
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            const mediaQuery = window.matchMedia(
              "(prefers-color-scheme: dark)"
            );
            const handleChange = (e) => setIsDarkMode(e.matches);
            mediaQuery.addEventListener("change", handleChange);
            return () => mediaQuery.removeEventListener("change", handleChange);
          }, []);
          // Update favicon based on theme
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            const favicon = document.getElementById("favicon");
            if (favicon) {
              favicon.href = isDarkMode ? "/icon_dark.png" : "/icon_light.png";
            }
          }, [isDarkMode]);
          // Load lane on mount
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            const loadLane = async () => {
              try {
                const laneResult = await chrome.storage.local.get([
                  SOCA_LANE_STORAGE_KEY
                ]);
                const lane =
                  laneResult[SOCA_LANE_STORAGE_KEY] || DEFAULT_SOCA_LANE;
                setSocaOpenBrowserLane(lane);
                form.setFieldsValue({ [SOCA_LANE_STORAGE_KEY]: lane });
              } catch (error) {
                console.error("Failed to load lane:", error);
                antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                  "Failed to load lane. Please refresh the page."
                );
              }
            };
            loadLane().finally(() => setLaneLoaded(true));
          }, []);
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            const loadProviderPolicyState = async () => {
              try {
                const runtimeState = await runtimeSendMessage({
                  type: "SOCA_GET_PROVIDER_POLICY_STATE"
                });
                if (
                  runtimeState === null || runtimeState === void 0
                    ? void 0
                    : runtimeState.ok
                ) {
                  setProviderPolicyMode(
                    normalizeProviderPolicyMode(runtimeState.mode)
                  );
                  setAutoFallbackOllama(
                    runtimeState.autoFallbackOllama !== false
                  );
                  return;
                }
              } catch (error) {
                console.warn(
                  "Failed to load provider policy state from runtime:",
                  error
                );
              }
              // Fallback path when runtime bridge API is unavailable.
              try {
                const result = await chrome.storage.local.get([
                  SOCA_PROVIDER_POLICY_MODE_KEY,
                  SOCA_DIRECT_PROVIDER_GATE_KEY,
                  SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY
                ]);
                const storedMode = result[SOCA_PROVIDER_POLICY_MODE_KEY];
                let mode = normalizeProviderPolicyMode(storedMode);
                if (
                  storedMode !== "local_only" &&
                  storedMode !== "all_providers_bridge_governed"
                ) {
                  const legacy = result[SOCA_DIRECT_PROVIDER_GATE_KEY];
                  if (typeof legacy === "boolean") {
                    mode = legacy
                      ? "all_providers_bridge_governed"
                      : "local_only";
                  }
                }
                setProviderPolicyMode(mode);
                setAutoFallbackOllama(
                  result[SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY] !== false
                );
              } catch (error) {
                console.warn("Failed to load provider policy state:", error);
              }
            };
            loadProviderPolicyState();
          }, []);
          // Fetch models data whenever lane changes
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            if (!laneLoaded) return;
            const loadModels = async () => {
              try {
                setLoading(true);
                const data = await (0,
                _llm_llm__WEBPACK_IMPORTED_MODULE_14__.fetchModelsData)({
                  lane: socaOpenBrowserLane
                });
                const imageProviders = (0,
                _llm_llm__WEBPACK_IMPORTED_MODULE_14__.getProvidersWithImageSupport)(
                  data
                );
                const filteredProviders = Object.fromEntries(
                  Object.entries(imageProviders).filter(([, provider]) => {
                    if (
                      providerPolicyMode === "all_providers_bridge_governed"
                    ) {
                      return true;
                    }
                    return provider.catalogMode !== "cloud_only";
                  })
                );
                setProvidersData(filteredProviders);
                setProviderOptions(
                  (0,
                  _llm_llm__WEBPACK_IMPORTED_MODULE_14__.providersToOptions)(
                    filteredProviders
                  )
                );
                // Convert all provider models to options
                const allModelOptions = {};
                Object.entries(filteredProviders).forEach(
                  ([providerId, provider]) => {
                    allModelOptions[providerId] = (0,
                    _llm_llm__WEBPACK_IMPORTED_MODULE_14__.modelsToOptions)(
                      provider.models,
                      providerId
                    );
                  }
                );
                setModelOptions(allModelOptions);
              } catch (error) {
                console.error("Failed to load models:", error);
                antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                  "Failed to load models. Please refresh the page."
                );
              } finally {
                setLoading(false);
              }
            };
            loadModels();
          }, [laneLoaded, socaOpenBrowserLane, providerPolicyMode]);
          // Load saved config from storage
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            if (!laneLoaded) return;
            if (Object.keys(providersData).length === 0) return; // Wait for providers to load
            const loadSavedConfig = async () => {
              var _a,
                _b,
                _c,
                _d,
                _e,
                _f,
                _g,
                _h,
                _j,
                _k,
                _l,
                _m,
                _o,
                _p,
                _q,
                _r,
                _s,
                _t,
                _u;
              form.setFieldsValue({
                [SOCA_LANE_STORAGE_KEY]: socaOpenBrowserLane
              });
              const fallbackProviderId =
                ((_a = Object.entries(providersData)
                  .map(([id, provider]) => ({ id, name: provider.name }))
                  .sort((a, b) => a.name.localeCompare(b.name))[0]) === null ||
                _a === void 0
                  ? void 0
                  : _a.id) || "ollama";
              if (!configLoaded) {
                const result = await chrome.storage.local.get([
                  "llmConfig",
                  "historyLLMConfig",
                  "socaBridgeConfig"
                ]);
                if (result.historyLLMConfig) {
                  setHistoryLLMConfig(result.historyLLMConfig);
                }
                if (result.llmConfig) {
                  const nextConfig = {
                    ...result.llmConfig,
                    authMode: normalizeAuthMode(
                      (_b = result.llmConfig) === null || _b === void 0
                        ? void 0
                        : _b.authMode
                    ),
                    oauthClientId: String(
                      ((_c = result.llmConfig) === null || _c === void 0
                        ? void 0
                        : _c.oauthClientId) || ""
                    ).trim(),
                    oauthScopes: String(
                      ((_d = result.llmConfig) === null || _d === void 0
                        ? void 0
                        : _d.oauthScopes) || GOOGLE_OAUTH_DEFAULT_SCOPE
                    )
                      .trim()
                      .replace(/\s+/g, " ")
                  };
                  if (nextConfig.llm === "") {
                    nextConfig.llm = fallbackProviderId;
                  }
                  if (!providersData[nextConfig.llm]) {
                    nextConfig.llm = fallbackProviderId;
                  }
                  if (!nextConfig.npm && providersData[nextConfig.llm]) {
                    nextConfig.npm = providersData[nextConfig.llm].npm;
                  }
                  if (
                    !nextConfig.modelName ||
                    !((_e = modelOptions[nextConfig.llm]) === null ||
                    _e === void 0
                      ? void 0
                      : _e.some((m) => m.value === nextConfig.modelName))
                  ) {
                    nextConfig.modelName =
                      ((_g =
                        (_f = modelOptions[nextConfig.llm]) === null ||
                        _f === void 0
                          ? void 0
                          : _f[0]) === null || _g === void 0
                        ? void 0
                        : _g.value) || "";
                  }
                  if (
                    !((_h = nextConfig.options) === null || _h === void 0
                      ? void 0
                      : _h.baseURL)
                  ) {
                    nextConfig.options = {
                      ...nextConfig.options,
                      baseURL: (0,
                      _llm_llm__WEBPACK_IMPORTED_MODULE_14__.getDefaultBaseURL)(
                        nextConfig.llm,
                        (_j = providersData[nextConfig.llm]) === null ||
                          _j === void 0
                          ? void 0
                          : _j.api
                      )
                    };
                  }
                  const isBridgeRoutedProvider = BRIDGE_ROUTED_PROVIDER_IDS.has(
                    String(nextConfig.llm || "")
                  );
                  if (
                    isBridgeRoutedProvider &&
                    typeof ((_k = result.socaBridgeConfig) === null ||
                    _k === void 0
                      ? void 0
                      : _k.bridgeBaseURL) === "string" &&
                    result.socaBridgeConfig.bridgeBaseURL.trim()
                  ) {
                    nextConfig.options = {
                      ...nextConfig.options,
                      baseURL: `${result.socaBridgeConfig.bridgeBaseURL.replace(/\/+$/, "")}/v1`
                    };
                  } else if (
                    isBridgeRoutedProvider &&
                    !isLocalBaseURL(
                      String(
                        ((_l = nextConfig.options) === null || _l === void 0
                          ? void 0
                          : _l.baseURL) || ""
                      )
                    )
                  ) {
                    nextConfig.options = {
                      ...nextConfig.options,
                      baseURL: "http://127.0.0.1:9834/v1"
                    };
                  }
                  // Never persist provider secrets in local state.
                  nextConfig.apiKey = "";
                  setConfig(nextConfig);
                  form.setFieldsValue(nextConfig);
                  const selectedProvider = String(nextConfig.llm || "");
                  if (selectedProvider === "google") {
                    try {
                      const oauthStatus = await runtimeSendMessage({
                        type: "SOCA_OAUTH_GOOGLE_STATUS"
                      });
                      if (
                        oauthStatus === null || oauthStatus === void 0
                          ? void 0
                          : oauthStatus.ok
                      ) {
                        setGoogleOAuthStatus({
                          connected: Boolean(
                            (_m =
                              oauthStatus === null || oauthStatus === void 0
                                ? void 0
                                : oauthStatus.data) === null || _m === void 0
                              ? void 0
                              : _m.connected
                          ),
                          expiresAt: Number(
                            ((_o =
                              oauthStatus === null || oauthStatus === void 0
                                ? void 0
                                : oauthStatus.data) === null || _o === void 0
                              ? void 0
                              : _o.expiresAt) || 0
                          ),
                          issuedAt: Number(
                            ((_p =
                              oauthStatus === null || oauthStatus === void 0
                                ? void 0
                                : oauthStatus.data) === null || _p === void 0
                              ? void 0
                              : _p.issuedAt) || 0
                          ),
                          scope:
                            String(
                              ((_q =
                                oauthStatus === null || oauthStatus === void 0
                                  ? void 0
                                  : oauthStatus.data) === null || _q === void 0
                                ? void 0
                                : _q.scope) || ""
                            ).trim() || GOOGLE_OAUTH_DEFAULT_SCOPE
                        });
                      }
                    } catch {
                      // ignore oauth status failures during bootstrap
                    }
                  }
                }
                // Session-only secret prefill (never persisted).
                try {
                  const selectedProvider = String(
                    ((_r = result.llmConfig) === null || _r === void 0
                      ? void 0
                      : _r.llm) || ""
                  );
                  if (BRIDGE_ROUTED_PROVIDER_IDS.has(selectedProvider)) {
                    const sess = await chrome.storage.session.get([
                      "socaBridgeToken"
                    ]);
                    if (
                      sess === null || sess === void 0
                        ? void 0
                        : sess.socaBridgeToken
                    ) {
                      form.setFieldValue(
                        "apiKey",
                        String(sess.socaBridgeToken)
                      );
                    }
                  } else if (selectedProvider) {
                    const secret =
                      await getProviderSessionSecret(selectedProvider);
                    if (secret) {
                      form.setFieldValue("apiKey", secret);
                    }
                  }
                } catch (e) {
                  // ignore
                }
                setConfigLoaded(true);
                return;
              }
              // On lane/provider refresh: only adjust config if it's now invalid.
              if (!providersData[config.llm]) {
                handleLLMChange(fallbackProviderId);
                return;
              }
              if (
                config.modelName &&
                !((_s = modelOptions[config.llm]) === null || _s === void 0
                  ? void 0
                  : _s.some((m) => m.value === config.modelName))
              ) {
                const nextModel =
                  ((_u =
                    (_t = modelOptions[config.llm]) === null || _t === void 0
                      ? void 0
                      : _t[0]) === null || _u === void 0
                    ? void 0
                    : _u.value) || "";
                const nextConfig = { ...config, modelName: nextModel };
                setConfig(nextConfig);
                form.setFieldsValue(nextConfig);
              }
            };
            loadSavedConfig().catch((error) => {
              console.error("Failed to load saved config:", error);
            });
          }, [
            laneLoaded,
            providersData,
            configLoaded,
            socaOpenBrowserLane,
            config,
            modelOptions
          ]);
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            if (!configLoaded) return;
            const options = modelOptions[config.llm] || [];
            const isCustom =
              Boolean(config.modelName) &&
              !options.some((m) => m.value === config.modelName);
            setUseCustomModelName(isCustom);
          }, [configLoaded, config.llm, config.modelName, modelOptions]);
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            setBridgeStatus({ state: "idle", message: "" });
            setModelsCacheStatus("");
          }, [watchedProvider, config.llm]);
          (0, react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
            const provider = String(watchedProvider || config.llm || "");
            const authMode = normalizeAuthMode(
              watchedAuthMode || config.authMode
            );
            if (provider !== "google" || authMode !== "oauth") return;
            runtimeSendMessage({
              type: "SOCA_OAUTH_GOOGLE_STATUS"
            })
              .then((resp) => {
                var _a, _b, _c, _d;
                if (!(resp === null || resp === void 0 ? void 0 : resp.ok))
                  return;
                setGoogleOAuthStatus({
                  connected: Boolean(
                    (_a =
                      resp === null || resp === void 0 ? void 0 : resp.data) ===
                      null || _a === void 0
                      ? void 0
                      : _a.connected
                  ),
                  expiresAt: Number(
                    ((_b =
                      resp === null || resp === void 0 ? void 0 : resp.data) ===
                      null || _b === void 0
                      ? void 0
                      : _b.expiresAt) || 0
                  ),
                  issuedAt: Number(
                    ((_c =
                      resp === null || resp === void 0 ? void 0 : resp.data) ===
                      null || _c === void 0
                      ? void 0
                      : _c.issuedAt) || 0
                  ),
                  scope:
                    String(
                      ((_d =
                        resp === null || resp === void 0
                          ? void 0
                          : resp.data) === null || _d === void 0
                        ? void 0
                        : _d.scope) || ""
                    ).trim() || GOOGLE_OAUTH_DEFAULT_SCOPE
                });
              })
              .catch(() => {});
          }, [watchedProvider, watchedAuthMode, config.llm, config.authMode]);
          const handleSocaLaneChange = (lane) => {
            setSocaOpenBrowserLane(lane);
          };
          const handleProviderPolicyToggle = async (next) => {
            var _a;
            try {
              const nextMode = next
                ? "all_providers_bridge_governed"
                : "local_only";
              if (next) {
                const granted = await new Promise((resolve) => {
                  var _a;
                  if (
                    !((_a = chrome.permissions) === null || _a === void 0
                      ? void 0
                      : _a.request)
                  )
                    return resolve(true);
                  chrome.permissions.request(
                    { origins: DIRECT_PROVIDER_HOST_PERMISSIONS },
                    (result) => resolve(Boolean(result))
                  );
                });
                if (!granted) {
                  antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                    "Direct provider permissions were denied."
                  );
                  return;
                }
              }
              if (
                !next &&
                ((_a = chrome.permissions) === null || _a === void 0
                  ? void 0
                  : _a.remove)
              ) {
                await new Promise((resolve) => {
                  var _a;
                  (_a = chrome.permissions) === null || _a === void 0
                    ? void 0
                    : _a.remove(
                        { origins: DIRECT_PROVIDER_HOST_PERMISSIONS },
                        () => resolve()
                      );
                });
              }
              setProviderPolicyMode(nextMode);
              await chrome.storage.local.set({
                [SOCA_PROVIDER_POLICY_MODE_KEY]: nextMode,
                [SOCA_DIRECT_PROVIDER_GATE_KEY]:
                  nextMode === "all_providers_bridge_governed"
              });
              await runtimeSendMessage({
                type: "SOCA_SET_PROVIDER_POLICY_MODE",
                mode: nextMode
              });
              await runtimeSendMessage({ type: "SOCA_REFRESH_DNR" });
            } catch (error) {
              console.error("Failed to update provider policy mode:", error);
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                "Failed to update provider policy mode."
              );
            }
          };
          const handleAutoFallbackToggle = async (next) => {
            try {
              setAutoFallbackOllama(next);
              await chrome.storage.local.set({
                [SOCA_BRIDGE_AUTO_FALLBACK_OLLAMA_KEY]: next
              });
              await runtimeSendMessage({
                type: "SOCA_SET_BRIDGE_AUTO_FALLBACK_OLLAMA",
                enabled: next
              });
            } catch (error) {
              console.error("Failed to update bridge fallback setting:", error);
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                "Failed to update bridge fallback setting."
              );
            }
          };
          const applyProviderModels = (providerId, models) => {
            if (!providerId || !providersData[providerId]) return [];
            const provider = providersData[providerId];
            const nextProviderModels = {
              ...provider.models
            };
            const catalogMode = provider.catalogMode || "local_only";
            for (const m of models || []) {
              const id = String(
                (m === null || m === void 0 ? void 0 : m.id) || ""
              ).trim();
              if (!id) continue;
              const origin = String(
                (m === null || m === void 0 ? void 0 : m.model_origin) || ""
              )
                .trim()
                .toLowerCase();
              if (catalogMode === "local_only" && origin === "cloud") continue;
              if (catalogMode === "cloud_only" && origin && origin !== "cloud")
                continue;
              const name =
                String(
                  (m === null || m === void 0 ? void 0 : m.name) || id
                ).trim() || id;
              const input = Array.isArray(
                m === null || m === void 0 ? void 0 : m.input_modalities
              )
                ? m.input_modalities.map((v) => String(v))
                : ["text", "image"];
              const output = Array.isArray(
                m === null || m === void 0 ? void 0 : m.output_modalities
              )
                ? m.output_modalities.map((v) => String(v))
                : ["text"];
              const normalizedOrigin =
                origin === "cloud" ||
                origin === "vps_holo" ||
                origin === "local"
                  ? origin
                  : catalogMode === "cloud_only"
                    ? "cloud"
                    : "local";
              nextProviderModels[id] = {
                id,
                name,
                modelOrigin: normalizedOrigin,
                modalities: {
                  input,
                  output
                }
              };
            }
            const nextProviders = {
              ...providersData,
              [providerId]: {
                ...provider,
                models: nextProviderModels
              }
            };
            const nextOptions = (0,
            _llm_llm__WEBPACK_IMPORTED_MODULE_14__.modelsToOptions)(
              nextProviderModels,
              providerId
            );
            setProvidersData(nextProviders);
            setModelOptions({
              ...modelOptions,
              [providerId]: nextOptions
            });
            return nextOptions;
          };
          const handleRefreshModels = async (force = true) => {
            var _a;
            const providerId = String(
              form.getFieldValue("llm") || config.llm || ""
            ).trim();
            if (!providerId) return;
            try {
              setRefreshingModels(true);
              setModelsCacheStatus("");
              const authMode = normalizeAuthMode(
                form.getFieldValue("authMode") || config.authMode
              );
              const baseURL = String(
                form.getFieldValue(["options", "baseURL"]) ||
                  ((_a = config.options) === null || _a === void 0
                    ? void 0
                    : _a.baseURL) ||
                  ""
              ).trim();
              const resp = await runtimeSendMessage({
                type: "SOCA_PROVIDER_MODELS_REFRESH",
                providerId,
                authMode,
                baseURL,
                force
              });
              if (!(resp === null || resp === void 0 ? void 0 : resp.ok)) {
                throw new Error(
                  String(
                    (resp === null || resp === void 0 ? void 0 : resp.err) ||
                      "provider_models_refresh_failed"
                  )
                );
              }
              const data =
                (resp === null || resp === void 0 ? void 0 : resp.data) || {};
              const models = Array.isArray(data.models) ? data.models : [];
              const nextOptions = applyProviderModels(providerId, models);
              const updatedAt = Number(data.updatedAt || Date.now());
              const expiresAt = Number(data.expiresAt || updatedAt);
              const source = data.fromCache ? "cache" : "live";
              const ttlSec = Math.max(
                0,
                Math.round((expiresAt - Date.now()) / 1000)
              );
              setModelsCacheStatus(
                `Models loaded from ${source}. ${models.length} entries. Cache TTL ~${ttlSec}s.`
              );
              if (providerId === String(form.getFieldValue("llm") || "")) {
                const currentModel = String(
                  form.getFieldValue("modelName") || ""
                );
                if (
                  nextOptions.length &&
                  !nextOptions.some((m) => m.value === currentModel)
                ) {
                  form.setFieldValue("modelName", nextOptions[0].value);
                }
              }
            } catch (error) {
              setModelsCacheStatus("");
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                String(
                  (error === null || error === void 0
                    ? void 0
                    : error.message) ||
                    error ||
                    "Model refresh failed"
                )
              );
            } finally {
              setRefreshingModels(false);
            }
          };
          const handleGoogleOAuthConnect = async () => {
            var _a, _b, _c, _d;
            try {
              setOauthLoading(true);
              const clientId = String(
                form.getFieldValue("oauthClientId") || ""
              ).trim();
              const scopes = String(
                form.getFieldValue("oauthScopes") || GOOGLE_OAUTH_DEFAULT_SCOPE
              )
                .trim()
                .replace(/\s+/g, " ");
              if (!clientId) {
                throw new Error("Google OAuth Client ID is required.");
              }
              const resp = await runtimeSendMessage({
                type: "SOCA_OAUTH_GOOGLE_START",
                clientId,
                scopes
              });
              if (!(resp === null || resp === void 0 ? void 0 : resp.ok)) {
                throw new Error(
                  String(
                    (resp === null || resp === void 0 ? void 0 : resp.err) ||
                      "google_oauth_start_failed"
                  )
                );
              }
              const statusResp = await runtimeSendMessage({
                type: "SOCA_OAUTH_GOOGLE_STATUS"
              });
              if (
                statusResp === null || statusResp === void 0
                  ? void 0
                  : statusResp.ok
              ) {
                setGoogleOAuthStatus({
                  connected: Boolean(
                    (_a =
                      statusResp === null || statusResp === void 0
                        ? void 0
                        : statusResp.data) === null || _a === void 0
                      ? void 0
                      : _a.connected
                  ),
                  expiresAt: Number(
                    ((_b =
                      statusResp === null || statusResp === void 0
                        ? void 0
                        : statusResp.data) === null || _b === void 0
                      ? void 0
                      : _b.expiresAt) || 0
                  ),
                  issuedAt: Number(
                    ((_c =
                      statusResp === null || statusResp === void 0
                        ? void 0
                        : statusResp.data) === null || _c === void 0
                      ? void 0
                      : _c.issuedAt) || 0
                  ),
                  scope:
                    String(
                      ((_d =
                        statusResp === null || statusResp === void 0
                          ? void 0
                          : statusResp.data) === null || _d === void 0
                        ? void 0
                        : _d.scope) || ""
                    ).trim() || GOOGLE_OAUTH_DEFAULT_SCOPE
                });
              }
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].success(
                "Google OAuth connected for this browser session."
              );
            } catch (error) {
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                String(
                  (error === null || error === void 0
                    ? void 0
                    : error.message) ||
                    error ||
                    "Google OAuth failed."
                )
              );
            } finally {
              setOauthLoading(false);
            }
          };
          const handleGoogleOAuthClear = async () => {
            try {
              setOauthLoading(true);
              const resp = await runtimeSendMessage({
                type: "SOCA_OAUTH_GOOGLE_CLEAR"
              });
              if (!(resp === null || resp === void 0 ? void 0 : resp.ok)) {
                throw new Error(
                  String(
                    (resp === null || resp === void 0 ? void 0 : resp.err) ||
                      "google_oauth_clear_failed"
                  )
                );
              }
              await chrome.storage.session.remove([
                SOCA_GOOGLE_OAUTH_SESSION_KEY
              ]);
              setGoogleOAuthStatus({
                connected: false,
                expiresAt: 0,
                issuedAt: 0,
                scope: GOOGLE_OAUTH_DEFAULT_SCOPE
              });
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].success(
                "Google OAuth token cleared for this browser session."
              );
            } catch (error) {
              antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                String(
                  (error === null || error === void 0
                    ? void 0
                    : error.message) ||
                    error ||
                    "Failed to clear Google OAuth token."
                )
              );
            } finally {
              setOauthLoading(false);
            }
          };
          const handleSave = () => {
            (async () => {
              var _a, _b, _c, _d;
              try {
                const value = await form.validateFields();
                const { socaOpenBrowserLane, ...llmConfigValue } = value;
                const lane = socaOpenBrowserLane || DEFAULT_SOCA_LANE;
                const allProvidersEnabled =
                  providerPolicyMode === "all_providers_bridge_governed";
                const providerId = String(llmConfigValue.llm || "").trim();
                const authMode = normalizeAuthMode(llmConfigValue.authMode);
                llmConfigValue.authMode = authMode;
                llmConfigValue.oauthClientId = String(
                  llmConfigValue.oauthClientId || ""
                ).trim();
                llmConfigValue.oauthScopes = String(
                  llmConfigValue.oauthScopes || GOOGLE_OAUTH_DEFAULT_SCOPE
                )
                  .trim()
                  .replace(/\s+/g, " ");
                const baseURL = String(
                  ((_a =
                    llmConfigValue === null || llmConfigValue === void 0
                      ? void 0
                      : llmConfigValue.options) === null || _a === void 0
                    ? void 0
                    : _a.baseURL) || ""
                ).trim();
                const normalizedBaseURL = (0,
                _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.normalizeBaseURL)(
                  baseURL
                );
                if (normalizedBaseURL) {
                  const providerMeta = providersData[providerId];
                  const providerNpm = String(
                    (providerMeta === null || providerMeta === void 0
                      ? void 0
                      : providerMeta.npm) ||
                      llmConfigValue.npm ||
                      ""
                  );
                  const bridgeRouted =
                    BRIDGE_ROUTED_PROVIDER_IDS.has(providerId);
                  const isCompatProvider =
                    providerNpm === "@ai-sdk/openai-compatible";
                  const compatLocal =
                    isCompatProvider && isLocalBaseURL(normalizedBaseURL);
                  const isDirectProvider =
                    (!bridgeRouted && DIRECT_PROVIDER_IDS.has(providerId)) ||
                    (isCompatProvider && !compatLocal);
                  if (isDirectProvider && !allProvidersEnabled) {
                    throw new Error(
                      "Cloud providers are disabled by policy mode. Enable 'All providers' to continue."
                    );
                  }
                  if (bridgeRouted && !isLocalBaseURL(normalizedBaseURL)) {
                    throw new Error(
                      "Bridge URL must be localhost/private IP/Tailscale (*.ts.net or 100.64.0.0/10)."
                    );
                  }
                  if (
                    isDirectProvider &&
                    !compatLocal &&
                    !(0,
                    _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.isAllowedDirectURL)(
                      normalizedBaseURL
                    )
                  ) {
                    throw new Error(
                      "Direct provider Base URL must use https:// and a public host."
                    );
                  }
                  const granted =
                    await ensureOriginPermission(normalizedBaseURL);
                  if (!granted) {
                    throw new Error(
                      "Host permission required for this Base URL. Please allow the permission prompt."
                    );
                  }
                  llmConfigValue.options = {
                    ...llmConfigValue.options,
                    baseURL: normalizedBaseURL
                  };
                }
                // Session-only bridge token (never persisted to chrome.storage.local).
                if (BRIDGE_ROUTED_PROVIDER_IDS.has(providerId)) {
                  const token = String(llmConfigValue.apiKey || "").trim();
                  const r1 = await runtimeSendMessage({
                    type: "SOCA_SET_BRIDGE_TOKEN",
                    token
                  });
                  if (!(r1 === null || r1 === void 0 ? void 0 : r1.ok))
                    throw new Error(
                      String(
                        (r1 === null || r1 === void 0 ? void 0 : r1.err) ||
                          "failed_to_set_bridge_token"
                      )
                    );
                  const currentBaseURL = String(
                    ((_b =
                      llmConfigValue === null || llmConfigValue === void 0
                        ? void 0
                        : llmConfigValue.options) === null || _b === void 0
                      ? void 0
                      : _b.baseURL) || ""
                  ).trim();
                  const loadedBridgeCfg = await chrome.storage.local.get([
                    "socaBridgeConfig"
                  ]);
                  const previousBridgeBaseURL = String(
                    ((_c =
                      loadedBridgeCfg === null || loadedBridgeCfg === void 0
                        ? void 0
                        : loadedBridgeCfg.socaBridgeConfig) === null ||
                    _c === void 0
                      ? void 0
                      : _c.bridgeBaseURL) || "http://127.0.0.1:9834"
                  ).trim();
                  const bridgeCandidates = (0,
                  _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.buildBridgeCandidates)(
                    {
                      savedBaseURL: currentBaseURL,
                      fallbackBaseURL: `${previousBridgeBaseURL}/v1`
                    }
                  );
                  const bridgeV1BaseURL = bridgeCandidates[0];
                  const bridgeBaseURL = bridgeV1BaseURL
                    .replace(/\/+$/, "")
                    .replace(/\/v1$/, "");
                  const r2 = await runtimeSendMessage({
                    type: "SOCA_SET_BRIDGE_CONFIG",
                    config: { bridgeBaseURL, dnrGuardrailsEnabled: true }
                  });
                  if (!(r2 === null || r2 === void 0 ? void 0 : r2.ok))
                    throw new Error(
                      String(
                        (r2 === null || r2 === void 0 ? void 0 : r2.err) ||
                          "failed_to_set_bridge_config"
                      )
                    );
                  llmConfigValue.options = {
                    ...llmConfigValue.options,
                    baseURL: `${bridgeBaseURL.replace(/\/+$/, "")}/v1`
                  };
                  await setProviderSessionSecret(providerId, token);
                } else {
                  const token = String(llmConfigValue.apiKey || "").trim();
                  const providerNpm = String(llmConfigValue.npm || "").trim();
                  const isCompatProvider =
                    providerNpm === "@ai-sdk/openai-compatible";
                  const isCompatLocal =
                    isCompatProvider && isLocalBaseURL(baseURL);
                  const isDirectProvider =
                    DIRECT_PROVIDER_IDS.has(providerId) ||
                    (isCompatProvider && !isCompatLocal);
                  if (isDirectProvider && authMode === "api_key" && !token) {
                    throw new Error("API key required for this provider.");
                  }
                  if (providerId === "google" && authMode === "oauth") {
                    if (!llmConfigValue.oauthClientId) {
                      throw new Error("Google OAuth Client ID is required.");
                    }
                    const oauthStatus = await runtimeSendMessage({
                      type: "SOCA_OAUTH_GOOGLE_STATUS"
                    });
                    if (
                      !(oauthStatus === null || oauthStatus === void 0
                        ? void 0
                        : oauthStatus.ok) ||
                      !((_d =
                        oauthStatus === null || oauthStatus === void 0
                          ? void 0
                          : oauthStatus.data) === null || _d === void 0
                        ? void 0
                        : _d.connected)
                    ) {
                      throw new Error(
                        "Google OAuth token missing. Click Connect before saving."
                      );
                    }
                  }
                  if (
                    providerId === "opencode-zen" &&
                    authMode === "oauth" &&
                    !token
                  ) {
                    throw new Error(
                      "OAuth bearer token required for Opencode Zen token mode."
                    );
                  }
                  await setProviderSessionSecret(providerId, token);
                }
                // Persist non-secret config only.
                llmConfigValue.apiKey = "";
                setConfig(llmConfigValue);
                setHistoryLLMConfig({
                  ...historyLLMConfig,
                  [llmConfigValue.llm]: llmConfigValue
                });
                setSocaOpenBrowserLane(lane);
                await chrome.storage.local.set({
                  llmConfig: llmConfigValue,
                  historyLLMConfig: {
                    ...historyLLMConfig,
                    [llmConfigValue.llm]: llmConfigValue
                  },
                  [SOCA_LANE_STORAGE_KEY]: lane
                });
                await runtimeSendMessage({ type: "SOCA_REFRESH_DNR" });
                antd__WEBPACK_IMPORTED_MODULE_6__["default"].success({
                  content: "Save Success!",
                  className: "toast-text-black"
                });
              } catch (e) {
                antd__WEBPACK_IMPORTED_MODULE_6__["default"].error(
                  String(
                    (e === null || e === void 0 ? void 0 : e.message) ||
                      e ||
                      "Please check the form field"
                  )
                );
              }
            })();
          };
          const handleLLMChange = (value) => {
            var _a, _b, _c;
            const provider = providersData[value];
            const defaultBaseURL = (0,
            _llm_llm__WEBPACK_IMPORTED_MODULE_14__.getDefaultBaseURL)(
              value,
              provider === null || provider === void 0 ? void 0 : provider.api
            );
            const providerAuthModes =
              (provider === null || provider === void 0
                ? void 0
                : provider.authModes) && provider.authModes.length
                ? provider.authModes
                : ["api_key"];
            // Check if user has a saved config for this provider
            const savedConfig = historyLLMConfig[value];
            const bridgeRouted = BRIDGE_ROUTED_PROVIDER_IDS.has(value);
            const savedAuthMode = normalizeAuthMode(
              savedConfig === null || savedConfig === void 0
                ? void 0
                : savedConfig.authMode
            );
            const authMode = providerAuthModes.includes(savedAuthMode)
              ? savedAuthMode
              : providerAuthModes[0];
            const savedBaseURL = String(
              ((_a =
                savedConfig === null || savedConfig === void 0
                  ? void 0
                  : savedConfig.options) === null || _a === void 0
                ? void 0
                : _a.baseURL) || ""
            ).trim();
            const baseURLToUse =
              bridgeRouted && savedBaseURL && !isLocalBaseURL(savedBaseURL)
                ? defaultBaseURL
                : savedBaseURL || defaultBaseURL;
            const newConfig = {
              llm: value,
              authMode,
              oauthClientId: String(
                (savedConfig === null || savedConfig === void 0
                  ? void 0
                  : savedConfig.oauthClientId) || ""
              ).trim(),
              oauthScopes: String(
                (savedConfig === null || savedConfig === void 0
                  ? void 0
                  : savedConfig.oauthScopes) || GOOGLE_OAUTH_DEFAULT_SCOPE
              )
                .trim()
                .replace(/\s+/g, " "),
              apiKey: "",
              modelName:
                (savedConfig === null || savedConfig === void 0
                  ? void 0
                  : savedConfig.modelName) ||
                ((_c =
                  (_b = modelOptions[value]) === null || _b === void 0
                    ? void 0
                    : _b[0]) === null || _c === void 0
                  ? void 0
                  : _c.value) ||
                "",
              npm:
                provider === null || provider === void 0
                  ? void 0
                  : provider.npm,
              options: {
                // Use saved base URL if it exists and is different from default, otherwise use default
                baseURL: baseURLToUse
              }
            };
            setConfig(newConfig);
            form.setFieldsValue(newConfig);
            setUseCustomModelName(false);
            if (BRIDGE_ROUTED_PROVIDER_IDS.has(value)) {
              chrome.storage.session
                .get(["socaBridgeToken"])
                .then((sess) => {
                  if (
                    sess === null || sess === void 0
                      ? void 0
                      : sess.socaBridgeToken
                  ) {
                    form.setFieldValue("apiKey", String(sess.socaBridgeToken));
                  }
                })
                .catch(() => {});
            } else {
              getProviderSessionSecret(value)
                .then((secret) => {
                  if (secret) {
                    form.setFieldValue("apiKey", secret);
                  } else {
                    form.setFieldValue("apiKey", "");
                  }
                })
                .catch(() => {});
            }
            if (value === "google" && authMode === "oauth") {
              runtimeSendMessage({ type: "SOCA_OAUTH_GOOGLE_STATUS" })
                .then((resp) => {
                  var _a, _b, _c, _d;
                  if (!(resp === null || resp === void 0 ? void 0 : resp.ok))
                    return;
                  setGoogleOAuthStatus({
                    connected: Boolean(
                      (_a =
                        resp === null || resp === void 0
                          ? void 0
                          : resp.data) === null || _a === void 0
                        ? void 0
                        : _a.connected
                    ),
                    expiresAt: Number(
                      ((_b =
                        resp === null || resp === void 0
                          ? void 0
                          : resp.data) === null || _b === void 0
                        ? void 0
                        : _b.expiresAt) || 0
                    ),
                    issuedAt: Number(
                      ((_c =
                        resp === null || resp === void 0
                          ? void 0
                          : resp.data) === null || _c === void 0
                        ? void 0
                        : _c.issuedAt) || 0
                    ),
                    scope:
                      String(
                        ((_d =
                          resp === null || resp === void 0
                            ? void 0
                            : resp.data) === null || _d === void 0
                          ? void 0
                          : _d.scope) || ""
                      ).trim() || GOOGLE_OAUTH_DEFAULT_SCOPE
                  });
                })
                .catch(() => {});
            }
          };
          const handleCustomModelToggle = (next) => {
            var _a;
            setUseCustomModelName(next);
            if (!next) {
              const provider = String(
                form.getFieldValue("llm") || config.llm || ""
              );
              const options = modelOptions[provider] || [];
              const nextModel =
                ((_a = options[0]) === null || _a === void 0
                  ? void 0
                  : _a.value) || "";
              form.setFieldValue("modelName", nextModel);
            }
          };
          const handleResetBaseURL = () => {
            const provider = providersData[config.llm];
            const defaultBaseURL = (0,
            _llm_llm__WEBPACK_IMPORTED_MODULE_14__.getDefaultBaseURL)(
              config.llm,
              provider === null || provider === void 0 ? void 0 : provider.api
            );
            const newConfig = {
              ...config,
              options: {
                ...config.options,
                baseURL: defaultBaseURL
              }
            };
            setConfig(newConfig);
            form.setFieldValue(["options", "baseURL"], defaultBaseURL);
            antd__WEBPACK_IMPORTED_MODULE_6__["default"].success({
              content: "Base URL reset to default",
              className: "toast-text-black"
            });
          };
          const handleBridgeCheck = async () => {
            var _a, _b, _c, _d, _e;
            const baseURL = String(
              form.getFieldValue(["options", "baseURL"]) ||
                ((_a = config.options) === null || _a === void 0
                  ? void 0
                  : _a.baseURL) ||
                ""
            ).trim();
            const token = String(form.getFieldValue("apiKey") || "").trim();
            const hasExplicitBaseURL = Boolean(baseURL);
            if (hasExplicitBaseURL && !isLocalBaseURL(baseURL)) {
              setBridgeStatus({
                state: "error",
                message:
                  "URL invalid for bridge mode. Use localhost/private IP/Tailscale (*.ts.net or 100.64.0.0/10)."
              });
              return;
            }
            const fetchWithTimeout = async (url, init, timeoutMs) => {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), timeoutMs);
              try {
                return await fetch(url, { ...init, signal: controller.signal });
              } finally {
                clearTimeout(timer);
              }
            };
            setBridgeStatus({
              state: "checking",
              message: "Checking bridge..."
            });
            try {
              const candidates = (0,
              _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.buildBridgeCandidates)(
                {
                  savedBaseURL: baseURL,
                  tailscaleHost: (0,
                  _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.normalizeBaseURL)(
                    baseURL
                  ),
                  fallbackBaseURL: "http://127.0.0.1:9834/v1"
                }
              );
              const missingPermissionOrigins = [];
              let lastError = "";
              for (const candidate of candidates) {
                const root = candidate.replace(/\/+$/, "").replace(/\/v1$/, "");
                let originPattern = "";
                try {
                  const candidateURL = new URL(root);
                  originPattern = `${candidateURL.origin}/*`;
                } catch {
                  continue;
                }
                if (
                  ((_b = chrome.permissions) === null || _b === void 0
                    ? void 0
                    : _b.contains) &&
                  originPattern
                ) {
                  const hasOriginPermission = await new Promise((resolve) => {
                    chrome.permissions.contains(
                      { origins: [originPattern] },
                      (result) => resolve(Boolean(result))
                    );
                  });
                  if (!hasOriginPermission) {
                    missingPermissionOrigins.push(originPattern);
                    continue;
                  }
                }
                const healthResp = await fetchWithTimeout(
                  `${root}/health`,
                  {},
                  4000
                );
                if (!healthResp.ok) {
                  lastError = `health_http_${healthResp.status}`;
                  continue;
                }
                if (!token) {
                  setBridgeStatus({
                    state: "warn",
                    message: `Bridge reachable at ${candidate}, but token is missing.`
                  });
                  return;
                }
                const headers = { Authorization: `Bearer ${token}` };
                const statusResp = await fetchWithTimeout(
                  `${root}/soca/bridge/status`,
                  { headers },
                  6000
                );
                if (statusResp.ok) {
                  const payload = await statusResp.json();
                  const mergedCount = Number(
                    (_e =
                      (_d =
                        (_c =
                          payload === null || payload === void 0
                            ? void 0
                            : payload.merged_models_count) !== null &&
                        _c !== void 0
                          ? _c
                          : payload === null || payload === void 0
                            ? void 0
                            : payload.models_count) !== null && _d !== void 0
                        ? _d
                        : payload === null || payload === void 0
                          ? void 0
                          : payload.model_count) !== null && _e !== void 0
                      ? _e
                      : 0
                  );
                  setBridgeStatus({
                    state: "ok",
                    message: `Bridge reachable at ${candidate}. ${mergedCount} models reported.`
                  });
                  return;
                }
                if (statusResp.status === 401 || statusResp.status === 403) {
                  setBridgeStatus({
                    state: "warn",
                    message: `Bridge reachable at ${candidate}, but token rejected.`
                  });
                  return;
                }
                const modelsResp = await fetchWithTimeout(
                  `${root}/v1/models`,
                  { headers },
                  6000
                );
                if (modelsResp.ok) {
                  const payload = await modelsResp.json();
                  const count = Array.isArray(
                    payload === null || payload === void 0
                      ? void 0
                      : payload.data
                  )
                    ? payload.data.length
                    : 0;
                  setBridgeStatus({
                    state: "ok",
                    message: `Bridge reachable at ${candidate}. Token accepted. ${count} models returned.`
                  });
                  return;
                }
                if (modelsResp.status === 401 || modelsResp.status === 403) {
                  setBridgeStatus({
                    state: "warn",
                    message: `Bridge reachable at ${candidate}, but token rejected.`
                  });
                  return;
                }
                lastError = `status_http_${statusResp.status}|models_http_${modelsResp.status}`;
              }
              if (missingPermissionOrigins.length > 0) {
                setBridgeStatus({
                  state: "warn",
                  message: `Host permission missing for ${missingPermissionOrigins[0]}. Save settings and approve permission prompt, then retry.`
                });
                return;
              }
              setBridgeStatus({
                state: "error",
                message: `Bridge unreachable across candidate URLs. Last error: ${lastError || "unknown"}.`
              });
            } catch (error) {
              setBridgeStatus({
                state: "error",
                message: `Bridge check failed: ${String((error === null || error === void 0 ? void 0 : error.message) || error || "unknown_error")}`
              });
            }
          };
          const providerId = String(watchedProvider || config.llm || "");
          const baseURL = String(
            watchedBaseURL ||
              ((_a = config.options) === null || _a === void 0
                ? void 0
                : _a.baseURL) ||
              ""
          );
          const providerMeta = providersData[providerId];
          const providerAuthModes =
            (providerMeta === null || providerMeta === void 0
              ? void 0
              : providerMeta.authModes) && providerMeta.authModes.length
              ? providerMeta.authModes
              : ["api_key"];
          const selectedAuthModeRaw = normalizeAuthMode(
            watchedAuthMode || config.authMode
          );
          const selectedAuthMode = providerAuthModes.includes(
            selectedAuthModeRaw
          )
            ? selectedAuthModeRaw
            : providerAuthModes[0];
          const providerNpm = String(
            (providerMeta === null || providerMeta === void 0
              ? void 0
              : providerMeta.npm) ||
              config.npm ||
              ""
          );
          const bridgeRoutedProvider =
            BRIDGE_ROUTED_PROVIDER_IDS.has(providerId);
          const allProvidersEnabled =
            providerPolicyMode === "all_providers_bridge_governed";
          const isCompatProvider = providerNpm === "@ai-sdk/openai-compatible";
          const openaiCompatLocal = isCompatProvider && isLocalBaseURL(baseURL);
          const isDirectProvider =
            (!bridgeRoutedProvider && DIRECT_PROVIDER_IDS.has(providerId)) ||
            (isCompatProvider && !openaiCompatLocal);
          const directProviderBlocked =
            isDirectProvider && !allProvidersEnabled;
          const googleOAuthMode =
            providerId === "google" && selectedAuthMode === "oauth";
          const zenTokenMode =
            providerId === "opencode-zen" && selectedAuthMode === "oauth";
          const requiresApiKey =
            bridgeRoutedProvider ||
            (isDirectProvider && !openaiCompatLocal && !googleOAuthMode);
          const apiKeyLabel = bridgeRoutedProvider
            ? "Bridge Token (session-only)"
            : zenTokenMode
              ? "OAuth Bearer Token (session-only)"
              : requiresApiKey
                ? "API Key"
                : "API Key (optional)";
          const apiKeyPlaceholder = bridgeRoutedProvider
            ? "Paste bridge token"
            : zenTokenMode
              ? "Paste OAuth bearer token"
              : "Paste API key";
          const oauthExpiresLabel = (0,
          react__WEBPACK_IMPORTED_MODULE_0__.useMemo)(() => {
            if (
              !(googleOAuthStatus === null || googleOAuthStatus === void 0
                ? void 0
                : googleOAuthStatus.expiresAt)
            )
              return "";
            try {
              return new Date(googleOAuthStatus.expiresAt).toLocaleString();
            } catch {
              return "";
            }
          }, [googleOAuthStatus]);
          return react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
            "div",
            { className: "min-h-screen bg-theme-primary relative" },
            loading &&
              react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                "div",
                {
                  className:
                    "absolute inset-0 bg-theme-primary flex items-center justify-center z-50"
                },
                react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                  antd__WEBPACK_IMPORTED_MODULE_8__["default"],
                  {
                    indicator:
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        _ant_design_icons__WEBPACK_IMPORTED_MODULE_10__[
                          "default"
                        ],
                        {
                          className: "fill-theme-icon",
                          style: { fontSize: 48 },
                          spin: true
                        }
                      )
                  }
                )
              ),
            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
              "div",
              { className: "border-b border-theme-input bg-theme-primary" },
              react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                "div",
                { className: "max-w-3xl mx-auto px-6 py-6" },
                react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                  "div",
                  { className: "flex items-center gap-4" },
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    "img",
                    {
                      src: isDarkMode ? "/icon_dark.png" : "/icon_light.png",
                      alt: "OpenBrowser Logo",
                      className: "w-12 h-12 radius-8px"
                    }
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    "div",
                    null,
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "h1",
                      {
                        className: "text-2xl font-semibold text-theme-primary"
                      },
                      "Settings"
                    ),
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "p",
                      {
                        className: "text-sm text-theme-primary mt-1",
                        style: { opacity: 0.7 }
                      },
                      "Configure your AI model preferences (vision models only)"
                    )
                  )
                )
              )
            ),
            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
              "div",
              { className: "max-w-3xl mx-auto px-6 py-8" },
              react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                "div",
                {
                  className:
                    "bg-theme-primary border-theme-input rounded-xl p-6",
                  style: { borderWidth: "1px", borderStyle: "solid" }
                },
                react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                  antd__WEBPACK_IMPORTED_MODULE_4__["default"],
                  {
                    form: form,
                    layout: "vertical",
                    initialValues: {
                      ...config,
                      [SOCA_LANE_STORAGE_KEY]: socaOpenBrowserLane
                    }
                  },
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    {
                      name: SOCA_LANE_STORAGE_KEY,
                      label:
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          "SOCA Lane"
                        ),
                      rules: [
                        {
                          required: true,
                          message: "Please select a SOCA lane"
                        }
                      ]
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_7__["default"],
                      {
                        placeholder: "Choose a SOCA lane",
                        onChange: handleSocaLaneChange,
                        size: "large",
                        className:
                          "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px",
                        classNames: {
                          popup: {
                            root: "bg-theme-input border-theme-input dropdown-theme-items"
                          }
                        }
                      },
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        Option,
                        { value: "OB_OFFLINE" },
                        "OB_OFFLINE (no network egress)"
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        Option,
                        { value: "OB_ONLINE_PULSE" },
                        "OB_ONLINE_PULSE (allowlisted domains only)"
                      )
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    "div",
                    {
                      className:
                        "mb-4 rounded-lg border border-theme-input bg-theme-input p-3"
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      { className: "flex items-center justify-between" },
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        "span",
                        { className: "text-sm font-medium text-theme-primary" },
                        "Allow cloud providers"
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        antd__WEBPACK_IMPORTED_MODULE_9__["default"],
                        {
                          checked: allProvidersEnabled,
                          onChange: handleProviderPolicyToggle
                        }
                      )
                    ),
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      {
                        className: "text-xs text-theme-primary mt-2",
                        style: { opacity: 0.7 }
                      },
                      allProvidersEnabled
                        ? "Cloud providers enabled (OpenAI, Anthropic, Gemini, OpenRouter, etc)."
                        : "Local-only mode. Only Ollama, SOCA Bridge, and local providers are available. Switch on to use cloud APIs."
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    "div",
                    {
                      className:
                        "mb-4 rounded-lg border border-theme-input bg-theme-input p-3"
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      { className: "flex items-center justify-between" },
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        "span",
                        { className: "text-sm font-medium text-theme-primary" },
                        "Auto fallback to Ollama"
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        antd__WEBPACK_IMPORTED_MODULE_9__["default"],
                        {
                          checked: autoFallbackOllama,
                          onChange: handleAutoFallbackToggle
                        }
                      )
                    ),
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      {
                        className: "text-xs text-theme-primary mt-2",
                        style: { opacity: 0.7 }
                      },
                      "When bridge-routed providers are unreachable, retry once on local Ollama (`http://127.0.0.1:11434/v1`)."
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    {
                      name: "llm",
                      label:
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          "LLM Provider"
                        ),
                      rules: [
                        {
                          required: true,
                          message: "Please select a LLM provider"
                        }
                      ]
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_7__["default"],
                      {
                        placeholder: "Choose a LLM provider",
                        onChange: handleLLMChange,
                        size: "large",
                        className:
                          "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px",
                        classNames: {
                          popup: {
                            root: "bg-theme-input border-theme-input dropdown-theme-items"
                          }
                        }
                      },
                      providerOptions.map((provider) =>
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          Option,
                          { key: provider.value, value: provider.value },
                          provider.label
                        )
                      )
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    {
                      name: "authMode",
                      label:
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          "Auth Mode"
                        ),
                      rules: [
                        {
                          required: true,
                          message: "Please select an auth mode"
                        }
                      ]
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_7__["default"],
                      {
                        placeholder: "Choose auth mode",
                        size: "large",
                        disabled: providerAuthModes.length <= 1,
                        className:
                          "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px",
                        classNames: {
                          popup: {
                            root: "bg-theme-input border-theme-input dropdown-theme-items"
                          }
                        },
                        onChange: (mode) => {
                          const normalized = normalizeAuthMode(mode);
                          const nextConfig = {
                            ...config,
                            authMode: normalized
                          };
                          setConfig(nextConfig);
                          form.setFieldValue("authMode", normalized);
                          const currentProvider = String(
                            form.getFieldValue("llm") || config.llm || ""
                          );
                          if (
                            currentProvider === "google" &&
                            normalized === "oauth"
                          ) {
                            form.setFieldValue("apiKey", "");
                          }
                        }
                      },
                      providerAuthModes.map((mode) =>
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          Option,
                          { key: mode, value: mode },
                          mode === "oauth" ? "OAuth" : "API Key"
                        )
                      )
                    )
                  ),
                  directProviderBlocked &&
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_2__["default"],
                      {
                        type: "warning",
                        showIcon: true,
                        className: "mb-4",
                        message: "Cloud providers require provider policy mode",
                        description:
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            "span",
                            null,
                            "This provider requires network access.",
                            " ",
                            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                              antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                              {
                                type: "link",
                                size: "small",
                                style: { padding: 0 },
                                onClick: () => handleProviderPolicyToggle(true)
                              },
                              "Enable cloud providers now"
                            )
                          )
                      }
                    ),
                  bridgeRoutedProvider &&
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      {
                        className:
                          "mb-4 rounded-lg border border-theme-input bg-theme-input p-3"
                      },
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        "div",
                        { className: "flex items-center justify-between" },
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          "Bridge Status"
                        ),
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                          {
                            size: "small",
                            onClick: handleBridgeCheck,
                            loading: bridgeStatus.state === "checking",
                            className: "text-theme-icon"
                          },
                          "Check Bridge"
                        )
                      ),
                      bridgeStatus.message &&
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_2__["default"],
                          {
                            className: "mt-2",
                            showIcon: true,
                            type:
                              bridgeStatus.state === "ok"
                                ? "success"
                                : bridgeStatus.state === "warn"
                                  ? "warning"
                                  : bridgeStatus.state === "error"
                                    ? "error"
                                    : "info",
                            message: bridgeStatus.message
                          }
                        ),
                      !bridgeStatus.message &&
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "div",
                          {
                            className: "text-xs text-theme-primary mt-2",
                            style: { opacity: 0.7 }
                          },
                          "Click \u201CCheck Bridge\u201D to verify the local SOCA Bridge endpoint used by this provider."
                        )
                    ),
                  (providerMeta === null || providerMeta === void 0
                    ? void 0
                    : providerMeta.supportsLiveCatalog) &&
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      {
                        className:
                          "mb-4 rounded-lg border border-theme-input bg-theme-input p-3"
                      },
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        "div",
                        { className: "flex items-center justify-between" },
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          "Model Catalog"
                        ),
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                          {
                            size: "small",
                            onClick: () => handleRefreshModels(true),
                            loading: refreshingModels,
                            className: "text-theme-icon"
                          },
                          "Refresh Models"
                        )
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        "div",
                        {
                          className: "text-xs text-theme-primary mt-2",
                          style: { opacity: 0.7 }
                        },
                        "Fetches live models for this provider and updates the local cache."
                      ),
                      modelsCacheStatus &&
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_2__["default"],
                          {
                            className: "mt-2",
                            type: "info",
                            showIcon: true,
                            message: modelsCacheStatus
                          }
                        )
                    ),
                  googleOAuthMode &&
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      "div",
                      {
                        className:
                          "mb-4 rounded-lg border border-theme-input bg-theme-input p-3"
                      },
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        "div",
                        { className: "flex items-center justify-between" },
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          "Google OAuth"
                        ),
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "div",
                          { className: "flex items-center gap-2" },
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                            {
                              size: "small",
                              onClick: handleGoogleOAuthConnect,
                              loading: oauthLoading
                            },
                            "Connect"
                          ),
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                            {
                              size: "small",
                              danger: true,
                              onClick: handleGoogleOAuthClear,
                              loading: oauthLoading
                            },
                            "Disconnect"
                          )
                        )
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                        {
                          className: "mt-3 mb-3",
                          name: "oauthClientId",
                          label:
                            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                              "span",
                              {
                                className:
                                  "text-sm font-medium text-theme-primary"
                              },
                              "OAuth Client ID"
                            ),
                          rules: [
                            {
                              required: true,
                              message: "Google OAuth Client ID is required"
                            }
                          ]
                        },
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_5__["default"],
                          {
                            placeholder: "Paste Google OAuth Client ID",
                            size: "large",
                            className:
                              "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                          }
                        )
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                        {
                          className: "mb-0",
                          name: "oauthScopes",
                          label:
                            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                              "span",
                              {
                                className:
                                  "text-sm font-medium text-theme-primary"
                              },
                              "OAuth Scopes"
                            )
                        },
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_5__["default"],
                          {
                            placeholder: GOOGLE_OAUTH_DEFAULT_SCOPE,
                            size: "large",
                            className:
                              "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                          }
                        )
                      ),
                      react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                        antd__WEBPACK_IMPORTED_MODULE_2__["default"],
                        {
                          className: "mt-2",
                          type: googleOAuthStatus.connected
                            ? "success"
                            : "warning",
                          showIcon: true,
                          message: googleOAuthStatus.connected
                            ? `Connected. Token expires at ${oauthExpiresLabel || "unknown"}.`
                            : "Not connected. Click Connect to start Google OAuth."
                        }
                      )
                    ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    { name: "npm", hidden: true },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_5__["default"],
                      null
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    {
                      label:
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "div",
                          {
                            className:
                              "flex items-center justify-between gap-3 flex-wrap"
                          },
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            "span",
                            {
                              className:
                                "text-sm font-medium text-theme-primary"
                            },
                            "Model Name"
                          ),
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            "div",
                            { className: "flex items-center gap-2" },
                            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                              "span",
                              { className: "text-xs text-theme-primary" },
                              "Custom"
                            ),
                            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                              antd__WEBPACK_IMPORTED_MODULE_9__["default"],
                              {
                                checked: useCustomModelName,
                                onChange: handleCustomModelToggle,
                                size: "small"
                              }
                            )
                          )
                        ),
                      required: true
                    },
                    useCustomModelName
                      ? react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                          {
                            name: "modelName",
                            rules: [
                              {
                                required: true,
                                message: "Please enter a model name"
                              }
                            ],
                            noStyle: true
                          },
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            antd__WEBPACK_IMPORTED_MODULE_5__["default"],
                            {
                              placeholder: "Enter custom model name",
                              size: "large",
                              className:
                                "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                            }
                          )
                        )
                      : react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                          {
                            name: "modelName",
                            rules: [
                              {
                                required: true,
                                message: "Please select a model"
                              }
                            ],
                            noStyle: true
                          },
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            antd__WEBPACK_IMPORTED_MODULE_7__["default"],
                            {
                              key: config.llm,
                              placeholder: "Select model name",
                              size: "large",
                              className:
                                "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px",
                              classNames: {
                                popup: {
                                  root: "bg-theme-input border-theme-input dropdown-theme-items"
                                }
                              },
                              showSearch: true,
                              allowClear: true,
                              searchValue: modelSearchValue,
                              onSearch: setModelSearchValue,
                              onOpenChange: (open) => {
                                if (open) setModelSearchValue("");
                              },
                              optionFilterProp: "children",
                              filterOption: (input, option) => {
                                var _a;
                                const label =
                                  ((_a =
                                    option === null || option === void 0
                                      ? void 0
                                      : option.children) === null ||
                                  _a === void 0
                                    ? void 0
                                    : _a.toString()) || "";
                                return label
                                  .toUpperCase()
                                  .includes(input.toUpperCase());
                              }
                            },
                            (modelOptions[config.llm] || []).map((model) =>
                              react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                                Option,
                                { key: model.value, value: model.value },
                                model.label
                              )
                            )
                          )
                        )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    {
                      name: "apiKey",
                      label:
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "span",
                          {
                            className: "text-sm font-medium text-theme-primary"
                          },
                          apiKeyLabel
                        ),
                      rules: [
                        ({ getFieldValue }) => ({
                          validator: async (_rule, value) => {
                            const provider = String(getFieldValue("llm") || "");
                            const authMode = normalizeAuthMode(
                              getFieldValue("authMode")
                            );
                            const currentBaseURL = String(
                              getFieldValue(["options", "baseURL"]) || ""
                            );
                            const token = String(value || "").trim();
                            const providerMeta = providersData[provider];
                            const providerNpm = String(
                              (providerMeta === null || providerMeta === void 0
                                ? void 0
                                : providerMeta.npm) ||
                                config.npm ||
                                ""
                            );
                            const bridgeRouted =
                              BRIDGE_ROUTED_PROVIDER_IDS.has(provider);
                            const isCompatProvider =
                              providerNpm === "@ai-sdk/openai-compatible";
                            const isCompatLocal =
                              isCompatProvider &&
                              isLocalBaseURL(currentBaseURL);
                            const isDirect =
                              (!bridgeRouted &&
                                DIRECT_PROVIDER_IDS.has(provider)) ||
                              (isCompatProvider && !isCompatLocal);
                            const googleOAuth =
                              provider === "google" && authMode === "oauth";
                            const zenOAuth =
                              provider === "opencode-zen" &&
                              authMode === "oauth";
                            if (
                              isDirect &&
                              providerPolicyMode !==
                                "all_providers_bridge_governed"
                            ) {
                              throw new Error(
                                "Cloud providers are disabled by policy mode."
                              );
                            }
                            if (bridgeRouted && !token) {
                              throw new Error(
                                "Bridge token required for this browser session"
                              );
                            }
                            if (zenOAuth && !token) {
                              throw new Error("OAuth bearer token required");
                            }
                            if (googleOAuth) {
                              return;
                            }
                            if (isDirect && !isCompatLocal && !token) {
                              throw new Error(
                                "API key required for this provider"
                              );
                            }
                          }
                        })
                      ]
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_5__["default"].Password,
                      {
                        placeholder: apiKeyPlaceholder,
                        disabled: googleOAuthMode,
                        size: "large",
                        className:
                          "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                      }
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    {
                      name: ["options", "baseURL"],
                      label:
                        react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          "div",
                          { className: "flex items-center justify-between" },
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            "span",
                            {
                              className:
                                "text-sm font-medium text-theme-primary"
                            },
                            "Base URL",
                            " ",
                            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                              "span",
                              {
                                className: "text-theme-primary",
                                style: { opacity: 0.5 }
                              },
                              "(Optional)"
                            )
                          ),
                          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                            antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                            {
                              type: "text",
                              size: "small",
                              onClick: handleResetBaseURL,
                              className: "text-xs px-0 text-theme-icon"
                            },
                            "Reset to default"
                          )
                        ),
                      rules: [
                        ({ getFieldValue }) => ({
                          validator: async (_rule, value) => {
                            var _a;
                            const provider = String(getFieldValue("llm") || "");
                            const mustHaveBaseURL = Boolean(
                              (_a = providersData[provider]) === null ||
                                _a === void 0
                                ? void 0
                                : _a.requiresBaseURL
                            );
                            const base = String(value || "").trim();
                            if (mustHaveBaseURL && !base) {
                              throw new Error(
                                "Base URL required for this provider"
                              );
                            }
                            if (!base) return;
                            const providerMeta = providersData[provider];
                            const providerNpm = String(
                              (providerMeta === null || providerMeta === void 0
                                ? void 0
                                : providerMeta.npm) ||
                                config.npm ||
                                ""
                            );
                            const bridgeRouted =
                              BRIDGE_ROUTED_PROVIDER_IDS.has(provider);
                            const isCompatProvider =
                              providerNpm === "@ai-sdk/openai-compatible";
                            const compatLocal =
                              isCompatProvider && isLocalBaseURL(base);
                            const isDirect =
                              (!bridgeRouted &&
                                DIRECT_PROVIDER_IDS.has(provider)) ||
                              (isCompatProvider && !compatLocal);
                            if (bridgeRouted && !isLocalBaseURL(base)) {
                              throw new Error(
                                "Bridge URL must target localhost/private/Tailscale host."
                              );
                            }
                            if (
                              isDirect &&
                              !compatLocal &&
                              !(0,
                              _llm_endpointPolicy__WEBPACK_IMPORTED_MODULE_15__.isAllowedDirectURL)(
                                base
                              )
                            ) {
                              throw new Error(
                                "Direct provider URL must be https:// on a public host."
                              );
                            }
                          }
                        })
                      ]
                    },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_5__["default"],
                      {
                        placeholder: "Enter custom base URL",
                        size: "large",
                        className:
                          "w-full bg-theme-input border-theme-input text-theme-primary input-theme-focus radius-8px"
                      }
                    )
                  ),
                  react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                    antd__WEBPACK_IMPORTED_MODULE_4__["default"].Item,
                    { className: "mb-0 mt-6" },
                    react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                      antd__WEBPACK_IMPORTED_MODULE_3__["default"],
                      {
                        onClick: handleSave,
                        size: "large",
                        icon: react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                          _ant_design_icons__WEBPACK_IMPORTED_MODULE_11__[
                            "default"
                          ],
                          null
                        ),
                        className: "w-full bg-inverted",
                        block: true,
                        style: {
                          borderColor: "inherit"
                        }
                      },
                      "Save Settings"
                    )
                  )
                )
              )
            )
          );
        };
        const root = (0,
        react_dom_client__WEBPACK_IMPORTED_MODULE_1__.createRoot)(
          document.getElementById("root")
        );
        root.render(
          react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
            react__WEBPACK_IMPORTED_MODULE_0___default().StrictMode,
            null,
            react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
              _sidebar_providers_ThemeProvider__WEBPACK_IMPORTED_MODULE_13__.ThemeProvider,
              null,
              react__WEBPACK_IMPORTED_MODULE_0___default().createElement(
                OptionsPage,
                null
              )
            )
          )
        );

        /***/
      }

    /******/
  };
  /************************************************************************/
  /******/ // The module cache
  /******/ var __webpack_module_cache__ = {};
  /******/
  /******/ // The require function
  /******/ function __webpack_require__(moduleId) {
    /******/ // Check if module is in cache
    /******/ var cachedModule = __webpack_module_cache__[moduleId];
    /******/ if (cachedModule !== undefined) {
      /******/ return cachedModule.exports;
      /******/
    }
    /******/ // Create a new module (and put it into the cache)
    /******/ var module = (__webpack_module_cache__[moduleId] = {
      /******/ id: moduleId,
      /******/ loaded: false,
      /******/ exports: {}
      /******/
    });
    /******/
    /******/ // Execute the module function
    /******/ __webpack_modules__[moduleId].call(
      module.exports,
      module,
      module.exports,
      __webpack_require__
    );
    /******/
    /******/ // Flag the module as loaded
    /******/ module.loaded = true;
    /******/
    /******/ // Return the exports of the module
    /******/ return module.exports;
    /******/
  }
  /******/
  /******/ // expose the modules object (__webpack_modules__)
  /******/ __webpack_require__.m = __webpack_modules__;
  /******/
  /************************************************************************/
  /******/ /* webpack/runtime/chunk loaded */
  /******/ (() => {
    /******/ var deferred = [];
    /******/ __webpack_require__.O = (result, chunkIds, fn, priority) => {
      /******/ if (chunkIds) {
        /******/ priority = priority || 0;
        /******/ for (
          var i = deferred.length;
          i > 0 && deferred[i - 1][2] > priority;
          i--
        )
          deferred[i] = deferred[i - 1];
        /******/ deferred[i] = [chunkIds, fn, priority];
        /******/ return;
        /******/
      }
      /******/ var notFulfilled = Infinity;
      /******/ for (var i = 0; i < deferred.length; i++) {
        /******/ var [chunkIds, fn, priority] = deferred[i];
        /******/ var fulfilled = true;
        /******/ for (var j = 0; j < chunkIds.length; j++) {
          /******/ if (
            (priority & (1 === 0) || notFulfilled >= priority) &&
            Object.keys(__webpack_require__.O).every((key) =>
              __webpack_require__.O[key](chunkIds[j])
            )
          ) {
            /******/ chunkIds.splice(j--, 1);
            /******/
          } else {
            /******/ fulfilled = false;
            /******/ if (priority < notFulfilled) notFulfilled = priority;
            /******/
          }
          /******/
        }
        /******/ if (fulfilled) {
          /******/ deferred.splice(i--, 1);
          /******/ var r = fn();
          /******/ if (r !== undefined) result = r;
          /******/
        }
        /******/
      }
      /******/ return result;
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/compat get default export */
  /******/ (() => {
    /******/ // getDefaultExport function for compatibility with non-harmony modules
    /******/ __webpack_require__.n = (module) => {
      /******/ var getter =
        module && module.__esModule
          ? /******/ () => module["default"]
          : /******/ () => module;
      /******/ __webpack_require__.d(getter, { a: getter });
      /******/ return getter;
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/create fake namespace object */
  /******/ (() => {
    /******/ var getProto = Object.getPrototypeOf
      ? (obj) => Object.getPrototypeOf(obj)
      : (obj) => obj.__proto__;
    /******/ var leafPrototypes;
    /******/ // create a fake namespace object
    /******/ // mode & 1: value is a module id, require it
    /******/ // mode & 2: merge all properties of value into the ns
    /******/ // mode & 4: return value when already ns object
    /******/ // mode & 16: return value when it's Promise-like
    /******/ // mode & 8|1: behave like require
    /******/ __webpack_require__.t = function (value, mode) {
      /******/ if (mode & 1) value = this(value);
      /******/ if (mode & 8) return value;
      /******/ if (typeof value === "object" && value) {
        /******/ if (mode & 4 && value.__esModule) return value;
        /******/ if (mode & 16 && typeof value.then === "function")
          return value;
        /******/
      }
      /******/ var ns = Object.create(null);
      /******/ __webpack_require__.r(ns);
      /******/ var def = {};
      /******/ leafPrototypes = leafPrototypes || [
        null,
        getProto({}),
        getProto([]),
        getProto(getProto)
      ];
      /******/ for (
        var current = mode & 2 && value;
        (typeof current == "object" || typeof current == "function") &&
        !~leafPrototypes.indexOf(current);
        current = getProto(current)
      ) {
        /******/ Object.getOwnPropertyNames(current).forEach(
          (key) => (def[key] = () => value[key])
        );
        /******/
      }
      /******/ def["default"] = () => value;
      /******/ __webpack_require__.d(ns, def);
      /******/ return ns;
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/define property getters */
  /******/ (() => {
    /******/ // define getter functions for harmony exports
    /******/ __webpack_require__.d = (exports, definition) => {
      /******/ for (var key in definition) {
        /******/ if (
          __webpack_require__.o(definition, key) &&
          !__webpack_require__.o(exports, key)
        ) {
          /******/ Object.defineProperty(exports, key, {
            enumerable: true,
            get: definition[key]
          });
          /******/
        }
        /******/
      }
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/global */
  /******/ (() => {
    /******/ __webpack_require__.g = (function () {
      /******/ if (typeof globalThis === "object") return globalThis;
      /******/ try {
        /******/ return this || new Function("return this")();
        /******/
      } catch (e) {
        /******/ if (typeof window === "object") return window;
        /******/
      }
      /******/
    })();
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/harmony module decorator */
  /******/ (() => {
    /******/ __webpack_require__.hmd = (module) => {
      /******/ module = Object.create(module);
      /******/ if (!module.children) module.children = [];
      /******/ Object.defineProperty(module, "exports", {
        /******/ enumerable: true,
        /******/ set: () => {
          /******/ throw new Error(
            "ES Modules may not assign module.exports or exports.*, Use ESM export syntax, instead: " +
              module.id
          );
          /******/
        }
        /******/
      });
      /******/ return module;
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/hasOwnProperty shorthand */
  /******/ (() => {
    /******/ __webpack_require__.o = (obj, prop) =>
      Object.prototype.hasOwnProperty.call(obj, prop);
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/make namespace object */
  /******/ (() => {
    /******/ // define __esModule on exports
    /******/ __webpack_require__.r = (exports) => {
      /******/ if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
        /******/ Object.defineProperty(exports, Symbol.toStringTag, {
          value: "Module"
        });
        /******/
      }
      /******/ Object.defineProperty(exports, "__esModule", { value: true });
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/node module decorator */
  /******/ (() => {
    /******/ __webpack_require__.nmd = (module) => {
      /******/ module.paths = [];
      /******/ if (!module.children) module.children = [];
      /******/ return module;
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/publicPath */
  /******/ (() => {
    /******/ var scriptUrl;
    /******/ if (__webpack_require__.g.importScripts)
      scriptUrl = __webpack_require__.g.location + "";
    /******/ var document = __webpack_require__.g.document;
    /******/ if (!scriptUrl && document) {
      /******/ if (
        document.currentScript &&
        document.currentScript.tagName.toUpperCase() === "SCRIPT"
      )
        /******/ scriptUrl = document.currentScript.src;
      /******/ if (!scriptUrl) {
        /******/ var scripts = document.getElementsByTagName("script");
        /******/ if (scripts.length) {
          /******/ var i = scripts.length - 1;
          /******/ while (
            i > -1 &&
            (!scriptUrl || !/^http(s?):/.test(scriptUrl))
          )
            scriptUrl = scripts[i--].src;
          /******/
        }
        /******/
      }
      /******/
    }
    /******/ // When supporting browsers where an automatic publicPath is not supported you must specify an output.publicPath manually via configuration
    /******/ // or pass an empty string ("") and set the __webpack_public_path__ variable from your code to use your own logic.
    /******/ if (!scriptUrl)
      throw new Error("Automatic publicPath is not supported in this browser");
    /******/ scriptUrl = scriptUrl
      .replace(/^blob:/, "")
      .replace(/#.*$/, "")
      .replace(/\?.*$/, "")
      .replace(/\/[^\/]+$/, "/");
    /******/ __webpack_require__.p = scriptUrl;
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/jsonp chunk loading */
  /******/ (() => {
    /******/ __webpack_require__.b =
      (typeof document !== "undefined" && document.baseURI) ||
      self.location.href;
    /******/
    /******/ // object to store loaded and loading chunks
    /******/ // undefined = chunk not loaded, null = chunk preloaded/prefetched
    /******/ // [resolve, reject, Promise] = chunk loading, 0 = chunk loaded
    /******/ var installedChunks = {
      /******/ options: 0
      /******/
    };
    /******/
    /******/ // no chunk on demand loading
    /******/
    /******/ // no prefetching
    /******/
    /******/ // no preloaded
    /******/
    /******/ // no HMR
    /******/
    /******/ // no HMR manifest
    /******/
    /******/ __webpack_require__.O.j = (chunkId) =>
      installedChunks[chunkId] === 0;
    /******/
    /******/ // install a JSONP callback for chunk loading
    /******/ var webpackJsonpCallback = (parentChunkLoadingFunction, data) => {
      /******/ var [chunkIds, moreModules, runtime] = data;
      /******/ // add "moreModules" to the modules object,
      /******/ // then flag all "chunkIds" as loaded and fire callback
      /******/ var moduleId,
        chunkId,
        i = 0;
      /******/ if (chunkIds.some((id) => installedChunks[id] !== 0)) {
        /******/ for (moduleId in moreModules) {
          /******/ if (__webpack_require__.o(moreModules, moduleId)) {
            /******/ __webpack_require__.m[moduleId] = moreModules[moduleId];
            /******/
          }
          /******/
        }
        /******/ if (runtime) var result = runtime(__webpack_require__);
        /******/
      }
      /******/ if (parentChunkLoadingFunction) parentChunkLoadingFunction(data);
      /******/ for (; i < chunkIds.length; i++) {
        /******/ chunkId = chunkIds[i];
        /******/ if (
          __webpack_require__.o(installedChunks, chunkId) &&
          installedChunks[chunkId]
        ) {
          /******/ installedChunks[chunkId][0]();
          /******/
        }
        /******/ installedChunks[chunkId] = 0;
        /******/
      }
      /******/ return __webpack_require__.O(result);
      /******/
    };
    /******/
    /******/ var chunkLoadingGlobal = (self[
      "webpackChunk_openbrowser_ai_openbrowser"
    ] = self["webpackChunk_openbrowser_ai_openbrowser"] || []);
    /******/ chunkLoadingGlobal.forEach(webpackJsonpCallback.bind(null, 0));
    /******/ chunkLoadingGlobal.push = webpackJsonpCallback.bind(
      null,
      chunkLoadingGlobal.push.bind(chunkLoadingGlobal)
    );
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/nonce */
  /******/ (() => {
    /******/ __webpack_require__.nc = undefined;
    /******/
  })();
  /******/
  /************************************************************************/
  /******/
  /******/ // startup
  /******/ // Load entry module and return exports
  /******/ // This entry module depends on other loaded chunks and execution need to be delayed
  /******/ var __webpack_exports__ = __webpack_require__.O(
    undefined,
    ["vendor"],
    () => __webpack_require__("./src/options/index.tsx")
  );
  /******/ __webpack_exports__ = __webpack_require__.O(__webpack_exports__);
  /******/
  /******/
})();
//# sourceMappingURL=options.js.map
