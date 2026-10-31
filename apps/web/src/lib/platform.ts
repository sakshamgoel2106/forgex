import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Returns true when running inside a native mobile container (Capacitor Android or iOS).
 * Returns false when running in a standard web browser or PWA.
 */
export function isNative(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Returns the current platform identifier ('android' | 'ios' | 'web').
 */
export function getPlatform(): 'android' | 'ios' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'android') return 'android';
  if (p === 'ios') return 'ios';
  return 'web';
}

/**
 * Initializes native mobile platform capabilities:
 * - Sets the status bar style to Dark with #0f172a navy background
 * - Ensures web content does not overlap the status bar
 */
export async function initNativePlatform(): Promise<void> {
  if (!isNative()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0F172A' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('[ForgeX Native] StatusBar initialization warning:', err);
  }
}

/**
 * Sets up the Android hardware back button handler.
 * @param onBack Callback that returns true if the in-app navigation handled the back action,
 *               or false if the app is already on the root screen and should exit.
 */
export function setupBackButtonHandler(onBack: () => boolean): () => void {
  if (!isNative()) return () => {};

  let isMounted = true;
  let listenerHandle: any = null;

  CapApp.addListener('backButton', () => {
    if (!isMounted) return;
    const handled = onBack();
    if (!handled) {
      CapApp.exitApp();
    }
  }).then((handle) => {
    listenerHandle = handle;
  }).catch((err) => {
    console.warn('[ForgeX Native] Back button listener registration failed:', err);
  });

  return () => {
    isMounted = false;
    if (listenerHandle?.remove) {
      listenerHandle.remove();
    }
  };
}
