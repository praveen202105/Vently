import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { useState, useRef, useEffect } from "react";
import { Send, Phone, MoreVertical, Smile, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router";

interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: Date;
}

export function ChatScreen() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hey! How's your evening going?",
      sender: "other",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showEndChatDialog, setShowEndChatDialog] = useState(false);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: input,
        sender: "me",
        timestamp: new Date(),
      };
      setMessages([...messages, newMessage]);
      setInput("");

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const responses = [
          "That's interesting! Tell me more.",
          "I totally understand how you feel.",
          "Same here! What else is on your mind?",
          "That's really cool!",
        ];
        const response: Message = {
          id: (Date.now() + 1).toString(),
          text: responses[Math.floor(Math.random() * responses.length)],
          sender: "other",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, response]);
      }, 2000);
    }
  };

  const handleEndChat = () => {
    setShowEndChatDialog(false);
    setShowReconnectDialog(true);
  };

  const handleReconnect = () => {
    setShowReconnectDialog(false);
    setMessages([
      {
        id: "reconnect",
        text: "Hey again! Nice to reconnect with you!",
        sender: "other",
        timestamp: new Date(),
      },
    ]);
  };

  const handleSkip = () => {
    setShowReconnectDialog(false);
    navigate("/mood");
  };

  return (
    <div className="h-screen flex flex-col bg-background md:ml-64">
      <header className="bg-glass-bg backdrop-blur-xl border-b border-glass-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg">
            <span className="text-white text-sm">A</span>
          </div>
          <div>
            <h2 className="text-foreground">Anonymous User</h2>
            <p className="text-xs text-muted-foreground">
              {isTyping ? "typing..." : "online"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/voice-call")}
          >
            <Phone className="w-5 h-5" />
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <MoreVertical className="w-5 h-5 text-muted-foreground" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content className="bg-popover backdrop-blur-xl border border-glass-border rounded-xl p-2 shadow-xl z-50">
                <DropdownMenu.Item
                  className="px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer outline-none"
                  onClick={() => setShowEndChatDialog(true)}
                >
                  End Chat
                </DropdownMenu.Item>
                <DropdownMenu.Item className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg cursor-pointer outline-none">
                  Report User
                </DropdownMenu.Item>
                <DropdownMenu.Item className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg cursor-pointer outline-none">
                  Block User
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 md:pb-4">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${
              message.sender === "me" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[75%] md:max-w-[60%] ${
                message.sender === "me"
                  ? "bg-gradient-to-br from-primary to-secondary text-white"
                  : "bg-glass-bg backdrop-blur-xl border border-glass-border text-foreground"
              } px-4 py-3 rounded-2xl shadow-lg`}
            >
              <p>{message.text}</p>
              <p className="text-xs mt-1 opacity-70">
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-glass-bg backdrop-blur-xl border border-glass-border px-4 py-3 rounded-2xl">
              <div className="flex gap-1">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="w-2 h-2 bg-primary rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-secondary rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-accent rounded-full"
                />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="fixed md:ml-64 bottom-16 md:bottom-0 left-0 right-0 bg-glass-bg backdrop-blur-xl border-t border-glass-border p-4">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <Smile className="w-6 h-6 text-muted-foreground" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 bg-input rounded-xl border border-glass-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground"
          />

          <Button variant="gradient" size="sm" onClick={handleSend}>
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <Dialog.Root open={showEndChatDialog} onOpenChange={setShowEndChatDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md">
            <GlassCard className="p-6">
              <Dialog.Title className="text-xl mb-4">End Chat?</Dialog.Title>
              <Dialog.Description className="text-muted-foreground mb-6">
                Are you sure you want to end this conversation?
              </Dialog.Description>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowEndChatDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="gradient"
                  className="flex-1"
                  onClick={handleEndChat}
                >
                  End Chat
                </Button>
              </div>
            </GlassCard>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={showReconnectDialog}
        onOpenChange={setShowReconnectDialog}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md">
            <GlassCard className="p-6">
              <Dialog.Title className="text-xl mb-4 text-center">
                Connect Again?
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground mb-6 text-center">
                Would you like to save this connection and chat again later?
              </Dialog.Description>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleSkip}>
                  Skip
                </Button>
                <Button
                  variant="gradient"
                  className="flex-1"
                  onClick={handleReconnect}
                >
                  Connect Again
                </Button>
              </div>
            </GlassCard>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
