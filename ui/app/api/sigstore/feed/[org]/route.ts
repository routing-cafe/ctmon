import { NextRequest, NextResponse } from "next/server";
import { SigstoreEntry } from "@/types/sigstore";
import client from "@/lib/clickhouse";

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

interface FeedParams {
  params: Promise<{ org: string }>;
}

async function getSigstoreEntriesForOrg(org: string, limit: number = 50): Promise<SigstoreEntry[]> {
  const sql = `
    SELECT 
      tree_id,
      log_index,
      entry_uuid,
      integrated_time,
      repository_name
    FROM rekor_log_entries_by_github_repository
    WHERE repository_name LIKE {orgPattern:String}
    ORDER BY integrated_time DESC
    LIMIT {limit:UInt32}
    SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 268435456
  `;

  const resultSet = await client.query({
    query: sql,
    query_params: {
      orgPattern: `${org}/%`,
      limit: limit,
    },
    format: "JSONEachRow",
  });

  return await resultSet.json<SigstoreEntry>();
}

function generateRSSFeed(entries: SigstoreEntry[], org: string): string {
  const now = new Date().toUTCString();
  const feedUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://transparency.cafe'}/api/sigstore/feed/${org}`;
  const webUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://transparency.cafe'}/sigstore/search/${encodeURIComponent(org)}?type=github_organization`;

  const items = entries.map(entry => {
    const pubDate = new Date(entry.integrated_time).toUTCString();
    const entryUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://transparency.cafe'}/sigstore/entry/${entry.entry_uuid}`;
    
    const getTitle = () => {
      const repo = entry.repository_name || "Unknown Repository";
      return `Rekor: ${repo}`;
    };

    const getDescription = () => {
      let desc = `New Rekor transparency log entry for repository ${entry.repository_name || "unknown"}`;
      desc += `\nEntry UUID: ${entry.entry_uuid}`;
      desc += `\nTree ID: ${entry.tree_id}`;
      desc += `\nLog Index: ${entry.log_index}`;
      return desc;
    };

    return `
    <item>
      <title>${escapeXml(getTitle())}</title>
      <description>${escapeXml(getDescription())}</description>
      <link>${escapeXml(entryUrl)}</link>
      <guid isPermaLink="true">${escapeXml(entryUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`Sigstore Rekor Entries for ${org}`)}</title>
    <description>${escapeXml(`Recent Sigstore Rekor transparency log entries for GitHub organization ${org}`)}</description>
    <link>${escapeXml(webUrl)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${now}</lastBuildDate>
    <generator>transparency.cafe</generator>
    <language>en-us</language>
    <ttl>60</ttl>
    ${items}
  </channel>
</rss>`;
}

export async function GET(request: NextRequest, { params }: FeedParams) {
  try {
    const { org } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const entries = await getSigstoreEntriesForOrg(org, limit);
    const rssXml = generateRSSFeed(entries, org);

    return new NextResponse(rssXml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('RSS feed generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate RSS feed' },
      { status: 500 }
    );
  }
}