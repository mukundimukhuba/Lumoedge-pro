/**
 * Horizontal page-push helpers for Chart Scanner / Connect / Quotes.
 * Prefer stack push (slide_from_right) over modal sheets or silent replace.
 */
import { router, type Href } from 'expo-router';

export type AppPageHref =
  | '/'
  | '/quotes'
  | '/chart-scanner'
  | '/connect-broker';

/** Open a main app page with a horizontal push when possible. */
export function pushAppPage(href: AppPageHref) {
  router.push(href as Href);
}

/** Pop back if the stack allows; otherwise land on Home without a blank flash. */
export function popToHome() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/' as Href);
}
