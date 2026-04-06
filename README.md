# Riboflavin

A document annotation tool built with React Flow. Paste any text to break it
into paragraph nodes, then highlight passages, write threaded replies, and tag
anything — all laid out on a pannable canvas.

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, click **Open Document**, and paste some text.

## How it works

- **Paragraphs** are arranged in a column on the left. Select text in any
  paragraph (or annotation) and click **Highlight** to create a linked
  annotation node.
- **Annotations** appear to the right of their source. Click an annotation to
  reply; double-click to edit. Replies inherit the thread color of their parent.
- **Tags** can be added to any node for lightweight categorization.

## Stack

- React + TypeScript
- [React Flow](https://reactflow.dev) for the node/edge canvas
- [Zustand](https://zustand-demo.pmnd.rs) for state management
- [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) for typography
