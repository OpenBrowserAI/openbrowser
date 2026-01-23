# OpenBrowser

> Empowering language to transform human words into action.

A customized Chromium browser with integrated AI assistant and enhanced theming capabilities.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Project Structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **pnpm** (v8 or higher)
- **Python** 3.x
- **Git**
- **Xcode Command Line Tools** (macOS)
- **depot_tools** (for Chromium build)

### Installing depot_tools

```bash
# Clone depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git

# Add to PATH (add this to your ~/.zshrc or ~/.bash_profile)
export PATH="$PATH:/path/to/depot_tools"
```

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/OpenBrowserAI/openbrowser.git
cd openbrowser

# 2. Install dependencies
pnpm install

# 3. Build the extension
cd chromium-extension
pnpm build
cd ..

# 4. Clone Chromium (in parent directory)
cd ..
mkdir chromium && cd chromium
fetch --nohooks chromium

# 5. Checkout the correct version
cd src
git checkout 144.0.7543.1

# 6. Sync dependencies
gclient sync -D

# 7. Run hooks
gclient runhooks

# 8. Apply OpenBrowser patches and assets
cd ../../openbrowser
bash chromium/scripts/setup_openbrowser.sh

# 9. Build Chromium
cd ../chromium/src
autoninja -C out/fast chrome

# 10. Run OpenBrowser
./out/fast/OpenBrowser.app/Contents/MacOS/OpenBrowser 
```

## Detailed Setup

### 1. Clone OpenBrowser Repository

```bash
git clone https://github.com/OpenBrowserAI/openbrowser.git
cd openbrowser
```

### 2. Install Node Dependencies

```bash
pnpm install
```

This installs all dependencies for the monorepo workspace, including:

- Core packages
- Extension packages
- Development tools

### 3. Build the Extension

The OpenBrowser Assistant extension needs to be built before applying patches:

```bash
cd chromium-extension
pnpm build
cd ..
```

This creates the `dist` folder with the compiled extension.

### 4. Set Up Chromium

#### 4.1. Clone Chromium Source

**Important:** Chromium should be cloned in the **parent directory** of `openbrowser`:

```
/Users/user/OpenBrowser/
├── openbrowser/          ← This repository
└── chromium/             ← Chromium source (to be created)
    └── src/
```

```bash
# Navigate to parent directory
cd ..

# Create chromium directory
mkdir chromium && cd chromium

# Fetch Chromium (this will take a while - ~20GB download)
fetch --nohooks chromium
```

#### 4.2. Checkout Correct Version

OpenBrowser is based on Chromium version **144.0.7543.1**:

```bash
cd src
git checkout 144.0.7543.1
```

#### 4.3. Sync Dependencies

```bash
# Sync all dependencies for this version
gclient sync -D

# Run build hooks
gclient runhooks
```

### 5. Apply OpenBrowser Patches and Assets

The setup script applies all patches, branding assets, and extension resources:

```bash
# Navigate back to openbrowser directory
cd ../../openbrowser

# Run the complete setup script
bash chromium/scripts/setup_openbrowser.sh
```

This script will:

1. ✅ Apply all patches (theme, UI, branding, integration)
2. ✅ Copy branding assets (logos, icons)
3. ✅ Copy extension to resources

### 6. Configure Build

Create GN args for the build:

```bash
cd ../chromium/src

# Create out/fast directory
gn gen out/fast

# Edit build configuration
gn args out/fast
```

Add these recommended args:

```gn
# Build configuration for OpenBrowser
is_debug = false
is_component_build = true
symbol_level = 1
enable_nacl = false
blink_symbol_level = 0

# Branding
is_chrome_branded = false

# Performance
use_goma = false
use_jumbo_build = true
```

### 7. Build Chromium

```bash
# Build Chrome target (this will take 1-3 hours on first build)
autoninja -C out/fast chrome
```

**Build tips:**

- First build takes a long time (1-3 hours)
- Subsequent builds are much faster (incremental)
- Use `-j` flag to control parallel jobs: `autoninja -j 8 -C out/fast chrome`

### 8. Run OpenBrowser

After successful build:

```bash
# macOS
./out/fast/OpenBrowser.app/Contents/MacOS/OpenBrowser

# Linux
./out/fast/chrome

