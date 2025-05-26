import { useEffect, useCallback } from 'react';

type KeyCombo = string[];
type ShortcutCallback = (e: KeyboardEvent) => void;

interface ShortcutOptions {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  preventDefault?: boolean;
  enabled?: boolean;
}

const defaultOptions: ShortcutOptions = {
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  preventDefault: true,
  enabled: true,
};

export function useKeyboardShortcut(
  keys: KeyCombo | string,
  callback: ShortcutCallback,
  options: ShortcutOptions = {},
) {
  const { ctrl, shift, alt, meta, preventDefault, enabled } = {
    ...defaultOptions,
    ...options,
  };

  const keyArray = Array.isArray(keys) ? keys : [keys];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const keyMatches = keyArray.includes(event.key.toLowerCase());
      const ctrlMatches = ctrl === event.ctrlKey;
      const shiftMatches = shift === event.shiftKey;
      const altMatches = alt === event.altKey;
      const metaMatches = meta === event.metaKey;

      if (keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches) {
        if (preventDefault) {
          event.preventDefault();
        }
        callback(event);
      }
    },
    [callback, keyArray, ctrl, shift, alt, meta, preventDefault, enabled],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Return a cleanup function that can be called manually if needed
  return () => document.removeEventListener('keydown', handleKeyDown);
}

// Example usage:
// useKeyboardShortcut(["n"], () => navigate("/proxies/new"), { ctrl: true });
// useKeyboardShortcut("Escape", closeModal);
// useKeyboardShortcut(["Delete", "Backspace"], handleDelete, { enabled: isDeleteEnabled });
