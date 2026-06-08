/**
 * GET /app/[slug]  —  "Pray on the app" smart link.
 *
 * This is the FALLBACK target. When the app is installed, the OS intercepts the
 * verified App Link / Universal Link (see public/.well-known/*) and opens the app
 * directly — this handler never runs. It only executes when the link is NOT
 * intercepted (app not installed, or links not yet verified).
 *
 * The store badges link here with `?store=android|ios` so we can honour the store
 * the user actually clicked (rather than guessing). Resolution:
 *   - Explicit ?store= wins, else infer from the User-Agent.
 *   - Desktop → redirect straight to the chosen store (no app to deep-link into);
 *     with no store choice, fall back to the public profile.
 *   - Mobile → serve a tiny page that first tries the custom-scheme deep link
 *     (covers installed-but-unverified), then falls back to the store. The Play URL
 *     carries the slug as the install referrer so the app can auto-select the people
 *     group after a fresh install.
 */

// Slugs are generated lowercased with hyphens (see server/database/people-groups.ts).
const SLUG_RE = /^[a-z0-9-]+$/

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const config = useRuntimeConfig(event)

  // Reject anything that isn't a well-formed slug rather than reflecting it.
  if (!SLUG_RE.test(slug)) {
    return sendRedirect(event, '/', 302)
  }

  const ua = (getHeader(event, 'user-agent') || '').toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = /android/.test(ua)

  const referrer = `utm_source=doxa_web&utm_medium=referral&utm_content=${slug}`
  const playUrl =
    `https://play.google.com/store/apps/details?id=${config.mobileAppAndroidPackage}` +
    `&referrer=${encodeURIComponent(referrer)}`
  const appStoreUrl = config.mobileAppAppleId
    ? `https://apps.apple.com/app/id${config.mobileAppAppleId}`
    : null

  // Which store? The badge the user clicked wins; otherwise infer from the device.
  const storeParam = getQuery(event).store
  const store =
    storeParam === 'android' || storeParam === 'ios'
      ? storeParam
      : isAndroid
        ? 'android'
        : isIOS
          ? 'ios'
          : null
  const storeUrl = store === 'android' ? playUrl : store === 'ios' ? appStoreUrl : null

  // No resolvable store (desktop with no explicit choice, or iOS before the app is
  // live) → fall back to the public profile.
  if (!storeUrl) {
    return sendRedirect(event, `/${slug}`, 302)
  }

  // Desktop has no app to deep-link into — send them straight to the chosen store.
  if (!isAndroid && !isIOS) {
    return sendRedirect(event, storeUrl, 302)
  }

  // Triple-slash so go_router sees path "/app/<slug>" for both the custom scheme and
  // the https App Link. slug is validated above, so it's safe to inline into JS strings.
  const deepLink = `${config.mobileAppScheme}:///app/${slug}`

  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening Doxa Prayer…</title>
</head>
<body>
<p>Opening the Doxa Prayer app…</p>
<script>
(function () {
  var deepLink = ${JSON.stringify(deepLink)};
  var storeUrl = ${JSON.stringify(storeUrl)};
  var redirected = false;
  function goToStore() {
    if (redirected) return;
    redirected = true;
    window.location.replace(storeUrl);
  }
  // If the app opens, the page is backgrounded — cancel the store redirect.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') redirected = true;
  });
  window.addEventListener('pagehide', function () { redirected = true; });
  // Best-effort attempt to open an installed app via its custom scheme.
  try { window.location.href = deepLink; } catch (e) {}
  // Otherwise send the user to the store (carrying the install referrer on Android).
  setTimeout(goToStore, 1200);
})();
</script>
<noscript><a href="${storeUrl}">Continue to the app store</a></noscript>
</body>
</html>`
})
