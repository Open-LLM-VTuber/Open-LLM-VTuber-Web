const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const chatscope = require('@chatscope/chat-ui-kit-react');

const filename = path.resolve(
  __dirname,
  '../src/renderer/src/components/sidebar/chat-history-panel.tsx',
);
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

function Passthrough({ children }) {
  return React.createElement(React.Fragment, null, children);
}

function renderPanel(messages) {
  // Keep the real panel and chatscope Message/Avatar. Stub only application
  // hooks, styles and surrounding layout so this runs without a browser.
  const imports = {
    react: React,
    '@chakra-ui/react': {
      Box: Passthrough,
      Spinner: () => null,
      Flex: Passthrough,
      Text: Passthrough,
      Icon: () => null,
    },
    './sidebar-styles': {
      sidebarStyles: {
        toolCallIndicator: {
          container: {},
          icon: {},
          text: {},
          spinner: {},
          completedIcon: {},
          errorIcon: {},
        },
      },
      chatPanelStyles: {},
    },
    '@chatscope/chat-ui-kit-react': {
      ...chatscope,
      MainContainer: Passthrough,
      ChatContainer: Passthrough,
      MessageList: Passthrough,
    },
    '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css': {},
    '@/context/chat-history-context': {
      useChatHistory: () => ({ messages }),
    },
    '@/context/character-config-context': {
      useConfig: () => ({ confName: 'Assistant' }),
    },
    '@/context/websocket-context': {
      useWebSocket: () => ({ baseUrl: 'http://localhost:12393' }),
    },
    '@emotion/react': { Global: () => null },
    'react-icons/fa': {},
    'react-i18next': {
      useTranslation: () => ({ t: (key) => key }),
    },
  };

  function requireMock(name) {
    if (!Object.hasOwn(imports, name)) {
      throw new Error(`Unexpected panel import: ${name}`);
    }
    return imports[name];
  }

  const loaded = { exports: {} };
  // Compile the repository's TSX with its existing TypeScript dependency;
  // no additional test runner or browser environment is needed.
  const evaluate = new Function('require', 'module', 'exports', compiled);
  evaluate(requireMock, loaded, loaded.exports);
  return renderToStaticMarkup(React.createElement(loaded.exports.default));
}

function message(content, overrides = {}) {
  return {
    id: 'message-1',
    role: 'ai',
    type: 'text',
    content,
    timestamp: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function escapeText(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function assertLiteralText(html, content) {
  // Check actual serialized content, not a prop sent to a mocked Message.
  assert.ok(
    html.includes(
      `<div class="cs-message__text-content">${escapeText(content)}</div>`,
    ),
    `Expected literal message content in rendered output:\n${html}`,
  );
  assert.ok(!html.includes('cs-message__html-content'));
}

const samples = [
  {
    name: 'multiline HTML and PHP',
    content: '```php\n<?php\n  echo "<h1>Hello</h1>";\n?>\n<div>\n    <p>Indented HTML</p>\n</div>\n```',
  },
  {
    name: 'literal entities and special characters',
    content: '&lt;div&gt; &amp; &#60; &#x3C; < > " \'',
  },
  {
    name: 'unsafe elements and attributes',
    content: [
      '<script>alert("test")</script>',
      '<img src="invalid" onerror="alert(1)">',
      '<svg onload="alert(2)"></svg>',
      '<a href="javascript:alert(3)">link</a>',
      '<iframe srcdoc="<h1>test</h1>"></iframe>',
    ].join('\n'),
  },
  {
    name: 'ordinary Unicode text',
    content: 'Hello, 世界 👋\n  Keep this indentation.\n\nGoodbye.',
  },
];

for (const role of ['human', 'ai']) {
  for (const sample of samples) {
    test(`${role}: ${sample.name} remains literal text`, () => {
      const html = renderPanel([message(sample.content, { role })]);
      assertLiteralText(html, sample.content);
      assert.ok(html.includes(
        role === 'ai' ? 'cs-message--incoming' : 'cs-message--outgoing',
      ));
      assert.ok(html.includes('cs-avatar'));
    });
  }
}

test('legacy history messages without type remain literal text', () => {
  for (const role of ['human', 'ai']) {
    const legacy = message('<p>Restored history</p>', { role });
    delete legacy.type;
    assertLiteralText(renderPanel([legacy]), legacy.content);
  }
});

test('partial streamed tags remain literal at every snapshot', () => {
  // Check render snapshots; stream accumulation itself belongs to the context.
  for (const content of [
    '<', '<div', '<div class="', '<div class="example">',
    '<div class="example">Hello</div>', '<?php', '<?php echo "<p>Hello</p>"; ?>',
  ]) {
    assertLiteralText(renderPanel([message(content)]), content);
  }
});

for (const status of ['running', 'completed', 'error']) {
  test(`tool status ${status} keeps its indicator instead of a chat bubble`, () => {
    const tool = message('', {
      type: 'tool_call_status',
      status,
      name: 'Assistant',
      tool_name: '<lookup>',
      tool_id: 'tool-1',
    });
    const html = renderPanel([tool]);
    const action = status === 'running' ? 'is using' : 'used';
    assert.ok(html.includes(`Assistant ${action} tool &lt;lookup&gt;`));
    assert.ok(!html.includes('cs-message__text-content'));
    assert.ok(!html.includes('cs-message__html-content'));
  });
}

test('empty ordinary messages remain filtered out', () => {
  const html = renderPanel([message('')]);
  assert.ok(html.includes('sidebar.noMessages'));
  assert.ok(!html.includes('cs-message__text-content'));
});

test('tool indicators coexist with escaped chat messages', () => {
  const content = '<h1>Hello</h1>';
  const html = renderPanel([
    message(content),
    message('', {
      id: 'tool-1',
      type: 'tool_call_status',
      status: 'running',
      name: 'Assistant',
      tool_name: 'lookup',
      tool_id: 'tool-1',
    }),
  ]);
  assertLiteralText(html, content);
  assert.ok(html.includes('Assistant is using tool lookup'));
});
