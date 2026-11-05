# Open LLM Vtuber

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Tests

```bash
$ npm test
```

The chat rendering tests use Node.js's built-in test runner (Node.js 18 or newer)
and the existing TypeScript and React dependencies. They render the actual chat
panel and Chatscope messages with application hooks and surrounding layout
stubbed, so no backend or browser is required. They verify literal text rendering,
including code, restored history and partial streamed messages. They do not test
browser layout, audio or WebSocket state transitions.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
