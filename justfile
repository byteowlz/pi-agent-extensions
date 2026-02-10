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
