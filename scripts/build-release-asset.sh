#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ASSET:-}" || "$ASSET" == */* ]]; then
  echo "[X] ASSET must be a filename in the repository root" >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  echo "[X] production node_modules is required before packaging" >&2
  exit 1
fi

asset_path="$(pwd)/$ASSET"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/ccs-release-asset.XXXXXX")"
package_tarball=""
cleanup() {
  rm -rf "$scratch"
  if [[ -n "$package_tarball" ]]; then
    rm -f "$package_tarball"
  fi
}
trap cleanup EXIT

package_tarball="$(npm pack --ignore-scripts --json | node -e '
  const fs = require("node:fs");
  const result = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(result) || result.length !== 1 || !result[0].filename) {
    throw new Error("npm pack returned no unique package filename");
  }
  process.stdout.write(result[0].filename);
')"

bundle="$scratch/bundle"
mkdir -p "$bundle"
tar -xzf "$package_tarball" -C "$bundle" --strip-components=1
cp -a node_modules "$bundle/node_modules"

node - "$bundle" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const bundle = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8'));
if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  throw new Error('package.json files must declare release runtime artifacts');
}
const missing = manifest.files
  .map((entry) => entry.replace(/\/$/, ''))
  .filter((entry) => !fs.existsSync(path.join(bundle, entry)));
if (missing.length > 0) {
  throw new Error(`release bundle is missing package.json files entries: ${missing.join(', ')}`);
}
NODE

tar \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -C "$bundle" \
  -czf "$asset_path" \
  .

echo "[OK] release asset follows package.json files: $ASSET"
