import { defaultSchema, type Options } from 'rehype-sanitize'

export const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [
      ...(defaultSchema.attributes?.blockquote ?? []),
      ['dataWeimoCentered', 'true'],
    ],
    code: [
      ['className', /^language-./, 'math-inline', 'math-display'],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'weimo-card-markdown__list-image-pair'],
    ],
    ol: [
      ...(defaultSchema.attributes?.ol ?? []),
      ['type', '1', 'a', 'A', 'i', 'I'],
      ['dataMarkerStyle', 'paren-upper-roman', 'paren-decimal'],
      ['dataOptionGrid', 'true'],
    ],
  },
} satisfies Options
