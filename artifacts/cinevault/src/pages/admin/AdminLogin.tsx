import { useState } from "react";
import { Film, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { login } from "@/lib/admin-db";

interface AdminLoginProps {
  onLogin: () => void;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTimeout(() => {
      if (login(password)) {
        onLogin();
      } else {
        setError("Incorrect password. Default is: admin123");
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#238636] flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(35,134,54,0.4)]">
            <Film className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider font-mono">CINEVAULT</h1>
          <p className="text-[#8b949e] text-sm mt-1">Admin Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 space-y-4 shadow-2xl">
          <div className="flex items-center gap-2 mb-6 text-[#8b949e]">
            <ShieldCheck className="w-4 h-4 text-[#238636]" />
            <span className="text-sm font-mono">Authentication Required</span>
          </div>

          <div>
            <label className="block text-[#c9d1d9] text-sm font-medium mb-2 font-mono">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center">
                <Lock className="w-4 h-4 text-[#8b949e]" />
              </div>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] focus:ring-1 focus:ring-[#238636] text-[#c9d1d9] rounded-lg pl-10 pr-10 py-3 text-sm outline-none font-mono placeholder:text-[#484f58] transition-colors"
                data-testid="input-admin-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute inset-y-0 right-3 flex items-center text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-[#da3633]/10 border border-[#da3633]/30 text-[#ff7b72] text-xs rounded-lg px-3 py-2 font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors font-mono uppercase tracking-wider text-sm"
            data-testid="btn-admin-login"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-[#484f58] text-xs mt-6 font-mono">
          CineVault Admin Panel v2.0
        </p>
      </div>
    </div>
  );
}
