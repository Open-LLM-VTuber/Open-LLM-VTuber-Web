import { BrowserWindow, screen, shell, ipcMain } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

const isMac = process.platform === "darwin";

export class WindowManager {
  private window: BrowserWindow | null = null;
  private windowedBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private hoveringComponents: Set<string> = new Set();
  private currentMode: "window" | "pet" = "window";

  constructor() {
    ipcMain.on("renderer-ready-for-mode-change", (_event, newMode) => {
      if (newMode === "pet") {
        setTimeout(() => {
          this.continueSetWindowModePet();
        }, 300);
      } else this.continueSetWindowModeWindow();
    });

    ipcMain.on("mode-change-rendered", () => {
      this.window?.setOpacity(1);
    });
  }

  createWindow(): BrowserWindow {
    this.window = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      transparent: true,
      backgroundColor: "#ffffff",
      autoHideMenuBar: true,
      frame: false,
      ...(isMac ? { titleBarStyle: "hiddenInset" } : {}),
      ...(process.platform === "linux" ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: true,
      },
      hasShadow: false,
      paintWhenInitiallyHidden: true,
    });

    this.setupWindowEvents();
    this.loadContent();

    return this.window;
  }

  private setupWindowEvents(): void {
    if (!this.window) return;

    this.window.on("ready-to-show", () => {
      this.window?.show();
      this.window?.webContents.send(
        "window-maximized-change",
        this.window.isMaximized()
      );
    });

    this.window.on("maximize", () => {
      this.window?.webContents.send("window-maximized-change", true);
    });

    this.window.on("unmaximize", () => {
      this.window?.webContents.send("window-maximized-change", false);
    });

    this.window.on("maximize", () => {
      this.window?.webContents.send("window-maximized-change", true);
    });

    this.window.on("unmaximize", () => {
      this.window?.webContents.send("window-maximized-change", false);
    });

    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });
  }

  private loadContent(): void {
    if (!this.window) return;

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      this.window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      this.window.loadFile(join(__dirname, "../renderer/index.html"));
    }
  }

  setWindowMode(mode: "window" | "pet"): void {
    if (!this.window) return;

    this.currentMode = mode;
    this.window.setOpacity(0);

    if (mode === "window") {
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

    this.window.setBackgroundColor("#ffffff");
    this.window.webContents.send("pre-mode-changed", "window");
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

    this.window?.setIgnoreMouseEvents(false, { forward: true });

    this.window.webContents.send("mode-changed", "window");
  }

  private setWindowModePet(): void {
    if (!this.window) return;

    this.windowedBounds = this.window.getBounds();

    if (this.window.isFullScreen()) {
      this.window.setFullScreen(false);
    }

    this.window.setBackgroundColor("#00000000");

    this.window.setAlwaysOnTop(true, "screen-saver");
    this.window.setPosition(0, 0);

    this.window.webContents.send("pre-mode-changed", "pet");
  }

  private continueSetWindowModePet(): void {
    if (!this.window) return;

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    this.window.setSize(width, height);

    if (isMac) this.window.setWindowButtonVisibility(false);
    this.window.setResizable(false);
    this.window.setSkipTaskbar(true);
    this.window.setFocusable(false);

    if (isMac) {
      this.window.setIgnoreMouseEvents(true);
      this.window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }

    this.window.webContents.send("mode-changed", "pet");
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  setIgnoreMouseEvents(ignore: boolean): void {
    if (!this.window) return;

    if (isMac) {
      this.window.setIgnoreMouseEvents(ignore);
      // this.window.setIgnoreMouseEvents(ignore, { forward: true });
    } else {
      this.window.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }

  maximizeWindow(): void {
    if (!this.window) return;

    if (this.isWindowMaximized()) {
      if (this.windowedBounds) {
        this.window.setBounds(this.windowedBounds);
        this.windowedBounds = null;
        this.window.webContents.send("window-maximized-change", false);
      }
    } else {
      this.windowedBounds = this.window.getBounds();
      const { width, height } = screen.getPrimaryDisplay().workArea;
      this.window.setBounds({ x: 0, y: 0, width, height });
      this.window.webContents.send("window-maximized-change", true);
    }
  }

  isWindowMaximized(): boolean {
    if (!this.window) return false;
    const bounds = this.window.getBounds();
    const { width, height } = screen.getPrimaryDisplay().workArea;
    return bounds.width >= width && bounds.height >= height;
  }

  updateComponentHover(componentId: string, isHovering: boolean): void {
    if (this.currentMode === "window") return;

    if (isHovering) {
      this.hoveringComponents.add(componentId);
    } else {
      this.hoveringComponents.delete(componentId);
    }

    if (this.window) {
      const shouldIgnore = this.hoveringComponents.size === 0;
      if (isMac) {
        this.window.setIgnoreMouseEvents(shouldIgnore);
      } else {
        this.window.setIgnoreMouseEvents(shouldIgnore, { forward: true });
      }
      if (!shouldIgnore) {
        this.window.setFocusable(true);
      }
    }
  }
}