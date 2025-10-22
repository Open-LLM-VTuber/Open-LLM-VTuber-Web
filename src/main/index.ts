/* eslint-disable no-shadow */
import { app, ipcMain, globalShortcut, desktopCapturer, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { WindowManager } from "./window-manager";
import { MenuManager } from "./menu-manager";

let windowManager: WindowManager;
let menuManager: MenuManager;
let isQuitting = false;

interface BackendAuthPayload {
  baseUrl: string;
  basicAuth: {
    enabled: boolean;
    username: string;
    password: string;
  };
}

interface BackendAuthState {
  hostname: string;
  port: string;
  header?: string;
}

const getDefaultPort = (protocol: string) => (protocol === 'https:' || protocol === 'wss:' ? '443' : '80');

let backendAuthState: BackendAuthState | null = null;

const matchesBackend = (targetUrl: string) => {
  if (!backendAuthState) return false;
  try {
    const parsed = new URL(targetUrl);
    const port = parsed.port || getDefaultPort(parsed.protocol);
    return parsed.hostname === backendAuthState.hostname && port === backendAuthState.port;
  } catch (error) {
    return false;
  }
};

const updateBackendAuthState = (payload: BackendAuthPayload) => {
  if (!payload?.baseUrl) {
    backendAuthState = null;
    return;
  }

  try {
    const parsed = new URL(payload.baseUrl);
    const port = parsed.port || getDefaultPort(parsed.protocol);
    backendAuthState = {
      hostname: parsed.hostname,
      port,
      header: payload.basicAuth?.enabled
        ? `Basic ${Buffer.from(`${payload.basicAuth.username}:${payload.basicAuth.password}`, 'utf-8').toString('base64')}`
        : undefined,
    };
  } catch (error) {
    backendAuthState = null;
  }
};

function setupIPC(): void {
  ipcMain.handle("get-platform", () => process.platform);

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

  ipcMain.on('update-backend-auth', (_event, payload: BackendAuthPayload) => {
    updateBackendAuthState(payload);
  });
}

function setupBackendAuthInterceptor(): void {
  const defaultSession = session?.defaultSession;
  if (!defaultSession) {
    return;
  }

  defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (backendAuthState && matchesBackend(details.url)) {
      const requestHeaders = { ...details.requestHeaders };
      if (backendAuthState.header) {
        requestHeaders.Authorization = backendAuthState.header;
      } else {
        delete requestHeaders.Authorization;
      }
      callback({ requestHeaders });
      return;
    }

    callback({ requestHeaders: details.requestHeaders });
  });
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
  setupBackendAuthInterceptor();

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
