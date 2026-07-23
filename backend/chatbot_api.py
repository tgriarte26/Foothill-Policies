"""
server.py

FastAPI backend for the Foothill Policy Owl chatbot. This replaces
chatbot_app.py's Streamlit UI with a plain JSON API, so that the custom
landing.html / chatbot.js frontend can call it directly instead of using
Streamlit's own UI.

Same Bedrock logic as chatbot_app.py (retrieve() + converse() against the
Managed Knowledge Base), just wrapped in HTTP endpoints instead of
Streamlit widgets.

Run with:
    uvicorn server:app --reload --port 8000

Endpoints:
    GET  /api/health   -> checks Bedrock connectivity
    POST /api/ask       -> {"question": "..."} -> {"answer": "...", "sources": [...]}
"""

import os
import traceback
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")

REGION = os.getenv("AWS_REGION", "us-west-2")
KNOWLEDGE_BASE_ID = os.getenv("KNOWLEDGE_BASE_ID", "H1HMELPYOJ")
MODEL_ID = os.getenv("MODEL_ARN", "us.amazon.nova-pro-v1:0")

app = FastAPI(title="Foothill Policy Owl API")

# The frontend (landing.html) will be served from a different origin/port
# than this API (e.g. a static file server on :5500 vs uvicorn on :8000),
# so the browser needs explicit CORS permission to call this API.
# For local dev this allows any origin; tighten allow_origins before
# deploying publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Bedrock helpers (unchanged logic from chatbot_app.py, minus st.cache_resource)
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


# Plain module-level singletons instead of st.cache_resource - built once
# at process startup and reused for every request.
_agent_client = boto3.client("bedrock-agent-runtime", **_boto3_kwargs())
_runtime_cfg = Config(connect_timeout=3600, read_timeout=3600, retries={"max_attempts": 1})
_runtime_client = boto3.client("bedrock-runtime", config=_runtime_cfg, **_boto3_kwargs())


def ask_policy_question(question: str) -> dict:
    retrieval = _agent_client.retrieve(
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

    response = _runtime_client.converse(
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
# API models + routes
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[str]


@app.get("/api/health")
def health():
    try:
        _agent_client.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": "test"},
            retrievalConfiguration={"managedSearchConfiguration": {"numberOfResults": 1}},
            userContext={"userId": "connection-test"},
        )
        return {"ok": True, "knowledge_base_id": KNOWLEDGE_BASE_ID}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


@app.post("/api/ask", response_model=AskResponse)
def ask(body: AskRequest):
    question = body.question.strip()
    if not question:
        return AskResponse(answer="Please type a question.", sources=[])
    try:
        result = ask_policy_question(question)
        return AskResponse(**result)
    except Exception as e:
        return AskResponse(
            answer=f"Error: {type(e).__name__}: {e}",
            sources=[],
        )
