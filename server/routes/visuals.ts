import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";

export const visualsRouter = Router();

visualsRouter.use(requireAuth);

export interface StockResult {
  id: string;
  provider: "pexels" | "pixabay" | "unsplash";
  thumbnailUrl: string;
  fullUrl: string;
  credit: string;
  sourceUrl: string;
}

async function searchPexels(query: string): Promise<StockResult[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY is not configured on the server.");
  const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12`, {
    headers: { Authorization: apiKey },
  });
  if (!response.ok) throw new Error(`Pexels API error (${response.status})`);
  const data: any = await response.json();
  return (data.photos ?? []).map((p: any) => ({
    id: `pexels-${p.id}`,
    provider: "pexels" as const,
    thumbnailUrl: p.src?.medium,
    fullUrl: p.src?.large2x || p.src?.large || p.src?.original,
    credit: p.photographer,
    sourceUrl: p.url,
  }));
}

async function searchPixabay(query: string): Promise<StockResult[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new Error("PIXABAY_API_KEY is not configured on the server.");
  const response = await fetch(
    `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=12`
  );
  if (!response.ok) throw new Error(`Pixabay API error (${response.status})`);
  const data: any = await response.json();
  return (data.hits ?? []).map((p: any) => ({
    id: `pixabay-${p.id}`,
    provider: "pixabay" as const,
    thumbnailUrl: p.webformatURL,
    fullUrl: p.largeImageURL || p.webformatURL,
    credit: p.user,
    sourceUrl: p.pageURL,
  }));
}

async function searchUnsplash(query: string): Promise<StockResult[]> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) throw new Error("UNSPLASH_ACCESS_KEY is not configured on the server.");
  const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12`, {
    headers: { Authorization: `Client-ID ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Unsplash API error (${response.status})`);
  const data: any = await response.json();
  return (data.results ?? []).map((p: any) => ({
    id: `unsplash-${p.id}`,
    provider: "unsplash" as const,
    thumbnailUrl: p.urls?.small,
    fullUrl: p.urls?.regular || p.urls?.full,
    credit: p.user?.name,
    sourceUrl: p.links?.html,
  }));
}

// ---------------------------------------------------------------------------
// GET /api/visuals/stock-search?query=...&provider=pexels|pixabay|unsplash
//
// This searches stock PHOTO libraries for B-roll background images. Full
// video B-roll search can be added the same way later (Pexels and Pixabay
// both have separate video-search endpoints) — not required for Phase 4.
// No projectId/ownership check needed here since nothing is written yet;
// the result is only persisted once the user picks one via visualService.
// ---------------------------------------------------------------------------
visualsRouter.get("/stock-search", async (req: AuthedRequest, res: Response) => {
  const query = req.query.query as string | undefined;
  const provider = (req.query.provider as string | undefined) || "pexels";

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "`query` is required." });
  }

  try {
    let results: StockResult[];
    if (provider === "pexels") results = await searchPexels(query);
    else if (provider === "pixabay") results = await searchPixabay(query);
    else if (provider === "unsplash") results = await searchUnsplash(query);
    else return res.status(400).json({ error: "`provider` must be pexels, pixabay, or unsplash." });

    res.json({ results });
  } catch (err: any) {
    console.error("[stock-search]", err);
    res.status(502).json({ error: err.message ?? "Stock search failed." });
  }
});
