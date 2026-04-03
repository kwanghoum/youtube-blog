# YouTube Blog Generator

YouTube URL을 입력하면 공개 자막을 바탕으로 한국어 블로그 글과 대표 이미지를 생성하고, 결과를 GitHub Pages에 게시하는 정적 사이트입니다.

## 구조
- `scripts/generate-post.mjs`: YouTube 메타데이터/자막 수집, OpenAI 기반 글 생성, 대표 이미지 생성, 콘텐츠 파일 저장
- `scripts/build-site.mjs`: `content/posts/*.json`을 읽어 `docs/` 정적 사이트 생성
- `content/posts/`: 생성된 포스트 JSON 저장소
- `content/images/`: 생성된 대표 이미지 저장소
- `.github/workflows/generate-post.yml`: 관리자용 수동 생성 워크플로우
- `.github/workflows/deploy-pages.yml`: `docs/`를 GitHub Pages로 배포

## 요구 사항
- Node.js 20+
- GitHub repository secrets
  - `OPENAI_API_KEY`: OpenAI API 키
- GitHub repository variables
  - `SITE_URL`: 최종 배포 URL. 예시: `https://<owner>.github.io/<repo>`

## 로컬 명령
```bash
node --test
node scripts/build-site.mjs
OPENAI_API_KEY=... node scripts/generate-post.mjs "https://www.youtube.com/watch?v=..."
```

## GitHub Pages 설정
1. 저장소를 GitHub에 올립니다.
2. `Settings -> Pages`에서 `Build and deployment` 소스를 `GitHub Actions`로 설정합니다.
3. `Settings -> Secrets and variables -> Actions`에 `OPENAI_API_KEY` secret을 추가합니다.
4. 같은 화면에서 `SITE_URL` variable을 추가합니다.
5. `Actions -> Generate Blog Post` 워크플로우를 수동 실행하고 YouTube URL을 입력합니다.

## 동작 방식
1. 워크플로우가 YouTube URL에서 영상 ID를 추출합니다.
2. 공개 자막과 영상 메타데이터를 수집합니다.
3. 자막이 없으면 실패 처리합니다.
4. OpenAI Responses API로 한국어 블로그 구조 JSON을 생성합니다.
5. OpenAI Images API로 대표 이미지 1장을 생성합니다.
6. `content/posts/*.json`, `content/images/*.png`, `docs/`를 갱신하고 커밋합니다.
7. 푸시 이벤트가 `deploy-pages.yml`을 실행해 GitHub Pages에 반영합니다.

## 콘텐츠 포맷
각 포스트 JSON은 아래 필드를 가집니다.
- `slug`
- `title`
- `date`
- `youtube_url`
- `video_id`
- `video_title`
- `channel_name`
- `source_note`
- `cover_image`
- `excerpt`
- `tags`
- `introduction_html`
- `sections`
- `takeaway_html`

## 주의 사항
- 자막 없는 영상은 기본 정책상 게시하지 않습니다.
- 동일 영상 ID는 중복 게시하지 않습니다.
- 브라우저 클라이언트에는 API 키를 두지 않습니다.
- 대표 이미지 생성 실패도 전체 실패로 처리합니다.

## OpenAI API 참고
- Responses API: https://platform.openai.com/docs/api-reference/responses
- Image generation guide: https://platform.openai.com/docs/guides/image-generation
