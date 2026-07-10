import { useState } from "react";
import { Sparkles, Wand2, Scissors } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { TextArea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { projectService } from "@/services/projectService";
import { sceneService } from "@/services/sceneService";
import { generateScript, improveScript, splitIntoScenes } from "@/services/aiService";
import type { Project, Tone } from "@/types";

const tones: Tone[] = ["emotional", "educational", "motivational", "story", "news", "product ad", "documentary"];

export default function ScriptStudio({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
}) {
  const { showToast } = useToast();
  const [topic, setTopic] = useState(project.topic ?? "");
  const [rawScript, setRawScript] = useState(project.raw_script ?? "");
  const [finalScript, setFinalScript] = useState(project.final_script ?? "");
  const [tone, setTone] = useState<Tone>((project.tone as Tone) ?? "educational");
  const [duration, setDuration] = useState(project.duration_target);
  const [language, setLanguage] = useState(project.language);
  const [busy, setBusy] = useState<"generate" | "improve" | "split" | "save" | null>(null);

  const persist = async (updates: Partial<Project>) => {
    const updated = await projectService.update(project.id, updates);
    onUpdated(updated);
    return updated;
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      showToast("Enter a topic first", "error");
      return;
    }
    setBusy("generate");
    try {
      const result = await generateScript({ topic, tone, durationTarget: duration, language, rawScript, projectId: project.id });
      setRawScript(result.finalScript);
      setFinalScript(result.finalScript);
      await persist({ topic, tone, language, duration_target: duration, raw_script: result.finalScript, final_script: result.finalScript, status: "script_ready" });
      showToast("Script generated", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to generate script", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleImprove = async () => {
    if (!finalScript.trim()) {
      showToast("Nothing to improve yet — generate a script first", "error");
      return;
    }
    setBusy("improve");
    try {
      const improved = await improveScript(finalScript, project.id, tone, language);
      setFinalScript(improved);
      await persist({ final_script: improved });
      showToast("Script improved", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to improve script", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSplitScenes = async () => {
    if (!finalScript.trim()) {
      showToast("Generate or write a script before splitting into scenes", "error");
      return;
    }
    setBusy("split");
    try {
      const scenes = await splitIntoScenes(finalScript, duration, project.id, language);
      for (let i = 0; i < scenes.length; i++) {
        await sceneService.create(project.id, i + 1, scenes[i]);
      }
      await persist({ status: "script_ready" });
      showToast(`Created ${scenes.length} scenes — open Scene Builder to review`, "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to split into scenes", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = async () => {
    setBusy("save");
    try {
      await persist({ topic, tone, language, duration_target: duration, raw_script: rawScript, final_script: finalScript });
      showToast("Draft saved", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to save", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <TextArea label="Topic" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this video about?" />
          <TextArea
            label="Rough script (optional)"
            rows={4}
            value={rawScript}
            onChange={(e) => setRawScript(e.target.value)}
            placeholder="Paste a rough script, or leave blank and let AI generate one from the topic"
          />
          <div className="grid sm:grid-cols-3 gap-4">
            <Select label="Tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              {tones.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select label="Duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </Select>
            <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="lo">Lao (ລາວ) — coming soon</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button icon={<Sparkles className="h-4 w-4" />} loading={busy === "generate"} onClick={handleGenerate}>
              Generate Script
            </Button>
            <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} loading={busy === "improve"} onClick={handleImprove}>
              Improve Script
            </Button>
            <Button variant="secondary" icon={<Scissors className="h-4 w-4" />} loading={busy === "split"} onClick={handleSplitScenes}>
              Split Into Scenes
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <TextArea
            label="Final polished script"
            rows={8}
            value={finalScript}
            onChange={(e) => setFinalScript(e.target.value)}
            placeholder="Your final script will appear here after generation — you can also edit it directly."
          />
          <div className="flex justify-end">
            <Button variant="secondary" loading={busy === "save"} onClick={handleSaveDraft}>
              Save
            </Button>
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-gray-400">
        Script generation calls your own backend at <code>server/</code>, which forwards requests to OpenAI or
        Anthropic using the key you set in your server environment (see <code>.env.example</code>). Run{" "}
        <code>npm run server:dev</code> alongside <code>npm run dev</code> for this to work locally.
      </p>
    </div>
  );
}
