from __future__ import annotations
import logging
import time
import uuid
from typing import Optional
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import (
    RunnableLambda,
    RunnableParallel,
    RunnablePassthrough,
)
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pinecone import Pinecone
from .config import (
    OPENAI_API_KEY,
    OPENAI_CHAT_MODEL,
    OPENAI_EMBED_MODEL,
    OPENAI_TEMPERATURE,
    PINECONE_API_KEY,
    PINECONE_DIMENSION,
    PINECONE_INDEX_NAME,
    PINECONE_NAMESPACE,
)

logger = logging.getLogger(__name__)

# Vérification des clés API
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is not configured.")
if not PINECONE_API_KEY:
    raise RuntimeError("PINECONE_API_KEY is not configured.")

# Initialisation du client Pinecone
pc = Pinecone(api_key=PINECONE_API_KEY)

def _ensure_pinecone_index() -> None:
    """Crée l'index Pinecone s'il n'existe pas déjà."""
    existing_indexes = [i.name for i in pc.list_indexes()]
    if PINECONE_INDEX_NAME in existing_indexes:
        return
    logger.info("Creating Pinecone index '%s'...", PINECONE_INDEX_NAME)
    pc.create_index(
        name=PINECONE_INDEX_NAME,
        dimension=PINECONE_DIMENSION,
        metric="cosine",
        spec={"serverless": {"cloud": "aws", "region": "us-east-1"}} # Adapter selon config
    )
    # Attente que l'index soit prêt
    while True:
        idx = pc.describe_index(PINECONE_INDEX_NAME)
        if idx.status["ready"]:
            break
        time.sleep(1)

_ensure_pinecone_index()

# Initialisation des modèles LangChain
embeddings = OpenAIEmbeddings(
    api_key=OPENAI_API_KEY,
    model=OPENAI_EMBED_MODEL,
    dimensions=PINECONE_DIMENSION,
)
llm = ChatOpenAI(
    api_key=OPENAI_API_KEY,
    model=OPENAI_CHAT_MODEL,
    temperature=OPENAI_TEMPERATURE,
)
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=150,
    add_start_index=True,
)

def ingest_pdf(file_path: str, doc_id: Optional[str] = None) -> str:
    """
    Charge un PDF, le découpe et stocke les vecteurs dans Pinecone.
    """
    document_id = doc_id or str(uuid.uuid4())
    loader = PyPDFLoader(file_path)
    pages = loader.load()
    # Ajout de métadonnées pour le filtrage
    for i, page in enumerate(pages, start=1):
        page.metadata["doc_id"] = document_id
        page.metadata["page_number"] = page.metadata.get("page", i)
    chunks = text_splitter.split_documents(pages)
    # S'assurer que chaque chunk a le doc_id
    for chunk in chunks:
        chunk.metadata.setdefault("doc_id", document_id)
    PineconeVectorStore.from_documents(
        documents=chunks,
        embedding=embeddings,
        index_name=PINECONE_INDEX_NAME,
        namespace=None,
    )
    return document_id

def get_retriever_for_doc(doc_id: str):
    """
    Crée un 'retriever' qui ne cherche QUE dans le document spécifié.
    """
    vectorstore = PineconeVectorStore.from_existing_index(
        index_name=PINECONE_INDEX_NAME,
        embedding=embeddings,
        namespace=PINECONE_NAMESPACE,
    )
    return vectorstore.as_retriever(
        search_kwargs={
            "k": 5,
            "filter": {"doc_id": {"$eq": doc_id}},
        }
    )

def _format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

DEFAULT_SYSTEM_PROMPT = (
    "You are a domain expert assistant that answers questions using the "
    "provided context. If the answer is not contained in the context, "
    "respond with 'I could not find that in the document.'"
)

def build_qa_chain(doc_id: str) -> RunnableParallel:
    """
    Construit la chaîne RAG pour un document spécifique.
    """
    retriever = get_retriever_for_doc(doc_id)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "{system_prompt}"),
            ("human", "Context:\n{context}\n\nQuestion: {question}"),
        ]
    )
    answer_chain = (
        {
            "context": retriever | RunnableLambda(_format_docs),
            "question": RunnablePassthrough(),
            "system_prompt": lambda _: DEFAULT_SYSTEM_PROMPT,
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    return RunnableParallel(
        answer=answer_chain,
        source_documents=retriever,
    )