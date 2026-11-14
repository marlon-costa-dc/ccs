#!/usr/bin/env bash
# Get current CCS version
# Usage: ./scripts/get-version.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CCS_DIR="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$CCS_DIR/VERSION"

if [[ -f "$VERSION_FILE" ]]; then
    cat "$VERSION_FILE"
else
    echo "unknown"
    exit 1
fi
