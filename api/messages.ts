import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Message queue — watch posts questions, Claude Code picks them up and responds
let messages: ChatMessage[] = [];

interface ChatMessage {
  id: string;
  question: string;
  answer?: string;
  watchSummary?: string;
  quickReplies?: string[];
  status: 'pending' | 'answered';
  createdAt: string;
  answeredAt?: string;
}

function summarize(text: string, maxWords: number = 50): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

function auth(req: VercelRequest): boolean {
  const token = (req.headers['authorization'] as string)?.replace('Bearer ', '');
  return token === process.env.RELAY_SECRET;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Clean up messages older than 1 hour
  const hourAgo = Date.now() - 60 * 60 * 1000;
  messages = messages.filter(m => new Date(m.createdAt).getTime() > hourAgo);

  switch (req.method) {
    case 'GET': return handleGet(req, res);
    case 'POST': return handlePost(req, res);
    case 'PATCH': return handlePatch(req, res);
    default: return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET /api/messages — get all or filter
// GET /api/messages?status=pending — Claude Code polls for unanswered questions
// GET /api/messages?id=xxx — watch polls for answer to its question
function handleGet(req: VercelRequest, res: VercelResponse) {
  const { status, id } = req.query;

  if (id && typeof id === 'string') {
    const msg = messages.find(m => m.id === id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    return res.json(msg);
  }

  let result = messages;
  if (status && typeof status === 'string') {
    result = messages.filter(m => m.status === status);
  }

  return res.json({ messages: result, count: result.length });
}

// POST /api/messages — watch sends a question
function handlePost(req: VercelRequest, res: VercelResponse) {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    question,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  messages.unshift(msg);
  return res.status(201).json(msg);
}

// PATCH /api/messages?id=xxx — Claude Code answers a question
function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id required' });

  const index = messages.findIndex(m => m.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const { answer, quickReplies } = req.body;
  if (answer) {
    messages[index].answer = answer;
    messages[index].watchSummary = summarize(answer);
  }
  if (quickReplies) messages[index].quickReplies = quickReplies;
  messages[index].status = 'answered';
  messages[index].answeredAt = new Date().toISOString();

  return res.json(messages[index]);
}
