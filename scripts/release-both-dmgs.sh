#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_cmd rsync
require_cmd npm
require_cmd node
require_cmd xcrun

ensure_python_alias() {
  if command -v python >/dev/null 2>&1 && python -c "import xml.parsers.expat" >/dev/null 2>&1; then
    return
  fi

  local selected_python=""
  local candidates=()

  if [[ -x "/usr/bin/python3" ]]; then
    candidates+=("/usr/bin/python3")
  fi
  if command -v python3 >/dev/null 2>&1; then
    candidates+=("$(command -v python3)")
  fi
  if [[ -x "/opt/homebrew/bin/python3.13" ]]; then
    candidates+=("/opt/homebrew/bin/python3.13")
  fi

  for candidate in "${candidates[@]}"; do
    if "$candidate" -c "import xml.parsers.expat" >/dev/null 2>&1; then
      selected_python="$candidate"
      break
    fi
  done

  if [[ -z "$selected_python" ]]; then
    echo "Missing compatible Python for DMG build (need python with xml.parsers.expat support)" >&2
    exit 1
  fi

  local shim_dir="$TMP_ROOT/bin"
  mkdir -p "$shim_dir"
  cat >"$shim_dir/python" <<EOF
#!/usr/bin/env bash
exec "$selected_python" "\$@"
EOF
  chmod +x "$shim_dir/python"
  export PATH="$shim_dir:$PATH"
}

require_env APPLE_API_KEY
require_env APPLE_API_KEY_ID
require_env APPLE_API_ISSUER

# Keep compatibility with existing notarize hook variable naming.
export APPLE_API_ISSUER_ID="${APPLE_API_ISSUER_ID:-$APPLE_API_ISSUER}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARM64_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$ARM64_DIR/.." && pwd)"
X64_DIR="$ROOT_DIR/church-lobby-companion-x64"

if [[ ! -d "$X64_DIR" ]]; then
  echo "Could not find x64 project at: $X64_DIR" >&2
  exit 1
fi

TMP_ROOT="/private/tmp/church-lobby-release-$$"
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT"
ensure_python_alias

build_and_notarize_dmg() {
  local source_dir="$1"
  local build_script="$2"
  local dmg_pattern="$3"

  local project_name
  project_name="$(basename "$source_dir")"

  local clone_dir="$TMP_ROOT/$project_name"
  echo "\n==> Preparing clean workspace for $project_name"
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'dist' \
    --exclude 'node_modules' \
    "$source_dir/" "$clone_dir/"

  pushd "$clone_dir" >/dev/null
  echo "==> Installing dependencies in $project_name"
  npm ci

  local version
  version="$(node -p "require('./package.json').version")"

  echo "==> Building signed app in $project_name using npm run $build_script"
  npm run "$build_script"

  local dmg_name="$dmg_pattern"
  if [[ "$dmg_pattern" == *"<version>"* ]]; then
    dmg_name="${dmg_pattern//<version>/$version}"
  fi

  local dmg_path="dist/$dmg_name"

  if [[ ! -f "$dmg_path" ]]; then
    echo "Expected DMG not found: $dmg_path" >&2
    exit 1
  fi

  echo "==> Notarizing DMG: $dmg_path"
  xcrun notarytool submit "$dmg_path" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --wait

  echo "==> Stapling and validating DMG: $dmg_path"
  xcrun stapler staple "$dmg_path"
  xcrun stapler validate "$dmg_path"

  local out_dir="$source_dir/dist"
  mkdir -p "$out_dir"
  cp -f "$dmg_path" "$out_dir/"

  echo "==> DMG ready at: $out_dir/$(basename "$dmg_path")"
  popd >/dev/null
}

build_and_notarize_dmg "$ARM64_DIR" "build:silicon" "Church Lobby-<version>-arm64.dmg"
build_and_notarize_dmg "$X64_DIR" "build:intel" "Church Lobby-<version>.dmg"

echo "\nDone. Final artifacts:"
ls -1 "$ARM64_DIR/dist"/*.dmg "$X64_DIR/dist"/*.dmg
