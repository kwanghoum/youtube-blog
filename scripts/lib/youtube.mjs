import { extractVideoId } from './utils.mjs';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export async function fetchVideoBundle(inputUrl) {
  const videoId = extractVideoId(inputUrl);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageHtml = await fetchText(watchUrl);
  const playerResponse = extractPlayerResponse(pageHtml);
  const metadata = await fetchMetadata(inputUrl, playerResponse, videoId);
  const transcript = await fetchTranscript(playerResponse, videoId);

  return {
    videoId,
    metadata,
    transcript
  };
}

async function fetchMetadata(inputUrl, playerResponse, videoId) {
  const oembedUrl = new URL('https://www.youtube.com/oembed');
  oembedUrl.searchParams.set('url', inputUrl);
  oembedUrl.searchParams.set('format', 'json');

  try {
    const response = await fetch(oembedUrl, {
      headers: { 'user-agent': USER_AGENT }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title,
        channelName: data.author_name,
        thumbnailUrl: data.thumbnail_url,
        videoId
      };
    }
  } catch {
    // Fall through to player response metadata.
  }

  const details = playerResponse?.videoDetails;
  if (!details?.title || !details?.author) {
    throw new Error('Unable to load YouTube video metadata.');
  }

  return {
    title: details.title,
    channelName: details.author,
    thumbnailUrl: details.thumbnail?.thumbnails?.at(-1)?.url ?? '',
    videoId
  };
}

async function fetchTranscript(playerResponse, videoId) {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error(`No public captions available for video ${videoId}.`);
  }

  const preferredTrack =
    tracks.find((track) => track.languageCode === 'ko') ||
    tracks.find((track) => track.languageCode?.startsWith('ko')) ||
    tracks.find((track) => track.languageCode === 'en') ||
    tracks[0];

  const transcriptUrl = new URL(preferredTrack.baseUrl);
  transcriptUrl.searchParams.set('fmt', 'json3');
  const response = await fetch(transcriptUrl, {
    headers: { 'user-agent': USER_AGENT }
  });

  if (!response.ok) {
    throw new Error(`Failed to download captions (${response.status}).`);
  }

  const payload = await response.json();
  const lines = [];

  for (const event of payload.events ?? []) {
    const segments = event.segs ?? [];
    const text = segments.map((segment) => segment.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push(text);
    }
  }

  const transcript = lines.join('\n');
  if (!transcript) {
    throw new Error(`Caption track for video ${videoId} was empty.`);
  }

  return {
    languageCode: preferredTrack.languageCode,
    name: preferredTrack.name?.simpleText ?? preferredTrack.vssId ?? preferredTrack.languageCode,
    text: transcript
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube page (${response.status}).`);
  }

  return response.text();
}

function extractPlayerResponse(html) {
  const marker = 'var ytInitialPlayerResponse = ';
  const alternativeMarker = 'ytInitialPlayerResponse = ';
  const jsonText =
    extractJsonObjectAfter(html, marker) ||
    extractJsonObjectAfter(html, alternativeMarker);

  if (!jsonText) {
    throw new Error('Unable to find YouTube player data in the watch page.');
  }

  return JSON.parse(jsonText);
}

function extractJsonObjectAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const openBrace = source.indexOf('{', start + marker.length);
  if (openBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, index + 1);
      }
    }
  }

  return null;
}
