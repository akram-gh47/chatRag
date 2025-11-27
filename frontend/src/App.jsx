import { useMemo, useRef, useState } from "react";
import { askQuestion, uploadPdf } from "./lib/api.js";
import "./App.css";

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const buildMessage = (role, content) => ({
  id: makeId(),
  role,
  content,
  timestamp: new Date().toISOString()
});

function App() {
  const fileInputRef = useRef(null);
  const [docId, setDocId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [isAsking, setIsAsking] = useState(false);
  const [sources, setSources] = useState([]);

  const readyToChat = Boolean(docId);

  const handleFileChange = async (event) => {
    setError(null);
    setStatus(null);

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Please pick a PDF file.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setStatus("Uploading and indexing your PDF…");

    try {
      const response = await uploadPdf(file);
      setDocId(response.doc_id);
      setChatHistory([]);
      setSources([]);
      setStatus("PDF ready. Start asking questions!");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to upload the file.";
      setError(message);
      setStatus(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleReset = () => {
    setDocId(null);
    setChatHistory([]);
    setSources([]);
    setQuestion("");
    setStatus("Upload a PDF to begin a new chat.");
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!docId) {
      setError("Upload a PDF before sending a question.");
      return;
    }
    if (!question.trim() || isAsking) {
      return;
    }

    const sanitizedQuestion = question.trim();
    const userMessage = buildMessage("user", sanitizedQuestion);
    const previewHistory = [...chatHistory, userMessage];

    setChatHistory(previewHistory);
    setQuestion("");
    setError(null);
    setStatus("Thinking…");
    setIsAsking(true);

    try {
      const { answer, sources: responseSources } = await askQuestion(
        docId,
        sanitizedQuestion,
        previewHistory
      );
      const assistantMessage = buildMessage("assistant", answer);
      setChatHistory((prev) => [...prev, assistantMessage]);
      setSources(responseSources ?? []);
      setStatus("Answered");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to fetch an answer.";
      setError(message);
      setStatus(null);
      setChatHistory((prev) => prev.filter((msg) => msg.id !== userMessage.id));
    } finally {
      setIsAsking(false);
    }
  };

  const lastUpdated = useMemo(
    () => chatHistory.at(-1)?.timestamp,
    [chatHistory]
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">RAG Playground</p>
          <h1>Chat with your PDF</h1>
          <p className="subtitle">
            Upload a PDF, let the backend ingest it via LangChain + Pinecone,
            and iterate on questions without leaving the browser.
          </p>
        </div>
        {docId && (
          <div className="doc-chip">
            <span>doc_id</span>
            <code>{docId}</code>
            <button type="button" onClick={handleReset} className="ghost-btn">
              Start over
            </button>
          </div>
        )}
      </header>

      <main className="card-grid">
        <section className="card upload-card">
          <div className="card-header">
            <h2>1. Upload a PDF</h2>
            <p>Select a document to load it into the vector store.</p>
          </div>

          <label className="upload-zone">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <div>
              <strong>Click to pick a PDF</strong>
              <p className="helper">
                Files never leave your machine except for the API call.
              </p>
            </div>
          </label>
          <ul className="hints">
            <li>Only one document at a time is supported.</li>
            <li>Re-upload to replace the current context entirely.</li>
          </ul>
        </section>

        <section className="card chat-card">
          <div className="card-header">
            <h2>2. Ask anything</h2>
            <p>
              Your questions run through the RAG pipeline. Responses include the
              snippets used to answer.
            </p>
          </div>

          <div className="chat-window">
            {chatHistory.length === 0 && (
              <div className="empty-state">
                <p>
                  {readyToChat
                    ? "Ask your first question to get started."
                    : "Upload a PDF to enable the chat interface."}
                </p>
              </div>
            )}

            {chatHistory.map((message) => (
              <article
                key={message.id}
                className={`chat-bubble ${message.role}`}
              >
                <header>
                  <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
                  <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                </header>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleAsk}>
            <textarea
              rows={3}
              name="question"
              placeholder={
                readyToChat
                  ? "Ask about the uploaded PDF…"
                  : "Upload a PDF before chatting."
              }
              disabled={!readyToChat || isAsking}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <div className="chat-form-actions">
              <button
                type="submit"
                className="primary-btn"
                disabled={!readyToChat || isAsking || !question.trim()}
              >
                {isAsking ? "Generating…" : "Send"}
              </button>
              <span className="form-hint">
                {readyToChat
                  ? "Press Shift + Enter for a newline."
                  : "Waiting for a PDF."}
              </span>
            </div>
          </form>
        </section>
      </main>

      <section className="status-area">
        {status && <p className="status-badge success">{status}</p>}
        {error && <p className="status-badge error">{error}</p>}
        {lastUpdated && (
          <p className="status-meta">
            Last update: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </section>

      {sources.length > 0 && (
        <section className="card sources-card">
          <div className="card-header">
            <h2>Sources cited</h2>
            <p>Snippets referenced by the last assistant reply.</p>
          </div>
          <div className="sources-grid">
            {sources.map((source, index) => (
              <article key={`${source.page_number}-${index}`} className="source">
                <p className="source-label">
                  Page {source.page_number ?? "?"}
                </p>
                <p className="source-snippet">
                  {source.snippet ?? "No preview available."}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default App;

