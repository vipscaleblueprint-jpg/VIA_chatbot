const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const EMBEDDING_MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text:latest";
import OpenAI from "openai";
import { createInternalClient } from "@/supabase/server";
import { createClient as createDocployClient } from "@supabase/supabase-js";
import { getClients } from "@/supabase/database/clients";
import { fetchDocploySOPs } from "@/lib/fetchSOPs";

export type SopDocument = {
  id?: number;
  content: string;
  metadata?: {
    source?: string;
    type?: string;
    [key: string]: unknown;
  };
};

export interface RetrievalResult {
  context: string;
  detectedTopic: string | null;
  searchTerms?: string;
}

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;

    if (openaiKey && openaiKey.startsWith("sk-")) {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const embedding = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: text,
        });
        return embedding.data[0].embedding;
      } catch (err: any) {
        console.warn(`[RAG] OpenAI Embedding failed. Falling back to local...`);
      }
    }

    const targetUrl = process.env.EMBEDDING_URL || `${OLLAMA_HOST}/api/embeddings`;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });

    if (!res.ok) throw new Error(`Embedding service unavailable (${res.status})`);
    const data = await res.json();
    return data.embedding || (Array.isArray(data) ? data : (data[0]?.embedding || data[0]));
  } catch (err: any) {
    console.error(`[RAG] GET_EMBEDDING_EXCEPTION:`, err.message);
    throw err;
  }
}

// Webhooks are being replaced by direct Supabase fetching (SSR)
// const N8N_SOP_FETCH_URL = "https://n8n.heysnaply.com/webhook/FETCH-SOP";
// const CHAT_WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL || "https://n8n.heysnaply.com/webhook/clientschat";

