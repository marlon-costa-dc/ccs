# Version Update Protocol for CCS

## Overview
This document defines the procedure for updating CCS (Claude Codex Switch) to new versions, including fetching releases, building binaries, and updating local configuration.

## 🎯 Objective
Update CCS to the latest version while preserving user configurations and ensuring the CLIProxyAPI Plus backend uses `marlon-costa-dc/cliproxyapi` as the default remote repository.

## 📋 Preconditions
- Git installed and configured
- Node.js & Bun runtime installed
- Access to the GitHub fork: `https://github.com/marlon-costa-dc/ccs`
- Write access to the local CCS installation directory

## 🔄 Update Workflow

### Step 1: Fetch Remote Changes
```bash
# From the CCS project directory
git remote update --prune
git status
```

### Step 2: Pull Integration Lane
```bash
# Pull from the integration branch (never directly from develop/main)
git pull origin main
# OR, if lane-based workflow:
make work WHAT=status BEAD=<bead-id>
```

### Step 3: Resolve Conflicts
```bash
# If there are merge conflicts, resolve them
git mergetool
# OR manually edit conflicting files
git add <resolved-files>
git commit -m "chore: resolve merge conflicts from update"
```

### Step 4: Build the Binary
```bash
# Clean build from the project root
bun run build
# This produces:
# - dist/ccs.js (main executable, shebang-added)
# - dist/bin/ccsxp-runtime.js
# - dist/bin/codex-runtime.js
# - dist/bin/droid-runtime.js
# - dist/ccs.d.ts (TypeScript declarations)
```

### Step 5: Verify Build
```bash
# Run quality gates
bun run typecheck
bun run lint       # 53 pre-existing line-length warnings OK
bun run format:check  # Prettier clean
```

### Step 6: Update Local Version
```bash
# Option A: Replace the binary directly
cp dist/ccs.js /usr/local/bin/ccs  # or wherever CCS is installed
chmod +x /usr/local/bin/ccs

# Option B: Use make install (if available)
make install
```

### Step 7: Sync Configuration
```bash
# The management_panel_repository is now set to marlon-costa-dc/cliproxyapi
# by default in the CLIProxy config schema.

# If you have a local config, update the backend:
ccs config set --backend plus

# Or edit ~/.ccs/config.yaml manually:
# backend: plus
# management_panel_repository: marlon-costa-dc/cliproxyapi
```

### Step 8: Validate
```bash
# Verify the new version
ccs --version

# Check provider support
ccs auth list

# Run a quick test
ccs demo
```

## 📦 Binary Distribution

### Built Artifacts
The `bun run build` command produces the following distributable files:

| File | Description |
|---|---|
| `dist/ccs.js` | Main CLI entry point (with shebang) |
| `dist/bin/ccsxp-runtime.js` | XAI/Grok runtime |
| `dist/bin/codex-runtime.js` | Codex runtime |
| `dist/bin/droid-runtime.js` | Droid runtime |
| `dist/ccs.d.ts` | TypeScript type definitions |

### Release Publishing to GitHub
To publish a new version to the fork `marlon-costa-dc/ccs`:

```bash
# 1. Create a Git tag
git tag v0.12.0-dev
git push origin v0.12.0-dev

# 2. Create a GitHub Release (via GitHub UI or API)
# - Tag: v0.12.0-dev
# - Title: "v0.12.0-dev - GLM + OpenCode Zen + OpenCode Go + Poolside Support"
# - Release notes: Summarize changes from the bead/worktree
# 
# - Updated provider-capabilities with zai/opencode/opencode-go/poolside
# - Updated model-catalog with GLM and Zen models
```

## 🔧 Configuration: Default Plus Backend

The CLIProxyAPI Plus backend is configured via the `management_panel_repository` field in `CCS_CONFIG`:

### Default Value (automatically applied)
```yaml
# In ~/.ccs/config.yaml or generated config.yaml:
management_panel_repository: marlon-costa-dc/cliproxyapi
backend: plus
```

### Manual Override
If you need to use a different Plus repository:
```yaml
management_panel_repository: your-org/your-repo
backend: plus
```

### Back to Original
```yaml
backend: original
# management_panel_repository omitted (defaults to original)
```

## 🆚 Version Comparison

### Before Update
```bash
ccs --version  # v0.11.0 or earlier
ccs list      # Fewer providers available
```

### After Update
```bash
ccs --version  # v0.12.0-dev
ccs list      # Includes: gemini, codex, xai, zai, opencode, opencode-go, poolside, agy, qwen, iflow, kiro, ghcp, claude, kimi, cursor, gitlab, codebuddy, kilo, qoder
```

## ⚠️ Known Migration Notes

1. **Test expectations**: 3 tests in `provider-capabilities.test.ts` updated to include `'opencode-go'` and `'poolside'` instead of `'go'` in provider ID arrays
2. **Line-length warnings**: 53 pre-existing max-lines warnings unchanged (not introduced by this update)
3. **Quota providers**: `'opencode-go'` and `'poolside'` are added to `CLIProxyProvider` but NOT to `MANAGED_QUOTA_PROVIDERS` (quota rotation not implemented for these API-key providers yet)
4. **OAuth**: OpenCode Zen, OpenCode Go, and Poolside use API key authentication. No OAuth flags — configure via AI Providers with API keys
5. **AI Providers families**: Added `opencode-api-key`, `opencode-go-api-key`, `poolside-api-key` to `AI_PROVIDER_FAMILY_IDS`. These route through CLIProxyAPI's config.yaml sections (`opencode-api-key:`, `opencode-go-api-key:`, `poolside-api-key:`). Requires CLIProxyAPI dc7 backend with matching auth URL endpoints.

## ✅ Validation Checklist
- [ ] `bun run build` completes without errors
- [ ] `bun run typecheck` passes (0 errors)
- [ ] `bun run format:check` passes (Prettier clean)
- [ ] `bun run lint` passes (0 errors, 53 pre-existing warnings)
- [ ] `ccs --version` shows new version
- [ ] `ccs auth list` includes all 19 providers + opencode-go, poolside
- [ ] `ccs config show backend` shows `plus`
- [ ] `ccs config show management_panel_repository` shows `marlon-costa-dc/cliproxyapi`
- [ ] Dashboard AI Providers section shows 8 families (5 existing + 3 new: OpenCode Zen, OpenCode Go, Poolside)