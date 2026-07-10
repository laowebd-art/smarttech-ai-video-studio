import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AuthShell } from "./Login";

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium text-primary-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">Enter your email and we'll send you a reset link.</p>
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
          <Link to="/login" className="block text-center text-sm font-medium text-primary-600 hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
