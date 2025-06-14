import { NextRequest, NextResponse } from "next/server";
import { Certificate } from "@/types/certificate";
import client from "@/lib/clickhouse";
import { generateRSSFeed, getRSSResponse, getBaseUrl, RSSItem } from "@/lib/rss";

interface FeedParams {
  params: Promise<{ domain: string }>;
}

async function getCTEntriesForDomain(domain: string, limit: number = 50): Promise<Certificate[]> {
  const sql = `
    SELECT 
      certificate_sha256,
      log_id,
      log_index,
      entry_timestamp,
      not_after,
      subject_common_name,
      issuer_common_name,
      issuer_organization
    FROM ct_log_entries_by_name
    WHERE name_rev = reverse({domain:String}) OR
          name_rev LIKE reverse({wildcard:String})
    ORDER BY entry_timestamp DESC
    LIMIT {limit:UInt32}
    SETTINGS max_execution_time = 5, max_threads = 1, max_memory_usage = 134217728
  `;

  const resultSet = await client.query({
    query: sql,
    query_params: {
      domain: domain,
      wildcard: `%.${domain}`,
      limit: limit,
    },
    format: "JSONEachRow",
  });

  return await resultSet.json<Certificate>();
}

function createCTRSSItems(entries: Certificate[], domain: string): RSSItem[] {
  const baseUrl = getBaseUrl();
  
  return entries.map(entry => {
    const pubDate = new Date(entry.entry_timestamp).toUTCString();
    const entryUrl = `${baseUrl}/search/${encodeURIComponent(entry.certificate_sha256)}?type=sha256`;
    
    const getTitle = () => {
      const cn = entry.subject_common_name || "Unknown CN";
      return `CT: ${cn}`;
    };

    const getDescription = () => {
      let desc = `New Certificate Transparency log entry for domain ${domain}`;
      desc += `\nSubject CN: ${entry.subject_common_name || 'N/A'}`;
      desc += `\nIssuer: ${entry.issuer_common_name || 'N/A'}`;
      if (entry.issuer_organization && entry.issuer_organization.length > 0) {
        desc += ` (${entry.issuer_organization[0]})`;
      }
      desc += `\nCertificate SHA256: ${entry.certificate_sha256}`;
      desc += `\nLog ID: ${entry.log_id}`;
      desc += `\nLog Index: ${entry.log_index}`;
      desc += `\nExpires: ${new Date(entry.not_after).toISOString().split('T')[0]}`;
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

export async function GET(request: NextRequest, { params }: FeedParams) {
  try {
    const { domain } = await params;
    const decodedDomain = decodeURIComponent(domain);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const entries = await getCTEntriesForDomain(decodedDomain, limit);
    const items = createCTRSSItems(entries, decodedDomain);
    
    const baseUrl = getBaseUrl();
    const feedUrl = `${baseUrl}/api/ct/feed/${encodeURIComponent(decodedDomain)}`;
    const webUrl = `${baseUrl}/search/${encodeURIComponent(decodedDomain)}`;

    const rssXml = generateRSSFeed({
      title: `Certificate Transparency Entries for ${decodedDomain}`,
      description: `Recent Certificate Transparency log entries for domain ${decodedDomain}`,
      link: webUrl,
      feedUrl: feedUrl,
      items: items,
    });

    const response = getRSSResponse(rssXml);
    return new NextResponse(response.body, { headers: response.headers });
  } catch (error) {
    console.error('CT RSS feed generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate CT RSS feed' },
      { status: 500 }
    );
  }
}