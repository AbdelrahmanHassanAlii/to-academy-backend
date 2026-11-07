import { describe, expect, it } from 'vitest';
describe('article HTML allowlist', () => {
  it('preserves formatting and removes executable elements, attributes and URL schemes', async () => {
    const { sanitizeArticleHtml } =
      await import('../../src/modules/articles/utils/article.utils.js');
    const html =
      '<h2 onclick="alert(1)">عنوان</h2><p style="background:url(javascript:alert(1))">نص<strong>مهم</strong></p><script>alert(1)</script><svg onload="alert(1)"></svg><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">bad</a><a href="https://example.com">good</a>';
    const clean = sanitizeArticleHtml(html);
    expect(clean).toContain('<h2>عنوان</h2>');
    expect(clean).toContain('<strong>مهم</strong>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).not.toMatch(/script|onclick|onload|onerror|style=|svg|iframe|<img|javascript:/i);
    expect(
      sanitizeArticleHtml('<a href="//evil.example">x</a><a href="data:text/html,x">x</a>'),
    ).not.toContain('href');
  });
});
