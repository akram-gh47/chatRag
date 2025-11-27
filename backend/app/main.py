import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .rag_pipeline import ingest_pdf, build_qa_chain

app = FastAPI(title="RAG Chatbot Workshop")

# Configuration CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Add frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modèles de données (Schemas) ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    doc_id: str
    question: str
    history: Optional[List[ChatMessage]] = None

class ChatResponse(BaseModel):
    answer: str
    sources: Optional[list] = None

# --- Endpoints ---
@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Endpoint pour uploader et ingérer un PDF."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF.")
    # Sauvegarde temporaire
    temp_dir = "tmp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        # Appel à notre pipeline d'ingestion
        doc_id = ingest_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Nettoyage
        if os.path.exists(file_path):
            os.remove(file_path)
    return {"doc_id": doc_id, "message": "PDF processed successfully"}

@app.post("/chat", response_model=ChatResponse)
async def chat_with_doc(request: ChatRequest):
    """Endpoint pour poser une question sur un document."""
    try:
        qa_chain = build_qa_chain(request.doc_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error building QA chain: {e}")
    # Gestion basique de l'historique
    history_text = ""
    if request.history:
        for msg in request.history:
            prefix = "User" if msg.role == "user" else "Assistant"
            history_text += f"{prefix}: {msg.content}\n"
    question_with_history = history_text + f"User: {request.question}"
    # Exécution de la chaîne
    result = qa_chain.invoke(question_with_history)
    answer = result["answer"]
    # Extraction des sources pour citation
    sources = []
    for doc in result.get("source_documents", []):
        sources.append(
            {
                "page_number": doc.metadata.get("page_number"),
                "snippet": doc.page_content[:200] + "...",
            }
        )
    return ChatResponse(answer=answer, sources=sources)