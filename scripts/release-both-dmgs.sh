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

build_and_notarize_pkg() {
  local source_dir="$1"
  local build_script="$2"
  local pkg_name="$3"

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

  local pkg_path="dist/$pkg_name"
  if [[ "$pkg_name" == *"<version>"* ]]; then
    pkg_path="dist/${pkg_name//<version>/$version}"
  fi

  if [[ ! -f "$pkg_path" ]]; then
    echo "Expected PKG not found: $pkg_path" >&2
    exit 1
  fi

  echo "==> Notarizing PKG: $pkg_path"
  xcrun notarytool submit "$pkg_path" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --wait

  echo "==> Stapling and validating PKG: $pkg_path"
  xcrun stapler staple "$pkg_path"
  xcrun stapler validate "$pkg_path"

  local out_dir="$source_dir/dist"
  mkdir -p "$out_dir"
  cp -f "$pkg_path" "$out_dir/"

  echo "==> PKG ready at: $out_dir/$(basename "$pkg_path")"
  popd >/dev/null
}

build_and_notarize_pkg "$ARM64_DIR" "build:silicon" "Church Lobby-<version>-arm64.pkg"
build_and_notarize_pkg "$X64_DIR" "build:intel" "Church Lobby-<version>.pkg"

echo "\nDone. Final artifacts:"
ls -1 "$ARM64_DIR/dist"/*.pkg "$X64_DIR/dist"/*.pkg
