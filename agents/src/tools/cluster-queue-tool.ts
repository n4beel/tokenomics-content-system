import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { resolveSeoRoot } from './runtime-paths.js';

function getFallbackTopics(count: number) {
  const fallback = [
    {
      title: 'BlackRock BUIDL Treasury Tokenization Momentum',
      slug: 'blackrock-buidl-treasury-tokenization-momentum',
      keyword: 'blackrock buidl tokenized treasury',
      cluster: 'RWA Tokenization',
      clusterId: 'fallback-rwa',
      category: 'RWA Tokenization',
      priority: 'P1',
      type: 'pillar' as const,
    },
    {
      title: 'MiCA Stablecoin Reserve Rules for EU Teams',
      slug: 'mica-stablecoin-reserve-rules-eu-teams',
      keyword: 'mica stablecoin reserve requirements',
      cluster: 'Regulatory Frameworks',
      clusterId: 'fallback-mica',
      category: 'Regulatory Frameworks',
      priority: 'P1',
      type: 'support' as const,
    },
  ];
  return fallback.slice(0, count);
}

const queueParams = z.object({
  count: z.number().optional().describe('Number of topics to return (default: 2)'),
});

export const clusterQueueTool = new FunctionTool({
  name: 'get_next_blog_topics',
  description: 'Get the next queued blog topics from the SEO content clusters. Returns topics prioritized by cluster priority (P0 first) and type (pillar before support). Each topic includes title, slug, keyword, cluster, category, and whether it is a pillar or support post.',
  parameters: queueParams as any,
  execute: async (args: any) => {
    const count = args.count || 2;
    const seoRoot = resolveSeoRoot(['queue/clusters.json']);
    const clustersPath = path.join(seoRoot, 'queue', 'clusters.json');

    if (!fs.existsSync(clustersPath)) {
      return JSON.stringify({
        success: true,
        warning: `clusters.json not found at ${clustersPath}. Using fallback topics.`,
        totalQueued: 2,
        selected: getFallbackTopics(count),
      });
    }

    try {
      const clustersData = JSON.parse(fs.readFileSync(clustersPath, 'utf-8'));
      const clusters = clustersData.clusters || [];

      const queuedPosts: Array<{
        title: string;
        slug: string;
        keyword: string;
        cluster: string;
        clusterId: string;
        category: string;
        priority: string;
        type: 'pillar' | 'support';
      }> = [];

      for (const cluster of clusters) {
        if (cluster.pillar && cluster.pillar.status === 'queued') {
          queuedPosts.push({
            title: cluster.pillar.title,
            slug: cluster.pillar.slug,
            keyword: cluster.pillar.keyword,
            cluster: cluster.name,
            clusterId: cluster.id,
            category: cluster.category,
            priority: cluster.priority,
            type: 'pillar',
          });
        }
        for (const post of cluster.posts || []) {
          if (post.status === 'queued') {
            queuedPosts.push({
              title: post.title,
              slug: post.slug,
              keyword: post.keyword,
              cluster: cluster.name,
              clusterId: cluster.id,
              category: cluster.category,
              priority: cluster.priority,
              type: 'support',
            });
          }
        }
      }

      queuedPosts.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority.localeCompare(b.priority);
        if (a.type !== b.type) return a.type === 'pillar' ? -1 : 1;
        return 0;
      });

      return JSON.stringify({ success: true, totalQueued: queuedPosts.length, selected: queuedPosts.slice(0, count) });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
