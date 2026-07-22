"""
chatbot_app.py

Foothill College themed chat interface for the FHDA policy Knowledge Base.
Colors: Scarlet, black & white (Foothill's actual school colors), Owl mascot.

This version uses Streamlit's own built-in theme system (see
.streamlit/config.toml) instead of injected CSS overrides. That file MUST
sit in a folder literally named ".streamlit" in the same directory you run
this from - Streamlit reads it automatically on startup, no code needed.
This is what actually fixes text contrast reliably: Streamlit computes
correct text color against these base colors for every component itself,
rather than us guessing at internal CSS selectors and fighting them.

Run with:
    streamlit run chatbot_app.py

Knowledge Base: knowledge-base-quick-start-dcu8k (RPW9OGLQJI)
Managed Knowledge Base -> uses retrieve() + converse() (two calls).

AUTH: see the "Setup & connection" section at the top of the app when it
runs - it has the exact steps and shows live connection status.
"""

import os
import traceback

import boto3
import streamlit as st
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

REGION = os.getenv("AWS_REGION", "us-west-2")
KNOWLEDGE_BASE_ID = os.getenv("KNOWLEDGE_BASE_ID", "H1HMELPYOJ")
# Nova models require the cross-region inference profile ID (us. prefix)
MODEL_ID = os.getenv("MODEL_ARN", "us.amazon.nova-pro-v1:0")

st.set_page_config(page_title="Foothill Policy Owl", page_icon="\U0001F989", layout="centered")

BOT_AVATAR = "\U0001F989"
USER_AVATAR = "\U0001F393"

st.title("\U0001F989 Foothill Policy Owl")
st.caption("Ask about any FHDA board policy or administrative procedure. Answers are grounded in the source documents, with citations.")


# ---------------------------------------------------------------------------
# Bedrock helpers
# ---------------------------------------------------------------------------

def extract_source(location: dict) -> str:
    if not location:
        return "unknown source"
    for key in ("s3Location", "webLocation", "confluenceLocation", "sharePointLocation", "salesforceLocation"):
        loc = location.get(key)
        if loc:
            return loc.get("uri") or loc.get("url") or str(loc)
    return "unknown source"


def _boto3_kwargs() -> dict:
    """
    Build explicit credential kwargs for boto3 clients.
    Prefers IAM key/secret/token from env; ignores empty strings so boto3
    falls back to ~/.aws credentials / IAM role if nothing is set.
    """
    kwargs: dict = {"region_name": REGION}
    key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    token = os.getenv("AWS_SESSION_TOKEN", "").strip()
    if key and secret:
        kwargs["aws_access_key_id"] = key
        kwargs["aws_secret_access_key"] = secret
        if token:
            kwargs["aws_session_token"] = token
    return kwargs


@st.cache_resource
def get_agent_client():
    return boto3.client("bedrock-agent-runtime", **_boto3_kwargs())


@st.cache_resource
def get_runtime_client():
    # Nova docs recommend read_timeout of 3600s (60 min)
    cfg = Config(connect_timeout=3600, read_timeout=3600, retries={"max_attempts": 1})
    return boto3.client("bedrock-runtime", config=cfg, **_boto3_kwargs())


def check_connection():
    """Runs a minimal retrieve() call to confirm credentials + KB access
    actually work. Returns (ok: bool, message: str)."""
    try:
        client = get_agent_client()
        client.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": "test"},
            retrievalConfiguration={"managedSearchConfiguration": {"numberOfResults": 1}},
            userContext={"userId": "connection-test"},
        )
        return True, "Connected"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def ask_policy_question(question: str) -> dict:
    agent_client = get_agent_client()
    retrieval = agent_client.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={"text": question},
        retrievalConfiguration={"managedSearchConfiguration": {"numberOfResults": 6}},
        userContext={"userId": "foothill-policy-owl"},
    )
    chunks = retrieval.get("retrievalResults", [])
    if not chunks:
        return {"answer": "I couldn't find anything about that in the policy documents. Try rephrasing?", "sources": []}

    context_text = "\n\n".join(f"[{i + 1}] {c['content']['text']}" for i, c in enumerate(chunks))
    sources = sorted({extract_source(c.get("location")) for c in chunks})

    runtime_client = get_runtime_client()
    response = runtime_client.converse(
        modelId=MODEL_ID,
        system=[{"text": (
            "You are a helpful policy assistant for the Foothill-De Anza Community College District. "
            "Answer questions using ONLY the provided context. "
            "If the context doesn't contain the answer, say so plainly."
        )}],
        messages=[
            {
                "role": "user",
                "content": [
                    {"text": f"Context:\n{context_text}\n\nQuestion: {question}"}
                ],
            }
        ],
        inferenceConfig={
            "maxTokens": 1024,
            "temperature": 0.3,
            "topP": 0.9,
        },
    )
    answer = response["output"]["message"]["content"][0]["text"]
    return {"answer": answer, "sources": sources}


