"""2단계: 로그인한 승인 사용자만 문서를 읽고 질문할 수 있는 챗봇."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, UploadFile
from google import genai
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

from retrieval import find_chunks  # noqa: E402
from supabase_store import add_document, all_document_texts, list_documents  # noqa: E402
from auth_guard import require_approved  # noqa: E402

app = FastAPI(docs_url="/api/docs", openapi_url="/api/openapi.json")
MAX_FILE_SIZE = 1_000_000


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@app.get("/api/documents")
def get_documents(authorization: str = Header(default="")):
    token, user_id = require_approved(authorization)
    return {"documents": list_documents(token)}


@app.post("/api/documents")
def upload_document(file: UploadFile, authorization: str = Header(default="")):
    token, user_id = require_approved(authorization)
    filename = (file.filename or "").replace("\\", "/").split("/")[-1]
    if not filename.lower().endswith(".txt"):
        raise HTTPException(status_code=400, detail="TXT 파일만 올릴 수 있습니다.")
    if len(filename) > 200:
        raise HTTPException(status_code=400, detail="파일명이 너무 깁니다.")

    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일은 1 MB 이하여야 합니다.")
    try:
        content = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="UTF-8 TXT 파일을 선택하세요.")
    if not content.strip():
        raise HTTPException(status_code=400, detail="내용이 비어 있습니다.")

    document = add_document(token, user_id, filename, content)
    return {"id": document["id"], "filename": document["filename"]}


@app.post("/api/chat")
def chat(request: ChatRequest, authorization: str = Header(default="")):
    # Gemini를 호출하기 전에 로그인과 관리자 승인을 먼저 확인합니다.
    token, user_id = require_approved(authorization)

    # RLS가 허용한 현재 사용자의 문서만 가져옵니다.
    documents = all_document_texts(token)
    chunks = find_chunks(request.question, documents)
    if not chunks:
        return {"answer": "내 문서에서 관련 내용을 찾지 못했습니다.", "sources": []}

    context = ""
    sources = []
    for chunk in chunks:
        context += "파일: " + chunk["source"] + "\n"
        context += chunk["text"] + "\n\n"
        if chunk["source"] not in sources:
            sources.append(chunk["source"])

    prompt = "아래 발췌문을 근거로 질문에 답하세요.\n"
    prompt += "발췌문에 답이 없으면 근거가 부족하다고 말하세요.\n\n"
    prompt += "발췌문:\n" + context
    prompt += "질문: " + request.question

    client = genai.Client()
    interaction = client.interactions.create(
        model="gemini-3.5-flash-lite", input=prompt
    )
    return {"answer": interaction.output_text, "sources": sources}
