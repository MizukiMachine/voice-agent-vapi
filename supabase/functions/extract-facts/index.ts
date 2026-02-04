// Supabase Edge Function: extract-facts
// Extracts facts from conversation transcript using OpenAI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractFactsRequest {
  userId: string;
  transcript: string;
}

interface ExtractedFact {
  fact: string;
  source: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, transcript }: ExtractFactsRequest = await req.json();

    if (!userId || !transcript) {
      return new Response(
        JSON.stringify({ error: 'userId and transcript are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get OpenAI API key from Supabase secrets
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Extract facts using OpenAI
    const facts = await extractFactsFromTranscript(transcript, openaiApiKey);

    // Save facts to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (facts.length > 0) {
      const factsToInsert = facts.map((fact) => ({
        user_id: userId,
        fact: fact,
        source: 'conversation',
      }));

      const { error: insertError } = await supabase
        .from('user_memories')
        .insert(factsToInsert);

      if (insertError) {
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        factsExtracted: facts.length,
        facts: facts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting facts:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractFactsFromTranscript(
  transcript: string,
  apiKey: string
): Promise<string[]> {
  const prompt = `以下の会話履歴から、ユーザーに関する重要な事実を抽出してください。
各事実は独立した文として、ユーザーを主語にして記載してください。
推測や解釈は避け、会話から明確に読み取れる事実のみを抽出してください。
事実がない場合は空の配列を返してください。

出力形式: JSON配列 (例: ["事実1", "事実2"])

会話履歴:
${transcript}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a fact extraction assistant. Extract facts about the user from conversations and return them as a JSON array of strings. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '[]';

  try {
    // Parse the JSON array from the response
    const facts = JSON.parse(content);
    return Array.isArray(facts) ? facts : [];
  } catch {
    // If parsing fails, try to extract JSON from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  }
}
