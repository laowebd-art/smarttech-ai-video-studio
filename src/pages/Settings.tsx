import { useEffect, useState } from "react";
import { Sparkles, Trash2, RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";
import { providerService, CAPABILITY_LABELS, type ProviderStatus, type Capability } from "@/services/providerService";

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [duration, setDuration] = useState(profile?.default_duration_target ?? 30);
  const [language, setLanguage] = useState(profile?.default_language ?? "en");
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const loadProviders = () => {
    setLoadingProviders(true);
    providerService
      .listStatus()
      .then(setProviders)
      .catch((e) => showToast(e.message ?? "Failed to load AI provider status", "error"))
      .finally(() => setLoadingProviders(false));
  };

  useEffect(loadProviders, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ default_duration_target: duration, default_language: language })
        .eq("id", profile.id);
      if (error) throw error;
      await refreshProfile();
      showToast("Settings saved", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const byCapability = new Map<Capability, ProviderStatus[]>();
  for (const p of providers) {
    for (const cap of p.capabilities) {
      if (!byCapability.has(cap)) byCapability.set(cap, []);
      byCapability.get(cap)!.push(p);
    }
  }

  return (
    <DashboardLayout title="Settings">
      <div className="max-w-2xl space-y-5">
        <Card>
          <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">AI Providers</h3>
            </div>
            <button onClick={loadProviders} className="text-gray-400 hover:text-gray-600" aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loadingProviders ? "animate-spin" : ""}`} />
            </button>
          </div>
          <CardBody className="space-y-4">
            <p className="text-xs text-gray-400">
              You never pick a provider directly — the AI Router automatically selects the best available one per
              task, with automatic fallback if a provider is unavailable. This is a live read from the server; no
              secret key values are ever shown here.
            </p>
            {loadingProviders ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(CAPABILITY_LABELS).map(([cap, label]) => {
                  const list = byCapability.get(cap as Capability) ?? [];
                  if (list.length === 0) return null;
                  return (
                    <div key={cap} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{label}</span>
                      <div className="flex items-center gap-1.5">
                        {list.map((p) => (
                          <Badge
                            key={p.id}
                            className={
                              p.configured
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                            }
                          >
                            {p.providerName}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Defaults</h3>
          </div>
          <CardBody className="space-y-4">
            <Select label="Default video duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </Select>
            <Select label="Default language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="lo">Lao (ລາວ) — coming soon</option>
            </Select>
            <div className="flex justify-end">
              <Button loading={saving} onClick={handleSave}>
                Save settings
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Storage & cache</h3>
          </div>
          <CardBody className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Storage usage</p>
              <p className="text-xs text-gray-400">Placeholder — connects to Supabase Storage usage in a later phase</p>
            </div>
            <Button variant="secondary" icon={<Trash2 className="h-4 w-4" />} onClick={() => showToast("Cache clearing will be wired up in a later phase.", "info")}>
              Clear cache
            </Button>
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
}
