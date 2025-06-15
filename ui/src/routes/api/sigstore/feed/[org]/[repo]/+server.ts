import type { RequestEvent } from "@sveltejs/kit";
import type { SigstoreEntry } from "$lib/types/sigstore";
import client from "$lib/server/clickhouse";
import { generateRSSFeed, getRSSResponse, getBaseUrl, type RSSItem } from "$lib/rss";

async function getSigstoreEntriesForRepo(
  org: string,
  repo: string,
  limit: number = 50,
): Promise<SigstoreEntry[]> {
  const repositoryName = `${org}/${repo}`;
  const sql = `
    SELECT 
      tree_id,
      log_index,
      entry_uuid,
      integrated_time,
      repository_name
    FROM rekor_log_entries_by_github_repository
    WHERE repository_name = {repoName:String}
    ORDER BY integrated_time DESC
    LIMIT {limit:UInt32}
    SETTINGS max_execution_time = 5, max_threads = 1, max_memory_usage = 134217728
  `;

  const resultSet = await client.query({
    query: sql,
    query_params: {
      repoName: repositoryName,
      limit: limit,
    },
    format: "JSONEachRow",
  });

  return await resultSet.json<SigstoreEntry>();
}

function createSigstoreRepoRSSItems(entries: SigstoreEntry[], repositoryName: string): RSSItem[] {
  const baseUrl = getBaseUrl();

  return entries.map((entry) => {
    const pubDate = new Date(entry.integrated_time).toUTCString();
    const entryUrl = `${baseUrl}/sigstore/entry/${entry.entry_uuid}`;

    const getTitle = () => {
      return `Rekor: ${repositoryName}`;
    };

    const getDescription = () => {
      let desc = `New Rekor transparency log entry for repository ${repositoryName}`;
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
    const { org, repo } = params;
    if (!org || !repo) {
      return new Response("Organization and repository parameters are required", { status: 400 });
    }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    const entries = await getSigstoreEntriesForRepo(org, repo, limit);
    const repositoryName = `${org}/${repo}`;
    const items = createSigstoreRepoRSSItems(entries, repositoryName);

    const baseUrl = getBaseUrl();
    const feedUrl = `${baseUrl}/api/sigstore/feed/${org}/${repo}`;
    const webUrl = `${baseUrl}/sigstore/search/${encodeURIComponent(repositoryName)}?type=github_repository`;

    const rssXml = generateRSSFeed({
      title: `Sigstore Rekor Entries for ${repositoryName}`,
      description: `Recent Sigstore Rekor transparency log entries for GitHub repository ${repositoryName}`,
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
