// Constants shared between main and renderer. Only the LOCAL API port lives
// here — the Laravel server URL is a main-process-only concern (the
// renderer never talks to Laravel directly, only to our own local Express
// API), so it stays in src/main/config.js instead.
export const LOCAL_API_PORT = 34115

export function localApiUrl(pathname) {
  return `http://127.0.0.1:${LOCAL_API_PORT}${pathname}`
}
