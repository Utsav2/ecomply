import type { ReactNode } from "react";
import styles from "./Markdown.module.css";

// Minimal markdown renderer for the AI summary. Handles exactly the four
// constructs the summary prompt allows — paragraphs (blank-line separated),
// "- " bullet lists, `code` spans, **bold** — and renders everything else as
// literal text. Builds React nodes; no HTML injection, no dependencies.

const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(
        <code key={`${keyBase}c${i++}`} className={styles.code}>
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={`${keyBase}b${i++}`}>{tok.slice(2, -2)}</strong>,
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split(/\r?\n/);

  let para: string[] = [];
  let items: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    const key = `p${blocks.length}`;
    blocks.push(<p key={key}>{renderInline(para.join(" "), key)}</p>);
    para = [];
  };
  const flushList = () => {
    if (items.length === 0) return;
    const key = `ul${blocks.length}`;
    blocks.push(
      <ul key={key}>
        {items.map((item, j) => (
          <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
        ))}
      </ul>,
    );
    items = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
    } else if (/^\s*- /.test(line)) {
      flushPara();
      items.push(line.replace(/^\s*- /, ""));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return <div className={styles.root}>{blocks}</div>;
}
