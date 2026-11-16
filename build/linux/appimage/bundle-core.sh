#!/usr/bin/env bash
# Adds the core sidecar to an AppImage produced by `wails3 generate appimage`.
#
# The Wails generator copies only the app binary into the AppDir, so the core is
# injected afterwards: the AppImage is extracted, the core is placed in
# usr/bin next to the app, and appimagetool packs it again. The app's AppRun
# puts usr/bin on PATH, so it finds the core without an environment variable.
#
# Usage: bundle-core.sh <appimage-pattern> <core-binary> <output-dir>
# Set LICENSE to a license file to place it beside the binaries as LICENSE.txt.
set -euo pipefail

APPIMAGE_PATTERN="${1:?appimage path or pattern is required}"
CORE="${2:?core binary is required}"
OUTPUT_DIR="${3:-.}"

# The generator names the file <app>-<arch>.AppImage; the caller may pass a
# pattern so one task works on every architecture.
APPIMAGE="$(compgen -G "$APPIMAGE_PATTERN" | head -n 1 || true)"
if [[ -z "$APPIMAGE" ]]; then
    echo "no AppImage matched $APPIMAGE_PATTERN" >&2
    exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

case "$(uname -m)" in
    x86_64) ARCH=x86_64 ;;
    aarch64|arm64) ARCH=aarch64 ;;
    *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

cd "$WORK"
"$APPIMAGE" --appimage-extract >/dev/null
cp "$CORE" squashfs-root/usr/bin/
chmod +x "squashfs-root/usr/bin/$(basename "$CORE")"

# The license travels with the binaries, beside the core in usr/bin.
if [[ -n "${LICENSE:-}" && -f "$LICENSE" ]]; then
    cp "$LICENSE" squashfs-root/usr/bin/LICENSE.txt
fi
if [[ -n "${NOTICES:-}" && -f "$NOTICES" ]]; then
    cp "$NOTICES" squashfs-root/usr/bin/THIRD_PARTY_NOTICES.txt
fi

TOOL="appimagetool-$ARCH.AppImage"
if [[ ! -x "$TOOL" ]]; then
    curl -fsSL -o "$TOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/$TOOL"
    chmod +x "$TOOL"
fi

NAME="$(basename "$APPIMAGE" .AppImage)"
ARCH="$ARCH" "./$TOOL" --appimage-extract-and-run squashfs-root "$WORK/$NAME.AppImage"
mv "$WORK/$NAME.AppImage" "$OUTPUT_DIR/$NAME.AppImage"
