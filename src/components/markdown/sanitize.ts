import { defaultSchema, type Options } from 'rehype-sanitize'

export const markdownSanitizeSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [
      ...(defaultSchema.attributes?.blockquote ?? []),
      ['dataWeimoCentered', 'true'],
    ],
    code: [['className', /^language-./]],
  },
}
