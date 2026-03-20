# pi-agent-extensions
# Manage custom Pi coding agent extensions

set positional-arguments

EXTENSIONS_DIR := "~/.pi/agent/extensions"
SRC_DIR := justfile_directory()

# === Help ===

# List available commands
default:
    @just --list

# === Install ===

# Interactively pick extensions to install/update
install:
    #!/usr/bin/env bash
    set -euo pipefail

    src_dir="{{ SRC_DIR }}"
    dest_dir="${HOME}/.pi/agent/extensions"
    mkdir -p "$dest_dir"

    # Discover all extensions (dirs with index.ts, skip node_modules/.git/.octo)
    extensions=()
    for d in "$src_dir"/*/; do
        name=$(basename "$d")
        [[ "$name" == "node_modules" || "$name" == ".git" || "$name" == ".octo" ]] && continue
        [[ -f "$d/index.ts" ]] || continue
        extensions+=("$name")
    done

    if [[ ${#extensions[@]} -eq 0 ]]; then
        echo "No extensions found."
        exit 1
    fi

    # Build labels showing install status
    labels=()
    for name in "${extensions[@]}"; do
        if [[ -d "$dest_dir/$name" ]]; then
            labels+=("$name [installed]")
        else
            labels+=("$name")
        fi
    done

    # Pre-select already installed extensions
    selected_args=()
    for name in "${extensions[@]}"; do
        if [[ -d "$dest_dir/$name" ]]; then
            selected_args+=("--selected=$name [installed]")
        fi
    done

    echo "Select extensions to install/update (space to toggle, enter to confirm):"
    echo ""

    chosen=$(printf '%s\n' "${labels[@]}" | \
        gum choose --no-limit "${selected_args[@]}" --cursor-prefix="[ ] " --selected-prefix="[x] ") || true

    if [[ -z "$chosen" ]]; then
        echo "Nothing selected."
        exit 0
    fi

    # Parse selection back to extension names
    installed=0
    updated=0
    while IFS= read -r line; do
        name="${line% \[installed\]}"
        if [[ -d "$dest_dir/$name" ]]; then
            echo "Updating: $name"
            rm -rf "$dest_dir/$name"
            ((updated++)) || true
        else
            echo "Installing: $name"
            ((installed++)) || true
        fi
        cp -r "$src_dir/$name" "$dest_dir/$name"
        # Remove files that shouldn't be in the install target
        rm -f "$dest_dir/$name/package.json" "$dest_dir/$name/install.sh"
    done <<< "$chosen"

    echo ""
    echo "Done: $installed installed, $updated updated."
    echo "Run /reload in pi to pick up changes."

# Install all extensions
install-all:
    #!/usr/bin/env bash
    set -euo pipefail

    src_dir="{{ SRC_DIR }}"
    dest_dir="${HOME}/.pi/agent/extensions"
    mkdir -p "$dest_dir"

    count=0
    for d in "$src_dir"/*/; do
        name=$(basename "$d")
        [[ "$name" == "node_modules" || "$name" == ".git" || "$name" == ".octo" ]] && continue
        [[ -f "$d/index.ts" ]] || continue

        if [[ -d "$dest_dir/$name" ]]; then
            echo "Updating: $name"
            rm -rf "$dest_dir/$name"
        else
            echo "Installing: $name"
        fi
        cp -r "$src_dir/$name" "$dest_dir/$name"
        rm -f "$dest_dir/$name/package.json" "$dest_dir/$name/install.sh"
        ((count++)) || true
    done

    echo ""
    echo "Done: $count extensions installed."
    echo "Run /reload in pi to pick up changes."

# === Status ===

