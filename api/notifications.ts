import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

let notifications: Notification[] = [];

interface Notification {
  id: string;
  type: 'task_complete' | 'error' | 'info';
  title: string;
  body: string;
  project: string;
  read: boolean;
  createdAt: string;
}

function auth(req: VercelRequest): boolean {
  const token = (req.headers['authorization'] as string)?.replace('Bearer ', '');
  return token === process.env.RELAY_SECRET;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Keep last 50 notifications, max 24h
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  notifications = notifications.filter(n => new Date(n.createdAt).getTime() > dayAgo).slice(0, 50);

  switch (req.method) {
    case 'GET': return handleGet(req, res);
    case 'POST': return handlePost(req, res);
    case 'PATCH': return handlePatch(req, res);
    default: return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET /api/notifications — watch polls for new notifications
// GET /api/notifications?unread=true — only unread
function handleGet(req: VercelRequest, res: VercelResponse) {
  const { unread } = req.query;
  let result = notifications;
  if (unread === 'true') {
    result = notifications.filter(n => !n.read);
  }
  return res.json({ notifications: result, count: result.length });
}

// POST /api/notifications — Claude Code sends a notification
function handlePost(req: VercelRequest, res: VercelResponse) {
  const { type, title, body, project } = req.body;
  const notification: Notification = {
    id: crypto.randomUUID(),
    type: type || 'task_complete',
    title: title || 'Task complete',
    body: body || '',
    project: project || '',
    read: false,
    createdAt: new Date().toISOString(),
  };
  notifications.unshift(notification);
  return res.status(201).json(notification);
}

// PATCH /api/notifications?id=xxx — mark as read
// PATCH /api/notifications?all=true — mark all as read
function handlePatch(req: VercelRequest, res: VercelResponse) {
  const { id, all } = req.query;
  if (all === 'true') {
    notifications.forEach(n => n.read = true);
    return res.json({ marked: notifications.length });
  }
  if (id && typeof id === 'string') {
    const n = notifications.find(n => n.id === id);
    if (n) n.read = true;
    return res.json(n || { error: 'Not found' });
  }
  return res.status(400).json({ error: 'id or all=true required' });
}
