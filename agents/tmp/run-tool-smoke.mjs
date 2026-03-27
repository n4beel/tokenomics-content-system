import path from 'path';
import fs from 'fs';

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, 'dist');

function printResult(name, value) {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            parsed = { raw: value };
        }
    }
    const ok = parsed && (parsed.success === true || parsed.success === undefined);
    console.log(`TOOL ${name} => ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) {
        console.log(JSON.stringify(parsed, null, 2));
    }
}

async function runWithTimeout(name, promiseFactory, ms = 45000) {
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            resolve(JSON.stringify({ success: false, error: `Timed out after ${ms}ms` }));
        }, ms);
    });
    const result = await Promise.race([promiseFactory(), timeoutPromise]);
    printResult(name, result);
}

async function run() {
    const cluster = await import(path.join(distRoot, 'src/tools/cluster-queue-tool.js'));
    const registry = await import(path.join(distRoot, 'src/tools/registry-tool.js'));
    const mermaid = await import(path.join(distRoot, 'src/tools/mermaid-tool.js'));
    const research = await import(path.join(distRoot, 'src/tools/research-tool.js'));
    const cms = await import(path.join(distRoot, 'src/tools/cms-publish-tool.js'));
    const image = await import(path.join(distRoot, 'src/tools/image-tool.js'));

    const smokeOut = path.join(projectRoot, 'tmp', 'tool-smoke-output');
    fs.mkdirSync(smokeOut, { recursive: true });

    await runWithTimeout('get_next_blog_topics', () => cluster.clusterQueueTool.execute({ count: 1 }), 10000);
    await runWithTimeout('get_published_posts', () => registry.registryTool.execute({ limit: 1 }), 10000);

    await runWithTimeout(
        'render_mermaid_diagram',
        () => mermaid.mermaidTool.execute({
            mermaidSource: 'flowchart TD\nA[Start] --> B[Done]',
            slug: 'tool-smoke',
            diagramName: 'simple-flow',
            outputDir: smokeOut,
            runId: 'tool-smoke',
        }),
        45000,
    );

    await runWithTimeout(
        'research_topic',
        () => research.researchTool.execute({
            topic: 'RWA tokenization market snapshot',
            outputDir: smokeOut,
            runId: 'tool-smoke',
        }),
        45000,
    );

    // Intentional dry-style check with tiny payload to ensure API connectivity/pathing.
    await runWithTimeout(
        'publish_draft_to_cms',
        () => cms.cmsPublishTool.execute({
            title: 'Tool Smoke Draft',
            slug: `tool-smoke-${Date.now()}`,
            content: `# Tool Smoke Draft\n\n${'Long validation paragraph for CMS publish normalization. '.repeat(220)}`,
            excerpt: 'Smoke draft for cms publish tool validation',
            runId: 'tool-smoke',
        }),
        45000,
    );

    await runWithTimeout(
        'generate_hero_image',
        () => image.heroImageTool.execute({
            prompt: 'Abstract fintech background with neutral geometric shapes and soft blue tones',
            slug: 'tool-smoke',
            outputDir: smokeOut,
            runId: 'tool-smoke',
        }),
        120000,
    );

    await runWithTimeout(
        'generate_og_image',
        () => image.ogImageTool.execute({
            slug: 'tool-smoke',
            title: 'Tool Smoke OG',
            heroPath: path.join(smokeOut, 'assets', 'hero-4k.png'),
            outputDir: smokeOut,
            runId: 'tool-smoke',
        }),
        60000,
    );
}

run().catch((err) => {
    console.error('Tool smoke runner failed:', err);
    process.exitCode = 1;
});
