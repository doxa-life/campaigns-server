import { setResponseHeader } from 'h3'

export default defineEventHandler((event) => {
  const path = event.path

  if (!path.startsWith('/api/people-groups/')) return

  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
  setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')

  if (getMethod(event) === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
