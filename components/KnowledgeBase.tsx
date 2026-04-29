"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/supabase/client";
import { createClient as createDocployClient } from "@supabase/supabase-js";
import { updateSOP, deleteSOP, updateAssistant, deleteAssistant, createAssistant } from "@/lib/ingest";
import { fetchDocploySOPs } from "@/lib/fetchSOPs";
import { UploadTask } from "@/app/page";

type SOPDoc = {
  id: number;
  source_name?: string;
  content: string;
  ai_title?: string;
  metadata: {
    type?: string;
    source?: string;
    is_edited?: boolean;
    date?: string;
    [key: string]: string | number | boolean | null | undefined | object;
  };
  created_at: string;
};

type Assistant = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  employment_type: string;
};

export default function KnowledgeBase({ 
  uploadQueue = [], 
  onClearQueue,
  onUpload,
  initialTab = "sop"
}: { 
  uploadQueue?: UploadTask[], 
  onClearQueue: () => void,
  onUpload: (files: FileList | File[]) => void,
  initialTab?: "sop" | "team" | "queue"
}) {
  const [sops, setSops] = useState<SOPDoc[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"sop" | "team" | "queue">(initialTab);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync tab if initialTab changes (e.g. from parent)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editAssistant, setEditAssistant] = useState<Partial<Assistant>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName]
    }));
  };

  const groupedSops = sops.reduce((acc, doc) => {
    const sourceName = doc.source_name || (doc.metadata?.source as string) || "Unknown Document";
    if (!acc[sourceName]) acc[sourceName] = [];
    acc[sourceName].push(doc);
    return acc;
  }, {} as Record<string, SOPDoc[]>);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setErrorMsg(null);
      const docployUrl = process.env.NEXT_PUBLIC_DOCPLOY_SUPABASE_URL;
      const docployKey = process.env.NEXT_PUBLIC_DOCPLOY_ANON_KEY;

      let sopRes, assistantRes;
      
      // SERVER ACTION BYPASS (avoids Browser Mixed Content and CORS errors)
      try {
         const [sopData, assistantResponse] = await Promise.all([
           (docployUrl && docployKey) 
              ? fetchDocploySOPs() // Using secure server-side Proxy!
              : supabase.from("SOP_VIA").select("*").order("created_at", { ascending: false }).then(r => r.data),
           
           supabase.from("assistant").select("*").order("name")
         ]);
         
         sopRes = { data: sopData, error: null };
         assistantRes = assistantResponse;
      } catch (err: unknown) {
         sopRes = { data: null, error: err };
         assistantRes = { data: [], error: null };
      }

      if (sopRes.error) {
        console.error("SOP Fetch Error:", sopRes.error);
        setErrorMsg((sopRes.error as any).message || JSON.stringify(sopRes.error));
      } else if (sopRes.data) {
        setSops(sopRes.data as SOPDoc[]);
      }

      if (assistantRes.data) setAssistants(assistantRes.data);
    } catch (err: any) {
      console.error("Fetch Catch Error:", err);
      setErrorMsg(err.message || "Unknown error occurred while fetching.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEditSop = (doc: SOPDoc) => {
    setEditingId(doc.id);
    setEditContent(doc.content);
    setEditTitle(doc.ai_title || "");
  };

  const handleSaveSop = useCallback(async (id: number) => {
    setIsSaving(true);
    const res = await updateSOP(id, editContent, editTitle);
    if (res.success) {
      setEditingId(null);
      await fetchData();
    } else {
      alert("Error updating SOP: " + res.error);
    }
    setIsSaving(false);
  }, [editContent, editTitle, fetchData]);

  const handleDeleteSop = useCallback(async (sourceName: string) => {
    if (!sourceName) {
       alert("Document source name is missing. Cannot delete.");
       return;
    }
    if (!confirm(`Are you sure you want to delete all segments from "${sourceName}"? This cannot be undone.`)) return;
    const res = await deleteSOP(sourceName);
    if (res.success) {
      await fetchData();
    } else {
      alert("Error deleting SOP: " + res.error);
    }
  }, [fetchData]);

  const handleEditAssistant = useCallback((a: Assistant) => {
    setEditingId(a.id);
    setEditAssistant(a);
  }, []);

  const handleSaveAssistant = useCallback(async (id: string) => {
    setIsSaving(true);
    const res = await updateAssistant(id, editAssistant);
    if (res.success) {
      setEditingId(null);
      await fetchData();
    } else {
      alert("Error updating team member: " + res.error);
    }
    setIsSaving(false);
  }, [editAssistant, fetchData]);

  const handleDeleteAssistant = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this team member?")) return;
    const res = await deleteAssistant(id);
    if (res.success) {
      await fetchData();
    } else {
      alert("Error deleting team member: " + res.error);
    }
  }, [fetchData]);

  const handleCreateAssistant = useCallback(async () => {
    const name = prompt("Enter assistant name:");
    if (!name) return;
    const email = prompt("Enter assistant email:");
    if (!email) return;

    const res = await createAssistant({
      name,
      email,
      is_active: true,
      employment_type: "Full-Time"
    });
    
    if (res.success) {
      await fetchData();
    } else {
      alert("Error creating assistant: " + res.error);
    }
  }, [fetchData]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50">
      {/* HEADER */}
      <div className="px-10 py-8 border-b border-slate-200 bg-white/40 backdrop-blur-sm">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </span>
          SECURE KNOWLEDGE BASE
        </h1>
        <p className="text-slate-500 text-sm mt-2 font-medium">Internal protocol datasets and documentation for the VIA strategic assistant.</p>
        
        {/* TABS */}
        <div className="flex gap-4 mt-8">
          <button 
            onClick={() => setActiveTab("sop")}
            className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === "sop" ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200"}`}
          >
            SOP Documents
          </button>

          <button 
            onClick={() => setActiveTab("queue")}
            className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === "queue" ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200"}`}
          >
            Bulk Ingestion
            {uploadQueue.some(t => t.status === "processing") && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full animate-ping" />
            )}
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-10">
        {loading ? (
          <div className="flex items-center justify-center h-64">
             <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {activeTab === "sop" ? (
              <>
                {Object.keys(groupedSops).length > 0 ? (
                  Object.entries(groupedSops).map(([sourceName, docs]) => {
                    const isExpanded = expandedFolders[sourceName];
                    return (
                      <div key={sourceName} className="glass-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm transition-all group relative">
                        {/* Folder Header */}
                        <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleFolder(sourceName)}>
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <h2 className="text-base font-black text-slate-900 tracking-tight">
                                  {sourceName}
                                </h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                  {docs.length} Segments
                                </p>
                              </div>
                           </div>
                           
                           <div className="flex items-center gap-4">
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDeleteSop(sourceName); }}
                               className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                               title="Delete Entire Document"
                             >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                             </button>
                             <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                               <svg className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                               </svg>
                             </div>
                           </div>
                        </div>

                        {/* Expanded Content (Chunks) */}
                        <div className={`grid transition-all duration-300 ${isExpanded ? "grid-rows-[1fr] mt-6 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                          <div className="overflow-hidden space-y-4">
                            {docs.map(doc => (
                               <div key={doc.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100/50 flex-1 relative group/chunk">
                                 <div className="flex justify-between items-start mb-4">
                                   <div className="flex items-center gap-3">
                                     <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                                       {String(doc.metadata?.type || "Document").replace("_", " ")}
                                     </span>
                                     {doc.metadata?.is_edited && (
                                       <span className="text-[8px] font-bold text-slate-400 uppercase bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                                         Edited
                                       </span>
                                     )}
                                   </div>
                                   <div className="flex items-center gap-4">
                                     <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">
                                       {new Date(doc.created_at).toLocaleDateString()} • ID: {doc.id}
                                     </span>
                                     
                                     <div className="flex items-center gap-2 opacity-0 group-hover/chunk:opacity-100 transition-opacity">
                                       <button 
                                          onClick={() => handleEditSop(doc)}
                                          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-primary transition-colors"
                                          title="Edit Segment"
                                       >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                       </button>
                                     </div>
                                   </div>
                                 </div>

                                 {(doc.ai_title || doc.metadata?.ai_title) && (
                                   <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2">
                                     {String(doc.ai_title || doc.metadata?.ai_title)}
                                   </h2>
                                 )}

                                 {editingId === doc.id ? (
                                   <div className="space-y-4">
                                     <input 
                                       value={editTitle}
                                       onChange={(e) => setEditTitle(e.target.value)}
                                       className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 font-black uppercase tracking-tight"
                                       placeholder="Segment Title"
                                     />
                                     <textarea 
                                       value={editContent}
                                       onChange={(e) => setEditContent(e.target.value)}
                                       className="w-full min-h-[150px] p-4 rounded-xl border border-primary/20 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 font-medium"
                                       placeholder="Update segment content..."
                                     />
                                     <div className="flex justify-end gap-3">
                                       <button 
                                         onClick={() => setEditingId(null)}
                                         className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all"
                                       >
                                         Cancel
                                       </button>
                                       <button 
                                         onClick={() => handleSaveSop(doc.id)}
                                         disabled={isSaving}
                                         className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                       >
                                         {isSaving ? "Saving..." : "Save Changes"}
                                       </button>
                                     </div>
                                   </div>
                                 ) : (
                                   <p className="text-slate-600 text-[13px] leading-relaxed line-clamp-2 group-hover/chunk:line-clamp-none transition-all">
                                     {doc.content}
                                   </p>
                                 )}
                               </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : errorMsg ? (
                  <div className="text-center py-20 bg-red-50/50 rounded-[3rem] border-2 border-dashed border-red-200">
                    <p className="text-red-500 font-bold tracking-widest text-sm mb-2">SUPABASE ERROR DETECTED:</p>
                    <p className="text-slate-700 font-mono text-xs">{errorMsg}</p>
                  </div>
                ) : (
                  <div className="text-center py-20 bg-white/40 rounded-[3rem] border-2 border-dashed border-slate-200">
                    <p className="text-slate-400 font-bold uppercase tracking-widest">No documentation found in secure storage.</p>
                  </div>
                )}
              </>
            ) : activeTab === "team" ? (
              <>
                <div className="flex justify-end mb-2">
                   <button 
                     onClick={handleCreateAssistant}
                     className="px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm"
                   >
                     + Add Team Member
                   </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assistants.map((a) => (
                    <div key={a.id} className="glass-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                       {editingId === a.id ? (
                         <div className="space-y-3">
                            <input 
                              value={editAssistant.name || ""}
                              onChange={e => setEditAssistant({...editAssistant, name: e.target.value})}
                              placeholder="Name"
                              className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-slate-50 text-sm font-bold"
                            />
                            <input 
                              value={editAssistant.email || ""}
                              onChange={e => setEditAssistant({...editAssistant, email: e.target.value})}
                              placeholder="Email"
                              className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-slate-50 text-xs"
                            />
                            <select 
                              value={editAssistant.employment_type || ""}
                              onChange={e => setEditAssistant({...editAssistant, employment_type: e.target.value})}
                              className="w-full px-4 py-2 rounded-xl border border-primary/20 bg-slate-50 text-[10px] font-bold uppercase tracking-wider"
                            >
                               <option value="Full-Time">Full-Time</option>
                               <option value="Part-Time">Part-Time</option>
                               <option value="Contractor">Contractor</option>
                            </select>
                            <label className="flex items-center gap-2 px-2">
                               <input 
                                 type="checkbox"
                                 checked={editAssistant.is_active}
                                 onChange={e => setEditAssistant({...editAssistant, is_active: e.target.checked})}
                               />
                               <span className="text-[10px] font-bold uppercase text-slate-500">Active</span>
                            </label>
                            <div className="flex justify-end gap-2 pt-2">
                               <button onClick={() => setEditingId(null)} className="text-[10px] font-black px-3 py-1 text-slate-400">Cancel</button>
                               <button onClick={() => handleSaveAssistant(a.id)} className="text-[10px] font-black px-4 py-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20">Save</button>
                            </div>
                         </div>
                       ) : (
                         <>
                           <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditAssistant(a)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-primary transition-colors">
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                 </svg>
                              </button>
                              <button onClick={() => handleDeleteAssistant(a.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors">
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                 </svg>
                              </button>
                           </div>
                           <div className="flex items-center gap-4 mb-4">
                              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xl">
                                {a.name.charAt(0)}
                              </div>
                              <div>
                                <h3 className="font-black text-slate-900 leading-tight uppercase tracking-tight">{a.name}</h3>
                                <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{a.employment_type || "Team Member"}</p>
                              </div>
                           </div>
                           <div className="space-y-2 mt-4 pt-4 border-t border-slate-50">
                              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                                <span className="text-slate-400">Email:</span>
                                <span className="text-slate-600 truncate max-w-[150px]">{a.email}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest">
                                <span className="text-slate-400">Status:</span>
                                <span className={a.is_active ? "text-green-500" : "text-slate-300"}>{a.is_active ? "Active" : "Inactive"}</span>
                              </div>
                           </div>
                         </>
                       )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-6 max-w-4xl mx-auto">
                {/* UPLOAD ZONE */}
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) onUpload(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative group cursor-pointer transition-all duration-500 overflow-hidden rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center p-12 bg-white/40 backdrop-blur-sm ${
                    isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-slate-200 hover:border-primary/30 hover:bg-white"
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    multiple 
                    accept=".pdf"
                    className="hidden" 
                    onChange={(e) => e.target.files && onUpload(e.target.files)}
                  />
                  
                  <div className={`w-20 h-20 rounded-3xl mb-6 flex items-center justify-center transition-all duration-500 ${
                    isDragging ? "bg-primary text-white rotate-12" : "bg-slate-50 text-slate-300 group-hover:bg-primary/10 group-hover:text-primary group-hover:rotate-6"
                  }`}>
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Drop New Protocols</h3>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest text-center max-w-sm leading-loose">
                    Drag and drop your PDF documentation here to synchronize with the <span className="text-primary">VIP Scale Distributed Dataset</span>.
                  </p>
                  
                  <div className="mt-8 flex gap-4">
                     <div className="px-4 py-1.5 rounded-full border border-slate-100 bg-white text-[9px] font-black uppercase text-slate-400 tracking-widest">Supports Multi-PDF</div>
                     <div className="px-4 py-1.5 rounded-full border border-slate-100 bg-white text-[9px] font-black uppercase text-slate-400 tracking-widest">Auto-Vectorizing</div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-10 border-t border-slate-100 mb-8">
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Transmission Logs</h2>
                  {uploadQueue.length > 0 && (
                    <button 
                      onClick={onClearQueue}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Clear Log History
                    </button>
                  )}
                </div>

                {uploadQueue.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-[3rem] border border-slate-100">
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">No active transmissions detected.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {uploadQueue.map((task) => (
                      <div key={task.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6 hover:shadow-md transition-all group">
                        <div className={`w-14 h-14 rounded-[2rem] flex items-center justify-center flex-shrink-0 transition-colors ${
                          task.status === "completed" ? "bg-green-50 text-green-500" :
                          task.status === "error" ? "bg-red-50 text-red-500" :
                          "bg-primary/10 text-primary"
                        }`}>
                          {task.status === "completed" ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : task.status === "error" ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-black text-slate-900 uppercase tracking-tight truncate pr-4 text-sm">{task.filename}</h3>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                              task.status === "completed" ? "bg-green-50 text-green-500" :
                              task.status === "error" ? "bg-red-50 text-red-500" :
                              "bg-primary/5 text-primary"
                            }`}>
                              {task.status === "processing" ? `Syncing ${task.progress}%` : task.status}
                            </span>
                          </div>
                          
                          <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-700 rounded-full ${
                                task.status === "completed" ? "bg-green-500" :
                                task.status === "error" ? "bg-red-500" :
                                "bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.4)]"
                              }`}
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>

                          {task.error && (
                            <div className="mt-3 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              <p className="text-[10px] text-red-600 font-bold uppercase tracking-tight">
                                Protocol Breach: {task.error}
                              </p>
                            </div>
                          )}
                          
                          {task.status === "completed" && (
                            <div className="mt-3 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              <p className="text-[10px] text-green-600 font-bold uppercase tracking-tight">
                                Secure Storage: {task.totalChunks} vectors distributed across SOP network.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
