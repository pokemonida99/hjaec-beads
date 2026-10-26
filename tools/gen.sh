#!/bin/zsh
# gen.sh <out.png> <prompt> [ref]
out=$1; prompt=$2; ref=$3
CODEX=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
before=$(ls -t ~/.codex/generated_images/*/exec-*.png 2>/dev/null | head -1)
if [ -n "$ref" ]; then
  $CODEX exec --skip-git-repo-check "Generate one image with your image generation tool: $prompt. Do not run any shell commands." -i "$ref" > "$out.log" 2>&1
else
  $CODEX exec --skip-git-repo-check "Generate one image with your image generation tool: $prompt. Do not run any shell commands." > "$out.log" 2>&1
fi
after=$(ls -t ~/.codex/generated_images/*/exec-*.png 2>/dev/null | head -1)
if [ "$after" != "$before" ]; then cp "$after" "$out"; echo "ok $out"; else echo "FAIL $out"; fi
