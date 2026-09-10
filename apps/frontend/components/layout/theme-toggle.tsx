'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon, SystemIcon } from '@/components/icons';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rlaas-theme';

/**
 * Cycles system → light → dark.
 *
 * `system` removes `data-theme` entirely so the CSS media query takes over
 * again; the two explicit choices stamp the attribute, which wins in both
 * directions. The matching pre-paint script lives in `app/layout.tsx` so the
 * page never flashes the wrong theme before React mounts.
 */
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

const LABELS: Record<ThemeChoice, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice just won't survive a reload.
  }
}

export function ThemeToggle() {
  // Server-rendered markup can't know the stored choice, so the button renders
  // its neutral state until mount and only then reflects reality.
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setChoice(stored);
      }
    } catch {
      /* keep the default */
    }
  }, []);

  function advance() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    setChoice(next);
    applyTheme(next);
  }

  const Icon =
    choice === 'light' ? SunIcon : choice === 'dark' ? MoonIcon : SystemIcon;

  return (
    <button
      type="button"
      onClick={advance}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors duration-state hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
      aria-label={`Theme: ${LABELS[choice]}. Switch theme.`}
      title={mounted ? `Theme: ${LABELS[choice]}` : 'Theme'}
    >
      <Icon className="h-[1.125rem] w-[1.125rem]" />
    </button>
  );
}
