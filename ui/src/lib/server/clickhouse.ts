import { createClient } from "@clickhouse/client";
import { env } from "$env/dynamic/private";

const CLICKHOUSE_HOST = env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_USER = env.CLICKHOUSE_USER || "default";
const CLICKHOUSE_PASSWORD = env.CLICKHOUSE_PASSWORD || "";
const CLICKHOUSE_DATABASE = env.CLICKHOUSE_DATABASE || "default";

const client = createClient({
  url: `https://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}`,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  database: CLICKHOUSE_DATABASE,
  request_timeout: 300000, // 5 minutes
});

export { client };
export default client;
