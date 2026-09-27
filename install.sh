#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="bande-dessinee-3d-scene"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CODEX_DEST="${HOME}/.codex/skills/${SKILL_NAME}"
AGY_DEST="${HOME}/.gemini/config/skills/${SKILL_NAME}"

mkdir -p "${HOME}/.codex/skills" "${HOME}/.gemini/config/skills"

if [ "${SRC_DIR}" != "${CODEX_DEST}" ]; then
  rm -rf "${CODEX_DEST}"
  cp -R "${SRC_DIR}" "${CODEX_DEST}"
  rm -rf "${CODEX_DEST}/.git"
  echo "✓ Installed to Codex skills: ${CODEX_DEST}"
else
  echo "✓ Already located in Codex skills: ${CODEX_DEST}"
fi

if [ "${SRC_DIR}" != "${AGY_DEST}" ]; then
  rm -rf "${AGY_DEST}"
  cp -R "${SRC_DIR}" "${AGY_DEST}"
  rm -rf "${AGY_DEST}/.git"
  echo "✓ Installed to Antigravity global skills: ${AGY_DEST}"
else
  echo "✓ Already located in Antigravity global skills: ${AGY_DEST}"
fi

echo "Done! You can now use \$${SKILL_NAME} in Codex or Antigravity."
