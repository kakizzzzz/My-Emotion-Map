#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const verificationPath = resolve(
  repositoryRoot,
  'supabase/verify-normalized-emotion.sql',
);
const verificationSql = readFileSync(verificationPath, 'utf8');

const requiredFragments = [
  'archive_user_count',
  'normalized_user_count',
  'record_count',
  'conversation_count',
  'message_count',
  'followup_count',
  'revisit_count',
  'ids_match',
  'sort_order_match',
  'semantic_checksum_match',
  'migration_verified_at',
  'data_model_version',
  'orphan_count',
  'duplicate_count',
  'future_schema_count',
];
const missing = requiredFragments.filter((fragment) =>
  !verificationSql.toLowerCase().includes(fragment));
if (missing.length > 0) {
  console.error(`Verification SQL is missing: ${missing.join(', ')}`);
  process.exit(1);
}
if (/\b(update|insert|delete|truncate|alter|drop|create)\b\s+(table|from|into|public\.)/i
  .test(verificationSql)) {
  console.error('Verification SQL must remain read-only.');
  process.exit(1);
}

if (process.argv.includes('--check-file')) {
  console.log('Normalized emotion verification SQL contract is complete and read-only.');
  process.exit(0);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error(
    'SUPABASE_DB_URL is required to run database verification. ' +
    'Use --check-file for a local contract check.',
  );
  process.exit(2);
}

const result = spawnSync(
  'psql',
  ['--no-psqlrc', '--set=ON_ERROR_STOP=1', '--file', verificationPath],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PGDATABASE: databaseUrl,
      PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? '10',
    },
    stdio: 'inherit',
  },
);
if (result.error) {
  console.error(`Unable to run psql: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
