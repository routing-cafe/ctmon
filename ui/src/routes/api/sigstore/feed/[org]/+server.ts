import type { RequestEvent } from "@sveltejs/kit";
import type { SigstoreEntry } from "$lib/types/sigstore";
import client from "$lib/server/clickhouse";
import { generateRSSFeed, getRSSResponse, getBaseUrl, type RSSItem } from "$lib/rss";

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
    SETTINGS max_execution_time = 5, max_threads = 1, max_memory_usage = 134217728
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

function createSigstoreOrgRSSItems(entries: SigstoreEntry[]): RSSItem[] {
  const baseUrl = getBaseUrl();

  return entries.map((entry) => {
    const pubDate = new Date(entry.integrated_time).toUTCString();
    const entryUrl = `${baseUrl}/sigstore/entry/${entry.entry_uuid}`;

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

    return {
      title: getTitle(),
      description: getDescription(),
      link: entryUrl,
      guid: entryUrl,
      pubDate: pubDate,
    };
  });
}

export async function GET({ params, url }: RequestEvent) {
  try {
    const { org } = params;
    if (!org) {
      return new Response("Organization parameter is required", { status: 400 });
    }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    const entries = await getSigstoreEntriesForOrg(org, limit);
    const items = createSigstoreOrgRSSItems(entries);

    const baseUrl = getBaseUrl();
    const feedUrl = `${baseUrl}/api/sigstore/feed/${encodeURIComponent(org)}`;
    const webUrl = `${baseUrl}/sigstore/search/${encodeURIComponent(org)}?type=github_organization`;

    const rssXml = generateRSSFeed({
      title: `Sigstore Rekor Entries for ${org}`,
      description: `Recent Sigstore Rekor transparency log entries for GitHub organization ${org}`,
      link: webUrl,
      feedUrl: feedUrl,
      items: items,
    });

    const response = getRSSResponse(rssXml);
    return new Response(response.body, { headers: response.headers });
  } catch (error) {
    console.error("RSS feed generation error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate RSS feed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
