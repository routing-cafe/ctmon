import { env } from "$env/dynamic/public";

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

export interface RSSItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
}

export interface RSSChannel {
  title: string;
  description: string;
  link: string;
  feedUrl: string;
  items: RSSItem[];
}

export function generateRSSFeed(channel: RSSChannel): string {
  const now = new Date().toUTCString();

  const items = channel.items
    .map(
      (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>
      <pubDate>${item.pubDate}</pubDate>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <description>${escapeXml(channel.description)}</description>
    <link>${escapeXml(channel.link)}</link>
    <atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${now}</lastBuildDate>
    <generator>transparency.cafe</generator>
    <language>en-us</language>
    <ttl>60</ttl>
    ${items}
  </channel>
</rss>`;
}

export function getBaseUrl(): string {
  return env.PUBLIC_BASE_URL || "https://transparency.cafe";
}

export function getRSSResponse(rssXml: string): Response {
  return new Response(rssXml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300", // Cache for 5 minutes
    },
  });
}
