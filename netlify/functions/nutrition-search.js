// Netlify Function: proxy sécurisé pour USDA FoodData Central.
// Dans Netlify, définir la variable d'environnement USDA_API_KEY.
exports.handler = async function (event) {
  const origin = String((event.headers || {}).origin || '');
  const allowedOrigins = new Set(['https://perf-master.netlify.app']);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Vary': 'Origin',
  };
  if (allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  if (event.httpMethod === 'OPTIONS') {
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const query = String((event.queryStringParameters || {}).q || '').trim();
  if (query.length < 2 || query.length > 100) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query must contain 2–100 characters' }) };
  }
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ results: [], error: 'USDA_API_KEY is not configured' }) };
  }
  try {
    const response = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, pageSize: 8, pageNumber: 1, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'] }),
    });
    if (!response.ok) {
      return { statusCode: response.status === 429 ? 429 : 502, headers, body: JSON.stringify({ results: [], error: 'USDA API request failed' }) };
    }
    const payload = await response.json();
    const get = (food, pattern) => {
      const item = (food.foodNutrients || []).find(n => pattern.test(String(n.nutrientName || n.name || '')));
      return item && Number.isFinite(Number(item.value)) ? Number(item.value) : null;
    };
    const results = (payload.foods || []).map(food => ({
      id: String(food.fdcId),
      name: food.description || food.lowercaseDescription || 'FoodData Central food',
      c: get(food, /carbohydrate, by difference|carbohydrate, total/i),
      p: get(food, /^protein$/i),
      f: get(food, /^total lipid \(fat\)$/i),
      dataType: food.dataType || '',
    })).filter(food => food.c !== null && food.p !== null && food.f !== null);
    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (error) {
    return { statusCode: 502, headers, body: JSON.stringify({ results: [], error: 'USDA service unavailable' }) };
  }
};
