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
  if (Array.isArray(tracks) && tracks.length > 0) {
    const preferredTrack = pickPreferredTrack(
      tracks.map((track) => ({
        source: 'player',
        languageCode: track.languageCode,
        name: track.name?.simpleText ?? track.vssId ?? track.languageCode,
        baseUrl: track.baseUrl
      }))
    );
    return fetchTranscriptFromPlayerTrack(preferredTrack, videoId);
  }

  const legacyTracks = await fetchLegacyCaptionTracks(videoId);
  if (legacyTracks.length > 0) {
    const preferredTrack = pickPreferredTrack(legacyTracks);
    return fetchTranscriptFromLegacyTrack(preferredTrack, videoId);
  }

  throw new Error(`No public captions available for video ${videoId}.`);
}

function pickPreferredTrack(tracks) {
  return (
    tracks.find((track) => track.languageCode === 'ko') ||
    tracks.find((track) => track.languageCode?.startsWith('ko')) ||
    tracks.find((track) => track.languageCode === 'en') ||
    tracks[0]
  );
}

async function fetchTranscriptFromPlayerTrack(track, videoId) {
  const transcriptUrl = new URL(track.baseUrl);
  transcriptUrl.searchParams.set('fmt', 'json3');
  const transcript = await fetchTranscriptJson3(transcriptUrl.toString(), videoId);
  return {
    languageCode: track.languageCode,
    name: track.name,
    text: transcript
  };
}

async function fetchTranscriptFromLegacyTrack(track, videoId) {
  const transcriptUrl = new URL('https://www.youtube.com/api/timedtext');
  transcriptUrl.searchParams.set('v', videoId);
  transcriptUrl.searchParams.set('lang', track.languageCode);
  transcriptUrl.searchParams.set('fmt', 'json3');
  if (track.kind) {
    transcriptUrl.searchParams.set('kind', track.kind);
  }
  if (track.name && track.name !== track.languageCode) {
    transcriptUrl.searchParams.set('name', track.name);
  }

  const transcript = await fetchTranscriptJson3(transcriptUrl.toString(), videoId);
  return {
    languageCode: track.languageCode,
    name: track.name,
    text: transcript
  };
}

async function fetchTranscriptJson3(url, videoId) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT }
  });

  if (!response.ok) {
    throw new Error(`Failed to download captions (${response.status}).`);
  }

  const bodyText = await response.text();
  const lines = extractTranscriptLines(bodyText);

  const transcript = lines.join('\n');
  if (!transcript) {
    throw new Error(`Caption track for video ${videoId} was empty.`);
  }
  return transcript;
}

function extractTranscriptLines(bodyText) {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return [];
  }

  // YouTube may return either JSON3 payloads or timedtext XML based on track/source.
  if (trimmed.startsWith('{')) {
    const payload = JSON.parse(trimmed);
    const lines = [];
    for (const event of payload.events ?? []) {
      const segments = event.segs ?? [];
      const text = segments.map((segment) => segment.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
      if (text) {
        lines.push(text);
      }
    }
    return lines;
  }

  const xmlLineRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  const lines = [];
  let match;
  while ((match = xmlLineRegex.exec(trimmed)) !== null) {
    const text = decodeHtmlEntities(stripXmlTags(match[1])).replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push(text);
    }
  }
  return lines;
}

async function fetchLegacyCaptionTracks(videoId) {
  const url = new URL('https://www.youtube.com/api/timedtext');
  url.searchParams.set('type', 'list');
  url.searchParams.set('v', videoId);
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT }
  });

  if (!response.ok) {
    return [];
  }

  const xml = await response.text();
  return parseTimedTextTrackList(xml);
}

function parseTimedTextTrackList(xml) {
  const tracks = [];
  const trackRegex = /<track\b([^>]*)\/>/g;
  let match;
  while ((match = trackRegex.exec(xml)) !== null) {
    const attributes = parseXmlAttributes(match[1]);
    const languageCode = attributes.lang_code;
    if (!languageCode) {
      continue;
    }
    tracks.push({
      source: 'legacy',
      languageCode,
      name: decodeHtmlEntities(attributes.name || languageCode),
      kind: attributes.kind || ''
    });
  }
  return tracks;
}

function parseXmlAttributes(rawAttributes) {
  const attributes = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(rawAttributes)) !== null) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripXmlTags(value) {
  return value.replace(/<[^>]+>/g, '');
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
