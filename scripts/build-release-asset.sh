#!/usr/bin/env bash
set -euo pipefail

if [[ ! "${ASSET:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "[X] ASSET must be a portable filename in the repository root" >&2
  exit 1
fi
if [[ ! -x node_modules/.bin/husky ]]; then
  echo "[X] development dependencies are required before packaging" >&2
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

package_tarball="$(npm pack --silent --json | node -e '
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

npm install \
  --prefix "$bundle" \
  --omit=dev \
  --ignore-scripts \
  --no-audit \
  --no-fund

if [[ ! -d "$bundle/node_modules/express" ]]; then
  echo "[X] express missing from bundle" >&2
  exit 1
fi

node - "$bundle" <<'NODE'
const path = require('node:path');
const { createRequire } = require('node:module');

const bundle = process.argv[2];
const expressPath = require.resolve('express', { paths: [bundle] });
const runtimeRequire = createRequire(expressPath);
const mimeVersion = runtimeRequire('mime/package.json').version;
const lookupType = typeof runtimeRequire('mime').lookup;
console.log(`bundled mime for express: ${mimeVersion} lookup=${lookupType}`);
if (lookupType !== 'function') {
  throw new Error('bundled express cannot resolve a mime exposing .lookup');
}
NODE

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
