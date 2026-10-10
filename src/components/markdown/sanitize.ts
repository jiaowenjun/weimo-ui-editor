import { defaultSchema, type Options } from 'rehype-sanitize'

export const markdownSanitizeSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./]],
  },
}
