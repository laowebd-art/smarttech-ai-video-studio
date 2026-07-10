import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Upload, Search, Sparkles, Trash2, Palette } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { sceneService } from "@/services/sceneService";
import { visualService, type StockResult } from "@/services/visualService";
import { generateVisualPrompt } from "@/services/aiService";
import type { Project, Scene, VisualAsset } from "@/types";

export default function VisualAssetStudio({ project }: { project: Project; onUpdated: (p: Project) => void }) {
  const { showToast } = useToast();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [sceneRows, assetRows] = await Promise.all([sceneService.list(project.id), visualService.list(project.id)]);
      setScenes(sceneRows);
      setAssets(assetRows);
    } catch (e: any) {
      showToast(e.message ?? "Failed to load visuals", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const upsertLocalAsset = (asset: VisualAsset) => {
    setAssets((prev) => [...prev.filter((a) => a.scene_id !== asset.scene_id), asset]);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No scenes yet"
        description="Build scenes in Scene Builder first, then come back here to assign a visual to each one."
      />
    );
  }

  return (
    <div className="space-y-4">
      {scenes.map((scene) => (
        <SceneVisualCard
          key={scene.id}
          project={project}
          scene={scene}
          asset={assets.find((a) => a.scene_id === scene.id) ?? null}
          onAssetChange={upsertLocalAsset}
          onAssetRemoved={(assetId) => setAssets((prev) => prev.filter((a) => a.id !== assetId))}
        />
      ))}
    </div>
  );
}

const SOLID_SWATCHES = ["#111827", "#1e3a8a", "#7c2d12", "#14532d", "#4c1d95", "#831843"];

