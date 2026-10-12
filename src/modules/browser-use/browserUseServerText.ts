/**
 * The Browser API describes sessions with English sentences and action slugs
 * rather than codes. These helpers look the known ones up in the active locale
 * so a translated panel does not switch language mid-screen; anything they do
 * not recognize is shown as received.
 *
 * The keys exist only in locales that translate them. English is what the
 * server already sends, so `defaultValue` covers it without repeating the text.
 */

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

// Keyed by the exact sentence in server/modules/browser-use/browser-use.service.ts.
const SERVER_MESSAGE_SLUGS: Record<string, string> = {
  'Browser is disabled in settings.': 'disabled',
  'Install Playwright and Chromium to use browser sessions.': 'installRequired',
  'Playwright is installed, but Chromium is missing. Install the Chromium runtime to continue.': 'chromiumMissing',
  'Browser runtime is not ready.': 'runtimeNotReady',
  'Browser runtime is available.': 'runtimeAvailable',
  'Installing Playwright package...': 'installingPlaywright',
  'Installing Chromium system dependencies...': 'installingSystemDeps',
  'Installing Chromium runtime...': 'installingChromium',
  'Browser runtime installed.': 'runtimeInstalled',
  'Installing Chromium system dependencies requires administrator privileges. Run `npx playwright install-deps chromium` on the machine where CloudCLI runs, then try again.': 'sudoRequired',
  'Browser session is ready.': 'sessionReady',
  'Browser session expired after inactivity.': 'sessionExpired',
  'Browser session stopped. Create a new session to continue browsing.': 'sessionStopped',
  'Browser session stopped during server shutdown.': 'sessionStoppedShutdown',
};

/** The server sentences these helpers can translate. */
export const KNOWN_SERVER_MESSAGES = Object.keys(SERVER_MESSAGE_SLUGS);

/** Translates a status or session message reported by the Browser API. */
export function localizeServerMessage(message: string | null | undefined, t: TranslateFn): string {
  if (!message) return '';

  const slug = SERVER_MESSAGE_SLUGS[message];
  return slug ? t(`browserUse.serverMessages.${slug}`, { defaultValue: message }) : message;
}

/** Translates a `lastAction` value such as `click` or `navigate:<url>`. */
export function localizeAction(action: string, t: TranslateFn): string {
  // Only the first colon separates the action from its detail: URLs have their own.
  const separatorIndex = action.indexOf(':');
  const name = separatorIndex === -1 ? action : action.slice(0, separatorIndex);
  const detail = separatorIndex === -1 ? '' : action.slice(separatorIndex + 1);
  const label = t(`browserUse.actions.${name}`, { defaultValue: name.replace(/_/g, ' ') });

  return detail ? `${label}: ${detail}` : label;
}
