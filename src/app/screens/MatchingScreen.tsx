import { motion } from "motion/react";
import { Button } from "../components/Button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Sparkles } from "lucide-react";

export function MatchingScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"searching" | "found">("searching");

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus("found");
      setTimeout(() => {
        navigate("/chat");
      }, 1500);
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.15),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10 flex flex-col items-center"
      >
        {status === "searching" ? (
          <>
            <div className="relative mb-8">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent rounded-full blur-3xl"
              />

              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="relative w-32 h-32 border-4 border-primary/30 border-t-primary rounded-full"
              />

              <motion.div
                animate={{
                  scale: [1, 0.8, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-primary to-secondary p-6 rounded-full"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
            </div>

            <motion.h2
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-2xl mb-2 text-center bg-gradient-to-r from-gradient-purple via-gradient-pink to-gradient-blue bg-clip-text text-transparent"
            >
              Finding someone special...
            </motion.h2>
            <p className="text-muted-foreground mb-8">This won't take long</p>

            <Button variant="outline" onClick={() => navigate("/mood")}>
              Cancel Search
            </Button>
          </>
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="text-center"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 0.5,
                repeat: 2,
              }}
              className="bg-gradient-to-br from-primary via-secondary to-accent p-8 rounded-full mb-6 inline-block shadow-2xl shadow-primary/50"
            >
              <Sparkles className="w-12 h-12 text-white" />
            </motion.div>

            <h2 className="text-3xl mb-2 bg-gradient-to-r from-gradient-purple to-gradient-pink bg-clip-text text-transparent">
              Match Found!
            </h2>
            <p className="text-muted-foreground">Connecting you now...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
