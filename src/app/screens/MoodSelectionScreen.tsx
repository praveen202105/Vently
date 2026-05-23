import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { useNavigate } from "react-router";
import { Heart, MessageCircle, Moon, Lightbulb, Flame, Mic, Users, Sparkles } from "lucide-react";

export function MoodSelectionScreen() {
  const navigate = useNavigate();

  const moods = [
    { icon: Heart, label: "Feeling lonely", color: "from-purple-500 via-purple-600 to-pink-500", emoji: "💜" },
    { icon: MessageCircle, label: "Need someone to talk", color: "from-blue-500 via-blue-600 to-cyan-500", emoji: "💬" },
    { icon: Users, label: "Friendship", color: "from-pink-500 via-pink-600 to-rose-500", emoji: "🤝" },
    { icon: Moon, label: "Late night talk", color: "from-indigo-500 via-indigo-600 to-purple-500", emoji: "🌙" },
    { icon: Lightbulb, label: "Relationship advice", color: "from-amber-500 via-amber-600 to-orange-500", emoji: "💡" },
    { icon: Flame, label: "Flirty chat", color: "from-rose-500 via-rose-600 to-pink-500", emoji: "🔥" },
    { icon: Mic, label: "Voice only", color: "from-violet-500 via-violet-600 to-purple-500", emoji: "🎙️" },
  ];

  const handleMoodSelect = (mood: string) => {
    localStorage.setItem("vently_mood", mood);
    navigate("/matching");
  };

  return (
    <div className="min-h-screen p-6 pb-24 relative overflow-hidden">
      {/* Animated Background */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-20 right-20 w-96 h-96 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full blur-3xl"
      />

      {/* Floating Hearts */}
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -100, -200],
            opacity: [0, 0.5, 0],
            x: [0, Math.random() * 50 - 25, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: i * 0.5,
          }}
          className="absolute text-2xl"
          style={{
            left: `${Math.random() * 100}%`,
            bottom: 0,
          }}
        >
          {["💜", "💙", "💗", "✨", "💫"][Math.floor(Math.random() * 5)]}
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-3xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="inline-block mb-4"
          >
            <Sparkles className="w-16 h-16 text-primary mx-auto" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-6xl mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent"
          >
            What's on your mind?
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-muted-foreground"
          >
            Choose what you're looking for right now
          </motion.p>
        </div>

        {/* Mood Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {moods.map((mood, index) => {
            const Icon = mood.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.08 }}
                whileHover={{ scale: 1.03, y: -5 }}
                whileTap={{ scale: 0.97 }}
              >
                <GlassCard
                  hover
                  onClick={() => handleMoodSelect(mood.label)}
                  className="p-6 cursor-pointer group border-2 border-glass-border hover:border-primary/30 transition-all relative overflow-hidden"
                >
                  {/* Gradient Background on Hover */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 0.1 }}
                    className={`absolute inset-0 bg-gradient-to-br ${mood.color}`}
                  />

                  <div className="relative flex items-center gap-5">
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className={`bg-gradient-to-br ${mood.color} p-5 rounded-2xl shadow-xl group-hover:shadow-2xl transition-all`}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </motion.div>

                    <div className="flex-1">
                      <h3 className="text-xl text-foreground mb-1">
                        {mood.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Connect instantly
                      </p>
                    </div>

                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: index * 0.2,
                      }}
                      className="text-3xl"
                    >
                      {mood.emoji}
                    </motion.div>
                  </div>

                  {/* Shine Effect */}
                  <motion.div
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "200%" }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    style={{ width: "50%" }}
                  />
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-12 text-center"
        >
          <GlassCard className="p-6 border-2 border-primary/20">
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Users className="w-5 h-5 text-primary" />
              <span>2,847 people are waiting to connect right now</span>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </div>
  );
}
