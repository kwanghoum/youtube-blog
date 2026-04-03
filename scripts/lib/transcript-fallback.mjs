import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { transcribeAudioFile } from './openai.mjs';

const execFileAsync = promisify(execFile);

export async function transcribeFromYoutubeAudio({ apiKey, youtubeUrl, videoId }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-audio-'));
  try {
    const outputTemplate = path.join(tempDir, '%(id)s.%(ext)s');
    await execFileAsync(
      'yt-dlp',
      [
        '--no-playlist',
        '--format',
        'bestaudio[ext=m4a]/bestaudio',
        '--output',
        outputTemplate,
        youtubeUrl
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const entries = await fs.readdir(tempDir);
    const audioFile = entries.find(
      (name) => name.startsWith(videoId) && (name.endsWith('.m4a') || name.endsWith('.webm') || name.endsWith('.mp3'))
    );
    if (!audioFile) {
      throw new Error(`yt-dlp did not produce an audio file for ${videoId}.`);
    }

    const filePath = path.join(tempDir, audioFile);
    const audioBuffer = await fs.readFile(filePath);
    const transcriptText = await transcribeAudioFile({
      apiKey,
      audioBuffer,
      filename: audioFile
    });

    return {
      languageCode: 'auto',
      name: 'audio-transcription-fallback',
      text: transcriptText
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