# Show which extensions are installed and their sync status
status:
    #!/usr/bin/env bash
    set -euo pipefail

    src_dir="{{ SRC_DIR }}"
    dest_dir="${HOME}/.pi/agent/extensions"

    printf "%-25s %s\n" "EXTENSION" "STATUS"
    printf "%-25s %s\n" "---------" "------"

    for d in "$src_dir"/*/; do
        name=$(basename "$d")
        [[ "$name" == "node_modules" || "$name" == ".git" || "$name" == ".octo" ]] && continue
        [[ -f "$d/index.ts" ]] || continue

        if [[ ! -d "$dest_dir/$name" ]]; then
            printf "%-25s %s\n" "$name" "not installed"
            continue
        fi

        # Compare index.ts to check if up-to-date
        if diff -q "$src_dir/$name/index.ts" "$dest_dir/$name/index.ts" > /dev/null 2>&1; then
            printf "%-25s %s\n" "$name" "up-to-date"
        else
            printf "%-25s %s\n" "$name" "outdated"
        fi
    done

# === Uninstall ===

# Interactively pick extensions to uninstall
uninstall:
    #!/usr/bin/env bash
    set -euo pipefail

    src_dir="{{ SRC_DIR }}"
    dest_dir="${HOME}/.pi/agent/extensions"

    # Find installed extensions that come from this repo
    installed=()
    for d in "$src_dir"/*/; do
        name=$(basename "$d")
        [[ "$name" == "node_modules" || "$name" == ".git" || "$name" == ".octo" ]] && continue
        [[ -f "$d/index.ts" ]] || continue
        [[ -d "$dest_dir/$name" ]] && installed+=("$name")
    done

    if [[ ${#installed[@]} -eq 0 ]]; then
        echo "No extensions installed."
        exit 0
    fi

    echo "Select extensions to uninstall (space to toggle, enter to confirm):"
    echo ""

    chosen=$(printf '%s\n' "${installed[@]}" | \
        gum choose --no-limit --cursor-prefix="[ ] " --selected-prefix="[x] ") || true

    if [[ -z "$chosen" ]]; then
        echo "Nothing selected."
        exit 0
    fi

    count=0
    while IFS= read -r name; do
        echo "Removing: $name"
        rm -rf "$dest_dir/$name"
        ((count++)) || true
    done <<< "$chosen"

    echo ""
    echo "Done: $count extensions removed."
    echo "Run /reload in pi to pick up changes."

# === Publishing ===

SCOPE := "@byteowlz"
SKIP_DIRS := "node_modules .git .octo docs scripts .pi .trx pi-docs"

# Helper: check if a dir is an extension (has index.ts, not in skip list)
[private]
is-extension dir:
    #!/usr/bin/env bash
    name=$(basename "{{ dir }}")
    for skip in {{ SKIP_DIRS }}; do [[ "$name" == "$skip" ]] && exit 1; done
    [[ -f "{{ dir }}/index.ts" ]] && exit 0 || exit 1

# List all extensions and their publish status
publish-status:
    #!/usr/bin/env bash
    set -euo pipefail
    printf "%-30s %-10s %s\n" "EXTENSION" "SETUP" "NPM VERSION"
    printf "%-30s %-10s %s\n" "---------" "-----" "-----------"
    for d in "{{ SRC_DIR }}"/*/; do
        name=$(basename "$d")
        just is-extension "$d" 2>/dev/null || continue
        setup="no"
        npm_ver="-"
        [[ -f "$d/package.json" ]] && setup="yes"
        if [[ "$setup" == "yes" ]]; then
            npm_ver=$(npm view "{{ SCOPE }}/$name" version 2>/dev/null || echo "unpublished")
        fi
        printf "%-30s %-10s %s\n" "$name" "$setup" "$npm_ver"
    done

# Setup an extension for npm publishing
publish-setup name:
    #!/usr/bin/env bash
    set -euo pipefail
    ext_dir="{{ SRC_DIR }}/{{ name }}"
    if [[ ! -d "$ext_dir" || ! -f "$ext_dir/index.ts" ]]; then
        echo "Extension not found: {{ name }}"
        exit 1
    fi
    if [[ -f "$ext_dir/package.json" ]]; then
        echo "{{ name }} already has a package.json"
        gum confirm "Overwrite?" || exit 0
    fi
    # Extract description from README
    desc="Pi extension: {{ name }}"
    if [[ -f "$ext_dir/README.md" ]]; then
        first=$(head -n 1 "$ext_dir/README.md" | sed 's/^# *//')
        [[ -n "$first" ]] && desc="$first"
    fi
    # Collect files: all .ts, metadata, and subdirectories
    files_list='"*.ts", "README.md", "CHANGELOG.md", "LICENSE", "*.schema.json", "*.example.json"'
    for sub in "$ext_dir"/*/; do
        [[ -d "$sub" ]] || continue
        subname=$(basename "$sub")
        [[ "$subname" == "node_modules" || "$subname" == "dist" ]] && continue
        files_list="$files_list, \"$subname/**\""
    done
    cat > "$ext_dir/package.json" << EOFPKG
    {
      "name": "{{ SCOPE }}/{{ name }}",
      "version": "1.0.0",
      "description": "$desc",
      "type": "module",
      "keywords": ["pi-package", "pi-extension", "pi-coding-agent"],
      "files": [$files_list],
      "pi": {
        "extensions": ["./index.ts"]
      },
      "homepage": "https://github.com/byteowlz/pi-agent-extensions/tree/main/{{ name }}",
      "bugs": {
        "url": "https://github.com/byteowlz/pi-agent-extensions/issues"
      },
      "repository": {
        "type": "git",
        "url": "git+https://github.com/byteowlz/pi-agent-extensions.git",
        "directory": "{{ name }}"
      },
      "devDependencies": {
        "@mariozechner/pi-agent-core": "*",
        "@mariozechner/pi-ai": "*",
        "@mariozechner/pi-coding-agent": "*",
        "@mariozechner/pi-tui": "*"
      },
      "license": "MIT"
    }
    EOFPKG
    echo "Setup complete: {{ SCOPE }}/{{ name }}"
    echo "  just publish {{ name }}    # publish to npm"
    echo "  just publish-bump {{ name }}  # bump version"

# Setup all extensions for npm publishing
publish-setup-all:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in "{{ SRC_DIR }}"/*/; do
        just is-extension "$d" 2>/dev/null || continue
        just publish-setup "$(basename "$d")"
    done

# Publish an extension to npm (use directory name, e.g. just publish auto-rename)
publish name:
    #!/usr/bin/env bash
    set -euo pipefail
    ext_dir="{{ SRC_DIR }}/{{ name }}"
    if [[ ! -f "$ext_dir/package.json" ]]; then
        echo "{{ name }} not set up yet. Run: just publish-setup {{ name }}"
        exit 1
    fi
    cd "$ext_dir"
    pkg_name=$(node -p "require('./package.json').name")
    echo "Publishing $pkg_name..."
    npm publish --access public

# Publish all set-up extensions to npm
publish-all:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in "{{ SRC_DIR }}"/*/; do
        name=$(basename "$d")
        [[ -f "$d/package.json" && -f "$d/index.ts" ]] || continue
        [[ "$name" == "node_modules" ]] && continue
        echo "=== $name ==="
        just publish "$name"
    done

# Bump version of an extension (patch/minor/major)
publish-bump name level="patch":
    #!/usr/bin/env bash
    set -euo pipefail
    ext_dir="{{ SRC_DIR }}/{{ name }}"
    if [[ ! -f "$ext_dir/package.json" ]]; then
        echo "{{ name }} not set up yet. Run: just publish-setup {{ name }}"
        exit 1
    fi
    cd "$ext_dir"
    npm version {{ level }} --no-git-tag-version
    pkg_name=$(node -p "require('./package.json').name")
    new_ver=$(node -p "require('./package.json').version")
    echo "Bumped $pkg_name to $new_ver"

# === Development ===

# Lint all extensions
lint:
    bun run lint

# Lint and auto-fix
lint-fix:
    bun run lint:fix

# Type check all extensions
typecheck:
    bun run typecheck

# Lint + typecheck
check:
    bun run check

# Format code
fmt:
    bun run lint:fix
