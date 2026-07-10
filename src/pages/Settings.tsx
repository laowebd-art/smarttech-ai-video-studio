import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";

const apiKeyStatus = [
  { name: "OPENAI_API_KEY", envVar: "OPENAI_API_KEY", present: Boolean(import.meta.env.VITE_OPENAI_KEY_PRESENT) },
  { name: "ANTHROPIC_API_KEY", envVar: "ANTHROPIC_API_KEY", present: Boolean(import.meta.env.VITE_ANTHROPIC_KEY_PRESENT) },
  { name: "ELEVENLABS_API_KEY", envVar: "ELEVENLABS_API_KEY", present: Boolean(import.meta.env.VITE_ELEVENLABS_KEY_PRESENT) },
  { name: "PEXELS_API_KEY", envVar: "PEXELS_API_KEY", present: Boolean(import.meta.env.VITE_PEXELS_KEY_PRESENT) },
];

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [aiModel, setAiModel] = useState(profile?.default_ai_model ?? "gpt-4o");
  const [ttsProvider, setTtsProvider] = useState(profile?.default_tts_provider ?? "openai");
  const [duration, setDuration] = useState(profile?.default_duration_target ?? 30);
  const [language, setLanguage] = useState(profile?.default_language ?? "en");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          default_ai_model: aiModel,
          default_tts_provider: ttsProvider,
          default_duration_target: duration,
          default_language: language,
        })
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

  return (
    <DashboardLayout title="Settings">
      <div className="max-w-2xl space-y-5">
        <Card>
          <div className="flex items-center gap-2 p-5 border-b border-gray-100 dark:border-gray-800">
            <KeyRound className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">API keys status</h3>
          </div>
          <CardBody className="space-y-2">
            {apiKeyStatus.map((k) => (
              <div key={k.name} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-600 dark:text-gray-300">{k.envVar}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    k.present
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {k.present ? "Configured" : "Not set"}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-2">
              Secret values are never displayed or sent to the browser. Set these in your server / Edge Function
              environment, not in <code>.env</code> files shipped to the client.
            </p>
          </CardBody>
        </Card>

        <Card>
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Defaults</h3>
          </div>
          <CardBody className="space-y-4">
            <Select label="Default AI model" value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
              <option value="gpt-4o">GPT-4o</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
            </Select>
            <Select label="Default TTS provider" value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
              <option value="openai">OpenAI TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
            </Select>
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
