import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// In-memory store (resets on cold start — fine for MVP)
let approvals: Approval[] = [];

interface Approval {
  id: string;
  type: 'approval' | 'permission';
  title: string;
  body: string;
  watchBody: string;
  sender: string;
  tool?: string;
  toolInput?: string;
  status: 'pending' | 'approved' | 'rejected';
  reply?: string;
  createdAt: string;
  updatedAt?: string;
}

function summarize(text: string, maxWords: number = 30): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

function auth(req: VercelRequest): boolean {
  const token = (req.headers['authorization'] as string)?.replace('Bearer ', '');
  return token === process.env.RELAY_SECRET;
}

function cleanup() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  approvals = approvals.filter(a => new Date(a.createdAt).getTime() > dayAgo);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });
  cleanup();

  switch (req.method) {
    case 'GET': return handleGet(req, res);
    case 'POST': return handlePost(req, res);
    case 'PATCH': return handlePatch(req, res);
    case 'DELETE': return handleDelete(req, res);
    default: return res.status(405).json({ error: 'Method not allowed' });
  }
}

function handleGet(req: VercelRequest, res: VercelResponse) {
  const { status, id } = req.query;

  if (id && typeof id === 'string') {
    const approval = approvals.find(a => a.id === id);
    if (!approval) return res.status(404).json({ error: 'Not found' });
    return res.json(approval);
  }

  let result = approvals;
  if (status && typeof status === 'string') {
    result = approvals.filter(a => a.status === status);
  }

  return res.json({ approvals: result, count: result.length });
}

function handlePost(req: VercelRequest, res: VercelResponse) {
  const { title, body, sender, type, tool, toolInput } = req.body;

  if (!title) return res.status(400).json({ error: 'title is required' });

  const fullBody = body || '';
  const approval: Approval = {
    id: crypto.randomUUID(),
    type: type || 'approval',
    title,
    body: fullBody,
    watchBody: summarize(fullBody),
    sender: sender || 'Claude Code',
    tool: tool || undefined,
    toolInput: toolInput || undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  approvals.unshift(approval);
  return res.status(201).json(approval);
}

function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id required' });

  const index = approvals.findIndex(a => a.id === id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });

  const { status, reply } = req.body;
  if (status) approvals[index].status = status;
  if (reply) approvals[index].reply = reply;
  approvals[index].updatedAt = new Date().toISOString();

  return res.json(approvals[index]);
}

function handleDelete(_req: VercelRequest, res: VercelResponse) {
  approvals = [];
  return res.json({ cleared: true });
}
