#!/usr/bin/env bash
# Installs whisper.cpp + ffmpeg (Homebrew) and downloads a Whisper model.
# Usage: npm run setup:whisper            -> small.en (default)
#        npm run setup:whisper -- base.en -> pick another model
set -euo pipefail

MODEL="${1:-small.en}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODELS_DIR="$ROOT/models"
MODEL_FILE="$MODELS_DIR/ggml-$MODEL.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"

say() { printf "\033[1;34m==>\033[0m %s\n" "$1"; }

if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required: https://brew.sh" >&2
    exit 1
  fi
  for pkg in whisper-cpp ffmpeg; do
    if brew list "$pkg" >/dev/null 2>&1; then
      say "$pkg already installed"
    else
      say "Installing $pkg"
      brew install "$pkg"
    fi
  done
  [[ "$(uname -m)" == "arm64" ]] && say "Apple Silicon detected: whisper.cpp will use Metal"
else
  say "Not macOS. Install ffmpeg and build whisper.cpp yourself (https://github.com/ggerganov/whisper.cpp),"
  say "then set WHISPER_BIN in .env to the whisper-cli path."
fi

mkdir -p "$MODELS_DIR"
if [[ -f "$MODEL_FILE" ]]; then
  say "Model already present: models/ggml-$MODEL.bin"
else
  say "Downloading ggml-$MODEL.bin"
  curl -L --fail --progress-bar -o "$MODEL_FILE.part" "$MODEL_URL"
  mv "$MODEL_FILE.part" "$MODEL_FILE"
fi

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  say "Created .env from .env.example"
fi
if [[ "$MODEL" != "small.en" ]]; then
  say "Set WHISPER_MODEL=models/ggml-$MODEL.bin in .env to use this model"
fi

say "Done. Run: npm run dev"
