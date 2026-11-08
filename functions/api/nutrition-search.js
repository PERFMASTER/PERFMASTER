// Cloudflare Pages Function: proxy sécurisé pour USDA FoodData Central.
// Ajouter USDA_API_KEY dans Settings > Variables and Secrets comme Secret chiffré.

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...extraHeaders,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }});
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = String(url.searchParams.get("q") || "").trim();
  if (query.length < 2 || query.length > 100) {
    return json({ error: "Query must contain 2–100 characters", results: [] }, 400);
  }

  const apiKey = context.env.USDA_API_KEY;
  if (!apiKey) {
    return json({ results: [], error: "USDA_API_KEY is not configured" }, 503);
  }

  try {
    const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query, pageSize: 8, pageNumber: 1,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
    });
    if (!response.ok) {
      return json({ results: [], error: "USDA API request failed" }, response.status === 429 ? 429 : 502);
    }
    const payload = await response.json();
    const get = (food, pattern) => {
      const item = (food.foodNutrients || []).find(n => pattern.test(String(n.nutrientName || n.name || "")));
      return item && Number.isFinite(Number(item.value)) ? Number(item.value) : null;
    };
    const results = (payload.foods || []).map(food => ({
      id: String(food.fdcId),
      name: food.description || food.lowercaseDescription || "FoodData Central food",
      c: get(food, /carbohydrate, by difference|carbohydrate, total/i),
      p: get(food, /^protein$/i),
      f: get(food, /^total lipid \(fat\)$/i),
      dataType: food.dataType || "",
    })).filter(food => food.c !== null && food.p !== null && food.f !== null);
    return json({ results });
  } catch (error) {
    return json({ results: [], error: "USDA service unavailable" }, 502);
  }
}
