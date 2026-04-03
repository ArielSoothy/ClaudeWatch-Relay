#!/bin/bash
# Send a notification to the watch
# Usage: notify-watch.sh "Build complete" "All tests pass" "DE Prep"
#        notify-watch.sh "Error" "Type check failed" "ClaudeWatch"

RELAY_URL="${RELAY_URL:-https://claudewatch-relay-pynnfzcae-ariels-projects-62f6e5f2.vercel.app}"
RELAY_SECRET="${RELAY_SECRET:-840606e72d1ccdb07c930afc79225877}"

TITLE="${1:-Task complete}"
BODY="${2:-}"
PROJECT="${3:-}"
TYPE="${4:-task_complete}"

curl -s -X POST "$RELAY_URL/api/notifications" \
  -H "Authorization: Bearer $RELAY_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"$TYPE\",\"title\":\"$TITLE\",\"body\":\"$BODY\",\"project\":\"$PROJECT\"}" > /dev/null 2>&1

exit 0
