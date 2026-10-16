export const desktopWebPreferences = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false
} as const;

export function isDesktopUrl(url: string, origin: string) {
  try { return new URL(url).origin === origin && new URL(url).protocol === 'http:'; }
  catch { return false; }
}
