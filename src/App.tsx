import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotPassword from "@/pages/auth/ForgotPassword";

// Auth pages stay eager (small, and needed immediately on first load).
// Everything behind the login wall is lazy so the initial bundle is small.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ProjectsList = lazy(() => import("@/pages/projects/ProjectsList"));
const NewProject = lazy(() => import("@/pages/projects/NewProject"));
const ProjectDetail = lazy(() => import("@/pages/projects/ProjectDetail"));
const AiVideoStudio = lazy(() => import("@/pages/AiVideoStudio"));
const Templates = lazy(() => import("@/pages/Templates"));
const RenderQueue = lazy(() => import("@/pages/RenderQueue"));
const ExportCenter = lazy(() => import("@/pages/ExportCenter"));
const Settings = lazy(() => import("@/pages/Settings"));

function PageFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-surface-dark">
      <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
        <Route path="/projects/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
        <Route path="/ai-video-studio" element={<ProtectedRoute><AiVideoStudio /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
        <Route path="/render-queue" element={<ProtectedRoute><RenderQueue /></ProtectedRoute>} />
        <Route path="/export-center" element={<ProtectedRoute><ExportCenter /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
