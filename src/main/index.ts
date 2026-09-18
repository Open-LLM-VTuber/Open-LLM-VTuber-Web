/* eslint-disable no-shadow */
import { app, ipcMain, globalShortcut, desktopCapturer, BrowserWindow } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { WindowManager } from "./window-manager";
import { MenuManager } from "./menu-manager";

let windowManager: WindowManager;
let menuManager: MenuManager;
let isQuitting = false;
let sharePickerWindow: BrowserWindow | null = null;

function setupIPC(): void {
  ipcMain.handle("get-platform", () => process.platform);

  // Forward renderer console output to the main-process terminal so debug
  // logging is visible without opening DevTools (pet-mode debugging).
  ipcMain.on("renderer-log", (_event, ...args: unknown[]) => {
    console.log("[renderer]", ...args);
  });

  ipcMain.on("set-ignore-mouse-events", (_event, ignore: boolean) => {
    const window = windowManager.getWindow();
    if (window) {
      windowManager.setIgnoreMouseEvents(ignore);
    }
  });

  ipcMain.on("get-current-mode", (event) => {
    event.returnValue = windowManager.getCurrentMode();
  });

  ipcMain.on("pre-mode-changed", (_event, newMode) => {
    if (newMode === 'window' || newMode === 'pet') {
      menuManager.setMode(newMode);
    }
  });

  ipcMain.on("window-minimize", () => {
    windowManager.getWindow()?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    const window = windowManager.getWindow();
    if (window) {
      windowManager.maximizeWindow();
    }
  });

  ipcMain.on("window-close", () => {
    const window = windowManager.getWindow();
    if (window) {
      if (process.platform === "darwin") {
        window.hide();
      } else {
        window.close();
      }
    }
  });

  ipcMain.on(
    "update-component-hover",
    (_event, componentId: string, isHovering: boolean) => {
      windowManager.updateComponentHover(componentId, isHovering);
    },
  );

  ipcMain.handle("get-config-files", () => {
    const configFiles = JSON.parse(localStorage.getItem("configFiles") || "[]");
    menuManager.updateConfigFiles(configFiles);
    return configFiles;
  });

  ipcMain.on("update-config-files", (_event, files) => {
    menuManager.updateConfigFiles(files);
  });

  ipcMain.handle('get-screen-capture', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources[0].id;
  });

  // Return every capturable source (screens + windows) with thumbnails so the
  // renderer can show a picker for full-screen / single-window sharing.
  ipcMain.handle('get-capture-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
      display_id: source.display_id,
    }));
  });

  // Dedicated "select share source" window: big thumbnails for screens and
  // windows, followed by an adjustable region step. Opens on demand from the
  // renderer (sidebar screen panel and pet-mode share button alike).
  ipcMain.handle('open-share-picker', () => {
    createSharePickerWindow();
  });

  // Picker confirmed a source (and optional region): forward to the main
  // window so its capture context starts sharing, then close the picker.
  ipcMain.on('share-picker-confirm', (_event, payload: {
    sourceId: string;
    sourceName?: string;
    region: { x: number; y: number; width: number; height: number } | null;
  }) => {
    windowManager.getWindow()?.webContents.send('share-picker-result', payload);
    if (sharePickerWindow && !sharePickerWindow.isDestroyed()) {
      sharePickerWindow.close();
    }
  });

  // Picker's stop button: ask the main window to stop sharing. The picker
  // stays open so the user can immediately pick a new source.
  ipcMain.on('share-picker-stop', () => {
    windowManager.getWindow()?.webContents.send('share-picker-stop');
  });
}

function createSharePickerWindow(): void {
  if (sharePickerWindow && !sharePickerWindow.isDestroyed()) {
    sharePickerWindow.show();
    sharePickerWindow.focus();
    return;
  }

  const picker = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 660,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'Select Share Source',
    backgroundColor: '#111111',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  sharePickerWindow = picker;
  picker.on('closed', () => {
    if (sharePickerWindow === picker) {
      sharePickerWindow = null;
    }
  });
  picker.once('ready-to-show', () => picker.show());

  // The renderer app renders a dedicated share-picker page instead of the
  // main UI when this flag is present.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    picker.loadURL(`${process.env.ELECTRON_RENDERER_URL}?share-picker=1`);
  } else {
    picker.loadFile(join(__dirname, '../renderer/index.html'), {
      search: 'share-picker=1',
    });
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");

  windowManager = new WindowManager();
  menuManager = new MenuManager((mode) => windowManager.setWindowMode(mode));

  const window = windowManager.createWindow({
    titleBarOverlay: {
      color: "#111111",
      symbolColor: "#FFFFFF",
      height: 30,
    },
  });
  menuManager.createTray();

  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
    return false;
  });

  // if (process.env.NODE_ENV === "development") {
  //   globalShortcut.register("F12", () => {
  //     const window = windowManager.getWindow();
  //     if (!window) return;

  //     if (window.webContents.isDevToolsOpened()) {
  //       window.webContents.closeDevTools();
  //     } else {
  //       window.webContents.openDevTools();
  //     }
  //   });
  // }

  setupIPC();

  app.on("activate", () => {
    const window = windowManager.getWindow();
    if (window) {
      window.show();
    }
  });

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on('web-contents-created', (_, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  menuManager.destroy();
  globalShortcut.unregisterAll();
});
