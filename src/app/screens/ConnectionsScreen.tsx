import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { useNavigate } from "react-router";
import { MessageCircle, Circle } from "lucide-react";

interface Connection {
  id: string;
  nickname: string;
  lastMessage: string;
  timestamp: string;
  isOnline: boolean;
}

export function ConnectionsScreen() {
  const navigate = useNavigate();

  const connections: Connection[] = [
    {
      id: "1",
      nickname: "Anonymous User",
      lastMessage: "That was a great conversation!",
      timestamp: "2 min ago",
      isOnline: true,
    },
    {
      id: "2",
      nickname: "Night Owl",
      lastMessage: "Thanks for the advice",
      timestamp: "1 hour ago",
      isOnline: true,
    },
    {
      id: "3",
      nickname: "Dreamer",
      lastMessage: "See you next time!",
      timestamp: "Yesterday",
      isOnline: false,
    },
    {
      id: "4",
      nickname: "Listener",
      lastMessage: "I really needed that talk",
      timestamp: "2 days ago",
      isOnline: false,
    },
  ];

  return (
    <div className="min-h-screen p-6 pb-24 md:pb-6 md:ml-64 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(99,102,241,0.1),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-2xl mx-auto"
      >
        <div className="mb-6">
          <h1 className="text-3xl bg-gradient-to-r from-gradient-purple via-gradient-pink to-gradient-blue bg-clip-text text-transparent">
            Your Connections
          </h1>
          <p className="text-muted-foreground mt-1">
            {connections.filter((c) => c.isOnline).length} online
          </p>
        </div>

        {connections.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No connections yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Start a conversation to make your first connection!
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {connections.map((connection, index) => (
              <motion.div
                key={connection.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <GlassCard
                  hover
                  onClick={() => navigate("/chat")}
                  className="p-4 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white">
                          {connection.nickname[0]}
                        </span>
                      </div>
                      {connection.isOnline && (
                        <Circle className="absolute bottom-0 right-0 w-4 h-4 fill-green-500 text-green-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-foreground truncate">
                          {connection.nickname}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          {connection.timestamp}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {connection.lastMessage}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
