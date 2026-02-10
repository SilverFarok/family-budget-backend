import { CollectionConfig } from 'payload/types'

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  access: {
    read: () => true,
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
  ],
}
