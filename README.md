# Foothill Policy Owl — chatbot

One Streamlit file, Foothill College colors (scarlet/black/white), wired
to your Managed Knowledge Base (RPW9OGLQJI).

## What changed in this version

1. **Colors/readability fixed at the root.** Instead of injecting custom
   CSS to override Streamlit's internals (fragile — this is what caused
   the earlier "text not visible" and "raw CSS showing as text" bugs),
   this uses Streamlit's own built-in theme system via
   `.streamlit/config.toml`. That file MUST stay in a folder literally
   named `.streamlit` next to `chatbot_app.py` — Streamlit finds it
   automatically, no code needed. This guarantees proper text contrast
   because Streamlit computes it correctly for every component itself.

2. **Connection status is now always visible** at the top of the app —
   checked once automatically when the page loads, plus a "Recheck"
   button. No more guessing whether it's connected.

3. **Setup instructions live inside the app itself** (the "Setup & auth
   help" section), so you have them on hand without scrolling back
   through chat history.

4. **Long-term API key recommended over short-term.** Short-term keys
   expire in 12 hours and need regenerating constantly — that's what's
   been causing the repeated "unable to locate credentials" cycle.
   Long-term keys last up to 365 days, set once.

## Setup

```bash
python3.12 -m pip install streamlit boto3 python-dotenv --break-system-packages
cp .env.example .env
```

Get a long-term key: **AWS Console → Bedrock → API keys → Long-term API
keys tab → Generate long-term API keys**. Paste it into `.env` as
`AWS_BEARER_TOKEN_BEDROCK=...`.

**Never export credentials manually or paste them into chat** — the
`.env` file is the one place they should live. `chatbot_app.py` reads it
automatically every time it starts.

## Run

```bash
python3.12 -m streamlit run chatbot_app.py
```

Folder must contain, together:
```
chatbot_app.py
.env
.streamlit/
  config.toml
```

If "Recheck" still shows not connected, expand **"Full error details"**
after asking a question — it shows the exact exception type and full
traceback, which tells us precisely what's wrong instead of guessing.
