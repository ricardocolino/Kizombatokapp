export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // CORS Configuration
    const allowedOrigins = [
      "capacitor://localhost",
      "http://localhost:3000",
      "http://localhost:5173",
      "https://ais-dev-zrifqkgbujknyfw6lb6hhi-7031768075.europe-west2.run.app",
      "https://ais-pre-zrifqkgbujknyfw6lb6hhi-7031768075.europe-west2.run.app"
    ];

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // Handle Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health Check
    if (url.pathname === "/api/health" && request.method === "GET") {
      return new Response(JSON.stringify({ 
        status: "ok", 
        worker: "kizombatok-upload",
        r2_bucket: !!env.R2_BUCKET 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Upload Endpoint
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const folder = formData.get("folder") || "posts";
        const fileName = formData.get("fileName") || `${Date.now()}-${file.name || 'upload'}`;

        if (!file) {
          return new Response(JSON.stringify({ error: "No file uploaded" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Validation: Size (100MB)
        if (file.size > 100 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "File too large (max 100MB)" }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Validation: MIME Type
        const allowedTypes = ["video/", "image/", "audio/"];
        if (!allowedTypes.some(type => file.type.startsWith(type))) {
          return new Response(JSON.stringify({ error: "Invalid file type" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const filePath = `${folder}/${fileName}`;

        // Upload to R2
        await env.R2_BUCKET.put(filePath, file, {
          httpMetadata: { contentType: file.type }
        });

        const publicUrl = `${env.R2_PUBLIC_URL}/${filePath}`;

        return new Response(JSON.stringify({ url: publicUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};
