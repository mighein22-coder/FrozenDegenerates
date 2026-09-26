/**
 * Light / dark theme.
 *
 * The choice is per browser (localStorage), not per account: it has to apply
 * on the login screen, before anyone is signed in, and it needs no schema
 * change. The palettes themselves live in index.html as CSS variables keyed on
 * `<html data-theme>`; this module only decides which one is active.
 *
 * index.html carries an inline copy of `resolveTheme` that runs before first
 * paint, so a light-mode member never sees a flash of dark. Keep the two in step.
 */

export type ThemePreference = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'icepick-theme';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : DEFAULT_THEME_PREFERENCE;
}

export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): Theme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark';
  return preference;
}

export function getThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be blocked (private mode, site data disabled); fall back to the default.
    return DEFAULT_THEME_PREFERENCE;
  }
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(LIGHT_QUERY).matches;
}

export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  document.documentElement.dataset.theme = resolveTheme(preference, systemPrefersLight());
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted, but still applied for this page load.
  }
  applyTheme(preference);
}

/**
 * Follow the device when the preference is "system". Installed once at startup
 * rather than by the Settings view, so the app tracks a device switching to
 * dark at sunset whichever screen is open.
 */
export function watchSystemTheme(): void {
  const media = window.matchMedia?.(LIGHT_QUERY);
  media?.addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
