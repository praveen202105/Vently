import { motion } from "motion/react";
import { Button } from "../components/Button";
import { GlassCard } from "../components/GlassCard";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [showWarning, setShowWarning] = useState(false);

  const handleContinue = () => {
    if (nickname && gender) {
      setShowWarning(true);
    }
  };

  const handleAccept = () => {
    localStorage.setItem("vently_user", JSON.stringify({ nickname, gender }));
    navigate("/mood");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl mb-2 bg-gradient-to-r from-gradient-purple to-gradient-pink bg-clip-text text-transparent">
            Create Your Identity
          </h1>
          <p className="text-muted-foreground">Choose how others will see you</p>
        </div>

        <GlassCard className="p-6 space-y-6">
          <div>
            <label className="block text-sm mb-2 text-muted-foreground">
              Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter a nickname..."
              className="w-full px-4 py-3 bg-input rounded-xl border border-glass-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="block text-sm mb-3 text-muted-foreground">
              Gender
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGender("male")}
                className={`p-4 rounded-xl border-2 transition-all ${
                  gender === "male"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-glass-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                Male
              </button>
              <button
                onClick={() => setGender("female")}
                className={`p-4 rounded-xl border-2 transition-all ${
                  gender === "female"
                    ? "border-secondary bg-secondary/10 text-secondary"
                    : "border-glass-border text-muted-foreground hover:border-secondary/30"
                }`}
              >
                Female
              </button>
            </div>
          </div>

          <Button
            variant="gradient"
            size="lg"
            className="w-full mt-6"
            onClick={handleContinue}
            disabled={!nickname || !gender}
          >
            Continue
          </Button>
        </GlassCard>
      </motion.div>

      <Dialog.Root open={showWarning} onOpenChange={setShowWarning}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md">
            <GlassCard className="p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="bg-destructive/20 p-3 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <Dialog.Title className="text-xl mb-2">
                    18+ Content Warning
                  </Dialog.Title>
                  <Dialog.Description className="text-muted-foreground">
                    This platform is intended for users 18 years and older. By
                    continuing, you confirm that you are at least 18 years old
                    and agree to our terms of service.
                  </Dialog.Description>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowWarning(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="gradient"
                  className="flex-1"
                  onClick={handleAccept}
                >
                  I'm 18+
                </Button>
              </div>
            </GlassCard>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
