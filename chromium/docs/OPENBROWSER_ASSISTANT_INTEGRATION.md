# OpenBrowser Assistant Integration - Technical Documentation

## Overview

This document describes the integration of the OpenBrowser Assistant as a built-in component extension in Chromium. The integration provides automatic loading of the assistant extension, side panel UI integration, and toolbar button support.

**Extension ID:** `cbjnlnglpbmhbeekoalifpaallpcmelp`

**Integration Type:** Component Extension (Built-in)

**Platform Support:** All platforms except Android and ChromeOS Ash

---

## Table of Contents

1. [Architecture](#architecture)
2. [Component Extension System](#component-extension-system)
3. [Resource Registration](#resource-registration)
4. [Side Panel Integration](#side-panel-integration)
5. [Toolbar Integration](#toolbar-integration)
6. [UI Modifications](#ui-modifications)
7. [File Changes Reference](#file-changes-reference)
8. [Build Configuration](#build-configuration)
9. [Testing & Validation](#testing--validation)

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────┐
│  Chromium Startup                                    │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│  ComponentLoader::AddDefaultComponentExtensions()    │
│  - Loads OpenBrowser Assistant manifest              │
│  - Registers extension with Extension System         │
└────────────────┬─────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────┐
│  Extension System                                    │
│  - Validates against allowlist                       │
│  - Loads resources from BINDATA                      │
│  - Initializes background service worker             │
└────────────────┬─────────────────────────────────────┘
                 │
                 ├─────────────────┬────────────────────┐
                 ▼                 ▼                    ▼
┌────────────────────┐  ┌──────────────────┐  ┌────────────────┐
│  Side Panel        │  │  Toolbar Button  │  │  Extension UI  │
│  - Entry ID        │  │  - Auto-pinned   │  │  - sidebar.html│
│  - Coordinator     │  │  - Icon & Action │  │  - options.html│
│  - Header Control  │  │  - Preferences   │  │  - Background  │
└────────────────────┘  └──────────────────┘  └────────────────┘
```

### Integration Layers

**Layer 1: Extension Registration**
- Extension ID definition
- Allowlist registration
- Manifest loading

**Layer 2: Resource Management**
- BINDATA resource registration
- Asset file mapping
- KaTeX font resources

**Layer 3: UI Integration**
- Side panel entry registration
- Toolbar button creation
- Auto-pinning mechanism

**Layer 4: Runtime Behavior**
- Extension lifecycle management
- UI state persistence
- Theme integration

---

## Component Extension System

### What is a Component Extension?

Component extensions are built-in extensions that ship with Chromium and load automatically. Unlike user-installed extensions, they:
- Load at browser startup
- Cannot be uninstalled by users
- Have access to privileged APIs
- Are compiled into the browser binary as resources

### Extension Loading Flow

**File:** `chrome/browser/extensions/component_loader.cc`

```cpp
void ComponentLoader::AddDefaultComponentExtensions(
    bool skip_session_components) {

  #if !BUILDFLAG(IS_ANDROID) && !BUILDFLAG(IS_CHROMEOS_ASH)
  // OpenBrowser Assistant - load from BINDATA resources
  std::string openbrowser_manifest =
      ui::ResourceBundle::GetSharedInstance().LoadDataResourceString(
          IDR_OPENBROWSER_ASSISTANT_MANIFEST);
  base::FilePath extension_path(FILE_PATH_LITERAL("openbrowser_assistant"));
  Add(openbrowser_manifest, extension_path);
  #endif

  // ... other component extensions
}
```

**Loading Steps:**

1. **Manifest Retrieval**
   - Reads manifest.json from BINDATA resources
   - Resource ID: `IDR_OPENBROWSER_ASSISTANT_MANIFEST`

2. **Path Assignment**
   - Virtual path: `openbrowser_assistant`
   - Not a real filesystem path, used for resource lookup

3. **Extension Registration**
   - Calls `Add()` to register with ComponentLoader
   - Extension system validates and initializes

**Platform Filtering:**
```cpp
#if !BUILDFLAG(IS_ANDROID) && !BUILDFLAG(IS_CHROMEOS_ASH)
```
- **Excluded:** Android (no extension support), ChromeOS Ash (different model)
- **Included:** Windows, macOS, Linux, ChromeOS Lacros

### Allowlist Registration

**File:** `chrome/browser/extensions/component_extensions_allowlist/allowlist.cc`

```cpp
bool IsComponentExtensionAllowlisted(const std::string& extension_id) {
  constexpr auto kAllowed = base::MakeFixedFlatSet<std::string_view>({
      extension_misc::kInAppPaymentsSupportAppId,
      extension_misc::kPdfExtensionId,
      extension_misc::kOpenBrowserAssistantExtensionId,  // NEW
      // ... other allowlisted extensions
  });

  return kAllowed.contains(extension_id);
}
```

**Purpose:**
- Security validation for component extensions
- Prevents unauthorized extensions from claiming component status
- Required for extension to load with component privileges

### Extension ID Definition

**File:** `extensions/common/constants.h`

```cpp
// The extension id of the OpenBrowser Assistant extension.
inline constexpr char kOpenBrowserAssistantExtensionId[] =
    "cbjnlnglpbmhbeekoalifpaallpcmelp";
```

**Extension ID Generation:**
The ID is derived from the extension's public key in manifest.json:
```json
{
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnk6aCCanZ8kXgeZ9..."
}
```

This ensures a consistent, stable extension ID across installations.

---

## Resource Registration

### Manifest Resource

**File:** `chrome/browser/browser_resources.grd`

```xml
<include name="IDR_OPENBROWSER_ASSISTANT_MANIFEST"
         file="resources\openbrowser_assistant\manifest.json"
         type="BINDATA" />
```

**Resource Type:** `BINDATA`
- Embedded in binary as compressed data
- Accessed via `ui::ResourceBundle`
- No disk I/O required at runtime

### Extension Files

**File:** `chrome/browser/resources/component_extension_resources.grd`

The integration registers 80+ resource files:

#### Core Extension Files (9 resources)
```xml
<!-- Icons -->
<include name="IDR_OPENBROWSER_ASSISTANT_ICON"
         file="openbrowser_assistant/icon.png" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_ICON_16"
         file="openbrowser_assistant/icon-16.png" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_ICON_32"
         file="openbrowser_assistant/icon-32.png" type="BINDATA" />

<!-- Themed Icons -->
<include name="IDR_OPENBROWSER_ASSISTANT_ICON_DARK"
         file="openbrowser_assistant/icon_dark.png" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_ICON_LIGHT"
         file="openbrowser_assistant/icon_light.png" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_ICON_NEUTRAL"
         file="openbrowser_assistant/icon_neutral.png" type="BINDATA" />

<!-- HTML Pages -->
<include name="IDR_OPENBROWSER_ASSISTANT_SIDEBAR_HTML"
         file="openbrowser_assistant/sidebar.html" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_OPTIONS_HTML"
         file="openbrowser_assistant/options.html" type="BINDATA" />

<!-- JavaScript -->
<include name="IDR_OPENBROWSER_ASSISTANT_BACKGROUND_JS"
         file="openbrowser_assistant/js/background.js" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_SIDEBAR_JS"
         file="openbrowser_assistant/js/sidebar.js" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_OPTIONS_JS"
         file="openbrowser_assistant/js/options.js" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_CONTENT_SCRIPT_JS"
         file="openbrowser_assistant/js/content_script.js" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_VENDOR_JS"
         file="openbrowser_assistant/js/vendor.js" type="BINDATA" />
<include name="IDR_OPENBROWSER_ASSISTANT_THEME_JS"
         file="openbrowser_assistant/js/theme.js" type="BINDATA" />
```

#### KaTeX Font Resources (72 resources)

Mathematical rendering support via KaTeX fonts:

```xml
<!-- Example: KaTeX Main fonts -->
<include name="IDR_OPENBROWSER_ASSISTANT_ASSET_KATEX_MAIN_REGULAR_TTF"
         file="openbrowser_assistant/js/assets/KaTeX_Main-Regular.ttf" />
<include name="IDR_OPENBROWSER_ASSISTANT_ASSET_KATEX_MAIN_REGULAR_WOFF"
         file="openbrowser_assistant/js/assets/KaTeX_Main-Regular.woff" />
<include name="IDR_OPENBROWSER_ASSISTANT_ASSET_KATEX_MAIN_REGULAR_WOFF2"
         file="openbrowser_assistant/js/assets/KaTeX_Main-Regular.woff2" />
```

**Font Families:**
- KaTeX_Main (4 variants: Regular, Bold, Italic, BoldItalic)
- KaTeX_Math (2 variants: Italic, BoldItalic)
- KaTeX_AMS (1 variant: Regular)
- KaTeX_Caligraphic (2 variants: Regular, Bold)
- KaTeX_Fraktur (2 variants: Regular, Bold)
- KaTeX_SansSerif (3 variants: Regular, Bold, Italic)
- KaTeX_Script (1 variant: Regular)
- KaTeX_Size1-4 (4 size variants)
- KaTeX_Typewriter (1 variant: Regular)

**Total:** 24 font files × 3 formats (TTF, WOFF, WOFF2) = 72 font resources

### Toolbar Icon Resource

**File:** `chrome/app/theme/theme_resources.grd`

```xml
<structure type="chrome_scaled_image"
           name="IDR_PRODUCT_LOGO_16_WHITE"
           file="${branding_path_component}/product_logo_16_white.png" />
```

**Purpose:** White version of product logo for toolbar button icon

---

## Side Panel Integration

### Side Panel Entry Registration

**File:** `chrome/browser/ui/views/side_panel/side_panel_entry_id.h`

```cpp
#define SIDE_PANEL_ENTRY_ID_LIST(V)                                            \
  // ... existing entries ...                                                  \
  V(kOpenBrowserAssistant, std::nullopt, "OpenBrowserAssistant")             \
  V(kExtension, std::nullopt, "Extension")
```

**Macro Parameters:**
1. **Entry ID:** `kOpenBrowserAssistant` - Enum value for this panel
2. **Action ID:** `std::nullopt` - No associated toolbar action (custom handling)
3. **Entry Name:** `"OpenBrowserAssistant"` - String identifier for metrics/logging

**Position:** Added before `kExtension` to appear in side panel list

### Side Panel Coordinator

**File:** `chrome/browser/ui/views/side_panel/side_panel_coordinator.cc`

```cpp
void SidePanelCoordinator::RegisterOpenBrowserAssistantEntry() {
  auto entry = std::make_unique<SidePanelEntry>(
      SidePanelEntry::Id::kOpenBrowserAssistant,
      base::BindRepeating(&CreateOpenBrowserAssistantWebView, browser_));

  global_registry_->Register(std::move(entry));
}
```

**Entry Creation:**
- **ID:** `kOpenBrowserAssistant`
- **Content Factory:** Callback to create WebView
- **Registry:** Global side panel registry (available across all tabs)

### Side Panel Content Creation

**File:** `chrome/browser/ui/views/side_panel/side_panel_util.cc`

```cpp
std::unique_ptr<views::View> CreateOpenBrowserAssistantWebView(Browser* browser) {
  auto web_view = std::make_unique<SidePanelWebUIViewT<...>>(
      base::RepeatingClosure(),
      base::RepeatingClosure(),
      std::make_unique<BubbleContentsWrapperT<OpenBrowserAssistantUI>>(
          GURL("chrome-extension://cbjnlnglpbmhbeekoalifpaallpcmelp/sidebar.html"),
          browser->profile(),
          IDS_OPENBROWSER_ASSISTANT_TITLE));

  return web_view;
}
```

**WebView Configuration:**
- **URL:** Extension sidebar page via chrome-extension:// protocol
- **Profile:** Current browser profile for extension access
- **Title:** Localized title for the panel header

### Side Panel UI Modifications

#### Header Controller

**File:** `chrome/browser/ui/views/side_panel/side_panel_header_controller.cc`

**Icon Selection Logic:**
```cpp
const gfx::VectorIcon* GetIconForEntry(SidePanelEntry::Id id) {
  switch (id) {
    case SidePanelEntry::Id::kOpenBrowserAssistant:
      return &vector_icons::kAssistantIcon;  // Custom icon
    // ... other entries
  }
}
```

**Purpose:** Provides appropriate icon for panel header based on active entry

#### Toolbar Pinning Controller

**File:** `chrome/browser/ui/views/side_panel/side_panel_toolbar_pinning_controller.cc`

```cpp
bool ShouldPinSidePanelEntry(SidePanelEntry::Id id) {
  switch (id) {
    case SidePanelEntry::Id::kOpenBrowserAssistant:
      return true;  // Always show in toolbar
    // ... other entries
  }
}
```

**Pinning Behavior:** OpenBrowser Assistant is permanently pinned to toolbar

#### Side Panel Display Logic

**File:** `chrome/browser/ui/views/side_panel/side_panel.cc`

```cpp
void SidePanel::UpdateVisibility() {
  if (current_entry_id_ == SidePanelEntry::Id::kOpenBrowserAssistant) {
    SetVisible(true);
    // Custom visibility logic for assistant
  }
}
```

**Visibility Control:** Special handling for assistant panel visibility

---

## Toolbar Integration

### Auto-Pinning Mechanism

**Preference Definition**

**File:** `chrome/browser/ui/toolbar/toolbar_pref_names.h`

```cpp
// Indicates whether the OpenBrowser extension has been auto-pinned.
inline constexpr char kPinnedOpenBrowserMigrationComplete[] =
    "toolbar.pinned_openbrowser_migration_complete";
```

**Registration**

**File:** `chrome/browser/ui/toolbar/toolbar_pref_names.cc`

```cpp
void RegisterProfilePrefs(PrefRegistrySimple* registry) {
  registry->RegisterBooleanPref(
      prefs::kPinnedOpenBrowserMigrationComplete, false);
}
```

**Auto-Pin Logic**

**File:** `chrome/browser/ui/toolbar/pinned_toolbar/pinned_toolbar_actions_model.cc`

```cpp
void PinnedToolbarActionsModel::MaybePinOpenBrowserAssistant() {
  if (prefs_->GetBoolean(prefs::kPinnedOpenBrowserMigrationComplete)) {
    return;  // Already pinned
  }

  // Pin the OpenBrowser Assistant extension
  PinAction(extension_misc::kOpenBrowserAssistantExtensionId);

  // Mark as complete
  prefs_->SetBoolean(prefs::kPinnedOpenBrowserMigrationComplete, true);
}
```

**Migration Flow:**
1. Check if migration already completed
2. If not, pin the extension to toolbar
3. Set preference to prevent re-pinning

**Timing:** Runs once per profile on browser startup

### Toolbar Button Creation

**File:** `chrome/browser/ui/views/toolbar/toolbar_view.cc`

```cpp
void ToolbarView::InitializeAssistantButton() {
  assistant_button_ = AddChildView(std::make_unique<ToolbarButton>(
      base::BindRepeating(&ToolbarView::OnAssistantButtonPressed,
                         base::Unretained(this))));

  assistant_button_->SetImage(
      ui::ImageModel::FromVectorIcon(vector_icons::kAssistantIcon,
                                     ui::kColorIcon, 16));
  assistant_button_->SetTooltipText(
      l10n_util::GetStringUTF16(IDS_TOOLBAR_ASSISTANT_TOOLTIP));
  assistant_button_->SetVisible(true);
}
```

**Button Properties:**
- **Icon:** Vector icon (scalable, theme-aware)
- **Size:** 16×16 pixels
- **Tooltip:** Localized tooltip text
- **Visibility:** Visible by default

### Button Click Handler

```cpp
void ToolbarView::OnAssistantButtonPressed() {
  // Open side panel
  browser_->browser_view()->unified_side_panel()->Show(
      SidePanelEntry::Id::kOpenBrowserAssistant);
}
```

**Action:** Opens OpenBrowser Assistant side panel when clicked

### Toolbar Button Styling

**File:** `chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.cc`

```cpp
void PinnedActionToolbarButton::UpdateButtonStyle() {
  if (action_id_ == extension_misc::kOpenBrowserAssistantExtensionId) {
    // Custom styling for assistant button
    SetBackground(views::CreateRoundedRectBackground(
        GetColorProvider()->GetColor(ui::kColorSysTonalContainer),
        8));
  }
}
```

**Styling Features:**
- Custom background color using theme system
- Rounded corners (8px radius)
- Integration with Material Design 3 colors

---

## UI Modifications

### Contents Corner Rounding

**File:** `chrome/browser/ui/views/frame/contents_rounded_corner.cc`

```cpp
int GetContentsCornerRadius(SidePanelEntry::Id entry_id) {
  switch (entry_id) {
    case SidePanelEntry::Id::kOpenBrowserAssistant:
      return 0;  // No corner rounding for assistant panel
    default:
      return 12;  // Default corner radius
  }
}
```

**Purpose:** Provides flush edge for assistant panel for better visual integration

### Side Panel Width

**File:** `chrome/browser/ui/views/side_panel/side_panel.cc`

```cpp
int GetSidePanelWidth(SidePanelEntry::Id entry_id) {
  if (entry_id == SidePanelEntry::Id::kOpenBrowserAssistant) {
    return 400;  // Fixed width for assistant
  }
  return 320;  // Default width
}
```

**Assistant Panel Width:** 400px (wider than default for better chat experience)

---

## File Changes Reference

### Complete File List (20 files)

#### Extension System (4 files)
1. **extensions/common/constants.h** - Extension ID definition
2. **chrome/browser/extensions/component_loader.cc** - Extension loading
3. **chrome/browser/extensions/component_extensions_allowlist/allowlist.cc** - Security allowlist
4. **chrome/browser/browser_resources.grd** - Manifest resource registration

#### Resource Files (2 files)
5. **chrome/browser/resources/component_extension_resources.grd** - Extension assets (80 resources)
6. **chrome/app/theme/theme_resources.grd** - Toolbar icon resource

#### Toolbar Integration (5 files)
7. **chrome/browser/ui/toolbar/toolbar_pref_names.h** - Preference declarations
8. **chrome/browser/ui/toolbar/toolbar_pref_names.cc** - Preference registration
9. **chrome/browser/ui/toolbar/pinned_toolbar/pinned_toolbar_actions_model.cc** - Auto-pin logic
10. **chrome/browser/ui/views/toolbar/toolbar_view.h** - Button declaration
11. **chrome/browser/ui/views/toolbar/toolbar_view.cc** - Button implementation

#### Toolbar Button Styling (2 files)
12. **chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.h** - Button styling interface
13. **chrome/browser/ui/views/toolbar/pinned_action_toolbar_button.cc** - Button styling implementation

#### Side Panel Core (5 files)
14. **chrome/browser/ui/views/side_panel/side_panel_entry_id.h** - Entry ID registration
15. **chrome/browser/ui/views/side_panel/side_panel_coordinator.cc** - Entry registration
16. **chrome/browser/ui/views/side_panel/side_panel_util.cc** - WebView creation
17. **chrome/browser/ui/views/side_panel/side_panel.cc** - Panel display logic
18. **chrome/browser/ui/views/side_panel/side_panel_header_controller.cc** - Header icon

#### Side Panel Behavior (2 files)
19. **chrome/browser/ui/views/side_panel/side_panel_toolbar_pinning_controller.cc** - Pinning behavior
20. **chrome/browser/ui/views/frame/contents_rounded_corner.cc** - Corner rounding

### Statistics

- **Total Files Modified:** 20
- **Total Lines Added:** 252
- **Total Lines Removed:** 32
- **New Resources:** 82 (manifest + 80 extension files + toolbar icon)
- **New Preferences:** 1 (auto-pin migration status)
- **New Side Panel Entry:** 1 (kOpenBrowserAssistant)

---

## Build Configuration

### Resource Build Process

**Step 1: GRD Processing**
```bash
# GRD files are processed by grit
tools/grit/grit.py -i chrome/browser/browser_resources.grd build ...
```

**Step 2: Resource Generation**
- Creates C++ header files with resource IDs
- Generates resource map for runtime lookup
- Compresses resources into binary format

**Step 3: Binary Embedding**
- Resources compiled into chrome.dll (Windows) or chrome binary (Linux/macOS)
- Available via `ui::ResourceBundle::GetSharedInstance()`

### Component Extension Build

**Extension files** must be present in source tree at:
```
chromium/src/chrome/browser/resources/openbrowser_assistant/
├── manifest.json
├── sidebar.html
├── options.html
├── icon.png
├── icon-16.png
├── icon-32.png
├── icon_dark.png
├── icon_light.png
├── icon_neutral.png
└── js/
    ├── background.js
    ├── sidebar.js
    ├── options.js
    ├── content_script.js
    ├── vendor.js
    ├── theme.js
    └── assets/
        └── KaTeX_*.{ttf,woff,woff2} (72 font files)
```

### Build Dependencies

**Modified Build Targets:**
- `//chrome/browser:browser` - Browser binary with new resources
- `//chrome/browser/ui` - UI components with side panel/toolbar changes
- `//extensions` - Extension system with new constant

**No New Build Targets Required** - all changes integrate into existing targets

---

## Testing & Validation

### Manual Testing Checklist

#### Extension Loading
- [ ] Extension loads automatically on browser startup
- [ ] Extension ID is correct: `cbjnlnglpbmhbeekoalifpaallpcmelp`
- [ ] Extension appears in `chrome://extensions`
- [ ] Extension cannot be uninstalled via UI

#### Resource Loading
- [ ] All icons load correctly (light/dark theme variants)
- [ ] Sidebar HTML loads without errors
- [ ] JavaScript files execute without console errors
- [ ] KaTeX fonts render mathematical expressions correctly

#### Side Panel
- [ ] Assistant entry appears in side panel menu
- [ ] Clicking entry opens assistant panel
- [ ] Panel displays sidebar.html content
- [ ] Panel width is 400px
- [ ] No corner rounding on panel edges

#### Toolbar Button
- [ ] Assistant button appears on toolbar (first run)
- [ ] Button has correct icon (white product logo)
- [ ] Button tooltip shows correct text
- [ ] Clicking button opens side panel
- [ ] Button state persists across restarts
- [ ] Auto-pin preference set correctly

#### Theme Integration
- [ ] Icons adapt to light/dark theme
- [ ] Button styling uses theme colors
- [ ] Side panel background matches browser theme

### Automated Testing

**Extension Loading Test:**
```cpp
IN_PROC_BROWSER_TEST_F(ComponentExtensionTest, LoadsOpenBrowserAssistant) {
  ExtensionRegistry* registry = ExtensionRegistry::Get(profile());
  const Extension* extension = registry->GetInstalledExtension(
      extension_misc::kOpenBrowserAssistantExtensionId);

  ASSERT_TRUE(extension);
  EXPECT_EQ(Manifest::COMPONENT, extension->location());
  EXPECT_TRUE(extension->is_component());
}
```

**Side Panel Test:**
```cpp
IN_PROC_BROWSER_TEST_F(SidePanelTest, OpensAssistantPanel) {
  SidePanelCoordinator* coordinator =
      browser()->browser_view()->side_panel_coordinator();

  coordinator->Show(SidePanelEntry::Id::kOpenBrowserAssistant);

  EXPECT_TRUE(coordinator->IsSidePanelShowing());
  EXPECT_EQ(SidePanelEntry::Id::kOpenBrowserAssistant,
            coordinator->GetCurrentEntryId());
}
```

**Auto-Pin Test:**
```cpp
IN_PROC_BROWSER_TEST_F(ToolbarTest, AutoPinsAssistant) {
  PrefService* prefs = browser()->profile()->GetPrefs();

  // Initially false
  EXPECT_FALSE(prefs->GetBoolean(
      prefs::kPinnedOpenBrowserMigrationComplete));

  // Trigger auto-pin
  PinnedToolbarActionsModel* model =
      PinnedToolbarActionsModelFactory::GetForProfile(browser()->profile());
  model->MaybePinOpenBrowserAssistant();

  // Now true
  EXPECT_TRUE(prefs->GetBoolean(
      prefs::kPinnedOpenBrowserMigrationComplete));

  // Button is pinned
  EXPECT_TRUE(model->Contains(
      extension_misc::kOpenBrowserAssistantExtensionId));
}
```

### Debug Commands

**Check Extension Status:**
```javascript
// In chrome://extensions - Developer Mode
chrome.management.getAll(extensions => {
  const assistant = extensions.find(e =>
    e.id === 'cbjnlnglpbmhbeekoalifpaallpcmelp');
  console.log(assistant);
});
```

**Check Resources:**
```bash
# List resources in binary (Linux/macOS)
nm -g out/Default/chrome | grep OPENBROWSER_ASSISTANT

# Check resource bundle (Developer Console)
ui::ResourceBundle::GetSharedInstance().GetRawDataResource(
    IDR_OPENBROWSER_ASSISTANT_MANIFEST)
```

**Check Preferences:**
```javascript
// In chrome://settings
chrome.settingsPrivate.getAllPrefs(prefs => {
  const assistantPref = prefs.find(p =>
    p.key === 'toolbar.pinned_openbrowser_migration_complete');
  console.log(assistantPref);
});
```

---

## Implementation Patterns

### Pattern 1: Component Extension Registration

**When to use:** Adding any new built-in extension

**Steps:**
1. Define extension ID in `extensions/common/constants.h`
2. Add to allowlist in `component_extensions_allowlist/allowlist.cc`
3. Load in `component_loader.cc` with platform guards
4. Register manifest and resources in GRD files

### Pattern 2: Side Panel Integration

**When to use:** Adding new side panel feature

**Steps:**
1. Add entry ID in `side_panel_entry_id.h`
2. Create WebView factory in `side_panel_util.cc`
3. Register entry in `side_panel_coordinator.cc`
4. Add icon mapping in `side_panel_header_controller.cc`
5. Configure visibility/pinning in respective controllers

### Pattern 3: Toolbar Button Integration

**When to use:** Adding persistent toolbar button

**Steps:**
1. Define preference in `toolbar_pref_names.h/cc`
2. Create button in `toolbar_view.h/cc`
3. Implement auto-pin in `pinned_toolbar_actions_model.cc`
4. Add custom styling in `pinned_action_toolbar_button.cc`
5. Register icon resource in `theme_resources.grd`

---

## Migration & Compatibility

### Preference Migration

**First Install:**
- `kPinnedOpenBrowserMigrationComplete = false`
- Auto-pin triggers on first profile load
- Preference set to `true` after pinning

**Profile Upgrade:**
- Existing profiles: Auto-pin runs once
- New profiles: Auto-pin runs on creation
- Enterprise managed: Can be disabled via policy

### Version Compatibility

**Minimum Required Version:**
- Chromium 144+ (or OpenBrowser custom builds)

**Backward Compatibility:**
- Patch applies cleanly to Chromium 144+
- No breaking changes to existing APIs
- Side panel infrastructure required (Chromium 114+)

### Extension Manifest Version

**Manifest V3 Required:**
```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "js/background.js"
  }
}
```

MV2 is deprecated; this integration uses MV3 exclusively.

---

## Security Considerations

### Extension Permissions

The OpenBrowser Assistant requests these permissions in manifest.json:
```json
{
  "permissions": [
    "tabs",
    "activeTab",
    "sidePanel",
    "storage",
    "scripting"
  ],
  "host_permissions": ["<all_urls>"]
}
```

**Audit Points:**
- `<all_urls>` allows content script injection on all sites
- `scripting` permission enables dynamic code execution
- `storage` accesses extension storage

**Mitigation:**
- Component extension status provides trust boundary
- Code review required for changes
- Cannot be modified by users

### Content Security Policy

Default CSP for component extensions:
```
script-src 'self'; object-src 'self';
```

**Restrictions:**
- No inline scripts
- No eval()
- Only extension resources can be loaded

### Resource Access Control

**BINDATA Resources:**
- Embedded in binary, cannot be modified at runtime
- Integrity guaranteed by binary signature
- No external file access

---

## Performance Considerations

### Memory Footprint

**Estimated Memory Usage:**
- Extension base: ~2 MB (JavaScript + HTML)
- KaTeX fonts: ~1.5 MB (all formats loaded on-demand)
- Icons: ~150 KB (multiple sizes + theme variants)
- **Total:** ~3.5-4 MB when fully loaded

### Loading Performance

**Startup Impact:**
- Component extension loading: < 50ms
- Resource extraction: < 10ms (BINDATA)
- Side panel registration: < 5ms
- **Total:** Negligible impact on browser startup

**Lazy Loading:**
- KaTeX fonts load on first mathematical expression render
- Side panel content loads on first open
- Toolbar button is lightweight (icon only)

### Resource Optimization

**Icon Formats:**
- PNG for bitmap icons (smaller file size)
- Multiple resolutions for HiDPI displays
- Theme variants to avoid runtime recoloring

**Font Formats:**
- WOFF2: Best compression (~30% smaller than TTF)
- WOFF: Fallback for older rendering engines
- TTF: Legacy support

---

## Troubleshooting

### Extension Not Loading

**Symptom:** Extension doesn't appear in chrome://extensions

**Diagnosis:**
1. Check platform guards - Android/ChromeOS Ash excluded
2. Verify manifest resource exists in GRD
3. Check component loader logs: `--enable-logging --v=1`

**Solution:**
```bash
# Verify resource exists
strings out/Default/chrome | grep "openbrowser_assistant"

# Check component loader
chrome --enable-logging --v=1 2>&1 | grep ComponentLoader
```

### Side Panel Not Opening

**Symptom:** Clicking toolbar button doesn't open panel

**Diagnosis:**
1. Check entry registration in coordinator
2. Verify WebView factory is called
3. Check browser console for errors

**Solution:**
```javascript
// Debug in DevTools console
let coordinator = chrome.browser.browser_view.side_panel_coordinator;
coordinator.Show(SidePanelEntry.Id.kOpenBrowserAssistant);
```

### Resources Not Found

**Symptom:** Icons or files missing, 404 errors

**Diagnosis:**
1. Verify files exist in `chrome/browser/resources/openbrowser_assistant/`
2. Check GRD registration matches file paths
3. Rebuild to regenerate resource pack

**Solution:**
```bash
# Verify files in source tree
ls chrome/browser/resources/openbrowser_assistant/

# Rebuild resource pack
autoninja -C out/Default chrome/browser:resources
```

### Auto-Pin Not Working

**Symptom:** Button doesn't appear on toolbar

**Diagnosis:**
1. Check preference value
2. Verify pinned actions model initialization
3. Check enterprise policy restrictions

**Solution:**
```javascript
// Check preference
chrome.settingsPrivate.getPref(
  'toolbar.pinned_openbrowser_migration_complete',
  console.log
);

// Force reset (testing only)
chrome.settingsPrivate.setPref(
  'toolbar.pinned_openbrowser_migration_complete',
  false
);
```

---

## Future Enhancements

### Planned Improvements

1. **Dynamic Extension Updates**
   - Hot-reload extension code without browser restart
   - OTA updates via update manifest

2. **Enhanced Toolbar Integration**
   - Badge notifications for assistant updates
   - Right-click context menu
   - Keyboard shortcut customization

3. **Multi-Panel Support**
   - Multiple assistant panels (e.g., chat, settings, history)
   - Panel switching without re-rendering
   - Panel state persistence

4. **Enterprise Features**
   - Group policy for auto-pin control
   - Enterprise-wide extension configuration
   - Audit logging for extension usage

---

## References

### Source Files

All referenced files are in the Chromium source tree:
- `chromium/src/chrome/browser/extensions/`
- `chromium/src/chrome/browser/ui/views/`
- `chromium/src/chrome/app/theme/`
- `chromium/src/extensions/common/`

### Related Documentation

- [Component Extensions Guide](https://www.chromium.org/developers/design-documents/extensions/component-extensions/)
- [Side Panel Architecture](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/views/side_panel/README.md)
- [Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Resource Bundle System](https://www.chromium.org/developers/design-documents/ui-localization/)

### Build System

- [GN Build Configuration](https://gn.googlesource.com/gn/)
- [GRD File Format](https://www.chromium.org/developers/design-documents/grit/)
- [BINDATA Resources](https://www.chromium.org/developers/design-documents/ui-localization/#bindata)

---

## Appendix: Patch Application

### Applying the Patch

```bash
# Navigate to Chromium source root
cd chromium/src

# Apply the integration patch
git apply /path/to/openbrowser-assistant-integration.patch

# Verify changes
git status
git diff

# Build Chromium
autoninja -C out/Default chrome
```

### Reverting the Patch

```bash
# Reverse apply the patch
git apply -R /path/to/openbrowser-assistant-integration.patch

# Or reset changes
git reset --hard HEAD
git clean -fd
```

### Patch Dependencies

This patch requires:
1. **Theme Colors API patch** applied first (for theme integration)
2. **Extension resources** present in `chrome/browser/resources/openbrowser_assistant/`
3. **Chromium version** 144+ (or compatible fork)

---

## License

Copyright 2024 The Chromium Authors. Licensed under the BSD-3-Clause license.

---

**Document Version:** 1.0
**Last Updated:** January 2026
**Maintained By:** OpenBrowser Team
**Patch File:** `openbrowser-assistant-integration.patch`
