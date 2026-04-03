#!/bin/bash
# Send an approval request to ClaudeWatch via the relay
# Usage: ./send-approval.sh "Deploy v4.0?" "All tests pass. Ready to ship."
#        ./send-approval.sh "Merge PR #123?" "2 approvals, no conflicts." "GitHub"

RELAY_URL="${RELAY_URL:-https://claudewatch-relay-pynnfzcae-ariels-projects-62f6e5f2.vercel.app}"
RELAY_SECRET="${RELAY_SECRET:-840606e72d1ccdb07c930afc79225877}"

TITLE="${1:?Usage: send-approval.sh TITLE [BODY] [SENDER]}"
BODY="${2:-}"
SENDER="${3:-Claude Code}"

RESPONSE=$(curl -s -X POST "$RELAY_URL/api/approvals" \
  -H "Authorization: Bearer $RELAY_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"$TITLE\",\"body\":\"$BODY\",\"sender\":\"$SENDER\"}")

ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ID" ]; then
  echo "❌ Failed to send approval"
  echo "$RESPONSE"
  exit 1
fi

echo "📱 Sent to watch: $TITLE"
echo "   ID: $ID"
echo ""
echo "⏳ Waiting for response..."

# Poll for response (timeout after 5 minutes)
for i in $(seq 1 60); do
  sleep 5
  STATUS=$(curl -s "$RELAY_URL/api/approvals?id=$ID" \
    -H "Authorization: Bearer $RELAY_SECRET" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  if [ "$STATUS" = "approved" ]; then
    REPLY=$(curl -s "$RELAY_URL/api/approvals?id=$ID" \
      -H "Authorization: Bearer $RELAY_SECRET" | grep -o '"reply":"[^"]*"' | cut -d'"' -f4)
    echo "✅ APPROVED${REPLY:+ — $REPLY}"
    exit 0
  elif [ "$STATUS" = "rejected" ]; then
    REPLY=$(curl -s "$RELAY_URL/api/approvals?id=$ID" \
      -H "Authorization: Bearer $RELAY_SECRET" | grep -o '"reply":"[^"]*"' | cut -d'"' -f4)
    echo "❌ REJECTED${REPLY:+ — $REPLY}"
    exit 1
  fi
done

echo "⏰ Timed out waiting for response"
exit 2
