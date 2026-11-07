import sanitizeHtml from 'sanitize-html';
export const ARTICLE_STATUSES = ['draft', 'published', 'archived'] as const;
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      'b',
      'i',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
      'hr',
    ],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  }).trim();
}
export function hasArticleText(html: string) {
  return (
    sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/&(?:nbsp|#160);/g, ' ')
      .trim().length > 0
  );
}
