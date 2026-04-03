import fs from 'node:fs/promises';
import path from 'node:path';
import { listPostFiles, readJson } from './fs-helpers.mjs';
import { ensureArray, escapeHtml, posixJoin } from './utils.mjs';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

export async function loadPosts() {
  const files = await listPostFiles(POSTS_DIR);
  const posts = await Promise.all(files.map((file) => readJson(file)));
  return posts.sort((left, right) => right.date.localeCompare(left.date));
}

export async function findExistingPostByVideoId(videoId) {
  const posts = await loadPosts();
  return posts.find((post) => post.video_id === videoId) ?? null;
}

export function renderDocument({ pageTitle, description, canonicalUrl, socialImage, body, assetPath = './assets/style.css', siteName = 'YouTube Blog Generator' }) {
  const canonicalTag = canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : '';
  const ogUrl = canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : '';
  const ogImage = socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}">` : '';

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="${escapeHtml(siteName)}">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    ${ogUrl}
    ${ogImage}
    ${canonicalTag}
    <link rel="stylesheet" href="${assetPath}">
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

export function renderPostPage(post, { siteUrl = '' } = {}) {
  const canonicalUrl = siteUrl ? `${siteUrl}/posts/${post.slug}/` : '';
  const socialImage = siteUrl ? `${siteUrl}/${post.cover_image}` : post.cover_image;
  const tags = ensureArray(post.tags)
    .map((tag) => `<li>${escapeHtml(tag)}</li>`)
    .join('');
  const sections = ensureArray(post.sections)
    .map((section) => `<section class="post-section"><h2>${escapeHtml(section.heading)}</h2>${section.html}</section>`)
    .join('');

  return renderDocument({
    pageTitle: `${post.title} | YouTube Blog Generator`,
    description: post.excerpt,
    canonicalUrl,
    socialImage,
    assetPath: '../../assets/style.css',
    body: `
      <main class="shell post-shell">
        <a class="back-link" href="../../index.html">홈으로</a>
        <article class="post-card">
          <header class="post-header">
            <p class="eyebrow">${escapeHtml(post.channel_name)}</p>
            <h1>${escapeHtml(post.title)}</h1>
            <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
            <div class="post-meta">
              <span>${escapeHtml(post.date)}</span>
              <span>영상 ID ${escapeHtml(post.video_id)}</span>
            </div>
            <img class="hero-image" src="../../${escapeHtml(post.cover_image)}" alt="${escapeHtml(post.title)} 대표 이미지">
          </header>

          <section class="post-section">
            <h2>도입</h2>
            ${post.introduction_html}
          </section>

          ${sections}

          <section class="post-section">
            <h2>시사점 또는 요약</h2>
            ${post.takeaway_html}
          </section>

          <section class="post-section source-block">
            <h2>출처</h2>
            <ul>
              <li>원본 영상 제목: ${escapeHtml(post.video_title)}</li>
              <li>채널명: ${escapeHtml(post.channel_name)}</li>
              <li>원본 URL: <a href="${escapeHtml(post.youtube_url)}" target="_blank" rel="noreferrer">${escapeHtml(post.youtube_url)}</a></li>
              <li>${escapeHtml(post.source_note)}</li>
            </ul>
          </section>

          <section class="post-section">
            <h2>태그</h2>
            <ul class="tag-list">${tags}</ul>
          </section>
        </article>
      </main>
    `
  });
}

export function renderIndexPage(posts, { siteUrl = '' } = {}) {
  const cards = posts
    .map((post) => `
      <article class="summary-card">
        <a class="summary-link" href="./posts/${post.slug}/index.html">
          <img src="./${escapeHtml(post.cover_image)}" alt="${escapeHtml(post.title)} 대표 이미지">
          <div class="summary-copy">
            <p class="eyebrow">${escapeHtml(post.channel_name)}</p>
            <h2>${escapeHtml(post.title)}</h2>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="summary-meta">
              <span>${escapeHtml(post.date)}</span>
              <span>${escapeHtml(post.video_title)}</span>
            </div>
          </div>
        </a>
      </article>
    `)
    .join('');

  return renderDocument({
    pageTitle: 'YouTube Blog Generator',
    description: '유튜브 공개 자막 기반으로 생성된 한국어 블로그 글 모음',
    canonicalUrl: siteUrl || '',
    socialImage: posts[0] ? (siteUrl ? `${siteUrl}/${posts[0].cover_image}` : posts[0].cover_image) : '',
    assetPath: './assets/style.css',
    body: `
      <main class="shell">
        <header class="page-header">
          <p class="eyebrow">GitHub Pages</p>
          <h1>YouTube Blog Generator</h1>
          <p class="lead">유튜브 공개 자막을 바탕으로 한국어 정보형 블로그 글과 대표 이미지를 자동 생성합니다.</p>
        </header>
        <section class="post-grid">
          ${cards || '<p class="empty-state">아직 생성된 글이 없습니다. GitHub Actions에서 YouTube URL을 입력해 첫 글을 생성하세요.</p>'}
        </section>
      </main>
    `
  });
}

export async function copyContentImagesToDocs() {
  const sourceDir = path.join(process.cwd(), 'content', 'images');
  const targetDir = path.join(process.cwd(), 'docs', 'images');
  await fs.mkdir(targetDir, { recursive: true });
  const files = await fs.readdir(sourceDir);

  await Promise.all(
    files
      .filter((file) => !file.startsWith('.'))
      .map((file) => fs.copyFile(path.join(sourceDir, file), path.join(targetDir, file)))
  );
}

export function postOutputDir(slug) {
  return path.join(process.cwd(), 'docs', 'posts', slug);
}

export function postPublicPath(slug) {
  return posixJoin('posts', slug, 'index.html');
}
