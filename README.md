# Open LLM Vtuber

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Using Nix (Recommended for NixOS users)

With [direnv](https://direnv.net/) and [nix-direnv](https://github.com/nix-community/nix-direnv):

```bash
direnv allow   # one-time, auto-loads the flake on every cd
npm install
npm run dev
```

Without direnv:

```bash
nix develop
npm install
npm run dev
```

The flake provides a NixOS-patched Electron binary via `ELECTRON_OVERRIDE_DIST_PATH`,
so no `LD_LIBRARY_PATH` exports are needed.

### Manual Setup

#### Install

```bash
$ npm install
```

#### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
