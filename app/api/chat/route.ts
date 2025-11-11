import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const UG_STORE = process.env.FILESTORE_UNDERGRAD;
const GRAD_STORE = process.env.FILESTORE_GRAD;

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set.');
}
if (!UG_STORE || !GRAD_STORE) {
  console.warn('FILESTORE_UNDERGRAD or FILESTORE_GRAD is not set.');
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

const UG_SYSTEM_INSTRUCTION = `
You are the official-style assistant for **GIKI Undergraduate Admissions**.

Context:
- You are grounded ONLY in the official GIKI Undergraduate Admissions Policy document provided via File Search.
- If information is not in that document, you must not guess or use outside knowledge.

Answering rules (very important):
1. **Source-locked**: Answer ONLY using the policy text.  
   - If something is missing or unclear in the document, reply exactly:
   - "This information is not available in the official GIKI Undergraduate Admissions Policy document."
2. **Concise**:
   - Default: 2–6 bullet points or short lines.
   - Avoid long paragraphs and avoid repeating the same sentence with different wording.
   - Do NOT paste large chunks of the policy verbatim.
3. **Style**:
   - Use simple, student-friendly English.
   - Use Markdown:
     - **bold** for key terms (e.g. **eligibility**, **test pattern**, **required marks**).
     - Use \`-\` bullet points for lists.
   - Start with the direct answer, no disclaimers or role-playing.
4. **Focus**:
   - For most questions, prioritize:
     - eligibility criteria,
     - admission test pattern,
     - application process,
     - deadlines (only if explicitly present),
     - fees/financial info (only if in the document),
     - special cases (A-levels, O-levels, transfer, repeaters) when relevant.
5. **Safety / scope**:
   - If user asks about non-GIKI topics or speculative questions, briefly say you can only answer based on the official GIKI undergraduate admissions policy and redirect them.
`;


const GRAD_SYSTEM_INSTRUCTION = `
You are the official-style assistant for **GIKI Graduate (MS & PhD) Admissions**.

Context:
- You are grounded ONLY in the official GIKI Graduate Admissions Policy document provided via File Search.
- If information is not in that document, you must not guess or use outside knowledge.

Answering rules (very important):
1. **Source-locked**: Answer ONLY using the graduate admissions policy.  
   - If something is missing or not clearly specified, reply exactly:
   - "This information is not available in the official GIKI Graduate Admissions Policy document."
2. **Concise**:
   - Default: 2–8 bullet points or short lines.
   - Avoid repeating the same idea; no long narrative paragraphs.
   - Do NOT paste long policy sections verbatim.
3. **Style**:
   - Use simple, precise language.
   - Use Markdown:
     - **bold** for key items (e.g. **MS eligibility**, **PhD eligibility**, **required tests**).
     - Use \`-\` bullets for lists.
   - For "What are the MS/PhD programs?" → respond with a clean bullet list of programs only.
4. **Focus**:
   - Emphasize:
     - eligibility (degrees, CGPA, marks),
     - accepted tests (ETS GRE, HEC HAT, GIKI test) and exemptions,
     - interview requirement,
     - key structural rules (e.g., merit-based, no special quotas) only when relevant.
5. **Safety / scope**:
   - No assumptions about funding, visas, employment, or policies not clearly written in the document.
   - If user asks something broad (e.g. scholarships), restrict your answer strictly to what’s in this policy.
`;


export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body.message || '').toString().trim();
    const type = (body.type || 'undergrad').toString().toLowerCase();

    if (!message) {
      return NextResponse.json(
        { error: 'No message provided.' },
        { status: 400 },
      );
    }

    const storeName =
      type === 'grad'
        ? GRAD_STORE || ''
        : UG_STORE || '';

    if (!storeName) {
      return NextResponse.json(
        {
          error:
            'File Search store not configured. Please set FILESTORE_UNDERGRAD and FILESTORE_GRAD.',
        },
        { status: 500 },
      );
    }

    const systemInstruction =
      type === 'grad'
        ? GRAD_SYSTEM_INSTRUCTION
        : UG_SYSTEM_INSTRUCTION;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        systemInstruction,
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: [storeName],
            },
          },
        ],
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
      },
    });

    const text =
      (response as any).text ?? extractTextFromResponse(response);

    if (!text) {
      return NextResponse.json(
        {
          error:
            'No text returned from Gemini. Please try again or check your configuration.',
        },
        { status: 500 },
      );
    }

    const citations = extractCitationsFromResponse(response, 4);

    return NextResponse.json(
      { text, citations },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('Error in /api/chat:', err);
    return NextResponse.json(
      {
        error:
          'Sorry, I encountered an error while processing your request.',
        details: err?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// --- Helpers ---

function extractTextFromResponse(response: any): string {
  if (!response) return '';
  if (typeof response.text === 'string') return response.text;

  const candidates = response.candidates || [];
  const parts: string[] = [];

  for (const c of candidates) {
    const content = c.content;
    if (!content?.parts) continue;
    for (const p of content.parts) {
      if (typeof p.text === 'string') {
        parts.push(p.text);
      }
    }
  }

  return parts.join('\n').trim();
}

/**
 * Extract up to `max` clean citations from grounding metadata.
 * Each citation: { title, snippet }
 */
function extractCitationsFromResponse(
  response: any,
  max: number,
): { title: string; snippet: string }[] {
  const citations: { title: string; snippet: string }[] = [];

  if (!response) return citations;

  const candidates = response.candidates || [];
  const allGroundingMeta: any[] = [];

  for (const c of candidates) {
    if (c.grounding_metadata) {
      allGroundingMeta.push(c.grounding_metadata);
    }
    if (c.groundingMetadata) {
      allGroundingMeta.push(c.groundingMetadata);
    }
  }

  for (const gm of allGroundingMeta) {
    const chunks =
      gm?.grounding_chunks ||
      gm?.groundingChunks ||
      [];
    for (const ch of chunks) {
      const ctx =
        ch.retrieved_context ||
        ch.retrievedContext ||
        ch.web ||
        ch.maps ||
        null;
      if (!ctx) continue;

      const rawTitle =
        ctx.title ||
        'GIKI Admissions Policy';
      const rawText =
        ctx.text ||
        ctx.snippet ||
        '';

      const text = (rawText || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;

      const snippet =
        text.length > 260
          ? text.slice(0, 260) + '…'
          : text;

      const title = String(rawTitle);

      const exists = citations.some(
        (c) =>
          c.title === title &&
          c.snippet === snippet,
      );
      if (!exists) {
        citations.push({ title, snippet });
      }

      if (citations.length >= max) {
        return citations;
      }
    }
  }

  return citations;
}