export async function retrieveContext(query: string): Promise<RetrievalResult> {
  try {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/[\s.?,!]+/).filter((w: string) => w.length >= 3);

    // Keyword Definitions
    const sopKeywords = ["sop", "sops", "standard operating procedure", "protocol", "manual", "guide", "procedure", "workflow", "process", "steps", "step", "instruction", "policy", "how to", "how do i", "setup", "framework", "playbook", "task", "history", "click", "paste", "setting", "button", "where", "what should i", "do i"];
    const clientKeywords = ["client", "clients", "brand", "brands", "customer", "account", "project status", "tracker", "kyc link", "clickup"];
    const brollKeywords = ["broll", "b-roll", "footage", "video", "tags", "stock", "b roll"];
    const vpsKeywords = ["vps", "server", "hosting", "credentials", "login", "password", "ip address", "vps credentials", "server details"];
    const personaKeywords = ["persona", "personality", "tone", "brand voice", "vibe"];
    const bodyKeywords = ["body", "height", "weight", "shoulder", "physical", "size", "physique"];
    const faceKeywords = ["face", "eyes", "hair", "skin", "features", "look", "expression", "facial"];

    // 1. ROUTING & INTENT
    let requestType: string = "SOP";

    const isBroll = brollKeywords.some(kw => queryLower.includes(kw));
    const isVPS = vpsKeywords.some(kw => queryLower.includes(kw));
    const isPersona = personaKeywords.some(kw => queryLower.includes(kw));
    const isBody = bodyKeywords.some(kw => queryLower.includes(kw));
    const isFace = faceKeywords.some(kw => queryLower.includes(kw));
    const isCaryn = queryLower.includes("caryn") || queryLower.includes("meininger");
    const isNicola = queryLower.includes("nicola") || queryLower.includes("ducharme");
    const isChad = queryLower.includes("chad") || queryLower.includes("gibson");
    const isCharmaine = queryLower.includes("charmaine") || queryLower.includes("schembri");
    const isDanielle = queryLower.includes("danielle") || queryLower.includes("french");
    const isClient = clientKeywords.some(kw => queryLower.includes(kw));
    const isSOP = sopKeywords.some(kw => queryLower.includes(kw));

    if (isCaryn) requestType = "Caryn Meininger";
    else if (isNicola) requestType = "Dr. Nicola Ducharme";
    else if (isChad) requestType = "Chad Gibson";
    else if (isCharmaine) requestType = "Charmaine Schembri";
    else if (isDanielle) requestType = "Danielle French";
    else if (isBroll) requestType = "BROLL";
    else if (isVPS) requestType = "VPS";
    else if (isPersona) requestType = "PERSONA";
    else if (isBody) requestType = "BODY";
    else if (isFace) requestType = "FACE";
    else if (isClient) requestType = "CLIENT";
    else if (isSOP) requestType = "SOP";
    else requestType = "CLIENT";

    const customTableNames = ["Caryn Meininger", "Chad Gibson", "Charmaine Schembri", "Danielle French", "Dr. Nicola Ducharme"];
    const isCustomTable = customTableNames.includes(requestType as string);

    const cleanQuery = queryLower.replace(/[?.!,;:]/g, " ").replace(/\s+/g, " ").trim();
    const searchTerms = cleanQuery.replace(/\bsop\b/g, " ").replace(/\s+/g, " ").trim();

    const skipWords = ["the", "and", "that", "this", "what", "should", "after", "before", "is", "a", "an", "for", "to", "do", "we", "of", "was", "with", "from", "analysis", "details"];
    const meaningfulWords = words.filter((w: string) => !skipWords.includes(w));

    // 2. FETCH DATA DIRECTLY FROM SUPABASE (SSR)
    let allItems: any[] = [];
    try {
      if (requestType === "CLIENT") {
        console.log(`RAG: Fetching CLIENT data directly...`);
        allItems = await getClients();
      } else {
        // Supabase table names can be case-sensitive. Based on the sidebar:
        // SOP and VPS are uppercase. Others are lowercase or have specific names.
        const tableName =
          requestType === "BROLL" ? "broll_tags" :
            (requestType === "VPS" || requestType === "SOP" || isCustomTable) ? requestType :
              requestType.toLowerCase();

        console.log(`RAG: Fetching ${requestType} data from local table: ${tableName}`);
        const supabase = createInternalClient();

        // Optimization: Try to find a specific client name in the query to filter the SQL query
        const potentialName = meaningfulWords.find(w => w.length > 3 && !vpsKeywords.includes(w) && !faceKeywords.includes(w) && !bodyKeywords.includes(w) && !personaKeywords.includes(w) && !brollKeywords.includes(w));

        if (potentialName && requestType !== "SOP" && requestType !== "BROLL" && !isCustomTable) {
          console.log(`RAG: Targeted search for "${potentialName}" in ${tableName}...`);

          const { data: filtered, error: filterError } = await supabase.from(tableName)
            .select("*")
            .or(`client.ilike.%${potentialName}%,name.ilike.%${potentialName}%,client_name.ilike.%${potentialName}%,product.ilike.%${potentialName}%`)
            .limit(20);

          if (!filterError && filtered && filtered.length > 0) {
            allItems = filtered;
            console.log(`RAG: Targeted search found ${allItems.length} matches in ${tableName}.`);
          } else {
            console.log(`RAG: Targeted search for "${potentialName}" returned 0 results in ${tableName}.`);

            // Fallback for Analysis: check clients table if analysis table is empty
            if (["BODY", "FACE", "PERSONA"].includes(requestType)) {
              console.log(`RAG: Checking "clients" table as fallback for ${requestType}...`);
              const { data: clientMatch } = await supabase.from("clients")
                .select("*")
                .ilike('name', `%${potentialName}%`)
                .limit(5);

              if (clientMatch && clientMatch.length > 0) {
                console.log(`RAG: Found ${clientMatch.length} matches in "clients" fallback.`);
                // We keep the requestType as is, the selection logic below will handle the columns
                allItems = clientMatch;
              }
            }

            if (allItems.length === 0) {
              console.log(`RAG: Fetching first 100 items from ${tableName} as last resort...`);
              const { data } = await supabase.from(tableName).select("*").limit(100);
              allItems = data || [];
            }
          }
        } else {
          const { data, error } = await supabase.from(tableName).select("*").limit(100);
          if (error) console.warn(`RAG: Local Supabase error for ${tableName}:`, error.message);
          allItems = data || [];
        }

        if (allItems.length === 0 && requestType === "SOP") {
          console.log("RAG: Local SOP table empty, falling back to Docploy...");
          allItems = await fetchDocploySOPs();
        }

        console.log(`RAG: Total items to process for ${requestType}: ${allItems.length}`);
      }
    } catch (err) {
      console.error(`RAG: Direct Supabase Fetch Error for ${requestType}:`, err);
      allItems = [];
    }
    const contextParts: string[] = [];

    // 3. SELECTION LOGIC - SOPs
    if (requestType === "SOP") {
      const queryTerms = searchTerms.split(/\s+/).filter((w: string) => w.length >= 3);
      const scoredSops = allItems.map(item => {
        const title = (item.ai_title || item.title || item.source_name || "").toLowerCase();
        const content = (item.content || "").toLowerCase();
        let score = 0;

        if (title.includes(searchTerms)) score += 500;
        else if (content.includes(searchTerms)) score += 250;

        if (title.includes("type") && title.includes("framework")) score += 300;
        if (content.includes("type") && content.includes("framework")) score += 200;

        ["type", "framework", "section", "protocol", "workflow", "standard", "guide"].forEach((term: string) => {
          if (title.includes(term)) score += 40;
          if (content.includes(term)) score += 10;
        });

        let keywordMatches = 0;
        queryTerms.forEach(term => {
          if (title.includes(term)) keywordMatches += 2;
          if (content.includes(term)) keywordMatches += 1;
        });
        score += (keywordMatches * 25);

        if (content.includes("click") || content.includes("button") || content.includes("select") || content.includes("dropdown")) score += 150;
        return { item, score };
      });

      const matchedSops = scoredSops
        .filter(e => e.score > 30)
        .sort((a, b) => b.score - a.score);

      const seenSops = new Set<string>();

      for (const match of matchedSops) {
        if (seenSops.size >= 2) break;

        const source = match.item.source_name || match.item.title || match.item.ai_title;
        if (!source || seenSops.has(source)) continue;

        seenSops.add(source);

        // Find all segments for this SOP and get their relevance scores
        const sourceSegments = scoredSops.filter(e => {
          const sName = (e.item.source_name || e.item.title || e.item.ai_title || "").toLowerCase().trim();
          const target = source.toLowerCase().trim();
          return sName === target || sName.includes(target) || target.includes(sName);
        });

        console.log(`RAG: SOP Match [Score ${match.score}]: ${source} (${sourceSegments.length} total segments)`);

        // Take ONLY the Top 5 most relevant segments of this SOP to keep the prompt extremely fast
        sourceSegments.sort((a, b) => b.score - a.score);
        const topSegments = sourceSegments.slice(0, 5);

        // Robust Content Extraction
        let docContent = topSegments
          .map(e => e.item.content || e.item.text || e.item.data || e.item.val || e.item.body || "")
          .filter(Boolean)
          .join("\n\n...[OTHER SECTIONS OF DOCUMENT SKIPPED FOR SPEED]...\n\n");

        // Final fallback: if expansion fails, use the original match's content
        if (!docContent) docContent = match.item.content || match.item.text || "";

        if (docContent) {
          contextParts.push(`### SOP DOCUMENT: ${source}\n\n${docContent}`);
        }
      }

      if (contextParts.length > 0 && requestType === "SOP") {
        return { context: contextParts.join("\n\n---\n\n"), detectedTopic: "SOP", searchTerms };
      }
    }

    // 4. SELECTION LOGIC - CLIENTS & ANALYSIS
    const scoreGeneral = (item: any) => {
      const itemStr = JSON.stringify(item).toLowerCase();
      const nameStr = (item.name || item.client || item.client_name || item.title || "").toLowerCase();
      const productStr = (item.product || item.product_name || "").toLowerCase();
      let score = 0;

      // Match client name/title
      if (nameStr && (queryLower.includes(nameStr) || nameStr.includes(queryLower))) {
        score += 100;
      }

      // Match product name
      if (productStr && (queryLower.includes(productStr) || productStr.includes(queryLower))) {
        score += 100;
      }

      meaningfulWords.forEach(w => {
        if (nameStr.includes(w)) score += 25;
        else if (productStr.includes(w)) score += 25;
        else if (itemStr.includes(w)) score += 5;
      });
      return { item, score };
    };

    const maxResults = isCustomTable ? 40 : 10;
    const generalMatches = allItems.map(scoreGeneral)
      .filter(e => e.score > 0 || isCustomTable)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    if (generalMatches.length > 0) {
      console.log(`RAG: Found ${generalMatches.length} matches in local table. Top score: ${generalMatches[0].score}`);
    }

    for (const { item } of generalMatches) {
      if (requestType === "CLIENT" && item.name && item.clickup_id) {
        let clientProfile = `[CLIENT PROFILE]: ${item.name}\n`;
        clientProfile += `Status: ${item.isActive ? 'Active' : 'Inactive'}\n`;
        clientProfile += `Tracking: ${item.tracker || 'N/A'}\n`;
        clientProfile += `ClickUp: ${item.clickup_id || 'N/A'}\n`;
        clientProfile += `Project: ${item.vps || 'N/A'}\n`;
        clientProfile += `Email: ${item.email || item.contact_email || 'N/A'}\n`;
        clientProfile += `KYC Link: ${item.kyc_link || 'N/A'}\n`;
        contextParts.push(clientProfile);
      } else if (requestType === "BROLL") {
        const title = item.tag || item.name || item.title || "B-Roll Footage";
        const desc = item.description || item.content || item.details || JSON.stringify(item);
        contextParts.push(`[B-ROLL]: ${title}\nDetails: ${desc}`);
      } else if (requestType === "VPS") {
        const title = item.client || item.client_name || item.name || item.server_name || "Server Details";
        const vpsInfo = item.vps || item.details || item.content || "N/A";
        const product = item.product || "N/A";
        contextParts.push(`[VPS DETAILS]: ${title}\nProduct: ${product}\nVPS/Details: ${vpsInfo}\nRaw Data: ${JSON.stringify(item)}`);
      } else if (["PERSONA", "BODY", "FACE"].includes(requestType)) {
        const typeLabel = requestType.charAt(0) + (requestType as string).slice(1).toLowerCase();
        const content = item[`${(requestType as string).toLowerCase()}_analysis`] || item.content || item.details || item.persona_details || JSON.stringify(item);
        contextParts.push(`[${typeLabel} Analysis]: ${item.name || item.client || "Profile"}\n${content}`);
      } else {
        // Generic formatter for custom tables (like Caryn Meininger) - Compacted for speed
        const key = item["Client Information"] || item.name || item.title || item.client || "Data Entry";
        const val = item["Details"] || item.content || item.value || JSON.stringify(item);
        contextParts.push(`[${requestType}]: ${key} -> ${val}`);
      }
    }

    // 5. VECTOR FALLBACK
    if (contextParts.length < 2 && requestType === "SOP") {
      try {
        const docployUrl = process.env.NEXT_PUBLIC_DOCPLOY_SUPABASE_URL;
        const docployKey = process.env.NEXT_PUBLIC_DOCPLOY_ANON_KEY;
        if (docployUrl && docployKey) {
          const supabase = createDocployClient(docployUrl, docployKey);
          const emb = await getEmbedding(query);
          const { data: matches } = await supabase.rpc('match_sop', { query_embedding: emb, match_threshold: 0.35, match_count: 2 });
          if (matches) matches.forEach((m: any) => contextParts.push(`### VECTOR MATCH: ${m.ai_title || "Procedure"}\n\n${m.content}`));
        }
      } catch { }
    }

    // 6. TEAM FALLBACK
    try {
      const supabase = createInternalClient();
      const { data: team } = await supabase.from("assistant").select("*").limit(20);
      if (team) {
        const matched = team.map(scoreGeneral).filter(e => e.score > 2).sort((a, b) => b.score - a.score).slice(0, 3);
        matched.forEach(e => contextParts.push(`[TEAM MEMBER]: ${e.item.name}\nEmail: ${e.item.email}\nDept: ${e.item.department || 'N/A'}`));
      }
    } catch { }

    return {
      context: contextParts.join("\n\n---\n\n") || "NO_CONTEXT_FOUND",
      detectedTopic: requestType,
      searchTerms
    };
  } catch (err) {
    console.error("RAG Error:", err);
    return { context: "RAG_ERROR", detectedTopic: null };
  }
}

export function chunkText(text: string, size = 1000): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let current = "";
  for (const word of words) {
    if ((current + word).length > size) { chunks.push(current.trim()); current = word + " "; }
    else { current += word + " "; }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export async function generateTitle(text: string): Promise<string> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error();
    const openai = new OpenAI({ apiKey: openaiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Short professional title (max 5 words). No punctuation." }, { role: "user", content: text.slice(0, 3000) }],
      max_tokens: 15
    });
    return response.choices[0].message.content?.trim() || "SOP Protocol";
  } catch { return text.split('\n')[0]?.slice(0, 40) || "New SOP"; }
}
