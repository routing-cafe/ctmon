import type { PageServerLoad } from './$types';
import type { SigstoreEntry, SigstoreSearchQuery } from '$lib/types/sigstore';
import { client } from '$lib/server/clickhouse';

interface QueryStatistics {
	rows_read?: number;
	bytes_read?: number;
	elapsed?: number;
}

async function getSigstoreSearchResults(
	query: string,
	queryType: SigstoreSearchQuery["queryType"],
	limit: number,
): Promise<
	{ entries: SigstoreEntry[]; error?: string; statistics?: QueryStatistics }
> {
	try {
		let sql = "";
		const queryParams: Record<string, string> = {};

		if (
			queryType === "github_repository" || queryType === "github_organization"
		) {
			// Use the materialized view directly for GitHub searches
			let whereClause = "";
			if (queryType === "github_repository") {
				whereClause = "repository_name = {query:String}";
				queryParams.query = query;
			} else {
				whereClause = "repository_name LIKE {queryPattern:String}";
				queryParams.queryPattern = `${query}/%`;
			}

			sql = `
				SELECT 
					tree_id,
					log_index,
					entry_uuid,
					integrated_time,
					repository_name
				FROM rekor_log_entries_by_github_repository
				WHERE ${whereClause}
				ORDER BY integrated_time DESC
				LIMIT {limit:UInt32}
				SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 268435456
			`;
		} else {
			// Use the main table for other search types
			let whereClause = "";
			switch (queryType) {
				case "hash":
					whereClause = "data_hash_value = {query:String}";
					queryParams.query = query;
					break;
				case "x509_san":
					whereClause = "has(x509_sans, {query:String})";
					queryParams.query = query;
					break;
				case "pgp_fingerprint":
					whereClause = "pgp_public_key_fingerprint = {query:String}";
					queryParams.query = query.toUpperCase().replace(/\s/g, "");
					break;
				case "pgp_email":
					whereClause = "pgp_signer_email ILIKE {queryPattern:String}";
					queryParams.queryPattern = `%${query}%`;
					break;
				default:
					throw new Error(`Unsupported query type: ${queryType}`);
			}

			sql = `
				SELECT 
					tree_id,
					log_index,
					entry_uuid,
					retrieval_timestamp,
					integrated_time,
					log_id,
					kind,
					api_version,
					signature_format,
					data_hash_algorithm,
					data_hash_value,
					data_url,
					signature_url,
					public_key_url,
					x509_certificate_sha256,
					x509_subject_dn,
					x509_subject_cn,
					x509_subject_organization,
					x509_subject_ou,
					x509_issuer_dn,
					x509_issuer_cn,
					x509_issuer_organization,
					x509_issuer_ou,
					x509_serial_number,
					x509_not_before,
					x509_not_after,
					x509_sans,
					x509_signature_algorithm,
					x509_public_key_algorithm,
					x509_public_key_size,
					x509_is_ca,
					x509_key_usage,
					x509_extended_key_usage,
					pgp_signature_hash,
					pgp_public_key_fingerprint,
					pgp_key_id,
					pgp_signer_user_id,
					pgp_signer_email,
					pgp_signer_name,
					pgp_key_algorithm,
					pgp_key_size,
					pgp_subkey_fingerprints
				FROM rekor_log_entries 
				WHERE ${whereClause}
				ORDER BY (tree_id, log_index) DESC
				LIMIT {limit:UInt32}
				SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 268435456
			`;
		}

		const resultSet = await client.query({
			query: sql,
			query_params: {
				...queryParams,
				limit: limit,
			},
			format: "JSONEachRow",
		});

		const entries = await resultSet.json<SigstoreEntry>();

		const headers = resultSet.response_headers;
		const summaryHeader = headers["x-clickhouse-summary"];
		const summaryValue = Array.isArray(summaryHeader)
			? summaryHeader[0]
			: summaryHeader;

		let statistics: QueryStatistics | undefined = undefined;

		if (summaryValue) {
			try {
				const summary = JSON.parse(summaryValue);
				statistics = {
					elapsed: parseFloat(summary.elapsed_ns || "0") / 1000000000, // Convert nanoseconds to seconds
					rows_read: parseInt(summary.read_rows || "0"),
					bytes_read: parseInt(summary.read_bytes || "0"),
				};
			} catch (error) {
				console.error("Failed to parse ClickHouse summary:", error);
			}
		}

		return { entries, statistics };
	} catch (error) {
		console.error("Sigstore search error:", error);
		return {
			entries: [],
			error: "Failed to perform search",
			statistics: undefined,
		};
	}
}

export const load: PageServerLoad = async ({ params, url }) => {
	const decodedQuery = decodeURIComponent(params.query);
	const queryType = (url.searchParams.get('type') || 'x509_san') as SigstoreSearchQuery['queryType'];
	const limit = parseInt(url.searchParams.get('limit') || '100', 10);

	const { entries, error, statistics } = await getSigstoreSearchResults(
		decodedQuery,
		queryType,
		limit,
	);

	return {
		query: decodedQuery,
		queryType,
		limit,
		entries,
		error,
		statistics
	};
};