const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (!env.PROXY_SECRET || request.headers.get("Authorization") !== `Bearer ${env.PROXY_SECRET}`) {
      return new Response(null, { status: 401 });
    }
    const size = Number(request.headers.get("Content-Length"));
    if ((Number.isFinite(size) && size > 64_000) || request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
      return new Response(null, { status: 413 });
    }
    let input;
    try {
      const body = await request.text();
      if (body.length > 64_000) return new Response(null, { status: 413 });
      input = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!Array.isArray(input.messages) || input.messages.length !== 2 ||
      input.messages[0]?.role !== "system" || input.messages[1]?.role !== "user" ||
      typeof input.messages[0].content !== "string" || typeof input.messages[1].content !== "string" ||
      input.response_format?.type !== "json_schema" || !input.response_format.json_schema ||
      input.temperature !== 0 || input.max_tokens !== 2500) {
      return new Response(null, { status: 400 });
    }
    try {
      const output = await env.AI.run(MODEL, input);
      return Response.json({ success: true, result: { response: output?.response ?? output } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("3036")) return Response.json({ success: false, errors: [{ code: 3036 }] }, { status: 429 });
      return Response.json({ success: false, errors: [{ code: 5000 }] }, { status: 502 });
    }
  },
};