function SceneVisualCard({
  project,
  scene,
  asset,
  onAssetChange,
  onAssetRemoved,
}: {
  project: Project;
  scene: Scene;
  asset: VisualAsset | null;
  onAssetChange: (a: VisualAsset) => void;
  onAssetRemoved: (assetId: string) => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [keyword, setKeyword] = useState(scene.broll_keyword ?? "");
  const [provider, setProvider] = useState<"pexels" | "pixabay" | "unsplash">("pexels");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StockResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [gradientFrom, setGradientFrom] = useState("#4f46e5");
  const [gradientTo, setGradientTo] = useState("#7c3aed");

  useEffect(() => {
    let cancelled = false;
    if (!asset) {
      setPreviewUrl(null);
      return;
    }
    visualService.resolveUrl(asset).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [asset?.id, asset?.storage_path, asset?.public_url]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await visualService.uploadFile(project.id, scene.id, file);
      onAssetChange(updated);
      showToast("Visual uploaded", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to upload file", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSearch = async () => {
    if (!keyword.trim()) {
      showToast("Enter a search keyword first", "error");
      return;
    }
    setSearching(true);
    setShowSearch(true);
    try {
      const found = await visualService.searchStock(keyword, provider);
      setResults(found);
      if (found.length === 0) showToast("No results found", "info");
    } catch (err: any) {
      showToast(err.message ?? `${provider} search failed — is the API key configured?`, "error");
    } finally {
      setSearching(false);
    }
  };

  const handlePickStock = async (result: StockResult) => {
    try {
      const updated = await visualService.attachStock(project.id, scene.id, result, keyword);
      onAssetChange(updated);
      setShowSearch(false);
      showToast("Visual attached", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to attach visual", "error");
    }
  };

  const handleSolid = async (color: string) => {
    try {
      const updated = await visualService.setSolid(project.id, scene.id, color);
      onAssetChange(updated);
      showToast("Solid background set", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to set background", "error");
    }
  };

  const handleGradient = async () => {
    try {
      const updated = await visualService.setGradient(project.id, scene.id, gradientFrom, gradientTo, 135);
      onAssetChange(updated);
      showToast("Gradient background set", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to set gradient", "error");
    }
  };

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      const prompt = await generateVisualPrompt(scene.id, project.id);
      await sceneService.update(scene.id, { visual_prompt: prompt });
      showToast("Visual prompt generated — see Scene Builder", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to generate visual prompt", "error");
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleRemove = async () => {
    if (!asset) return;
    try {
      await visualService.remove(asset);
      onAssetRemoved(asset.id);
      showToast("Visual removed", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to remove visual", "error");
    }
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold">
            {scene.scene_number}
          </span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Scene {scene.scene_number}</span>
        </div>

        <div className="flex gap-4">
          <VisualPreview asset={asset} url={previewUrl} />

          <div className="flex-1 space-y-3">
            <p className="text-sm text-gray-500 line-clamp-2">{scene.visual_prompt || "No visual prompt yet"}</p>

            <div className="flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => fileInputRef.current?.click()}>
                {asset?.storage_path ? "Replace" : "Upload"}
              </Button>
              <Button variant="secondary" icon={<Palette className="h-4 w-4" />} onClick={() => setShowColorPicker((s) => !s)}>
                Solid / Gradient
              </Button>
              <Button
                variant="secondary"
                icon={<Sparkles className="h-4 w-4" />}
                loading={generatingPrompt}
                onClick={handleGeneratePrompt}
              >
                Generate image prompt
              </Button>
              {asset && (
                <button onClick={handleRemove} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Remove visual">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {showColorPicker && (
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Solid color</p>
                  <div className="flex gap-1.5">
                    {SOLID_SWATCHES.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleSolid(c)}
                        className="h-7 w-7 rounded-full border border-white/20 shadow"
                        style={{ backgroundColor: c }}
                        aria-label={`Set solid ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Gradient</p>
                  <div className="flex items-center gap-2">
                    <input type="color" value={gradientFrom} onChange={(e) => setGradientFrom(e.target.value)} className="h-8 w-10 rounded" />
                    <input type="color" value={gradientTo} onChange={(e) => setGradientTo(e.target.value)} className="h-8 w-10 rounded" />
                    <Button variant="secondary" onClick={handleGradient}>
                      Apply gradient
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <Input label="Search keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. city skyline sunset" />
              </div>
              <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className="w-36">
                <option value="pexels">Pexels</option>
                <option value="pixabay">Pixabay</option>
                <option value="unsplash">Unsplash</option>
              </Select>
              <Button variant="secondary" icon={<Search className="h-4 w-4" />} loading={searching} onClick={handleSearch}>
                Search
              </Button>
            </div>

            {showSearch && results.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handlePickStock(r)}
                    className="aspect-video overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800 hover:ring-2 hover:ring-primary-500"
                  >
                    <img src={r.thumbnailUrl} alt={r.credit} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function VisualPreview({ asset, url }: { asset: VisualAsset | null; url: string | null }) {
  const base = "h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800 flex items-center justify-center";

  if (!asset) {
    return (
      <div className={`${base} bg-gray-50 dark:bg-gray-800`}>
        <ImageIcon className="h-5 w-5 text-gray-300" />
      </div>
    );
  }

  if (asset.source_type === "solid" && asset.color_value) {
    return <div className={base} style={{ backgroundColor: asset.color_value }} />;
  }

  if (asset.source_type === "gradient" && asset.gradient_from && asset.gradient_to) {
    return (
      <div
        className={base}
        style={{
          background: `linear-gradient(${asset.gradient_angle ?? 135}deg, ${asset.gradient_from}, ${asset.gradient_to})`,
        }}
      />
    );
  }

  if (asset.source_type === "uploaded_video" && url) {
    return (
      <video className={`${base} object-cover`} src={url} muted playsInline />
    );
  }

  if (url) {
    return (
      <div className={base}>
        <img src={url} alt="Scene visual" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`${base} bg-gray-50 dark:bg-gray-800`}>
      <ImageIcon className="h-5 w-5 text-gray-300" />
    </div>
  );
}
