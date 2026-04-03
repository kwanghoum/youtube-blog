import fs from 'node:fs/promises';
import path from 'node:path';
import { generateBlogContent, generateCoverImage } from './lib/openai.mjs';
import { findExistingPostByVideoId } from './lib/posts.mjs';
import { transcribeFromYoutubeAudio } from './lib/transcript-fallback.mjs';
import { fetchVideoBundle, fetchVideoMetadataOnly } from './lib/youtube.mjs';
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
let videoId;
let metadata;
let transcript;
let sourceMode = 'captions';

try {
  const bundle = await fetchVideoBundle(sourceUrl);
  videoId = bundle.videoId;
  metadata = bundle.metadata;
  transcript = bundle.transcript;
} catch (error) {
  console.log(`Primary YouTube extraction failed: ${error?.message || error}`);
  console.log('Falling back to audio transcription path...');
  const base = await fetchVideoMetadataOnly(sourceUrl);
  videoId = base.videoId;
  metadata = base.metadata;
  try {
    transcript = await transcribeFromYoutubeAudio({
      apiKey,
      youtubeUrl: sourceUrl,
      videoId
    });
    sourceMode = 'audio-transcription';
  } catch (audioError) {
    console.log(`Audio transcription fallback failed: ${audioError?.message || audioError}`);
    console.log('Falling back to metadata-only generation...');
    transcript = {
      languageCode: 'n/a',
      name: 'metadata-only-fallback',
      text: buildMetadataOnlyTranscript(metadata, sourceUrl)
    };
    sourceMode = 'metadata-only';
  }
}

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
  source_note: buildSourceNote(sourceMode),
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

function buildSourceNote(mode) {
  if (mode === 'captions') {
    return '생성 기준: 영상 자막/메타데이터 기반 재구성';
  }
  if (mode === 'audio-transcription') {
    return '생성 기준: 영상 오디오 전사/메타데이터 기반 재구성';
  }
  return '생성 기준: 영상 메타데이터 기반 요약(자막/오디오 전사 접근 불가)';
}

function buildMetadataOnlyTranscript(videoMetadata, url) {
  const lines = [
    `Video title: ${videoMetadata.title}`,
    `Channel name: ${videoMetadata.channelName}`,
    `Source URL: ${url}`,
    'Transcript unavailable due to caption/transcription access limits.',
    'Write a cautious informational summary focused on the likely topic, and avoid invented specifics.'
  ];
  return lines.join('\n');
}
