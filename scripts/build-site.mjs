import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from './lib/fs-helpers.mjs';
import { copyContentImagesToDocs, loadPosts, postOutputDir, renderIndexPage, renderPostPage } from './lib/posts.mjs';

const docsDir = path.join(process.cwd(), 'docs');
const assetsDir = path.join(docsDir, 'assets');
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || '');

await ensureDir(docsDir);
await ensureDir(assetsDir);

const posts = await loadPosts();
await copyStaticAssets();
await copyContentImagesToDocs();

for (const post of posts) {
  const outputDir = postOutputDir(post.slug);
  await ensureDir(outputDir);
  const html = renderPostPage(post, { siteUrl });
  await fs.writeFile(path.join(outputDir, 'index.html'), html, 'utf8');
}

const indexHtml = renderIndexPage(posts, { siteUrl });
await fs.writeFile(path.join(docsDir, 'index.html'), indexHtml, 'utf8');
await fs.writeFile(path.join(docsDir, '.nojekyll'), '', 'utf8');

console.log(`Built ${posts.length} posts into ${docsDir}`);

async function copyStaticAssets() {
  const sourceDir = path.join(process.cwd(), 'static');
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => fs.copyFile(path.join(sourceDir, entry.name), path.join(assetsDir, entry.name)))
  );
}

function normalizeSiteUrl(value) {
  return value.replace(/\/$/, '');
}
