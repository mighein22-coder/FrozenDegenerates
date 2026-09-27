import { describe, it, expect, vi } from 'vitest';
import { parseThemePreference, resolveTheme } from '../theme';

describe('parseThemePreference', () => {
  it('accepts the three stored values', () => {
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('system')).toBe('system');
  });

  it('defaults to dark when nothing, or something unexpected, is stored', () => {
    expect(parseThemePreference(null)).toBe('dark');
    expect(parseThemePreference(undefined)).toBe('dark');
    expect(parseThemePreference('')).toBe('dark');
    expect(parseThemePreference('Light')).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('ignores the device for an explicit choice', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('follows the device for system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});

describe('watchSystemTheme', () => {
  it('re-applies on a device change only while the preference is system', async () => {
    let onChange: () => void = () => {};
    let prefersLight = true;
    const store: Record<string, string> = {};
    const html = { dataset: {} as Record<string, string> };

    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; }
    });
    vi.stubGlobal('document', { documentElement: html });
    vi.stubGlobal('window', {
      matchMedia: () => ({
        get matches() { return prefersLight; },
        addEventListener: (_: string, cb: () => void) => { onChange = cb; }
      })
    });

    const { watchSystemTheme, setThemePreference } = await import('../theme');
    watchSystemTheme();

    setThemePreference('system');
    expect(html.dataset.theme).toBe('light');

    prefersLight = false;
    onChange();
    expect(html.dataset.theme).toBe('dark');

    // An explicit choice is not overridden by the device.
    setThemePreference('light');
    prefersLight = true;
    onChange();
    prefersLight = false;
    onChange();
    expect(html.dataset.theme).toBe('light');

    vi.unstubAllGlobals();
  });
});

describe('printInLightTheme', () => {
  it('prints on the light palette and restores the member\'s theme afterwards', async () => {
    const listeners: Record<string, () => void> = {};
    const html = { dataset: {} as Record<string, string> };

    vi.stubGlobal('localStorage', {
      getItem: () => 'dark',
      setItem: () => {}
    });
    vi.stubGlobal('document', { documentElement: html });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false, addEventListener: () => {} }),
      addEventListener: (type: string, cb: () => void) => { listeners[type] = cb; }
    });

    const { printInLightTheme, applyTheme } = await import('../theme');
    applyTheme();
    printInLightTheme();
    expect(html.dataset.theme).toBe('dark');

    listeners.beforeprint();
    expect(html.dataset.theme).toBe('light');

    listeners.afterprint();
    expect(html.dataset.theme).toBe('dark');

    vi.unstubAllGlobals();
  });
});
