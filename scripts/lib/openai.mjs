const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

export async function generateBlogContent({ apiKey, metadata, transcript, sourceUrl }) {
  const prompt = [
    'You are writing a Korean informational blog post based strictly on a YouTube transcript and metadata.',
    'Do not invent facts not supported by the transcript or metadata.',
    'Return JSON that matches the provided schema.',
    'Requirements:',
    '- Language: Korean.',
    '- Tone: clear, explanatory, blog-friendly, not promotional.',
    '- Include 2 to 4 main sections.',
    '- Every section body must be valid HTML using only <p>, <ul>, <li>, <strong>, <em> tags.',
    '- Do not include a source section in the generated fields; that is added by the system.',
    '- Create an image prompt for a blog cover image that is specific, non-textual, and visually coherent.',
    '',
    `Video title: ${metadata.title}`,
    `Channel name: ${metadata.channelName}`,
    `Source URL: ${sourceUrl}`,
    '',
    'Transcript:',
    transcript
  ].join('\n');

  const schema = {
    name: 'youtube_blog_post',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'excerpt', 'tags', 'introduction_html', 'sections', 'takeaway_html', 'image_prompt'],
      properties: {
        title: { type: 'string' },
        excerpt: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 6
        },
        introduction_html: { type: 'string' },
        sections: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['heading', 'html'],
            properties: {
              heading: { type: 'string' },
              html: { type: 'string' }
            }
          }
        },
        takeaway_html: { type: 'string' },
        image_prompt: { type: 'string' }
      }
    }
  };

  return withRetry(async () => {
    const response = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-5',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: schema.name,
            schema: schema.schema,
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(await formatApiError('OpenAI text generation failed', response));
    }

    const payload = await response.json();
    const outputText = payload.output_text || extractResponseText(payload);
    if (!outputText) {
      throw new Error('OpenAI text generation returned no output_text payload.');
    }

    return JSON.parse(outputText);
  }, 2);
}

export async function generateCoverImage({ apiKey, title, imagePrompt }) {
  return withRetry(async () => {
    const response = await fetch(IMAGES_URL, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt: `${imagePrompt}\n\nThe image should feel editorial, modern, and suitable for a blog cover. Do not include visible text or logos.`,
        size: process.env.OPENAI_IMAGE_SIZE || '1536x1024'
      })
    });

    if (!response.ok) {
      throw new Error(await formatApiError('OpenAI image generation failed', response));
    }

    const payload = await response.json();
    const image = payload.data?.[0]?.b64_json;
    if (!image) {
      throw new Error(`OpenAI image generation returned no image for \"${title}\".`);
    }

    return Buffer.from(image, 'base64');
  }, 2);
}

export async function transcribeAudioFile({ apiKey, audioBuffer, filename }) {
  return withRetry(async () => {
    const form = new FormData();
    const file = new File([audioBuffer], filename, { type: guessAudioMimeType(filename) });
    form.append('file', file);
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');

    const response = await fetch(TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(await formatApiError('OpenAI transcription failed', response));
    }

    const payload = await response.json();
    const text = (payload.text || '').trim();
    if (!text) {
      throw new Error('OpenAI transcription returned empty text.');
    }
    return text;
  }, 2);
}

function guessAudioMimeType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.m4a')) {
    return 'audio/mp4';
  }
  if (lower.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (lower.endsWith('.webm')) {
    return 'audio/webm';
  }
  return 'application/octet-stream';
}

function authHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  };
}

async function formatApiError(prefix, response) {
  const text = await response.text();
  return `${prefix}: ${response.status} ${response.statusText} - ${text}`;
}

function extractResponseText(payload) {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) {
        return content.text;
      }
    }
  }
  return '';
}

async function withRetry(task, maxAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}
