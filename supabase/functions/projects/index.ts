import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  const corsHeaders = getCorsHeaders();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, title, url")
      .order("title", { ascending: true });

    if (error) throw error;

    // Map database fields to API response format
    const mappedProjects = (projects ?? []).map((p) => ({
      id: p.id,
      name: p.title,
      open_url: p.url,
    }));

    return new Response(JSON.stringify(mappedProjects), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