# Windows
out\fast\chrome.exe
```

## Project Structure

```
openbrowser/
├── chromium/
│   ├── config/
│   │   └── patches.list           # Ordered list of patches to apply
│   ├── docs/
│   │   ├── THEME_COLORS_API.md    # Theme Colors API documentation
│   │   └── OPENBROWSER_ASSISTANT_INTEGRATION.md
│   ├── patches/
│   │   ├── branding/              # Branding and URL patches
│   │   ├── theme/                 # Theme system patches
│   │   ├── theme_api/             # Theme Colors API patches
│   │   ├── ui/                    # UI modification patches
│   │   └── openbrowser_integration/  # Assistant integration patches
│   └── scripts/
│       ├── setup_openbrowser.sh   # Main setup script (runs all)
│       ├── apply_patches.sh       # Apply patches from patches.list
│       ├── apply_branding_assets.sh  # Copy logos, icons
│       └── copy_extension_to_resources.sh  # Copy extension
├── chromium-extension/            # OpenBrowser Assistant extension
├── branding_assets/               # Logos, icons, favicons
├── packages/
│   ├── core/                      # Core OpenBrowser packages
│   └── extension/                 # Extension packages
└── docs/                          # Additional documentation
```

## Development

### Making Changes to Patches

If you need to modify patches:

1. Make changes in Chromium source
2. Create a new patch:
   ```bash
   cd ../chromium/src
   git diff > /Users/user/OpenBrowser/openbrowser/chromium/patches/your-patch-name.patch
   ```
3. Add to `chromium/config/patches.list`
4. Test by resetting and reapplying:
   ```bash
   git checkout .
   cd ../../openbrowser
   bash chromium/scripts/apply_patches.sh
   ```

### Updating the Extension

```bash
# Make changes in chromium-extension/
cd chromium-extension

# Build
pnpm build

# Copy to Chromium resources
cd ..
bash chromium/scripts/copy_extension_to_resources.sh

# Rebuild Chromium
cd ../chromium/src
autoninja -C out/fast chrome
```

### Available Scripts

In the `openbrowser` directory:

```bash
# Build all packages
pnpm build

# Format code
pnpm format

# Check formatting
pnpm format:check

# Clean all build artifacts
pnpm clean
```

In the `chromium/scripts` directory:

```bash
# Apply all patches, assets, and extension (complete setup)
bash setup_openbrowser.sh

# Apply only patches
bash apply_patches.sh

# Apply only branding assets
bash apply_branding_assets.sh

# Copy only extension
bash copy_extension_to_resources.sh
```

## Troubleshooting

### Build Errors

**Error: `openbrowser/common/BUILD.gn` not found**

- Make sure you applied the `branding_url_changes.patch`
- Run `bash chromium/scripts/apply_patches.sh` again

**Error: Patch failed to apply**

- Some patches may conflict with local changes
- Reset changes: `cd ../chromium/src && git checkout .`
- Reapply patches: `bash ../../openbrowser/chromium/scripts/apply_patches.sh`

**Error: Extension not found**

- Build the extension first: `cd chromium-extension && pnpm build`
- Copy to resources: `bash ../chromium/scripts/copy_extension_to_resources.sh`

### Depot Tools Issues

**Error: `gclient` or `gn` not found**

- Make sure depot_tools is in your PATH
- Restart your terminal after adding to PATH

### Version Mismatch

**Error: Wrong Chromium version**

```bash
cd chromium/src
git checkout 144.0.7543.1
gclient sync -D
```

### Permission Errors

**Error: Permission denied on scripts**

```bash
chmod +x chromium/scripts/*.sh
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Format code (`pnpm format`)
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Resources

- [Chromium Build Documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/README.md)
- [Theme Colors API Documentation](chromium/docs/THEME_COLORS_API.md)
- [OpenBrowser Assistant Integration](chromium/docs/OPENBROWSER_ASSISTANT_INTEGRATION.md)
- [depot_tools Tutorial](https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html)

## Support

- GitHub Issues: [https://github.com/OpenBrowserAI/openbrowser/issues](https://github.com/OpenBrowserAI/openbrowser/issues)
- Documentation: [./docs](./docs)

---

Built with ❤️ by the OpenBrowser team
