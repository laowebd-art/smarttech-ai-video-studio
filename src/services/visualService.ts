import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/apiClient";
import { slugifyFilename } from "@/lib/utils";
import type { VisualAsset, VisualSourceType } from "@/types";

const BUCKET = "project-visuals";

export interface StockResult {
  id: string;
  provider: "pexels" | "pixabay" | "unsplash";
  thumbnailUrl: string;
  fullUrl: string;
  credit: string;
  sourceUrl: string;
}

async function findExisting(projectId: string, sceneId: string): Promise<VisualAsset | null> {
  const { data } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("project_id", projectId)
    .eq("scene_id", sceneId)
    .maybeSingle();
  return (data as VisualAsset) ?? null;
}

async function upsert(projectId: string, sceneId: string, fields: Partial<VisualAsset>): Promise<VisualAsset> {
  const existing = await findExisting(projectId, sceneId);
  const payload = {
    project_id: projectId,
    scene_id: sceneId,
    source_type: null,
    provider: null,
    search_keyword: null,
    storage_path: null,
    public_url: null,
    color_value: null,
    gradient_from: null,
    gradient_to: null,
    gradient_angle: null,
    ...fields,
  };
  if (existing) {
    const { data, error } = await supabase.from("visual_assets").update(payload).eq("id", existing.id).select().single();
    if (error) throw error;
    return data as VisualAsset;
  }
  const { data, error } = await supabase.from("visual_assets").insert(payload).select().single();
  if (error) throw error;
  return data as VisualAsset;
}

export const visualService = {
  async list(projectId: string): Promise<VisualAsset[]> {
    const { data, error } = await supabase.from("visual_assets").select("*").eq("project_id", projectId);
    if (error) throw error;
    return (data as VisualAsset[]) ?? [];
  },

  async uploadFile(projectId: string, sceneId: string, file: File): Promise<VisualAsset> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const sourceType: VisualSourceType = file.type.startsWith("video/") ? "uploaded_video" : "uploaded_image";
    const path = `${user.id}/${projectId}/scenes/${sceneId}/${Date.now()}-${slugifyFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    return upsert(projectId, sceneId, { source_type: sourceType, storage_path: path });
  },

  async setSolid(projectId: string, sceneId: string, colorHex: string): Promise<VisualAsset> {
    return upsert(projectId, sceneId, { source_type: "solid", color_value: colorHex });
  },

  async setGradient(projectId: string, sceneId: string, from: string, to: string, angle: number): Promise<VisualAsset> {
    return upsert(projectId, sceneId, {
      source_type: "gradient",
      gradient_from: from,
      gradient_to: to,
      gradient_angle: angle,
    });
  },

  async attachStock(projectId: string, sceneId: string, result: StockResult, keyword: string): Promise<VisualAsset> {
    return upsert(projectId, sceneId, {
      source_type: "stock_image",
      provider: result.provider,
      search_keyword: keyword,
      public_url: result.fullUrl,
    });
  },

  async remove(asset: VisualAsset): Promise<void> {
    if (asset.storage_path) {
      await supabase.storage.from(BUCKET).remove([asset.storage_path]);
    }
    const { error } = await supabase.from("visual_assets").delete().eq("id", asset.id);
    if (error) throw error;
  },

  /** project-visuals is a private bucket — resolve a playable/viewable URL for an asset. */
  async resolveUrl(asset: VisualAsset): Promise<string | null> {
    if (asset.public_url) return asset.public_url; // stock/external URLs are already hotlinkable
    if (!asset.storage_path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(asset.storage_path, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  },

  async searchStock(query: string, provider: "pexels" | "pixabay" | "unsplash"): Promise<StockResult[]> {
    const result = await apiGet<{ results: StockResult[] }>(
      `/api/visuals/stock-search?query=${encodeURIComponent(query)}&provider=${provider}`
    );
    return result.results;
  },
};
