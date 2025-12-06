<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1-jLqQ7JH6ko1tO7UR8ol9uRM6NmmdOoO

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## PDF / ZIP handling

- Attachments now support images, PDF, ZIP (per-file), and small text files/snippets.
- Files are uploaded to the private Supabase Storage bucket `uploads`; only minimal metadata is stored (no file contents) in `public.file_metadata` and `messages.file_metadata`.
- Max upload size is 25MB per file. Unsupported items inside ZIPs are skipped with warnings.
- Apply the new schema before use: `supabase db push`
- Deploy the updated Edge Function: `supabase functions deploy gemini-chat`
- Required env/secrets for the Edge Function: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, and model provider keys (`GOOGLE_API_KEY`, `OPENAI_API_KEY`) available to the function runtime.