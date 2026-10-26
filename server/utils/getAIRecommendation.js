import ErrorHandler from "../middlewares/errorMiddleware.js";

export const getAIRecommendation = async (userPrompt, products) => {
  const API_KEY = process.env.GROQ_API_KEY;
  const URL = "https://api.groq.com/openai/v1/chat/completions";

  const slim = products.map(({ id, name, description, category, price }) => ({
    id,
    name,
    description: description?.slice(0, 150),
    category,
    price,
  }));

  const systemPrompt = `You are a shopping assistant. The user may write in English or Roman Urdu.
You get a list of products (JSON) and a user request.
Return only the products that truly match the request. If the user asks for "best" or "acha", put the better ones first. Return at most 5 ids.
Use only ids from the given list.
If NO product matches, reply exactly {"ids":[]}.
Reply ONLY with JSON like {"ids":["id1","id2"]}.`;

  const response = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Products:\n${JSON.stringify(slim)}\n\nUser request: "${userPrompt}"`,
        },
      ],
    }),
  });

  const data = await response.json();

  if (response.status === 429) {
    throw new ErrorHandler(
      "Too many AI searches. Please wait a minute and try again.",
      429,
    );
  }

  if (!response.ok) {
    console.error("Groq error:", data?.error?.message);
    throw new ErrorHandler(
      "AI service is not available right now. Please try again.",
      502,
    );
  }

  const aiResponse = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!aiResponse) {
    throw new ErrorHandler("AI response is empty or invalid.", 502);
  }

  let ids = [];
  try {
    ids = JSON.parse(aiResponse).ids || [];
  } catch {
    throw new ErrorHandler("Failed to parse AI response.", 502);
  }

  // AI ki di hui ranking (best pehle) bachane ke liye ids ke order mein nikalo
  const matched = ids
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);

  return { success: true, products: matched };
};
