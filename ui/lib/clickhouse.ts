import { createClient } from "@clickhouse/client";

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'localhost';
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8123';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'default';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'default';

const client = createClient({
  url: `https://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}`,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  database: CLICKHOUSE_DATABASE,
  request_timeout: 300000, // 5 minutes
});

export default client;
