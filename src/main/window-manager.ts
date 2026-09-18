import {
  BrowserWindow, screen, shell, ipcMain,
} from 'electron';
import { join } from 'path';
import { execFile } from 'node:child_process';
import { is } from '@electron-toolkit/utils';

const isMac = process.platform === 'darwin';

// Linux/X11-only pet-mode cursor polling. On Linux, `screen.getCursorScreenPoint()`
// is backed by Chromium's cached `last_mouse_location` (only refreshed by mouse
// events Chromium actually processes), so it stays frozen while the pet window
// ignores mouse events — this is the root cause of the "pet clicks do nothing"
// bug on Linux. X11 is detected via `DISPLAY` being set and `WAYLAND_DISPLAY`
// absent. macOS keeps its native `forward` behavior, and Windows / Wayland
// sessions keep the original implementation unchanged.
const isX11 = !isMac
  && process.env.DISPLAY !== undefined
  && process.env.WAYLAND_DISPLAY === undefined;

export class WindowManager {
  private window: BrowserWindow | null = null;

  private windowedBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;

  private hoveringComponents: Set<string> = new Set();

  private currentMode: 'window' | 'pet' = 'window';

  // Track if mouse events are forcibly ignored
  private forceIgnoreMouse = false;

  // Timer for the X11 pet-mode cursor poll (see startPetCursorPolling)
  private petCursorPollTimer: ReturnType<typeof setInterval> | null = null;

  // Tracks whether the window is currently ignoring mouse events. Electron's
  // `BrowserWindow.isIgnoreMouseEvents()` getter does not exist on Electron 31
  // (Linux/Windows), so we keep our own flag — the main process is the only
  // place that changes this state in pet mode.
  private petWindowIsIgnoringMouse = false;

  // Guards against overlapping async X11 cursor queries (xdotool spawns).
  private petCursorPositionQueryInFlight = false;

  // Whether we already warned that xdotool is unavailable (X11 fallback).
  private warnedXdotoolMissing = false;

  constructor() {
    ipcMain.on('renderer-ready-for-mode-change', (_event, newMode) => {
      // [PetDebug] renderer ready for mode change -> ${newMode}
      if (newMode === 'pet') {
        setTimeout(() => {
          this.continueSetWindowModePet();
        }, 500);
      } else {
        setTimeout(() => {
          this.continueSetWindowModeWindow();
        }, 500);
      }
    });

    ipcMain.on('mode-change-rendered', () => {
      this.window?.setOpacity(1);
    });

    ipcMain.on('window-unfullscreen', () => {
      const window = this.getWindow();
      if (window && window.isFullScreen()) {
        window.setFullScreen(false);
      }
    });

    // Handle toggle force ignore mouse events from renderer
    ipcMain.on('toggle-force-ignore-mouse', () => {
      this.toggleForceIgnoreMouse();
    });
  }

  createWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    this.window = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      transparent: true,
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      frame: false,
      icon: process.platform === 'win32'
        ? join(__dirname, '../../resources/icon.ico')
        : join(__dirname, '../../resources/icon.png'),
      ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: true,
      },
      hasShadow: false,
      paintWhenInitiallyHidden: true,
      ...options,
    });

    this.setupWindowEvents();
    this.loadContent();

    this.window.on('enter-full-screen', () => {
      this.window?.webContents.send('window-fullscreen-change', true);
    });

    this.window.on('leave-full-screen', () => {
      this.window?.webContents.send('window-fullscreen-change', false);
    });

    return this.window;
  }

  private setupWindowEvents(): void {
    if (!this.window) return;

    this.window.on('ready-to-show', () => {
      this.window?.show();
      this.window?.webContents.send(
        'window-maximized-change',
        this.window.isMaximized(),
      );
    });

    this.window.on('maximize', () => {
      this.window?.webContents.send('window-maximized-change', true);
    });

    this.window.on('unmaximize', () => {
      this.window?.webContents.send('window-maximized-change', false);
    });

    this.window.on('resize', () => {
      const window = this.getWindow();
      if (window) {
        const bounds = window.getBounds();
        const { width, height } = screen.getPrimaryDisplay().workArea;
        const isMaximized = bounds.width >= width && bounds.height >= height;
        window.webContents.send('window-maximized-change', isMaximized);
      }
    });

    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });
  }

  private loadContent(): void {
    if (!this.window) return;

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      this.window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      this.window.loadFile(join(__dirname, '../renderer/index.html'));
    }
  }

  setWindowMode(mode: 'window' | 'pet'): void {
    if (!this.window) return;
    // [PetDebug] setWindowMode(${mode})

    this.currentMode = mode;
    this.window.setOpacity(0);

    if (mode === 'window') {
      this.setWindowModeWindow();
    } else {
      this.setWindowModePet();
    }
  }

  private setWindowModeWindow(): void {
    if (!this.window) return;

    this.window.setAlwaysOnTop(false);
    this.window.setIgnoreMouseEvents(false);
    this.window.setSkipTaskbar(false);
    this.window.setResizable(true);
    this.window.setFocusable(true);
    this.window.setAlwaysOnTop(false);

    this.window.setBackgroundColor('#ffffff');
    this.window.webContents.send('pre-mode-changed', 'window');
  }

  private continueSetWindowModeWindow(): void {
    if (!this.window) return;
    if (this.windowedBounds) {
      this.window.setBounds(this.windowedBounds);
    } else {
      this.window.setSize(900, 670);
      this.window.center();
    }

    if (isMac) {
      this.window.setWindowButtonVisibility(true);
      this.window.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: false,
      });
    }

    this.window?.setIgnoreMouseEvents(false);
    this.petWindowIsIgnoringMouse = false;
    // [PetDebug] pet -> window: setIgnoreMouseEvents(false), polling stopped

    this.window.webContents.send('mode-changed', 'window');

    // Leaving pet mode: stop the X11 cursor poll.
    this.syncPetCursorPolling();
  }

  private setWindowModePet(): void {
    if (!this.window) return;

    this.windowedBounds = this.window.getBounds();

    if (this.window.isFullScreen()) {
      this.window.setFullScreen(false);
    }

    this.window.setBackgroundColor('#00000000');

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setPosition(0, 0);

    this.window.webContents.send('pre-mode-changed', 'pet');
  }

  private continueSetWindowModePet(): void {
    if (!this.window) return;
    // Calculate the bounding rectangle that covers all connected displays.
    // This allows the transparent pet-mode window to span across monitors,
    // so the avatar can be dragged freely between them.
    const displays = screen.getAllDisplays();
    const minX = Math.min(...displays.map((d) => d.bounds.x));
    const minY = Math.min(...displays.map((d) => d.bounds.y));
    const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
    const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
    const combinedWidth = maxX - minX;
    const combinedHeight = maxY - minY;

    // Resize and position the window to cover the entire virtual screen
    // so the avatar is not clipped when dragged to a second monitor.
    this.window.setBounds({
      x: minX,
      y: minY,
      width: combinedWidth,
      height: combinedHeight,
    });
    // [PetDebug] pet bounds=${JSON.stringify({ minX, minY, combinedWidth, combinedHeight })}

    if (isMac) this.window.setWindowButtonVisibility(false);
    this.window.setResizable(false);
    this.window.setSkipTaskbar(true);
    this.window.setFocusable(false);

    if (isMac) {
      this.window.setIgnoreMouseEvents(true);
      this.window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    } else if (isX11) {
      // NOTE: Electron's `forward: true` option is macOS-only. On Linux/X11 an
      // ignoring window receives no mouse events at all, so the renderer's
      // hover detection can never fire while ignored. Interactivity is instead
      // restored by cursor polling (see startPetCursorPolling) + renderer-side
      // hit-testing below.
      this.window.setIgnoreMouseEvents(true);
    } else {
      // Windows / Linux-Wayland: keep the original behavior (`forward` is a
      // no-op there, but this matches the pre-fix implementation).
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }
    this.petWindowIsIgnoringMouse = true;

    this.window.webContents.send('mode-changed', 'pet');
    // [PetDebug] window -> pet: ignoreMouse=true, focusable=false

    // X11 only: keep hit-testing alive while the window is click-through.
    this.syncPetCursorPolling();
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  setIgnoreMouseEvents(ignore: boolean): void {
    if (!this.window) return;

    if (isMac) {
      this.window.setIgnoreMouseEvents(ignore);
    } else if (isX11) {
      // `forward` is macOS-only; X11 interactivity is driven by cursor polling
      // (see startPetCursorPolling).
      this.window.setIgnoreMouseEvents(ignore);
    } else {
      // Windows / Wayland: original behavior.
      this.window.setIgnoreMouseEvents(ignore, { forward: true });
    }
    this.petWindowIsIgnoringMouse = ignore;
    // [PetDebug] setIgnoreMouseEvents(from renderer) -> ${ignore}
  }

  maximizeWindow(): void {
    if (!this.window) return;

    if (this.isWindowMaximized()) {
      if (this.windowedBounds) {
        this.window.setBounds(this.windowedBounds);
        this.windowedBounds = null;
        this.window.webContents.send('window-maximized-change', false);
      }
    } else {
      this.windowedBounds = this.window.getBounds();
      const { width, height } = screen.getPrimaryDisplay().workArea;
      this.window.setBounds({
        x: 0, y: 0, width, height,
      });
      this.window.webContents.send('window-maximized-change', true);
    }
  }

  isWindowMaximized(): boolean {
    if (!this.window) return false;
    const bounds = this.window.getBounds();
    const { width, height } = screen.getPrimaryDisplay().workArea;
    return bounds.width >= width && bounds.height >= height;
  }

  updateComponentHover(componentId: string, isHovering: boolean): void {
    if (this.currentMode === 'window') return;

    // If force ignore is enabled, don't change the mouse ignore state
    if (this.forceIgnoreMouse) return;

    if (isHovering) {
      this.hoveringComponents.add(componentId);
    } else {
      this.hoveringComponents.delete(componentId);
    }
    // [PetDebug] updateComponentHover(${componentId}, ${isHovering}) hovering=[...]

    if (this.window) {
      const shouldIgnore = this.hoveringComponents.size === 0;
      // [PetDebug]   -> setIgnoreMouseEvents(${shouldIgnore})
      if (isMac) {
        this.window.setIgnoreMouseEvents(shouldIgnore);
      } else if (isX11) {
        this.window.setIgnoreMouseEvents(shouldIgnore);
      } else {
        // Windows / Wayland: original behavior.
        this.window.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      }
      this.petWindowIsIgnoringMouse = shouldIgnore;
      if (!shouldIgnore) {
        this.window.setFocusable(true);
      }
    }
  }

  // Toggle force ignore mouse events
  toggleForceIgnoreMouse(): void {
    this.forceIgnoreMouse = !this.forceIgnoreMouse;
    // [PetDebug] toggleForceIgnoreMouse -> ${this.forceIgnoreMouse}

    // Apply the new setting immediately
    if (this.forceIgnoreMouse) {
      if (isMac) {
        this.window?.setIgnoreMouseEvents(true);
      } else if (isX11) {
        // `forward` is macOS-only; see startPetCursorPolling.
        this.window?.setIgnoreMouseEvents(true);
      } else {
        this.window?.setIgnoreMouseEvents(true, { forward: true });
      }
      this.petWindowIsIgnoringMouse = true;
    } else {
      // Reapply normal behavior based on hovering components
      const shouldIgnore = this.hoveringComponents.size === 0;
      if (isMac) {
        this.window?.setIgnoreMouseEvents(shouldIgnore);
      } else if (isX11) {
        this.window?.setIgnoreMouseEvents(shouldIgnore);
      } else {
        this.window?.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      }
      this.petWindowIsIgnoringMouse = shouldIgnore;
    }

    // Notify renderer about the change
    this.window?.webContents.send('force-ignore-mouse-changed', this.forceIgnoreMouse);
  }

  // Get current force ignore state
  isForceIgnoreMouse(): boolean {
    return this.forceIgnoreMouse;
  }

  /**
   * Start/stop the X11 pet-mode cursor poll depending on the current mode.
   */
  private syncPetCursorPolling(): void {
    if (isX11 && this.currentMode === 'pet' && this.window) {
      this.startPetCursorPolling();
    } else {
      this.stopPetCursorPolling();
    }
  }

  /**
   * Query the global pointer position.
   *
   * On Linux/X11, `screen.getCursorScreenPoint()` is backed by Chromium's
   * `Env::last_mouse_location` — the position from the last mouse event the
   * browser process processed. A click-through pet window receives no mouse
   * events at all, so that value stays frozen (this is the root cause of the
   * "click-through never lifts" bug on Linux). We therefore query X11 directly
   * via `xdotool getmouselocation` (XQueryPointer, always live), and only fall
   * back to the Electron API when `xdotool` is not installed.
   */
  private queryGlobalCursorPosition(): Promise<{ x: number; y: number } | null> {
    return new Promise((resolve) => {
      execFile(
        'xdotool',
        ['getmouselocation', '--shell'],
        { timeout: 1000 },
        (error, stdout) => {
          if (error) {
            if (!this.warnedXdotoolMissing) {
              this.warnedXdotoolMissing = true;
              console.warn(
                '[PetDebug] WARN: xdotool unavailable; falling back to screen.getCursorScreenPoint(), ' +
                'which stays frozen while the pet window ignores mouse events on Linux. ' +
                'Install xdotool (e.g. `sudo apt install xdotool`) for working pet-mode interaction.',
              );
            }
            const fallback = screen.getCursorScreenPoint();
            resolve({ x: fallback.x, y: fallback.y });
            return;
          }
          const xMatch = /X=(\d+)/.exec(stdout);
          const yMatch = /Y=(\d+)/.exec(stdout);
          if (!xMatch || !yMatch) {
            resolve(null);
            return;
          }
          resolve({ x: Number(xMatch[1]), y: Number(yMatch[1]) });
        },
      );
    });
  }

  private startPetCursorPolling(): void {
    if (this.petCursorPollTimer || !this.window) return;
    // [PetDebug] pet cursor polling started

    const window = this.window;
    this.petCursorPollTimer = setInterval(() => {
      if (window.isDestroyed()) {
        // [PetDebug] poll: window destroyed, stopping
        this.stopPetCursorPolling();
        return;
      }
      // Only poll while input is not forcibly opened/closed by the user.
      if (this.currentMode !== 'pet' || this.forceIgnoreMouse) {
        // [PetDebug] poll: skip (mode=${this.currentMode}, force=${this.forceIgnoreMouse})
        return;
      }
      // While the window does NOT ignore mouse events, the renderer receives
      // real events and does its own hit-testing; no polling needed.
      // (Electron 31 has no `isIgnoreMouseEvents()` getter, so we track the
      // state ourselves — see petWindowIsIgnoringMouse.)
      if (!this.petWindowIsIgnoringMouse) return;
      // Don't overlap async X11 queries on slow systems.
      if (this.petCursorPositionQueryInFlight) return;

      this.petCursorPositionQueryInFlight = true;
      this.queryGlobalCursorPosition().then((cursor) => {
        this.petCursorPositionQueryInFlight = false;
        if (!cursor || window.isDestroyed()) return;

        const bounds = window.getBounds();
        const localX = cursor.x - bounds.x;
        const localY = cursor.y - bounds.y;
        // [PetDebug] poll: cursor=(${cursor.x},${cursor.y}) local=(${localX},${localY})
        window.webContents.send('pet-cursor-position', {
          x: localX,
          y: localY,
        });
      });
    }, 80);
  }

  private stopPetCursorPolling(): void {
    if (this.petCursorPollTimer) {
      clearInterval(this.petCursorPollTimer);
      this.petCursorPollTimer = null;
      // [PetDebug] pet cursor polling stopped
    }
  }

  // Get current mode
  getCurrentMode(): 'window' | 'pet' {
    return this.currentMode;
  }
}