#!/usr/bin/env bash
# Install the host-neutral consumer package next to pi-tui-rpc.
#
# pi-tui-rpc imports ../runtime-interactions/wire.js and `ajv`; a deployed
# extension cannot reach the repository, so both are copied into the extension
# root. Keep this list in sync with scripts/verify-install-layout.mjs.
set -euo pipefail

src_dir="${1:?source repo}"
dest_dir="${2:?extension dir}"

# Nothing to do when pi-tui-rpc is not installed.
if [[ ! -d "$dest_dir/pi-tui-rpc" ]]; then
	exit 0
fi

if [[ ! -d "$src_dir/runtime-interactions" ]]; then
	echo "ERROR: runtime-interactions package is missing; pi-tui-rpc cannot load." >&2
	exit 1
fi

echo "Installing shared package: runtime-interactions (+ ajv runtime deps)"
rm -rf "$dest_dir/runtime-interactions"
cp -r "$src_dir/runtime-interactions" "$dest_dir/runtime-interactions"
find "$dest_dir/runtime-interactions" -name '*.test.ts' -delete
mkdir -p "$dest_dir/runtime-interactions/node_modules"

for pkg in ajv fast-deep-equal fast-uri json-schema-traverse require-from-string; do
	if [[ ! -d "$src_dir/node_modules/$pkg" ]]; then
		echo "ERROR: missing node_modules/$pkg; run bun install first." >&2
		exit 1
	fi
	rm -rf "$dest_dir/runtime-interactions/node_modules/$pkg"
	cp -R "$src_dir/node_modules/$pkg" "$dest_dir/runtime-interactions/node_modules/$pkg"
done
