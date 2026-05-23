import { motion } from "motion/react";
import { Button } from "../components/Button";
import { useNavigate } from "react-router";
import { Heart, Shield, MessageCircle, Sparkles, Zap, Users } from "lucide-react";
import { GlassCard } from "../components/GlassCard";

export function WelcomeScreen() {
  const navigate = useNavigate();

  const features = [
    {
      icon: MessageCircle,
      text: "Anonymous conversations",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Heart,
      text: "Emotional connections",
      gradient: "from-pink-500 to-rose-500"
    },
    {
      icon: Shield,
      text: "Safe & private",
      gradient: "from-purple-500 to-violet-500"
    },
    {
      icon: Sparkles,
      text: "Real-time matching",
      gradient: "from-amber-500 to-orange-500"
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 pb-12 relative overflow-hidden">
      {/* Animated Background Blobs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, -30, 0],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-10 left-10 w-72 h-72 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          x: [0, -50, 0],
          y: [0, 50, 0],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full blur-3xl"
      />

      {/* Floating Sparkles */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -40, 0],
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.3,
          }}
          className="absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        >
          <Sparkles className="w-4 h-4 text-primary" />
        </motion.div>
      ))}

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md relative z-10">
        {/* Hero Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 1 }}
          className="mb-8"
        >
          <motion.div
            animate={{
              rotate: 360,
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear",
            }}
            className="absolute w-32 h-32 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-full blur-2xl opacity-40"
          />
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 p-8 rounded-3xl shadow-2xl"
          >
            <MessageCircle className="w-16 h-16 text-white" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <motion.h1
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="text-6xl md:text-7xl mb-6"
          >
            <span className="block bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Talk Freely.
            </span>
            <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Stay Anonymous.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl md:text-2xl text-muted-foreground mt-4"
          >
            Find someone who understands you.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full space-y-3 mb-12"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
              >
                <GlassCard className="p-5 border-2 border-glass-border hover:border-primary/30 transition-all group">
                  <div className="flex items-center gap-4">
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className={`bg-gradient-to-br ${feature.gradient} p-4 rounded-xl shadow-lg group-hover:shadow-2xl transition-all`}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </motion.div>
                    <span className="text-lg text-foreground">{feature.text}</span>
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1, x: 5 }}
                      className="ml-auto"
                    >
                      <Zap className="w-5 h-5 text-primary" />
                    </motion.div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Social Proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex items-center gap-2 text-muted-foreground mb-8"
        >
          <Users className="w-5 h-5" />
          <span className="text-sm">10,000+ people online now</span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="w-full max-w-md space-y-4 relative z-10"
      >
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="gradient"
            size="lg"
            className="w-full text-xl shadow-2xl shadow-primary/50"
            onClick={() => navigate("/onboarding")}
          >
            <Sparkles className="w-6 h-6" />
            Start Talking
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="outline"
            size="lg"
            className="w-full text-xl border-2"
            onClick={() => navigate("/home")}
          >
            Learn More
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
