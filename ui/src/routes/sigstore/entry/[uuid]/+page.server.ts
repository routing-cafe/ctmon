import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import type { SigstoreEntry } from "$lib/types/sigstore";
import { client } from "$lib/server/clickhouse";

async function getSigstoreEntry(uuid: string): Promise<SigstoreEntry | null> {
  if (!uuid) {
    return null;
  }

  const sql = `
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
		WHERE entry_uuid = {uuid:String}
		LIMIT 1
		SETTINGS max_execution_time = 10, max_threads = 1, max_memory_usage = 134217728
	`;

  const resultSet = await client.query({
    query: sql,
    query_params: {
      uuid: uuid,
    },
    format: "JSONEachRow",
  });

  const entries = await resultSet.json<SigstoreEntry>();

  if (entries.length === 0) {
    return null;
  }

  return entries[0];
}

export const load: PageServerLoad = async ({ params }) => {
  const entry = await getSigstoreEntry(params.uuid);

  if (!entry) {
    throw error(404, "Sigstore entry not found");
  }

  return {
    entry,
  };
};
