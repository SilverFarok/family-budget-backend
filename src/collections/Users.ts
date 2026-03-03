import crypto from 'crypto'
import type { CollectionConfig, Endpoint } from 'payload'

type InviteTokenPayload = {
  exp: number
  inviteeEmail: string
  inviterId: string
}

const INVITE_LINK_PATH = '/expenses'
const INVITE_TTL_HOURS_DEFAULT = 72

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const getSecret = (): string => process.env.PAYLOAD_SECRET || ''

const getInviteTtlHours = (): number => {
  const parsed = Number(process.env.INVITE_TOKEN_TTL_HOURS ?? INVITE_TTL_HOURS_DEFAULT)
  if (!Number.isFinite(parsed) || parsed <= 0) return INVITE_TTL_HOURS_DEFAULT
  return parsed
}

const toBase64Url = (value: string): string => Buffer.from(value).toString('base64url')

const fromBase64Url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8')

const sign = (payloadPart: string, secret: string): string =>
  crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url')

const createInviteToken = (payload: InviteTokenPayload, secret: string): string => {
  const payloadPart = toBase64Url(JSON.stringify(payload))
  const signature = sign(payloadPart, secret)
  return `${payloadPart}.${signature}`
}

const verifyInviteToken = (token: string, secret: string): InviteTokenPayload | null => {
  const [payloadPart, signature] = token.split('.')
  if (!payloadPart || !signature) return null

  const expectedSignature = sign(payloadPart, secret)
  if (expectedSignature !== signature) return null

  try {
    const payload = JSON.parse(fromBase64Url(payloadPart)) as InviteTokenPayload
    if (!payload.inviterId || !payload.inviteeEmail || !payload.exp) return null
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

const extractUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item) return null
      if (typeof item === 'string' || typeof item === 'number') return String(item)
      if (typeof item === 'object' && 'id' in item && item.id) return String(item.id)
      return null
    })
    .filter((item): item is string => Boolean(item))
}

const parseJsonBody = async <T>(req: { json?: () => Promise<unknown> }): Promise<T | null> => {
  if (typeof req.json !== 'function') return null

  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

const inviteEndpoint: Endpoint = {
  path: '/invite',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secret = getSecret()
    if (!secret) {
      return Response.json({ error: 'Invite token secret is missing' }, { status: 500 })
    }

    const body = await parseJsonBody<{ email?: string }>(req)
    const inviteeEmail = normalizeEmail(body?.email ?? '')

    if (!EMAIL_PATTERN.test(inviteeEmail)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const inviterEmail = normalizeEmail(req.user.email ?? '')
    if (inviteeEmail === inviterEmail) {
      return Response.json({ error: 'You cannot invite yourself' }, { status: 400 })
    }

    const exp = Math.floor(Date.now() / 1000) + getInviteTtlHours() * 60 * 60
    const token = createInviteToken(
      {
        inviterId: String(req.user.id),
        inviteeEmail,
        exp,
      },
      secret,
    )

    const frontendBase =
      process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001'
    const inviteUrl = `${frontendBase.replace(/\/+$/, '')}${INVITE_LINK_PATH}?invite=${encodeURIComponent(token)}`

    return Response.json({
      expiresAt: new Date(exp * 1000).toISOString(),
      inviteUrl,
      token,
    })
  },
}

const acceptInviteEndpoint: Endpoint = {
  path: '/accept-invite',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secret = getSecret()
    if (!secret) {
      return Response.json({ error: 'Invite token secret is missing' }, { status: 500 })
    }

    const body = await parseJsonBody<{ token?: string }>(req)
    const token = (body?.token ?? '').trim()
    if (!token) {
      return Response.json({ error: 'Invite token is required' }, { status: 400 })
    }

    const invitePayload = verifyInviteToken(token, secret)
    if (!invitePayload) {
      return Response.json({ error: 'Invite token is invalid or expired' }, { status: 400 })
    }

    const currentUserId = String(req.user.id)
    const currentEmail = normalizeEmail(req.user.email ?? '')
    if (invitePayload.inviteeEmail !== currentEmail) {
      return Response.json(
        { error: 'Invite token was created for another email address' },
        { status: 403 },
      )
    }

    if (invitePayload.inviterId === currentUserId) {
      return Response.json({ error: 'You cannot accept your own invite' }, { status: 400 })
    }

    let inviterDoc: { connections?: unknown; email?: string } | null = null

    try {
      inviterDoc = (await req.payload.findByID({
        collection: 'users',
        id: invitePayload.inviterId,
        depth: 0,
        req,
      })) as { connections?: unknown; email?: string }
    } catch {
      return Response.json({ error: 'Inviter no longer exists' }, { status: 404 })
    }

    const currentDoc = (await req.payload.findByID({
      collection: 'users',
      id: currentUserId,
      depth: 0,
      overrideAccess: false,
      req,
      user: req.user,
    })) as { connections?: unknown }

    const inviterConnections = new Set(extractUserIds(inviterDoc.connections))
    const currentConnections = new Set(extractUserIds(currentDoc.connections))

    inviterConnections.add(currentUserId)
    currentConnections.add(invitePayload.inviterId)

    await req.payload.update({
      collection: 'users',
      id: invitePayload.inviterId,
      data: {
        connections: Array.from(inviterConnections),
      },
      req,
    })

    await req.payload.update({
      collection: 'users',
      id: currentUserId,
      data: {
        connections: Array.from(currentConnections),
      },
      req,
    })

    return Response.json({
      message: 'Users connected successfully',
      inviterEmail: inviterDoc.email ?? null,
    })
  },
}

const connectionsEndpoint: Endpoint = {
  path: '/connections',
  method: 'get',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const me = (await req.payload.findByID({
      collection: 'users',
      id: String(req.user.id),
      depth: 0,
      overrideAccess: false,
      req,
      user: req.user,
    })) as { connections?: unknown }

    const connectionIds = extractUserIds(me.connections)

    if (!connectionIds.length) {
      return Response.json({
        connections: [],
        currentUserEmail: req.user.email ?? null,
      })
    }

    const foundUsers = await req.payload.find({
      collection: 'users',
      depth: 0,
      limit: connectionIds.length,
      req,
      where: {
        id: {
          in: connectionIds,
        },
      },
    })

    const connections = foundUsers.docs
      .map((doc) => ({
        id: String(doc.id),
        email: doc.email ?? '',
      }))
      .filter((doc) => Boolean(doc.email))

    return Response.json({
      connections,
      currentUserEmail: req.user.email ?? null,
    })
  },
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    create: () => true,
    delete: () => false,
    read: ({ req }) => {
      if (!req.user) return false
      return {
        id: {
          equals: req.user.id,
        },
      }
    },
    update: () => false,
  },
  endpoints: [inviteEndpoint, acceptInviteEndpoint, connectionsEndpoint],
  fields: [
    {
      name: 'connections',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Users connected by invite flow',
      },
    },
  ],
}
