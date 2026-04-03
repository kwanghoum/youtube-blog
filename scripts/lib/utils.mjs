import path from 'node:path';

export function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'post';
}

export function extractVideoId(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid YouTube URL.');
  }

  if (url.hostname === 'youtu.be') {
    return sanitizeVideoId(url.pathname.slice(1));
  }

  if (url.hostname.endsWith('youtube.com')) {
    if (url.pathname === '/watch') {
      return sanitizeVideoId(url.searchParams.get('v'));
    }

    const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
    if (match) {
      return sanitizeVideoId(match[2]);
    }
  }

  throw new Error('Unsupported YouTube URL format.');
}

function sanitizeVideoId(value) {
  if (!value || !/^[a-zA-Z0-9_-]{6,20}$/.test(value)) {
    throw new Error('Could not determine a valid YouTube video ID.');
  }
  return value;
}

export function buildSlug(date, title, videoId) {
  return `${date}-${slugify(title)}-${videoId.slice(0, 6).toLowerCase()}`;
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function posixJoin(...parts) {
  return parts.join('/').replace(/\/+/g, '/').replace(/\/\//g, '/');
}

export function contentImagePath(filename) {
  return path.join('content', 'images', filename);
}
