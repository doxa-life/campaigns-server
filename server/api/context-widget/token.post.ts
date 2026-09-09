/**
 * POST /api/context-widget/token — mint a handoff token for the embedded
 * Context chat widget.
 *
 * Called same-origin by the widget, so the `auth-token` cookie identifies the
 * caller. Anyone logged in here may ask the assistant questions; the widget is
 * read-only and answers only from the Context workspace's own portfolios.
 *
 * The token is a short-lived HS256 JWT signed with the widget client's secret,
 * which the Context host holds too. It carries the user's id and display name
 * so questions can be attributed in that host's log — never their email.
 */
import jwt from 'jsonwebtoken'

// The Context host rejects anything longer-lived than 15 minutes.
const TOKEN_TTL_SECONDS = 300

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const config = useRuntimeConfig()
  const secret = String(config.contextWidgetSecret || '')
  const clientId = String(config.public.contextWidgetClientId || '')

  if (!secret || !clientId) {
    throw createError({ statusCode: 503, statusMessage: 'The context widget is not configured.' })
  }

  const token = jwt.sign(
    { name: user.display_name || '' },
    secret,
    {
      algorithm: 'HS256',
      subject: String(user.userId),
      audience: clientId,
      expiresIn: TOKEN_TTL_SECONDS
    }
  )

  return { token }
})
