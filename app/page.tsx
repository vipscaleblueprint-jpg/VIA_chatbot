"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { ingestText } from "@/lib/ingest";
import KnowledgeBase from "@/components/KnowledgeBase";

// --- TYPES ---
type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
};

export type UploadTask = {
  id: string;
  filename: string;
  status: "idle" | "processing" | "completed" | "error";
  progress: number;
  error?: string;
  totalChunks?: number;
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [botStatus, setBotStatus] = useState<"idle" | "waiting" | "seen" | "analyzing" | "typing">("idle");
  const [statusIndex, setStatusIndex] = useState(0);
  const [lastMessageSeen, setLastMessageSeen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "dataset">("chat");
  const [datasetTab, setDatasetTab] = useState<"sop" | "team" | "queue">("sop");
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastRequestCancelled, setLastRequestCancelled] = useState(false);
  
  const loadingStatuses = [
    "Searching knowledge base...",
    "Extracting matching documents...",
    "Analyzing strategic data...",
    "Generating insight...",
    "Refining response structure...",
    "Almost ready..."
  ];

  // UPLOAD QUEUE STATE
  const [uploadQueue, setUploadQueue] = useState<UploadTask[]>([]);


  const bottomRef = useRef<HTMLDivElement>(null);

  // HYDRATE FROM CACHE ON MOUNT
  useEffect(() => {
    if (typeof window !== "undefined" && !isHydrated) {
      const saved = sessionStorage.getItem("via_chat_history");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const hydrated = parsed.map((m: Msg) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
          setMessages(hydrated);
        } catch (e) {
          console.error("Failed to load history:", e);
        }
      }
      setIsHydrated(true);
    }
  }, [isHydrated]);

  // SAVE TO CACHE ON CHANGE
  useEffect(() => {
    if (isHydrated && messages.length > 0) {
      sessionStorage.setItem("via_chat_history", JSON.stringify(messages));
    }
  }, [messages, isHydrated]);

  // auto scroll to bottom when new messages appear
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, botStatus]);

  // ROTATING LOADING TEXT
  useEffect(() => {
    if (botStatus !== "typing") {
      setStatusIndex(0); 
      return;
    }
    const interval = setInterval(() => {
      setStatusIndex(prev => Math.min(prev + 1, loadingStatuses.length - 1));
    }, 4500);
    return () => clearInterval(interval);
  }, [botStatus]);



  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const forceStop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setBotStatus("idle");
      setLastRequestCancelled(true);
    }
  };

  const deleteMessage = (id: string) => {
    if (botStatus !== "idle") forceStop();
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const startEdit = (msg: Msg) => {
    if (botStatus !== "idle") forceStop();
    setInput(msg.text);
    setEditingId(msg.id);
  };

  async function sendMessage() {
    if (!input.trim() || botStatus !== "idle") return;

    const userText = input;
    const currentEditingId = editingId;
    
    // Clear state
    setInput("");
    setEditingId(null);
    setLastRequestCancelled(false);
    
    const controller = new AbortController();
    setAbortController(controller);

    if (currentEditingId) {
      // If editing, find the message and update it
      setMessages(prev => {
        const index = prev.findIndex(m => m.id === currentEditingId);
        if (index === -1) return prev;
        // Remove subsequent messages (assistant reply)
        return [...prev.slice(0, index), { ...prev[index], text: userText, timestamp: new Date() }];
      });
    } else {
      const userMsgId = Math.random().toString(36).substring(7);
      const newUserMsg: Msg = { 
        id: userMsgId,
        role: "user", 
        text: userText, 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, newUserMsg]);
    }

    setLastMessageSeen(true);
    setBotStatus("typing");
    
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Connection failed");

      const data = await res.json();
      const reply = data.reply ?? "I encountered an error processing your request.";

      setMessages(prev => [...prev, { 
        id: Math.random().toString(36).substring(7),
        role: "assistant", 
        text: reply,
        timestamp: new Date()
      }]);

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Fetch aborted");
        return;
      }
      setMessages(prev => [
        ...prev,
        { 
          id: Math.random().toString(36).substring(7),
          role: "assistant", 
          text: "I'm having trouble connecting to the system. Please try again in a moment.",
          timestamp: new Date()
        },
      ]);
    } finally {
      setBotStatus("idle");
      setAbortController(null);
    }
  }

  async function handlePDFUpload(files: FileList | File[]) {
    if (!files || files.length === 0) return;

    // 1. ADD ALL FILES TO QUEUE FIRST
    const newTasks: UploadTask[] = Array.from(files).map(f => ({
      id: Math.random().toString(36).substring(7),
      filename: f.name,
      status: "idle",
      progress: 0
    }));
    
    setUploadQueue(prev => [...newTasks, ...prev]);
    if (activeView !== "dataset") setActiveView("dataset");
    setDatasetTab("queue"); // Auto-switch to queue tab

    // 2. DYNAMIC IMPORT PDFJS
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    for (const task of newTasks) {
      const file = Array.from(files).find(f => f.name === task.filename);
      if (!file) continue;

      setUploadQueue(prev => prev.map(t => t.id === task.id ? { ...t, status: "processing" } : t));

      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => (typeof (item as any).str === "string" ? (item as any).str : ""))
            .join(" ");
          fullText += pageText + "\n";
          
          setUploadQueue(prev => prev.map(t => t.id === task.id ? { 
            ...t, 
            progress: Math.floor((i / pdf.numPages) * 100 * 0.5) // First 50% is parsing
          } : t));
        }

        const cleanText = fullText.replace(/\s+/g, " ").trim();
        if (!cleanText) throw new Error("Could not extract text from document");

        console.log(`[Ingest] Chunking and processing ${file.name}...`);
        const res = await ingestText(cleanText, file.name);
        if (res.success) {
          setUploadQueue(prev => prev.map(t => t.id === task.id ? { 
            ...t, 
            status: "completed", 
            progress: 100,
            totalChunks: res.chunks 
          } : t));
        } else {
          throw new Error(res.error);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setUploadQueue(prev => prev.map(t => t.id === task.id ? { 
          ...t, 
          status: "error", 
          error: errorMsg
        } : t));
      }
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  return (
    <div className="h-screen flex selection:bg-accent/20 relative overflow-hidden">
      {/* SIDEBAR */}
      <aside className="hidden md:flex w-20 flex-col items-center py-8 gap-10 z-40 border-r border-slate-200/60 bg-white/20 backdrop-blur-2xl">
        <div className="relative w-10 h-10 transition-all duration-500 hover:scale-110">
           <Image src="/icon/vip.png" alt="VIA" fill className="object-contain" />
        </div>
        
        <div className="flex-1 flex flex-col items-center gap-6">
          <div className="w-8 h-[1px] bg-slate-200" />
          
          <button 
            onClick={() => setActiveView("chat")}
            className={`w-12 h-12 rounded-2xl glass-card flex items-center justify-center transition-all group relative border shadow-sm ${activeView === "chat" ? "bg-white text-accent border-accent/20 scale-110 shadow-lg shadow-accent/10" : "text-slate-400 border-slate-100 hover:text-accent hover:bg-white"}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <div className="absolute left-16 px-4 py-2 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap pointer-events-none uppercase tracking-widest font-black shadow-2xl z-50">
              Strategic Chat
              <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </button>

          <button 
            onClick={() => setActiveView("dataset")}
            className={`w-12 h-12 rounded-2xl glass-card flex items-center justify-center transition-all group relative border shadow-sm ${activeView === "dataset" ? "bg-white text-accent border-accent/20 scale-110 shadow-lg shadow-accent/10" : "text-slate-400 border-slate-100 hover:text-accent hover:bg-white"}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="absolute left-16 px-4 py-2 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap pointer-events-none uppercase tracking-widest font-black shadow-2xl z-50">
              Knowledge Base
              <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </button>

          <a 
            href="https://docs.google.com/spreadsheets/d/16jhIyA89RfkliY-88RRkc27VpcqzHfgYGHsNIYc1H-I/edit?gid=583061340#gid=583061340"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center text-slate-400 hover:text-accent hover:bg-white transition-all group relative border-slate-100 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            
            <div className="absolute left-16 px-4 py-2 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap pointer-events-none uppercase tracking-widest font-black shadow-2xl z-50">
              Edit Master Dataset
              <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
            </div>
          </a>


        </div>

        <div className="mt-auto flex flex-col items-center gap-6">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative overflow-hidden">

        {/* HEADER */}
        <header className="sticky top-4 z-30 mx-auto w-[95%] max-w-5xl">
          <div className="glass-panel rounded-full px-6 py-3 flex items-center justify-between shadow-lg border-white/50">
            <div className="flex items-center gap-4">
              <div className="relative h-8 w-32">
                <Image 
                  src="/icon/header.png" 
                  alt="VIP Logo" 
                  fill
                  className="object-contain"
                />
              </div>

            </div>
            
            <div className="hidden md:flex items-center gap-3">
              <div className="bg-slate-50 px-4 py-1.5 rounded-full text-[10px] text-slate-400 uppercase tracking-wider font-bold border border-slate-100">
                Secure Protocol Active
              </div>
            </div>
          </div>
        </header>

        {activeView === "chat" ? (
          <>
            {/* CHAT AREA */}
            <main className="flex-1 overflow-y-auto scroll-smooth relative">
              <div className="max-w-3xl mx-auto py-12 px-6 relative z-10">

                {messages.length === 0 && (
                  <div className="text-center pt-24 space-y-10 animate-float">
                    <div className="inline-flex items-center gap-6 px-10 py-4 rounded-full border border-slate-200 bg-white shadow-md mb-8">
                      <div className="relative w-24 h-12">
                        <Image 
                          src="/icon/header.png" 
                          alt="VIP" 
                          fill
                          className="object-contain"
                        />
                      </div>
                      <div className="w-[1px] h-8 bg-slate-200" />
                      <span className="text-xl uppercase tracking-[0.4em] font-black text-slate-500">VIA</span>
                    </div>
                    <div className="space-y-4">
                      <h2 className="text-5xl md:text-6xl font-display font-black tracking-tight text-slate-900">
                        We craft <span className="text-accent italic">intelligence</span> <br />
                        and digital strategy
                      </h2>
                      <p className="max-w-lg mx-auto text-slate-500 text-sm font-medium leading-relaxed">
                        I am VIA, your specialized company assistant. I provide detailed insights about operations, internal protocols, and strategic digital activations.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto pt-8">
                      {["Client Portfolio Details", "Company Policy Search", "Project Status Updates", "Departmental Contacts"].map((prompt) => (
                        <button 
                          key={prompt}
                          onClick={() => setInput(prompt)}
                          className="glass-card hover:bg-white text-left p-5 rounded-[2rem] text-sm font-bold text-slate-600 hover:text-accent hover:border-accent/30 transition-all border-slate-100 shadow-sm flex items-center justify-between group"
                        >
                          {prompt}
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-8">
                  {messages.map((m, i) => {
                    const isLastUserMsg = m.role === "user" && i === messages.length - 1;

                    return (
                      <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                        
                        <div className={`flex items-start gap-4 max-w-[90%] md:max-w-[80%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                          
                          {m.role === "assistant" && (
                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 glass-card mt-1 border border-white/10 shadow-lg p-1.5">
                              <Image src="/icon/vip.png" alt="VIA" width={32} height={32} className="object-contain" />
                            </div>
                          )}

                          <div className="flex flex-col">                            <div
                              className={`px-6 py-4 rounded-[2rem] text-[15px] leading-relaxed relative group/msg
                              ${
                                m.role === "user"
                                  ? "message-user text-white rounded-tr-sm"
                                  : "message-assistant text-slate-800 rounded-tl-sm bg-white border border-slate-100 font-medium"
                              }`}
                            >
                              {m.role === "assistant" ? 
                                <div className="prose prose-sm max-w-none markdown-content font-sans">
                                  <ReactMarkdown>{m.text}</ReactMarkdown>
                                </div> : 
                                <span>{m.text}</span>
                              }

                              {/* ACTIONS */}
                              {m.role === "user" && (
                                <div className={`absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 transition-opacity ${
                                  (isLastUserMsg && botStatus !== "idle") ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"
                                }`}>
                                  <button 
                                    onClick={() => startEdit(m)}
                                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-accent transition-colors shadow-sm"
                                    title="Edit message"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button 
                                    onClick={() => deleteMessage(m.id)}
                                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-red-500 transition-colors shadow-sm"
                                    title="Delete message"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            <div className={`flex items-center gap-2 mt-2 px-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                               <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase">
                                  {formatTime(m.timestamp)}
                               </span>
                               {editingId === m.id && (
                                 <span className="text-[9px] text-accent font-black uppercase tracking-widest animate-pulse">Editing...</span>
                               )}
                            </div>
                          </div>
                        </div>


                        {isLastUserMsg && (
                          <div className="mt-2 flex flex-col items-end px-2">
                             <span className={`text-[10px] font-semibold tracking-widest ${lastRequestCancelled ? "text-red-400" : "text-accent/60"}`}>
                                {lastRequestCancelled 
                                  ? "Cancelled" 
                                  : (lastMessageSeen 
                                      ? (botStatus === "idle" ? "Confirmed" : botStatus.charAt(0).toUpperCase() + botStatus.slice(1)) 
                                      : "Transmitting"
                                    )
                                }
                             </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {botStatus === "typing" && (
                    <div className="flex items-start gap-4 animate-pulse">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 glass-card mt-1 border border-slate-200 shadow-lg p-1.5 bg-white">
                        <Image src="/icon/vip.png" alt="VIA" width={32} height={32} className="object-contain" />
                      </div>
                      <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-5 py-4 flex flex-col gap-3 shadow-sm min-w-[180px]">
                        <div className="flex gap-1.5 items-center">
                          <div className="w-2 h-2 bg-accent/60 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-accent/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-2 h-2 bg-accent/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest transition-opacity duration-500">
                           {loadingStatuses[statusIndex]}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div ref={bottomRef} className="h-20" />
              </div>
            </main>

            {/* INPUT AREA */}
            <footer className="p-8 relative">
              <div className="max-w-4xl mx-auto flex items-center gap-4 bg-white p-2 rounded-full border border-slate-200 shadow-xl">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={editingId ? "Edit your strategy..." : "Type your strategic inquiry here..."}
                  className={`flex-1 bg-transparent text-slate-900 py-3 px-8 outline-none border-none text-[15px] placeholder:text-slate-300 font-semibold ${editingId ? "text-accent" : ""}`}
                />
                
                {botStatus !== "idle" ? (
                  <button
                    onClick={forceStop}
                    className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-all duration-300 shadow-md group"
                    title="Force Stop"
                  >
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 pr-2">
                    {editingId && (
                      <button
                        onClick={() => { setEditingId(null); setInput(""); }}
                        className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest px-3"
                      >
                        Cancel Edit
                      </button>
                    )}
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim()}
                      className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 shadow-md ${
                        !input.trim() 
                        ? "bg-slate-50 text-slate-200 cursor-not-allowed" 
                        : "bg-primary text-white hover:bg-primary/90 hover:scale-[1.02] active:scale-95 shadow-primary/20"
                      }`}
                    >
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

            </footer>
          </>
        ) : (
          <KnowledgeBase 
            uploadQueue={uploadQueue} 
            onClearQueue={() => setUploadQueue([])}
            onUpload={handlePDFUpload}
            initialTab={datasetTab}
          />
        )}
      </div>
    </div>
  );
}
