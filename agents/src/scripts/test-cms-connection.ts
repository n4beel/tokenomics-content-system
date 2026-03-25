#!/usr/bin/env npx tsx
/**
 * test-cms-connection.ts
 * Quick smoke test for the Payload CMS integration.
 *
 * Usage: npx tsx src/scripts/test-cms-connection.ts
 *
 * Tests:
 * 1. GET /api/posts — verifies API key and connectivity
 * 2. POST /api/posts — creates a test draft
 * 3. DELETE /api/posts/:id — deletes the test draft
 */

import 'dotenv/config';

const CMS_URL = process.env.PAYLOAD_CMS_URL || 'https://cms.tokenomics.net';
const API_KEY = process.env.PAYLOAD_API_KEY || '';
const API_KEY_COLLECTION = process.env.PAYLOAD_API_KEY_COLLECTION || 'payload-mcp-api-keys';

if (!API_KEY) {
  console.error('❌ PAYLOAD_API_KEY not set in .env');
  process.exit(1);
}

async function request(method: string, path: string, body?: any): Promise<any> {
  const url = `${CMS_URL}${path}`;
  console.log(`  → ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `${API_KEY_COLLECTION} API-Key ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return data;
}

async function main() {
  console.log(`\n🔌 Testing CMS at ${CMS_URL}\n`);

  // Test 1: List posts
  console.log('1️⃣  Listing posts (GET /api/posts)...');
  try {
    const list = await request('GET', '/api/posts?limit=1');
    console.log(`   ✅ Connected. Total posts: ${list.totalDocs ?? 'unknown'}\n`);
  } catch (err: any) {
    console.error(`   ❌ Failed: ${err.message}\n`);
    process.exit(1);
  }

  // Test 2: Create draft
  console.log('2️⃣  Creating test draft (POST /api/posts)...');
  let testId: string | null = null;
  try {
    const result = await request('POST', '/api/posts', {
      title: '[TEST] CMS Connection Test — Safe to Delete',
      slug: `test-connection-${Date.now()}`,
      content: 'This is an automated test post. If you see this, the CMS publishing pipeline is working. Safe to delete.',
      excerpt: 'Automated CMS connectivity test post.',
      publishedAt: new Date().toISOString(),
      _status: 'draft',
    });
    testId = result.doc?.id;
    console.log(`   ✅ Draft created: ID=${testId}`);
    console.log(`   📎 ${CMS_URL}/admin/collections/posts/${testId}\n`);
  } catch (err: any) {
    console.error(`   ❌ Failed: ${err.message}\n`);
    console.log('   ℹ️  This may be due to required fields in your Payload schema.\n');
  }

  // Test 3: Delete test post
  if (testId) {
    console.log('3️⃣  Cleaning up test draft (DELETE /api/posts/:id)...');
    try {
      await request('DELETE', `/api/posts/${testId}`);
      console.log('   ✅ Test draft deleted\n');
    } catch (err: any) {
      console.error(`   ⚠️  Cleanup failed (manual delete needed): ${err.message}\n`);
    }
  }

  console.log('🏁 CMS connection test complete\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
