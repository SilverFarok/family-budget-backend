import type { CollectionConfig, PayloadRequest } from 'payload'

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

const getVisibleUserIds = async (req: PayloadRequest) => {
  if (!req.user) return []

  const currentUser = (await req.payload.findByID({
    collection: 'users',
    id: String(req.user.id),
    depth: 0,
    overrideAccess: false,
    req,
    user: req.user,
  })) as { connections?: unknown }

  return Array.from(new Set([String(req.user.id), ...extractUserIds(currentUser.connections)]))
}

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  access: {
    read: async ({ req }) => {
      const visibleUserIds = await getVisibleUserIds(req)
      if (!visibleUserIds.length) return false

      return {
        user: {
          in: visibleUserIds,
        },
      }
    },
    create: ({ req }) => Boolean(req.user),
    update: async ({ req }) => {
      const visibleUserIds = await getVisibleUserIds(req)
      if (!visibleUserIds.length) return false

      return {
        user: {
          in: visibleUserIds,
        },
      }
    },
    delete: async ({ req }) => {
      const visibleUserIds = await getVisibleUserIds(req)
      if (!visibleUserIds.length) return false

      return {
        user: {
          in: visibleUserIds,
        },
      }
    },
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        if (!req.user) return data

        if (operation === 'create') {
          return {
            ...data,
            user: req.user.id,
          }
        }

        if (operation === 'update') {
          return {
            ...data,
            user: originalDoc?.user,
          }
        }

        return {
          ...data,
          user: originalDoc?.user ?? req.user.id,
        }
      },
    ],
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Опис',
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      label: 'Сума',
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Продукти', value: 'Продукти' },
        { label: 'Транспорт', value: 'Транспорт' },
        { label: 'Дім', value: 'Дім' },
        { label: "Здоров'я", value: "Здоров'я" },
        { label: 'Інше', value: 'Інше' },
      ],
    },
    {
      name: 'createdAt',
      type: 'date',
      defaultValue: () => new Date().toISOString(),
      label: 'Дата',
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        readOnly: true,
      },
    },
  ],
}
