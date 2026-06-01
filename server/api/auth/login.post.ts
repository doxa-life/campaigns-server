import bcrypt from 'bcrypt'
import { sql } from '../../utils/database'
import { logLoginFailed, logLogin } from '../../utils/activity-logger'
import { checkRateLimit, logRateLimitExceeded } from '../../utils/rate-limit'
import { generateToken, setAuthCookie } from '../../utils/auth'
import { readBody, getHeader, setResponseHeader } from 'h3'
import { createError } from '#imports'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password are required' })
  }

  // Check rate limit before processing login
  const userAgent = getHeader(event, 'user-agent') || undefined
  const rateCheck = await checkRateLimit('LOGIN_FAILED', 'email', email, 15 * 60 * 1000, 5)

  if (!rateCheck.allowed) {
    logRateLimitExceeded(email, '/api/auth/login', userAgent)
    setResponseHeader(event, 'Retry-After', rateCheck.retryAfterSeconds!)
    throw createError({
      statusCode: 429,
      statusMessage: `Too many login attempts. Try again in ${Math.ceil(rateCheck.retryAfterSeconds! / 60)} minutes.`
    })
  }

  // Query existing user from database
  const users = await sql`
    SELECT * FROM users WHERE email = ${email}
  `

  const user = users[0]

  if (!user) {
    logLoginFailed(email, userAgent, { reason: 'user_not_found' })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  // Check if user is verified
  if (!user.verified) {
    logLoginFailed(email, userAgent, { reason: 'not_verified' })
    throw createError({ statusCode: 401, statusMessage: 'Please verify your email address before logging in' })
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password)
  if (!isValidPassword) {
    logLoginFailed(email, userAgent, { reason: 'invalid_password' })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  const token = generateToken({
    userId: user.id,
    email: user.email,
    display_name: user.display_name
  })
  setAuthCookie(event, token)

  // Log successful login
  logLogin(user.id, userAgent)

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar: user.avatar,
      verified: user.verified,
      superadmin: user.superadmin
    }
  }
})
