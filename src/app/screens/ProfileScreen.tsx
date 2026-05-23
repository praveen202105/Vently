import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { useState, useEffect } from "react";
import { User, Edit2, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router";

export function ProfileScreen() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editNickname, setEditNickname] = useState("");

  useEffect(() => {
    const userData = localStorage.getItem("vently_user");
    if (userData) {
      const { nickname: savedNickname, gender: savedGender } =
        JSON.parse(userData);
      setNickname(savedNickname);
      setGender(savedGender);
      setEditNickname(savedNickname);
    }
  }, []);

  const handleSave = () => {
    setNickname(editNickname);
    localStorage.setItem(
      "vently_user",
      JSON.stringify({ nickname: editNickname, gender })
    );
    setIsEditing(false);
  };

  const handleResetSession = () => {
    localStorage.removeItem("vently_user");
    localStorage.removeItem("vently_mood");
    navigate("/welcome");
  };

  return (
    <div className="min-h-screen p-6 pb-24 md:pb-6 md:ml-64 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(236,72,153,0.1),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-2xl mx-auto"
      >
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-primary/50">
            <User className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl bg-gradient-to-r from-gradient-purple via-gradient-pink to-gradient-blue bg-clip-text text-transparent">
            {nickname || "Your Profile"}
          </h1>
          <p className="text-muted-foreground mt-1 capitalize">{gender}</p>
        </div>

        <div className="space-y-4">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-foreground">Nickname</h2>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <Edit2 className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className="w-full px-4 py-3 bg-input rounded-xl border border-glass-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setIsEditing(false);
                      setEditNickname(nickname);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="gradient"
                    size="sm"
                    className="flex-1"
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">{nickname}</p>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl text-foreground mb-4">Preferences</h2>
            <div className="space-y-3">
              <button
                onClick={() => navigate("/mood")}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-muted transition-colors text-foreground"
              >
                Change mood preference
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-xl text-foreground mb-4">Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted/30 rounded-xl">
                <p className="text-2xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  12
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Conversations
                </p>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-xl">
                <p className="text-2xl bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">
                  4
                </p>
                <p className="text-sm text-muted-foreground mt-1">Connections</p>
              </div>
            </div>
          </GlassCard>

          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive/10"
            onClick={handleResetSession}
          >
            <RotateCcw className="w-5 h-5" />
            Reset Session
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
