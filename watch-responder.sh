#!/bin/bash
# Watch Responder — polls relay for questions from the watch,
# answers them using Claude Code (your subscription, no API cost)
# Usage: ./watch-responder.sh (runs in background, Ctrl+C to stop)

RELAY_URL="${RELAY_URL:-https://claudewatch-relay.vercel.app}"
RELAY_SECRET="${RELAY_SECRET:-840606e72d1ccdb07c930afc79225877}"

echo "🤖 Watch Responder started"
echo "   Polling $RELAY_URL for questions..."
echo "   Using Claude Code (subscription mode)"
echo "   Press Ctrl+C to stop"
echo ""

while true; do
  # Check for pending questions
  PENDING=$(curl -s "$RELAY_URL/api/messages?status=pending" \
    -H "Authorization: Bearer $RELAY_SECRET")

  COUNT=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)

  if [ "$COUNT" -gt 0 ] 2>/dev/null; then
    # Get the oldest pending question
    QUESTION=$(echo "$PENDING" | python3 -c "
import sys,json
msgs = json.load(sys.stdin)['messages']
# oldest pending
m = msgs[-1]
print(m['id'] + '|||' + m['question'])
" 2>/dev/null)

    MSG_ID=$(echo "$QUESTION" | cut -d'|' -f1)
    MSG_TEXT=$(echo "$QUESTION" | cut -d'|' -f4-)

    if [ -n "$MSG_ID" ] && [ -n "$MSG_TEXT" ]; then
      echo "📱 Question from watch: $MSG_TEXT"

      # Use Claude Code to answer (uses your subscription!)
      ANSWER=$(claude --print --dangerously-skip-permissions "Answer this briefly in under 40 words. Also provide exactly 3 short follow-up suggestions the user might ask next, as a JSON array called quickReplies. Format: {\"answer\": \"your answer\", \"quickReplies\": [\"q1\", \"q2\", \"q3\"]}. Question: $MSG_TEXT" 2>/dev/null)

      if [ -n "$ANSWER" ]; then
        # Try to parse structured response
        PARSED_ANSWER=$(echo "$ANSWER" | python3 -c "
import sys,json
text = sys.stdin.read()
# Try to find JSON in the response
try:
    start = text.index('{')
    end = text.rindex('}') + 1
    d = json.loads(text[start:end])
    print(json.dumps({'answer': d.get('answer', text[:200]), 'quickReplies': d.get('quickReplies', [])}))
except:
    print(json.dumps({'answer': text[:200], 'quickReplies': []}))
" 2>/dev/null)

        ANSWER_TEXT=$(echo "$PARSED_ANSWER" | python3 -c "import sys,json; print(json.load(sys.stdin)['answer'])" 2>/dev/null)
        QUICK_REPLIES=$(echo "$PARSED_ANSWER" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['quickReplies']))" 2>/dev/null)

        # Send answer back to relay
        curl -s -X PATCH "$RELAY_URL/api/messages?id=$MSG_ID" \
          -H "Authorization: Bearer $RELAY_SECRET" \
          -H "Content-Type: application/json" \
          -d "{\"answer\":$(echo "$ANSWER_TEXT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"quickReplies\":$QUICK_REPLIES}" > /dev/null

        echo "✅ Answered: $ANSWER_TEXT"
        echo ""
      fi
    fi
  fi

  sleep 10
done
