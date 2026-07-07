// The Google Identity Services script (accounts.google.com/gsi/client) is
// loaded with `async defer` in index.html and - unlike the older deprecated
// `platform.js` library - never calls a `window.onGoogleLibraryLoad` hook.
// Waiting on that hook (as this code used to) means `google.accounts.id.initialize()`
// often never runs before the user clicks "Continue with Google", so `prompt()`
// gets called against an uninitialized client - which is why the popup felt
// slow/inconsistent instead of appearing immediately on click.
//
// This just polls until the script has actually finished loading.
export function pollUntilGoogleIdentityReady(onReady: () => void, intervalMs = 100): void {
  const tryNow = () => {
    const google = (window as any).google;
    if (typeof google !== 'undefined' && google?.accounts?.id) {
      onReady();
    } else {
      setTimeout(tryNow, intervalMs);
    }
  };
  tryNow();
}
