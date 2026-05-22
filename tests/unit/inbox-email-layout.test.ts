import { describe, expect, it } from 'vitest'
import { renderInboxMessageEmail, renderAdminNotificationEmail } from '../../server/utils/inbox-email-layout'

describe('inbox email layout', () => {
  describe('renderInboxMessageEmail (light shell for auto-ack + reply + held-sender)', () => {
    it('wraps the body in the brand light shell', () => {
      const html = renderInboxMessageEmail({ bodyHtml: '<p>On it!</p>', subject: 'Re: Hello' })
      // Brand light shell markers shared by auto-ack and the human reply.
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('color: #3B463D')
      expect(html).toContain('max-width: 600px')
      // No heavy-template chrome: no logo banner, no colored header bar, no "automated" footer.
      expect(html).not.toContain('template-header-doxa')
      expect(html).not.toContain('automated notification')
      // The composed body is passed through untouched.
      expect(html).toContain('<p>On it!</p>')
    })

    it('reflects the locale in the lang attribute and escapes the subject into the title', () => {
      const html = renderInboxMessageEmail({ bodyHtml: '<p>hi</p>', locale: 'es', subject: 'A & B' })
      expect(html).toContain('<html lang="es">')
      expect(html).toContain('<title>A &amp; B</title>')
    })

    it('defaults the lang attribute to en', () => {
      const html = renderInboxMessageEmail({ bodyHtml: '<p>hi</p>' })
      expect(html).toContain('<html lang="en">')
    })
  })

  describe('renderAdminNotificationEmail (legacy admin shell for staff notifications)', () => {
    it('matches the legacy admin look with heading, content, and footer', () => {
      const html = renderAdminNotificationEmail({
        heading: 'New inbox message',
        contentHtml: '<p>From: someone</p>',
        appName: 'DOXA Prayer',
      })
      // Legacy admin shell: #333 body text, #3B463D heading, standard footer line.
      expect(html).toContain('color: #333')
      expect(html).toContain('<h2 style="color: #3B463D; margin-bottom: 20px;">New inbox message</h2>')
      expect(html).toContain('This is an automated notification from DOXA Prayer.')
      expect(html).toContain('<p>From: someone</p>')
    })

    it('escapes the heading and app name', () => {
      const html = renderAdminNotificationEmail({
        heading: 'A <b>review</b>',
        contentHtml: '',
        appName: 'Ben & Co',
      })
      expect(html).toContain('A &lt;b&gt;review&lt;/b&gt;')
      expect(html).toContain('This is an automated notification from Ben &amp; Co.')
    })

    it('allows overriding the footer note', () => {
      const html = renderAdminNotificationEmail({
        heading: 'h',
        contentHtml: '',
        appName: 'App',
        footerNote: 'Custom footer',
      })
      expect(html).toContain('Custom footer')
      expect(html).not.toContain('This is an automated notification from')
    })
  })
})
