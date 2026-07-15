import type { ThemeMode } from '../settings/app-settings';

export function applyThemeMode(
  mode: ThemeMode,
  root: HTMLElement = document.documentElement,
): void {
  if (mode === 'system') {
    delete root.dataset.theme;
    return;
  }
  root.dataset.theme = mode;
}
