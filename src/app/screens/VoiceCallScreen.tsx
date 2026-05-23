import { motion } from "motion/react";
import { Button } from "../components/Button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";

export function VoiceCallScreen() {
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleEndCall = () => {
    navigate("/chat");
  };

  return (
    <div className="h-screen flex flex-col items-center justify-between p-6 bg-gradient-to-br from-background via-primary/5 to-background relative overflow-hidden md:ml-64">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.15),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md mt-12"
      >
        <div className="text-center">
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative inline-block mb-6"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent rounded-full blur-2xl opacity-50" />
            <div className="relative w-32 h-32 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-2xl">
              <span className="text-white text-4xl">A</span>
            </div>

            <motion.div
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeOut",
              }}
              className="absolute inset-0 border-4 border-primary rounded-full"
            />
          </motion.div>

          <h2 className="text-2xl mb-2 text-foreground">Anonymous User</h2>
          <p className="text-muted-foreground mb-2">Voice Call</p>
          <p className="text-primary text-lg">{formatDuration(callDuration)}</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md mb-12"
      >
        <div className="flex items-center justify-center gap-6">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsMuted(!isMuted)}
            className={`p-6 rounded-full shadow-xl transition-all ${
              isMuted
                ? "bg-destructive text-white"
                : "bg-glass-bg backdrop-blur-xl border border-glass-border text-foreground"
            }`}
          >
            {isMuted ? (
              <MicOff className="w-7 h-7" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleEndCall}
            className="p-8 bg-destructive rounded-full shadow-2xl shadow-destructive/50"
          >
            <PhoneOff className="w-8 h-8 text-white" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsSpeakerOn(!isSpeakerOn)}
            className={`p-6 rounded-full shadow-xl transition-all ${
              isSpeakerOn
                ? "bg-primary text-white"
                : "bg-glass-bg backdrop-blur-xl border border-glass-border text-foreground"
            }`}
          >
            {isSpeakerOn ? (
              <Volume2 className="w-7 h-7" />
            ) : (
              <VolumeX className="w-7 h-7" />
            )}
          </motion.button>
        </div>

        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            {isMuted ? "Microphone is muted" : "Microphone is on"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isSpeakerOn ? "Speaker is on" : "Speaker is off"}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
