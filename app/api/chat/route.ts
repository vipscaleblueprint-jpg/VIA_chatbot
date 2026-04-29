import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/rag";
import { askLLM } from "@/lib/llm";
import { getTopic, setTopic } from "@/lib/chatMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const sessionId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "local";

    /* LOAD MEMORY */
    const lastTopic = getTopic(sessionId);

    /* RETRIEVE */
    const retrieval = await retrieveContext(message);
    let { context } = retrieval;
    let detectedTopic = retrieval.detectedTopic;

    /* MEMORY RETRY */
    if (context === "NO_CONTEXT_FOUND" && lastTopic) {
      const retry = await retrieveContext(lastTopic + " " + message);
      context = retry.context;
      detectedTopic = retry.detectedTopic || lastTopic;
    }

    /* SAVE TOPIC */
    if (detectedTopic) setTopic(sessionId, detectedTopic as string);

    // 4. ASK N8N CHATBOT WORKFLOW (RAG)
    try {
      const n8nWebhook = process.env.CHAT_WEBHOOK_URL || "https://n8n.heysnaply.com/webhook/VIA";
      
      const prompt = `
[SYSTEM_TASK]
You are VIA, the scale-up technical assistant. Your task is to extract and display the EXACT information requested from the CONTEXT provided below.

[GENERAL_RULES]
- USE ONLY PROVIDED CONTEXT to answer the user's exact request.
- NO HALLUCINATIONS. NO GENERAL KNOWLEDGE. NO CONVERSATION.
- NO INTRODUCTIONS. NO OUTRO. 
- IMPORTANT: When reviewing SOP documents, look carefully for the exact phrase or topic the user is asking about (e.g., if they ask for "Output in Task History 1", look for that section in the SOP).
- Do NOT tell the user "the context provided is an SOP, please clarify" - instead, just find the matching section in the text and output those steps precisely.

[SPECIFIC_TEMPLATES]
1. CLIENT PROFILES:
[Client Name]
Status: [Value]
Tracking: [Value]
ClickUp: [Value]
Project: [Value]
Email: [Value]
KYC Link: [Value]

2. VPS / SERVER DETAILS:
[Client Name]
Product: [Value]
VPS/Details: [Value]
(Include any other server info like IP or credentials if present)

3. SOP / PROTOCOL DATA:
(Provide the Document Title as a Header. Underneath, extract the exact steps or specific information the user is asking for from the SOP context. Quote the text exactly as it appears. Do not summarize unless necessary. Do not dump the entire document if they only ask for a specific part.)

4. ANALYSIS DATA (BODY/FACE/PERSONA):
(Provide the result clearly. Only add "--- RAW ANALYSIS & EXTENDED DETAILS ---" at the very end if full details are requested.)

[BEGIN_CONTEXT]
${context}
[END_CONTEXT]

[USER_QUESTION]
${message}

[AI_RESPONSE]
`;

      const response = await fetch(n8nWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          searchTerms: retrieval.searchTerms,
          sessionId: sessionId
        }),
      });

      if (!response.ok) throw new Error("Webhook to n8n failed");

      // Define an interface for the n8n webhook response
      interface N8nWebhookResponse {
        content?: string;
        output?: string;
        reply?: string;
        text?: string;
        [key: string]: any; // Allow for other properties or array access like n8nResult[0]?.output
      }
      const n8nResult = (await response.json()) as N8nWebhookResponse;
      
      // Extraction logic for n8n chatbot output
      const reply = 
        n8nResult.content || 
        n8nResult.output || 
        n8nResult.reply || 
        n8nResult.text || 
        (Array.isArray(n8nResult) && (n8nResult[0]?.content || n8nResult[0]?.output || n8nResult[0]?.text)) || 
        JSON.stringify(n8nResult);

      return NextResponse.json({ reply: typeof reply === 'string' ? reply.trim() : reply });
    } catch (whError: unknown) { // Use 'unknown' for caught errors
      console.error("N8N WEBHOOK ERROR:", whError);
      
      // Fallback to local LLM if webhook fails (optional, but safer)
      const prompt = `
- MISSION: You are VIA, the VIP Scale technical interface. Extract SPECIFIC requested data from the provided context.
- CRITICAL: NO CONVERSATION. NO INTRODUCTIONS. Output ONLY the requested information.
- SELECTIVITY: Do NOT mix unrelated context items (e.g. don't show clients when asking for SOPs).
- CONTEXT: ${context}
- QUESTION: ${message}
`;
      const fallbackReply = await askLLM(prompt);
      return NextResponse.json({ reply: fallbackReply });
    }

  } catch (err) { 
    console.error(err);
    return NextResponse.json({ error: "Server crashed" }, { status: 500 });
  }
}