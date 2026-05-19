import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import React from "react";

const BASE: Style = {
  fontSize: 9,
  lineHeight: 1.6,
  color: "#333",
};

// Split raw HTML into inline segments, handling <strong> and <em>
function inlineSegments(html: string) {
  const segments: { text: string; bold: boolean; italic: boolean }[] = [];
  // strip any tags we don't handle inline, except strong/em
  const cleaned = html.replace(/<(?!\/?(strong|em)\b)[^>]+>/gi, "");
  const regex = /<(strong|em)>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > last) {
      segments.push({ text: decodeEntities(cleaned.slice(last, match.index)), bold: false, italic: false });
    }
    segments.push({
      text: decodeEntities(match[2]),
      bold: match[1] === "strong",
      italic: match[1] === "em",
    });
    last = match.index + match[0].length;
  }
  if (last < cleaned.length) {
    segments.push({ text: decodeEntities(cleaned.slice(last)), bold: false, italic: false });
  }
  return segments;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function fontFor(bold: boolean, italic: boolean) {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function InlineText({ html, style }: { html: string; style?: Style }) {
  const segs = inlineSegments(html);
  if (segs.length === 0) return null;
  if (segs.length === 1 && !segs[0].bold && !segs[0].italic) {
    return <Text style={{ ...BASE, ...style }}>{segs[0].text}</Text>;
  }
  return (
    <Text style={{ ...BASE, ...style }}>
      {segs.map((s, i) => (
        <Text key={i} style={{ fontFamily: fontFor(s.bold, s.italic) }}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

function getInnerHtml(tag: string, html: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) results.push(m[1]);
  return results;
}

export function htmlToPdfElements(html: string): React.ReactNode[] {
  if (!html) return [];
  const elements: React.ReactNode[] = [];

  // Match top-level block tags
  const blockRe = /<(p|h2|h3|h4|ul|ol|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = blockRe.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];

    if (tag === "h2") {
      elements.push(
        <InlineText key={key++} html={inner} style={{ fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2, marginTop: 6 }} />
      );
    } else if (tag === "h3" || tag === "h4") {
      elements.push(
        <InlineText key={key++} html={inner} style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 1, marginTop: 4 }} />
      );
    } else if (tag === "ul") {
      const items = getInnerHtml("li", inner);
      items.forEach((item) => {
        elements.push(
          <View key={key++} style={{ flexDirection: "row", marginBottom: 1 }}>
            <Text style={{ ...BASE, width: 12 }}>•</Text>
            <InlineText html={item} style={{ flex: 1 }} />
          </View>
        );
      });
    } else if (tag === "ol") {
      const items = getInnerHtml("li", inner);
      items.forEach((item, idx) => {
        elements.push(
          <View key={key++} style={{ flexDirection: "row", marginBottom: 1 }}>
            <Text style={{ ...BASE, width: 16 }}>{idx + 1}.</Text>
            <InlineText html={item} style={{ flex: 1 }} />
          </View>
        );
      });
    } else if (tag === "blockquote") {
      elements.push(
        <View key={key++} style={{ borderLeftWidth: 2, borderLeftColor: "#ccc", paddingLeft: 8, marginVertical: 3 }}>
          <InlineText html={inner} style={{ color: "#666", fontFamily: "Helvetica-Oblique" }} />
        </View>
      );
    } else {
      // p
      const text = inner.replace(/<br\s*\/?>/gi, "\n");
      if (decodeEntities(text.replace(/<[^>]+>/g, "")).trim()) {
        elements.push(<InlineText key={key++} html={text} style={{ marginBottom: 3 }} />);
      }
    }
  }

  return elements;
}
