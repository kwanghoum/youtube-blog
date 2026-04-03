import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlug, extractVideoId, slugify } from '../scripts/lib/utils.mjs';
import { renderIndexPage, renderPostPage } from '../scripts/lib/posts.mjs';

test('extractVideoId supports watch URLs', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId supports short URLs', () => {
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
});

test('slugify strips punctuation and normalizes spaces', () => {
  assert.equal(slugify('AI가 바꾼 YouTube 요약! 2026'), 'ai-youtube-2026');
});

test('buildSlug prefixes date and video fragment', () => {
  assert.equal(buildSlug('2026-04-03', '테스트 제목', 'dQw4w9WgXcQ'), '2026-04-03-post-dQw4w9'.toLowerCase());
});

test('renderIndexPage renders empty state', () => {
  const html = renderIndexPage([]);
  assert.match(html, /아직 생성된 글이 없습니다/);
});

test('renderPostPage renders source section', () => {
  const html = renderPostPage({
    slug: '2026-04-03-demo-dqw4w9',
    title: '데모 글',
    excerpt: '요약입니다.',
    date: '2026-04-03',
    video_id: 'dQw4w9WgXcQ',
    video_title: '원본 제목',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    channel_name: '테스트 채널',
    source_note: '생성 기준: 영상 자막/메타데이터 기반 재구성',
    cover_image: 'images/demo.png',
    tags: ['AI', 'YouTube', 'Blog'],
    introduction_html: '<p>도입</p>',
    sections: [{ heading: '핵심 내용', html: '<p>본문</p>' }],
    takeaway_html: '<p>정리</p>'
  });

  assert.match(html, /원본 영상 제목/);
  assert.match(html, /테스트 채널/);
  assert.match(html, /\.\.\/\.\.\/assets\/style\.css/);
});
