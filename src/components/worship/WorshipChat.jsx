import React, { useState, useEffect, useRef, useCallback } from "react";
import { keryx } from "@/api/keryxClient";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Link2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const NOTIFICATION_SOUND = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export default function WorshipChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [unread, setUnread] = useState(0);
    const [input, setInput] = useState("");
    const [senderName, setSenderName] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const audioRef = useRef(null);
    const { toast } = useToast();
    const isOpenRef = useRef(false);
    const knownIdsRef = useRef(new Set());

    useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

    // Load current user name
    useEffect(() => {
        keryx.auth.me()
            .then(u => setSenderName(u?.full_name || u?.email?.split("@")[0] || ""))
            .catch(() => {});
    }, []);

    // Load initial messages
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const result = await keryx.entities.ChatMessage.filter(
                    { channel: "worship" },
                    { sort: "created_date", limit: 50 }
                );
                const items = result.items || result;
                setMessages(items);
                items.forEach(m => knownIdsRef.current.add(m.id));
            } catch (e) {
                console.error("Erro ao carregar mensagens:", e);
            } finally {
                setLoading(false);
            }
        };
        loadMessages();
    }, []);

    // Real-time subscription
    useEffect(() => {
        const unsubscribe = keryx.entities.ChatMessage.subscribe((event) => {
            if (event.type === "create" && event.data?.channel === "worship") {
                const msg = event.data;
                if (knownIdsRef.current.has(msg.id)) return;
                knownIdsRef.current.add(msg.id);
                setMessages(prev => [...prev, msg]);

                if (!isOpenRef.current) {
                    setUnread(prev => prev + 1);
                    // Play notification sound
                    try {
                        const audio = new Audio(NOTIFICATION_SOUND);
                        audio.volume = 0.5;
                        audio.play().catch(() => {});
                    } catch (e) {}
                    // Show toast
                    toast({
                        title: `🎵 ${msg.sender_name || "Equipe de Louvor"}`,
                        description: msg.message?.slice(0, 80) || "Nova mensagem",
                    });
                }
            }
        });
        return unsubscribe;
    }, [toast]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || !senderName.trim() || sending) return;

        setSending(true);
        try {
            const created = await keryx.entities.ChatMessage.create({
                sender_name: senderName.trim(),
                message: text,
                channel: "worship",
            });
            knownIdsRef.current.add(created.id);
            setMessages(prev => [...prev, created]);
            setInput("");
        } catch (e) {
            toast({
                title: "Erro ao enviar mensagem",
                description: e?.message || "Tente novamente.",
                variant: "destructive",
            });
        } finally {
            setSending(false);
        }
    }, [input, senderName, sending, toast]);

    const handleOpen = () => {
        setIsOpen(true);
        setUnread(0);
    };

    const extractUrl = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex);
    };

    return (
        <>
            {/* Floating button */}
            <motion.button
                onClick={handleOpen}
                className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all"
                style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
                whileTap={{ scale: 0.9 }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
            >
                <MessageCircle className="w-6 h-6 text-white" />
                {unread > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center"
                    >
                        {unread > 9 ? "9+" : unread}
                    </motion.span>
                )}
                {unread > 0 && (
                    <motion.span
                        className="absolute inset-0 rounded-full border-2 border-red-400"
                        animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    />
                )}
            </motion.button>

            {/* Chat panel */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/50 z-40"
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 250 }}
                            className="fixed top-0 right-0 bottom-0 w-full max-w-sm z-50 bg-card border-l border-border flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/20 to-accent/20">
                                <div className="flex items-center gap-2">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
                                        <Music className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white text-sm">Chat da Equipe</h3>
                                        <p className="text-xs text-muted-foreground">Envie links de músicas em tempo real</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                                {loading ? (
                                    <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
                                ) : messages.length === 0 ? (
                                    <div className="text-center text-muted-foreground text-sm py-8">
                                        <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p>Nenhuma mensagem ainda</p>
                                        <p className="text-xs mt-1">A equipe pode enviar links de músicas aqui</p>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        const urls = extractUrl(msg.message || "");
                                        const isMe = msg.sender_name === senderName;
                                        return (
                                            <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                                                {!isMe && (
                                                    <span className="text-xs text-muted-foreground mb-1 px-1">{msg.sender_name}</span>
                                                )}
                                                <div
                                                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm chat-message-text ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                                                    style={isMe ? { background: "linear-gradient(135deg, var(--primary), var(--accent))" } : {}}
                                                >
                                                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                                                    {urls && urls.length > 0 && (
                                                        <div className="mt-1 space-y-1">
                                                            {urls.map((url, i) => (
                                                                <a
                                                                    key={i}
                                                                    href={url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1 text-xs underline opacity-90 hover:opacity-100"
                                                                >
                                                                    <Link2 className="w-3 h-3" />
                                                                    Abrir link
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                                                    {msg.created_date ? new Date(msg.created_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-3 border-t border-border space-y-2">
                                <input
                                    type="text"
                                    placeholder="Seu nome"
                                    value={senderName}
                                    onChange={(e) => setSenderName(e.target.value)}
                                    className="w-full h-8 rounded-lg bg-background border border-border px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Digite um link de música ou mensagem..."
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        className="flex-1 h-10 rounded-lg bg-background border border-border px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    <Button
                                        onClick={handleSend}
                                        disabled={!input.trim() || !senderName.trim() || sending}
                                        size="icon"
                                        className="h-10 w-10 shrink-0"
                                        style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}