# ---------------------------------------------------------------------------
# Setup & connection status - always visible, checked once per session
# (not on every keystroke), with a manual recheck button.
# ---------------------------------------------------------------------------

if "conn_ok" not in st.session_state:
    st.session_state.conn_ok, st.session_state.conn_msg = check_connection()

status_col, button_col = st.columns([4, 1])
with status_col:
    if st.session_state.conn_ok:
        st.success(f"Connected to Knowledge Base `{KNOWLEDGE_BASE_ID}`", icon="\u2705")
    else:
        st.error(f"Not connected: {st.session_state.conn_msg}", icon="\u26a0\ufe0f")
with button_col:
    if st.button("Recheck"):
        st.session_state.conn_ok, st.session_state.conn_msg = check_connection()
        st.rerun()

with st.expander("Setup & auth help", expanded=not st.session_state.conn_ok):
    st.markdown(f"""
**Currently targeting:**
- Knowledge Base ID: `{KNOWLEDGE_BASE_ID}`
- Region: `{REGION}`
- Model: `{MODEL_ID}`

**To authenticate, use a long-term Bedrock API key (recommended over short-term):**
1. AWS Console -> Amazon Bedrock -> **API keys** (left sidebar)
2. Go to the **Long-term API keys** tab -> **Generate long-term API keys**
3. Pick an expiration (e.g. 90 days) -> **Generate** -> copy the key
4. Put it in your `.env` file (same folder as this app) as one line:
   ```
   AWS_BEARER_TOKEN_BEDROCK=paste_your_long_term_key_here
   ```
5. Restart this app: stop it (Ctrl+C) and run `streamlit run chatbot_app.py` again

Using `.env` instead of `export` means you only set this once — no more
re-exporting it every time you open a new terminal tab.

If step 2 fails with a permissions error, your sandbox account may not
allow creating IAM users (long-term keys need that). In that case, fall
back to a short-term key from the **Short-term API keys** tab instead —
same `.env` line, just know it'll need refreshing periodically.
""")

st.divider()


# ---------------------------------------------------------------------------
# Chat UI
# ---------------------------------------------------------------------------

if "foothill_messages" not in st.session_state:
    st.session_state.foothill_messages = [
        {
            "role": "assistant",
            "content": "Hoot hoot! Ask me about any FHDA board policy or administrative procedure.",
            "sources": [],
        }
    ]

for msg in st.session_state.foothill_messages:
    avatar = BOT_AVATAR if msg["role"] == "assistant" else USER_AVATAR
    with st.chat_message(msg["role"], avatar=avatar):
        st.markdown(msg["content"])
        if msg.get("sources"):
            with st.expander("Sources"):
                for s in msg["sources"]:
                    st.markdown(f"- `{s}`")

question = st.chat_input("Ask your question...")

if question:
    st.session_state.foothill_messages.append({"role": "user", "content": question, "sources": []})
    with st.chat_message("user", avatar=USER_AVATAR):
        st.markdown(question)

    with st.chat_message("assistant", avatar=BOT_AVATAR):
        if not KNOWLEDGE_BASE_ID:
            st.error("KNOWLEDGE_BASE_ID is not set.")
        else:
            with st.spinner("Hooting through the policy documents..."):
                try:
                    result = ask_policy_question(question)
                    st.markdown(result["answer"])
                    if result["sources"]:
                        with st.expander("Sources"):
                            for s in result["sources"]:
                                st.markdown(f"- `{s}`")
                    st.session_state.foothill_messages.append(
                        {"role": "assistant", "content": result["answer"], "sources": result["sources"]}
                    )
                    st.session_state.conn_ok = True
                except Exception as e:
                    error_msg = f"{type(e).__name__}: {e}"
                    st.error(error_msg)
                    with st.expander("Full error details"):
                        st.code(traceback.format_exc())
                    st.session_state.foothill_messages.append(
                        {"role": "assistant", "content": "Error: " + error_msg, "sources": []}
                    )
