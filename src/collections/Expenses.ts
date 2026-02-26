import type { CollectionConfig } from 'payload'

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  access: {
    read: ({ req }) => {
      if (!req.user) return false
      return {
        user: {
          equals: req.user.id,
        },
      }
    },
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => {
      if (!req.user) return false
      return {
        user: {
          equals: req.user.id,
        },
      }
    },
    delete: ({ req }) => {
      if (!req.user) return false
      return {
        user: {
          equals: req.user.id,
        },
      }
    },
  },
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        if (!req.user) return data
        return {
          ...data,
          user: req.user.id,
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
