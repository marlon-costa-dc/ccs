#!/usr/bin/env bash
# =============================================================================
# DEPRECATED: This script is kept for emergency manual releases only.
#
# Releases are now automated via semantic-release:
#   - Merge to main  → stable release (npm @latest)
#   - Merge to dev   → dev release (npm @dev)
#
# Version is determined automatically from conventional commits:
#   - feat: commit   → MINOR bump (5.0.2 → 5.1.0)
#   - fix: commit    → PATCH bump (5.0.2 → 5.0.3)
#   - feat!: commit  → MAJOR bump (5.0.2 → 6.0.0)
#
# See: docs/version-management.md
# =============================================================================
#
# Legacy usage (emergency only): ./scripts/bump-version.sh [major|minor|patch]

set -euo pipefail

# Show deprecation warning
echo "============================================================="
echo "[!] DEPRECATED: This script is for emergency use only."
echo ""
echo "    Releases are now automated via semantic-release."
echo "    Simply merge to 'main' or 'dev' branch."
echo ""
echo "    Version is determined from conventional commits:"
echo "      feat: commit   -> MINOR (5.0.2 -> 5.1.0)"
echo "      fix: commit    -> PATCH (5.0.2 -> 5.0.3)"
echo "      feat!: commit  -> MAJOR (5.0.2 -> 6.0.0)"
echo "============================================================="
echo ""

# Require explicit confirmation
read -p "Continue with manual bump? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. Use conventional commits + merge to main instead."
    exit 0
fi
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CCS_DIR="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$CCS_DIR/VERSION"

# Check VERSION file exists
if [[ ! -f "$VERSION_FILE" ]]; then
    echo "[X] Error: VERSION file not found at $VERSION_FILE"
    exit 1
fi

# Read current version
CURRENT_VERSION=$(cat "$VERSION_FILE")
echo "Current version: $CURRENT_VERSION"

# Parse version
if [[ ! "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "[X] Error: Invalid version format in VERSION file"
    echo "Expected: MAJOR.MINOR.PATCH (e.g., 1.2.3)"
    exit 1
fi

MAJOR="${BASH_REMATCH[1]}"
MINOR="${BASH_REMATCH[2]}"
PATCH="${BASH_REMATCH[3]}"

# Determine bump type
BUMP_TYPE="${1:-patch}"

case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
    *)
        echo "[X] Error: Invalid bump type '$BUMP_TYPE'"
        echo "Usage: $0 [major|minor|patch]"
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "New version: $NEW_VERSION"
echo ""
echo "This will update hardcoded versions in:"
echo "  1. VERSION file"
echo "  2. package.json (via sync-version.js)"
echo "  3. installers/install.sh"
echo "  4. installers/install.ps1"
echo ""
echo "Note: lib/ccs and lib/ccs.ps1 are now bootstraps"
echo "      (delegate to Node.js, no version hardcoded)"
echo ""

# Already confirmed above in deprecation warning

# Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"
echo "[OK] Updated VERSION file to $NEW_VERSION"

# Note: lib/ccs and lib/ccs.ps1 are now lightweight bootstraps
# They delegate to Node.js via npx - no version variable needed
# Version is determined by the npm package at runtime

# Update installers/install.sh
INSTALL_SH="$CCS_DIR/installers/install.sh"
if [[ -f "$INSTALL_SH" ]]; then
    sed -i.bak "s/^CCS_VERSION=\".*\"/CCS_VERSION=\"$NEW_VERSION\"/" "$INSTALL_SH"
    rm -f "$INSTALL_SH.bak"
    echo "[OK] Updated installers/install.sh"
else
    echo "[!] installers/install.sh not found, skipping"
fi

# Update installers/install.ps1
INSTALL_PS1="$CCS_DIR/installers/install.ps1"
if [[ -f "$INSTALL_PS1" ]]; then
    sed -i.bak "s/^\\\$CcsVersion = \".*\"/\\\$CcsVersion = \"$NEW_VERSION\"/" "$INSTALL_PS1"
    rm -f "$INSTALL_PS1.bak"
    echo "[OK] Updated installers/install.ps1"
else
    echo "[!] installers/install.ps1 not found, skipping"
fi

# Sync version to package.json
echo "Syncing version to package.json..."
if node "$SCRIPT_DIR/sync-version.js"; then
    echo "[OK] Synced version to package.json"
else
    echo "[X] Error: Failed to sync version to package.json"
    exit 1
fi

echo ""
echo "[OK] Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Commit: git add VERSION package.json installers/install.sh installers/install.ps1"
echo "  3. Commit: git commit -m \"chore: bump version to $NEW_VERSION\""
echo "  4. Tag: git tag v$NEW_VERSION"
echo "  5. Push: git push origin main && git push origin v$NEW_VERSION"
