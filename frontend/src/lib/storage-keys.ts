/**
 * Names this app agrees on with itself inside browser-global namespaces.
 *
 * localStorage keys and a DOM event name are the same class of value: a string identifier in a
 * namespace shared with every other script on the page, where a typo does not throw — it silently
 * reads null, or registers a listener that never fires. They are grouped here so the whole set of
 * `chat.*` names the app owns is visible in one place.
 *
 * The three storage keys share a `chat.` prefix on purpose, so they are recognisable in devtools
 * and cannot collide with anything else on the origin.
 */

export const ACCESS_TOKEN_KEY = "chat.accessToken";
export const REFRESH_TOKEN_KEY = "chat.refreshToken";
export const USER_KEY = "chat.user";

/**
 * Dispatched on `window` by the API client when a token refresh fails, and listened for by
 * AuthProvider to drop the app to the login screen.
 *
 * A DOM event is used rather than a direct call so the axios module stays free of any React or
 * router dependency — a deliberate decoupling seam. The cost is that the two halves are joined
 * only by this string: misspell the dispatch and a dead session never routes anywhere, misspell
 * the removeEventListener and cleanup silently no-ops. Neither fails loudly, which is exactly why
 * the name is here instead of typed twice.
 */
export const AUTH_LOGOUT_EVENT = "auth:logout";
