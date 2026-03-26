import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { execFile } from 'child_process';
import path from 'path';
import { buildToolEnv, resolveNodeExec, resolveSeoRoot } from './runtime-paths.js';

const heroParams = z.object({
  prompt: z.string().describe('The image generation prompt following the Precision Infrastructure brand direction'),
  slug: z.string().describe('The post slug for file naming'),
  outputDir: z.string().describe('Output directory for generated images'),
});

const ogParams = z.object({
  slug: z.string().describe('The post slug'),
  title: z.string().describe('The post title for OG overlay'),
  heroPath: z.string().describe('Path to the hero-4k.png base image'),
  outputDir: z.string().describe('Output directory'),
});

export const heroImageTool = new FunctionTool({
  name: 'generate_hero_image',
  description: 'Generate a branded hero image for a blog post using the Gemini API. Provide the image prompt following the "Precision Infrastructure" brand direction, the post slug, and output directory.',
  parameters: heroParams as any,
  execute: async (args: any) => {
    const { prompt, slug, outputDir } = args;
    const seoRoot = resolveSeoRoot(['scripts/image-pipeline.mjs']);
    const nodeExec = resolveNodeExec();
    const toolEnv = buildToolEnv(seoRoot);
    const script = path.join(seoRoot, 'scripts', 'image-pipeline.mjs');
    return new Promise((resolve) => {
      execFile(nodeExec, [script, 'hero', prompt, '--slug', slug, '--output', outputDir], {
        cwd: seoRoot,
        env: toolEnv,
        timeout: 180_000,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve(JSON.stringify({ success: false, error: error.message, stderr: stderr?.slice(0, 500) }));
          return;
        }
        resolve(JSON.stringify({ success: true, output: stdout }));
      });
    });
  },
});

export const ogImageTool = new FunctionTool({
  name: 'generate_og_image',
  description: 'Generate an OG image by compositing the post title and logo onto a hero image using Sharp. Requires the slug, title, path to the hero-4k.png, and output directory.',
  parameters: ogParams as any,
  execute: async (args: any) => {
    const { slug, title, heroPath, outputDir } = args;
    const seoRoot = resolveSeoRoot(['scripts/image-pipeline.mjs']);
    const nodeExec = resolveNodeExec();
    const toolEnv = buildToolEnv(seoRoot);
    const script = path.join(seoRoot, 'scripts', 'image-pipeline.mjs');
    return new Promise((resolve) => {
      execFile(nodeExec, [script, 'og', '--slug', slug, '--title', title, '--hero', heroPath, '--output', outputDir], {
        cwd: seoRoot,
        env: toolEnv,
        timeout: 60_000,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve(JSON.stringify({ success: false, error: error.message, stderr: stderr?.slice(0, 500) }));
          return;
        }
        resolve(JSON.stringify({ success: true, output: stdout }));
      });
    });
  },
});
