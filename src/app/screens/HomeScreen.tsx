import { motion } from "motion/react";
import { Button } from "../components/Button";
import { GlassCard } from "../components/GlassCard";
import { useNavigate } from "react-router";
import { Heart, Shield, MessageCircle, Sparkles, Users, Moon, Zap, Star } from "lucide-react";

export function HomeScreen() {
  const navigate = useNavigate();

  const features = [
    {
      icon: MessageCircle,
      title: "Anonymous Chats",
      description: "Connect without revealing your identity",
      gradient: "from-blue-500 via-cyan-500 to-blue-600",
    },
    {
      icon: Heart,
      title: "Emotional Support",
      description: "Find someone who truly understands",
      gradient: "from-pink-500 via-rose-500 to-pink-600",
    },
    {
      icon: Shield,
      title: "Safe & Private",
      description: "Your conversations are secure",
      gradient: "from-purple-500 via-violet-500 to-purple-600",
    },
    {
      icon: Sparkles,
      title: "Instant Matching",
      description: "Connect with someone in seconds",
      gradient: "from-amber-500 via-yellow-500 to-amber-600",
    },
    {
      icon: Users,
      title: "Build Connections",
      description: "Save your favorite chat partners",
      gradient: "from-emerald-500 via-green-500 to-emerald-600",
    },
    {
      icon: Moon,
      title: "24/7 Available",
      description: "Someone is always there to talk",
      gradient: "from-indigo-500 via-blue-500 to-indigo-600",
    },
  ];

  return (
    <div className="min-h-screen p-6 pb-24 md:pb-6 md:ml-64 relative overflow-hidden">
      {/* Animated Background Gradients */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full blur-3xl"
      />

      {/* Floating Particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
          }}
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-6xl mx-auto"
      >
        {/* Hero Section */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 1 }}
            className="inline-block mb-6"
          >
            <div className="relative">
              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute inset-0 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-full blur-2xl opacity-50"
              />
              <div className="relative bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 p-6 rounded-3xl shadow-2xl">
                <MessageCircle className="w-16 h-16 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-6xl md:text-7xl lg:text-8xl mb-6"
          >
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent font-bold">
              Vently
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl md:text-3xl mb-4 text-foreground"
          >
            Talk Freely. Stay Anonymous.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Your safe space for anonymous emotional conversations. Connect with real people who understand you.
          </motion.p>
        </div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col md:flex-row gap-4 justify-center mb-20"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="gradient"
              size="lg"
              className="w-full md:w-auto px-12 text-xl shadow-2xl shadow-primary/50"
              onClick={() => navigate("/mood")}
            >
              <Sparkles className="w-6 h-6" />
              Start Talking Now
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              size="lg"
              className="w-full md:w-auto px-12 text-xl border-2"
            >
              <Zap className="w-6 h-6" />
              Learn More
            </Button>
          </motion.div>
        </motion.div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-3 gap-4 md:gap-8 mb-20 max-w-3xl mx-auto"
        >
          {[
            { number: "10K+", label: "Active Users" },
            { number: "50K+", label: "Conversations" },
            { number: "24/7", label: "Available" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className="text-center"
            >
              <GlassCard className="p-6 border-2 border-glass-border hover:border-primary/50 transition-all">
                <motion.p
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                  className="text-3xl md:text-4xl bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent mb-2"
                >
                  {stat.number}
                </motion.p>
                <p className="text-sm md:text-base text-muted-foreground">
                  {stat.label}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>

        {/* Features Grid */}
        <div className="mb-16">
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-4xl md:text-5xl text-center mb-12 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent"
          >
            Why Choose Vently?
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <GlassCard className="p-6 h-full border-2 border-glass-border hover:border-primary/30 transition-all group">
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                      transition={{ duration: 0.5 }}
                      className={`bg-gradient-to-br ${feature.gradient} p-5 rounded-2xl inline-block mb-4 shadow-lg group-hover:shadow-2xl transition-all`}
                    >
                      <Icon className="w-7 h-7 text-white" />
                    </motion.div>
                    <h3 className="text-xl mb-3 text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground">
                      {feature.description}
                    </p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="mt-20"
        >
          <GlassCard className="p-8 md:p-12 border-2 border-glass-border overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl text-center mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                How It Works
              </h2>
              <p className="text-center text-muted-foreground mb-12">
                Get started in just 3 simple steps
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    step: "1",
                    title: "Choose Your Vibe",
                    description: "Select your mood and what you want to talk about",
                    icon: Heart,
                  },
                  {
                    step: "2",
                    title: "Get Matched",
                    description: "We connect you with someone who shares your vibe",
                    icon: Sparkles,
                  },
                  {
                    step: "3",
                    title: "Start Chatting",
                    description: "Build meaningful connections anonymously",
                    icon: MessageCircle,
                  },
                ].map((item, i) => {
                  const StepIcon = item.icon;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.4 + i * 0.2 }}
                      className="text-center"
                    >
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className="relative inline-block mb-4"
                      >
                        <div className="w-20 h-20 bg-gradient-to-br from-primary via-secondary to-accent rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-primary/50">
                          <StepIcon className="w-10 h-10 text-white" />
                        </div>
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white text-sm">{item.step}</span>
                        </div>
                      </motion.div>
                      <h3 className="text-xl mb-3 text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-muted-foreground">
                        {item.description}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8 }}
          className="mt-20 text-center"
        >
          <GlassCard className="p-12 border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5">
            <Star className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Ready to Connect?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of people having meaningful conversations right now
            </p>
            <Button
              variant="gradient"
              size="lg"
              className="px-16 text-xl shadow-2xl shadow-primary/50"
              onClick={() => navigate("/mood")}
            >
              <Sparkles className="w-6 h-6" />
              Start Your Journey
            </Button>
          </GlassCard>
        </motion.div>
      </motion.div>
    </div>
  );
}
