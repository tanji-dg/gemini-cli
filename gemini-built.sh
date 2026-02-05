#!/bin/bash
# Wrapper for built gemini cli
# This script ensures that --model and other flags are prioritized to avoid misinterpretation by yargs.

DIR="$(dirname "$(readlink -f "$0")")"
NODE_PATH=$(which node)

# Extract --model and its value if present
MODEL_FLAG=""
MODEL_VALUE=""
OTHER_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --model|-m)
            MODEL_FLAG="$1"
            MODEL_VALUE="$2"
            shift 2
            ;;
        *)
            OTHER_ARGS+=("$1")
            shift
            ;;
    esac
done

# Reconstruct command line with model options first
FINAL_ARGS=()
if [ -n "$MODEL_FLAG" ]; then
    FINAL_ARGS+=("$MODEL_FLAG" "$MODEL_VALUE")
fi
FINAL_ARGS+=("${OTHER_ARGS[@]}")

# Debug output to stderr for PAL diagnostics
echo "DEBUG: gemini-built.sh prioritized args: ${FINAL_ARGS[@]}" >&2

exec "$NODE_PATH" "$DIR/packages/cli/dist/index.js" "${FINAL_ARGS[@]}"
