/**
 * Strip quoted history from an email reply, leaving only the new content —
 * the equivalent of Mailgun's stripped-html / stripped-text for providers
 * (SES) that deliver raw MIME without a stripped variant.
 *
 * Heuristic, not a full parser: cut everything from the earliest known
 * quote marker to the end. Major clients wrap the quoted thread in a
 * recognizable container (Gmail gmail_quote, Outlook divRplyFwdMsg, Apple
 * Mail blockquote type=cite, Thunderbird moz-cite-prefix, Yahoo
 * yahoo_quoted). When no marker matches, the content is returned unchanged
 * — the UI's quoted-content toggle simply has nothing to collapse.
 */

const HTML_QUOTE_MARKERS: RegExp[] = [
  /<div[^>]*class="[^"]*\bgmail_quote\b[^"]*"/i,
  /<div[^>]*id="divRplyFwdMsg"/i,
  /<div[^>]*id="appendonsend"/i,
  /<div[^>]*class="[^"]*\byahoo_quoted\b[^"]*"/i,
  /<div[^>]*class="[^"]*\bmoz-cite-prefix\b[^"]*"/i,
  /<blockquote[^>]*type="cite"/i,
  /<div[^>]*name="messageReplySection"/i,
]

export function stripQuotedHtml(html: string): string {
  if (!html) return html
  let cut = -1
  for (const marker of HTML_QUOTE_MARKERS) {
    const match = marker.exec(html)
    if (match && (cut === -1 || match.index < cut)) cut = match.index
  }
  if (cut <= 0) return html
  const stripped = html.slice(0, cut).trim()
  return stripped || html
}

const TEXT_QUOTE_MARKERS: RegExp[] = [
  // "On Mon, Jan 5, 2026 at 3:12 PM Name <a@b.com> wrote:" (possibly wrapped to a second line)
  /^On .{0,200}wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  // Outlook's separator line above the quoted headers
  /^_{10,}\s*$/m,
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
]

export function stripQuotedText(text: string): string {
  if (!text) return text
  let cut = -1
  for (const marker of TEXT_QUOTE_MARKERS) {
    const match = marker.exec(text)
    if (match && (cut === -1 || match.index < cut)) cut = match.index
  }
  if (cut <= 0) return text
  const stripped = text.slice(0, cut).trim()
  return stripped || text
}
