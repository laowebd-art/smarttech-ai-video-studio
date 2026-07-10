export * from "./database.types";

export type Tone =
  | "emotional"
  | "educational"
  | "motivational"
  | "story"
  | "news"
  | "product ad"
  | "documentary";

export type DurationTarget = 15 | 30 | 60;

export interface DashboardStats {
  totalProjects: number;
  draftVideos: number;
  renderedVideos: number;
  totalMinutesGenerated: number;
}
