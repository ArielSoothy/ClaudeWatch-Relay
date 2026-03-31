// In-memory store (resets on cold start — fine for MVP, upgrade to KV later)
let approvals: Approval[] = [];

interface Approval {
  id: string;
  title: string;
  body: string;
  sender: string;
  status: 'pending' | 'approved' | 'rejected';
  reply?: string;
  createdAt: string;
  updatedAt?: string;
}

function auth(req: Request): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  return token === process.env.RELAY_SECRET;
}

function cleanup() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  approvals = approvals.filter(a => new Date(a.createdAt).getTime() > dayAgo);
}

// GET /api/approvals — list all (watch polls this)
// GET /api/approvals?status=pending — filter by status
// GET /api/approvals?id=xxx — get single
export async function GET(req: Request) {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  cleanup();

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const id = url.searchParams.get('id');

  if (id) {
    const approval = approvals.find(a => a.id === id);
    if (!approval) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(approval);
  }

  let result = approvals;
  if (status) {
    result = approvals.filter(a => a.status === status);
  }

  return Response.json({ approvals: result, count: result.length });
}

// POST /api/approvals — create new approval request (Claude Code sends this)
export async function POST(req: Request) {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  cleanup();

  const { title, body, sender } = await req.json();

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const approval: Approval = {
    id: crypto.randomUUID(),
    title,
    body: body || '',
    sender: sender || 'Claude Code',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  approvals.unshift(approval);
  return Response.json(approval, { status: 201 });
}

// PATCH /api/approvals?id=xxx — update status (watch sends approve/reject)
export async function PATCH(req: Request) {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  cleanup();

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id query param required' }, { status: 400 });

  const index = approvals.findIndex(a => a.id === id);
  if (index === -1) return Response.json({ error: 'Not found' }, { status: 404 });

  const { status, reply } = await req.json();
  if (status) approvals[index].status = status;
  if (reply) approvals[index].reply = reply;
  approvals[index].updatedAt = new Date().toISOString();

  return Response.json(approvals[index]);
}

// DELETE /api/approvals — clear all
export async function DELETE(req: Request) {
  if (!auth(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  approvals = [];
  return Response.json({ cleared: true });
}
