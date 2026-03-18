import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEO_ROOT = path.resolve(__dirname, '../../../../tokenomics-seo');
const REGISTRY_PATH = path.join(SEO_ROOT, 'registry', 'published-posts.json');

const registryParams = z.object({
  category: z.string().optional().describe('Filter by category name'),
  limit: z.number().optional().describe('Max number of posts to return'),
});

export const registryTool = new FunctionTool({
  name: 'get_published_posts',
  description: 'Get all published blog posts from the registry for internal linking. Returns titles, slugs, URLs, and categories. Also returns key service pages and case studies that should be linked. Use this to add 2-3 internal links per blog post.',
  parameters: registryParams as any,
  execute: async (args: any) => {
    const { category, limit } = args;

    try {
      const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      let posts = Array.isArray(registry) ? registry : (registry.posts || []);

      if (category) {
        posts = posts.filter((p: any) =>
          p.category?.toLowerCase().includes(category.toLowerCase()) ||
          p.categories?.some((c: string) => c.toLowerCase().includes(category.toLowerCase()))
        );
      }

      if (limit) {
        posts = posts.slice(0, limit);
      }

      return JSON.stringify({
        success: true,
        totalPosts: posts.length,
        posts: posts.map((p: any) => ({
          title: p.title,
          slug: p.slug,
          url: `/blog/${p.slug}/`,
          category: p.category || p.categories?.[0],
          publishedAt: p.publishedAt,
        })),
        servicePages: [
          { title: 'Tokenomics Data Room', url: '/services/data-room/' },
        ],
        caseStudies: [
          { title: 'EcoYield RWA Case Study', url: '/case-studies/real-world-assets/' },
        ],
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
