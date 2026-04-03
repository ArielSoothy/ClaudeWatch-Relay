#!/bin/bash
# PermissionRequest hook — sends dangerous operations to watch for approval
# Claude Code blocks until this script exits:
#   exit 0 = allow
#   exit 2 + JSON = deny
#   other = fall through to normal prompt

RELAY_URL="${RELAY_URL:-https://claudewatch-relay-pynnfzcae-ariels-projects-62f6e5f2.vercel.app}"
RELAY_SECRET="${RELAY_SECRET:?Set RELAY_SECRET env var}"

TOOL="$CLAUDE_TOOL_NAME"

# --- Filter: only send dangerous operations to watch ---
SHOULD_SEND=false
TITLE=""
BODY=""
TOOL_INPUT=""

case "$TOOL" in
  Bash)
    CMD="$CLAUDE_TOOL_INPUT_command"
    if echo "$CMD" | grep -qE '(git push|git reset|rm -rf|npm publish|docker push|vercel --prod|vercel deploy --prod|kubectl apply|kubectl delete)'; then
      SHOULD_SEND=true
      TITLE="Run: $(echo "$CMD" | head -c 60)"
      BODY="$CMD"
      TOOL_INPUT="$CMD"
    fi
    ;;
  Edit|Write)
    FILE="$CLAUDE_TOOL_INPUT_file_path"
    if echo "$FILE" | grep -qE '(\.env|vercel\.json|package\.json|Dockerfile|\.github/|settings\.json)'; then
      SHOULD_SEND=true
      TITLE="$TOOL: $(basename "$FILE")"
      BODY="Modify $FILE"
      TOOL_INPUT="$FILE"
    fi
    ;;
esac

# Not dangerous — allow immediately
if [ "$SHOULD_SEND" = false ]; then
  exit 0
fi

# --- Send to relay ---
RESPONSE=$(curl -s -X POST "$RELAY_URL/api/approvals" \
  -H "Authorization: Bearer $RELAY_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"title\":$(echo "$TITLE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"body\":$(echo "$BODY" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"sender\":\"Claude Code\",\"type\":\"permission\",\"tool\":\"$TOOL\",\"toolInput\":$(echo "$TOOL_INPUT" | head -c 200 | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}")

ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -z "$ID" ]; then
  # Relay failed — fall through to normal prompt
  exit 1
fi

# --- Poll for response (10 minutes = 120 polls × 5s) ---
for i in $(seq 1 120); do
  sleep 5
  RESULT=$(curl -s "$RELAY_URL/api/approvals?id=$ID" \
    -H "Authorization: Bearer $RELAY_SECRET")

  STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)

  if [ "$STATUS" = "approved" ]; then
    exit 0
  elif [ "$STATUS" = "rejected" ]; then
    REPLY=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reply','Rejected from watch'))" 2>/dev/null)
    echo "{\"decision\": \"deny\", \"reason\": \"$REPLY\"}"
    exit 2
  fi
done

# Timed out — fall through to normal prompt
exit 1
