/**
 * Runs a raw .sql file against DATABASE_URL using the Prisma engine.
 *
 * Exists because these statements (CREATE EXTENSION, ALTER COLUMN ... USING,
 * CREATE INDEX ... USING hnsw) cannot be expressed in schema.prisma, and psql
 * is not installed on every dev machine here.
 *
 * Usage: node prisma/sql/run-sql.js prisma/sql/001_pgvector.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

/**
 * Splits a SQL script into individual statements.
 *
 * Prisma's raw helpers go through prepared statements, which reject multi-command
 * strings ("cannot insert multiple commands into a prepared statement"), so the
 * script has to be fed one statement at a time. A naive split on ';' would break
 * the DO $$ ... $$ blocks, whose bodies contain semicolons — hence the
 * dollar-quote tracking below.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let dollarTag = null; // e.g. '$$' or '$body$' while inside a dollar-quoted block

  while (i < sql.length) {
    const rest = sql.slice(i);

    // Skip line comments only when not inside a dollar-quoted body.
    if (!dollarTag && rest.startsWith('--')) {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl + 1;
      current += sql.slice(i, end);
      i = end;
      continue;
    }

    const dollarMatch = /^\$[A-Za-z_0-9]*\$/.exec(rest);
    if (dollarMatch) {
      const tag = dollarMatch[0];
      if (!dollarTag) dollarTag = tag;
      else if (dollarTag === tag) dollarTag = null;
      current += tag;
      i += tag.length;
      continue;
    }

    const ch = sql[i];
    if (ch === ';' && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) statements.push(current.trim());
  return statements.filter(s => s.replace(/--.*$/gm, '').trim().length > 0);
}

async function main() {
  const relPath = process.argv[2];
  if (!relPath) {
    console.error('Usage: node prisma/sql/run-sql.js <path-to-sql-file>');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(filePath)) {
    console.error(`SQL file not found: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const prisma = new PrismaClient();

  console.log(`\n=== Executing ${relPath} ===\n`);

  const statements = splitStatements(sql);
  console.log(`Parsed ${statements.length} statement(s).\n`);

  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
      process.stdout.write(`  [${i + 1}/${statements.length}] ${label}... `);
      await prisma.$executeRawUnsafe(stmt);
      console.log('ok');
    }
    console.log('\n✅ SQL executed successfully.\n');

    const [ext] = await prisma.$queryRawUnsafe(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );
    console.log(`   pgvector version: ${ext ? ext.extversion : 'NOT INSTALLED'}`);

    const cols = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name, udt_name
      FROM information_schema.columns
      WHERE column_name = 'embedding'
      ORDER BY table_name
    `);
    for (const c of cols) {
      console.log(`   ${c.table_name}.${c.column_name} -> ${c.udt_name}`);
    }

    const idx = await prisma.$queryRawUnsafe(`
      SELECT indexname FROM pg_indexes
      WHERE indexname LIKE '%hnsw%' OR indexname LIKE '%fts%'
      ORDER BY indexname
    `);
    console.log(`   indexes: ${idx.map(i => i.indexname).join(', ') || 'none'}`);
    console.log('');
  } catch (err) {
    console.error(`\n❌ SQL execution failed:\n${err.message}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
