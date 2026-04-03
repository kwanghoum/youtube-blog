import fs from 'node:fs/promises';
import path from 'node:path';
import { generateBlogContent, generateCoverImage } from './lib/openai.mjs';
import { findExistingPostByVideoId } from './lib/posts.mjs';
import { fetchVideoBundle } from './lib/youtube.mjs';
import { buildSlug, contentImagePath, extractVideoId } from './lib/utils.mjs';
import { writeJson } from './lib/fs-helpers.mjs';

const sourceUrl = process.argv[2] || process.env.YOUTUBE_URL;
if (!sourceUrl) {
  throw new Error('Usage: node scripts/generate-post.mjs <youtube-url>');
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is required. Add it to your environment or GitHub Actions secrets.');
}

const requestedVideoId = extractVideoId(sourceUrl);
const existingPost = await findExistingPostByVideoId(requestedVideoId);
if (existingPost) {
  throw new Error(`A post for video ${requestedVideoId} already exists at slug \"${existingPost.slug}\".`);
}

console.log(`Fetching YouTube data for ${requestedVideoId}...`);
const { videoId, metadata, transcript } = await fetchVideoBundle(sourceUrl);

console.log(`Generating blog content from captions (${transcript.languageCode})...`);
const generated = await generateBlogContent({
  apiKey,
  metadata,
  transcript: transcript.text,
  sourceUrl
});

const date = new Date().toISOString().slice(0, 10);
const slug = buildSlug(date, generated.title, videoId);
const imageFilename = `${slug}.png`;
const coverImage = `images/${imageFilename}`;

console.log('Generating cover image...');
const imageBuffer = await generateCoverImage({
  apiKey,
  title: generated.title,
  imagePrompt: generated.image_prompt
});

await fs.writeFile(contentImagePath(imageFilename), imageBuffer);

const post = {
  slug,
  title: generated.title,
  date,
  youtube_url: sourceUrl,
  video_id: videoId,
  video_title: metadata.title,
  channel_name: metadata.channelName,
  source_note: '생성 기준: 영상 자막/메타데이터 기반 재구성',
  cover_image: coverImage,
  excerpt: generated.excerpt,
  tags: generated.tags,
  introduction_html: generated.introduction_html,
  sections: generated.sections,
  takeaway_html: generated.takeaway_html,
  transcript_language: transcript.languageCode,
  transcript_track_name: transcript.name,
  generated_at: new Date().toISOString()
};

await writeJson(path.join(process.cwd(), 'content', 'posts', `${slug}.json`), post);
console.log(`Created content/posts/${slug}.json and content/images/${imageFilename}`);
