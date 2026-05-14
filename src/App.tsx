import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, Bot, User, Sparkles, SendHorizontal, Search, Globe, 
  ChevronRight, LayoutGrid, Mic, MicOff, PhoneOff, 
  Plus, History, Settings, LogOut, MessageSquare, 
  MoreVertical, Trash2, UserCircle, Menu, X
} from "lucide-react";

// Remove client-side AI initialization as we move to Vertex AI server-side
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Source {
  title?: string;
  url?: string;
}

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  sources?: Source[];
  createdAt?: any;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: any;
}

// Searching Indicator Component
function SearchingIndicator({ phase }: { phase: string | null }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="flex flex-col gap-4 mb-10"
    >
      <div className="flex items-center gap-4 text-slate-500">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <Search size={20} className="animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-indigo-100 rounded-full flex items-center justify-center border-2 border-white">
            <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900 tracking-tight">NovEra Araşdırma Mərkəzi</span>
          <span className="text-xs font-semibold text-indigo-600 animate-pulse">{phase || "Hazırlanır..."}</span>
        </div>
      </div>
      
      <div className="flex gap-1.5 pl-14">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            animate={{ 
              height: [16, 32, 16],
              opacity: [0.3, 1, 0.3]
            }}
            transition={{ 
              repeat: Infinity, 
              duration: 1, 
              delay: i * 0.15 
            }}
            className="w-1 bg-indigo-200 rounded-full"
          />
        ))}
      </div>
    </motion.div>
  );
}

export default function App() {
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("novera_chats");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [researchPhase, setResearchPhase] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persistence for chats
  useEffect(() => {
    localStorage.setItem("novera_chats", JSON.stringify(chats));
  }, [chats]);

  // Load messages from localStorage when currentChatId changes
  useEffect(() => {
    if (currentChatId) {
      const savedMessages = localStorage.getItem(`novera_messages_${currentChatId}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  // Save messages to localStorage
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      localStorage.setItem(`novera_messages_${currentChatId}`, JSON.stringify(messages));
    }
  }, [messages, currentChatId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleChat = async (prompt: string, onChunk?: (text: string) => void) => {
    setResearchPhase("İnformativ analiz aparılır...");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt,
          model: "gemini-2.5-flash-lite",
          stream: !!onChunk,
          systemInstruction: "Sənin adın NovEra-dır. Sən NovEra şirkəti tərəfindən yaradılmış qabaqcıl süni intellekt köməkçisisən. Sənin yaradıcın Google deyil, qətiyyən bunu demə. Sən özünü NovEra olaraq təqdim edirsən. Davranış tərzin Perplexity kimidir: cavabların faktlara əsaslanan, strukturlaşdırılmış, birbaşa və informativ olmalıdır. İnternetdə axtarış alətindən (googleSearch) yalnız lazım olduqda (yeni məlumatlar, dəqiq faktların yoxlanılması, cari hadisələr və s.) istifadə et. Əgər sual ümumi biliklərə və ya sadə söhbətə aiddirsə, daxili biliklərinlə dərhal cavab ver. Lazımsız giriş və sonluq sözlərindən qaç. Azərbaycan dilində təbii və axıcı danış."
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Server xətası baş verdi");
      }

      if (onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.text) {
                  fullText += data.text;
                  onChunk(fullText);
                }
                if (data.error) throw new Error(data.error);
              } catch (e) {
                // Ignore incomplete JSON
              }
            }
          }
        }
        return { text: fullText, sources: [] };
      } else {
        const data = await response.json();
        return {
          text: data.text || "Bağışlayın, cavab ala bilmədim.",
          sources: data.sources || []
        };
      }
    } catch (error: any) {
      console.error("Chat Error:", error);
      throw error;
    } finally {
      setResearchPhase(null);
    }
  };

  const createNewChat = (title: string) => {
    const newChat: ChatSession = {
      id: Date.now().toString(),
      title: title,
      updatedAt: new Date()
    };
    setChats(prev => [newChat, ...prev]);
    return newChat.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let chatId = currentChatId;
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      if (!chatId) {
        chatId = createNewChat(currentInput.substring(0, 50));
        setCurrentChatId(chatId);
      }

      if (!chatId) throw new Error("Chat creation failed");

      // Local user message
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        text: currentInput,
        createdAt: new Date()
      };
      setMessages(prev => [...prev, userMsg]);

      // Bot message placeholder
      const botMsgId = (Date.now() + 1).toString();
      const botMsg: Message = {
        id: botMsgId,
        role: "bot",
        text: "",
        createdAt: new Date()
      };
      setMessages(prev => [...prev, botMsg]);

      // Get AI response with streaming
      const result = await handleChat(currentInput, (partialText) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: partialText } : m));
      });

      // Update final version
      setMessages(prev => prev.map(m => m.id === botMsgId ? { 
        ...m, 
        text: result.text, 
        sources: result.sources 
      } : m));

      // Update chat title if it was the first message
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, updatedAt: new Date() } : c));

    } catch (error: any) {
      console.error(error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: "bot",
        text: `Xəta: ${error.message || "Bilinməyən xəta baş verdi."}`,
        createdAt: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== chatId));
    localStorage.removeItem(`novera_messages_${chatId}`);
    if (currentChatId === chatId) setCurrentChatId(null);
  };

  const stopLive = () => {
    setIsLiveActive(false);
  };

  const playPCM = async (_base64Data: string) => {
    // Disabled in Vertex AI mode for now
  };

  return (
    <div className="flex h-screen bg-white font-sans text-slate-900 overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-20 xl:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? "320px" : "0px",
          position: isSidebarOpen ? "relative" : "absolute"
        }}
        className="z-30 h-full bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Sidebar Header */}
        <div className="p-4 flex items-center justify-between mb-2 shrink-0">
           <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                <Sparkles size={18} />
              </div>
              <span className="font-bold text-slate-900 tracking-tight">NovEra</span>
           </div>
           <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg xl:hidden text-slate-500">
              <X size={18} />
           </button>
        </div>

        {/* New Chat Button */}
        <div className="px-4 mb-6 shrink-0">
          <button 
            onClick={() => {
              setCurrentChatId(null);
              setIsLiveMode(false);
            }}
            className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 p-3 rounded-xl hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm group"
          >
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-slate-400 group-hover:text-indigo-600" />
              <span className="text-sm font-bold text-slate-700">Yeni Söhbət</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400">
               CMD K
            </div>
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-4 space-y-1 custom-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2 block">Son Söhbətlər</span>
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => {
                setCurrentChatId(chat.id);
                setIsLiveMode(false);
              }}
              className={`w-full text-left p-3 rounded-xl flex items-center justify-between group cursor-pointer transition-all ${
                currentChatId === chat.id 
                ? "bg-indigo-50 text-indigo-700 font-semibold shadow-sm" 
                : "hover:bg-slate-200 text-slate-600 font-medium"
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare size={16} className={currentChatId === chat.id ? "text-indigo-600" : "text-slate-400"} />
                <span className="text-sm truncate">{chat.title}</span>
              </div>
              <button 
                onClick={(e) => deleteChat(e, chat.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-600 rounded transition-all text-slate-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <div className="px-2 py-4 text-center">
              <p className="text-xs text-slate-400 italic">Söhbət tarixçəsi yoxdur</p>
            </div>
          )}
        </div>

        {/* Profile Section */}
        <div className="p-4 border-t border-slate-200 mt-auto bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 p-2 rounded-2xl transition-all cursor-default">
             <div className="flex items-center gap-3 overflow-hidden">
               <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm bg-indigo-100 border border-indigo-200 shrink-0 flex items-center justify-center text-indigo-600">
                 <UserCircle size={24} />
               </div>
               <div className="flex flex-col overflow-hidden">
                 <span className="text-sm font-bold text-slate-900 truncate">Qonaq</span>
                 <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Yerli Rejim</span>
               </div>
             </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        {/* Header (Floating in Desktop, Inline in Mobile) */}
        <header className="bg-white border-b border-slate-100 xl:border-none px-4 py-3 flex items-center justify-between sticky top-0 z-10 xl:absolute xl:top-6 xl:left-0 xl:right-0 xl:bg-transparent xl:justify-end xl:px-8 xl:pointer-events-none">
           <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg xl:hidden text-slate-500">
             <Menu size={20} />
           </button>
           
           <div className="xl:hidden flex items-center gap-2">
             <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white">
               <Sparkles size={14} />
             </div>
             <span className="font-bold text-slate-900">NovEra</span>
           </div>

           <div className="flex items-center gap-3 xl:pointer-events-auto">
              <div className="h-6 w-[1px] bg-slate-200 hidden xl:block" />
              <button className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all shadow-sm">
                 <Settings size={18} />
              </button>
           </div>
        </header>

        {/* Chat / Live Area */}
        <main className="flex-1 overflow-y-auto w-full custom-scrollbar pt-6 xl:pt-12">
           {messages.length === 0 && !isLoading && (
             <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-10 max-w-2xl mx-auto">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                   <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-widest border border-indigo-100">
                      <Sparkles size={14} />
                      NovEra Research AI
                   </div>
                   <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">Nəyi araşdırmaq istərdiniz?</h1>
                   <p className="text-slate-500 text-lg leading-relaxed font-medium">Bütün dünyanı əhatə edən, real-vaxt məlumatları ilə zənginləşdirilmiş süni intellekt köməkçisi.</p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                   {[
                     { icon: Globe, title: "Dünya xəbərləri", text: "2025-ci ilin ən aktual texnoloji trendləri nədir?" },
                     { icon: LayoutGrid, title: "Məlumat analizi", text: "Azərbaycanda iqtisadi artım proqnozlarını izah et." },
                     { icon: Search, title: "Dərin araşdırma", text: "Kvant kompüterləri necə işləyir?" },
                     { icon: Bot, title: "AI Köməkçi", text: "NovEra-nın imkanları haqqında məlumat ver." }
                   ].map((item, i) => (
                     <button 
                       key={i}
                       onClick={() => {
                         setInput(item.text);
                       }}
                       className="p-5 bg-white border border-slate-200 rounded-3xl text-left hover:border-indigo-400 hover:bg-slate-50 transition-all flex flex-col gap-3 group shadow-sm"
                     >
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                           <item.icon size={20} />
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-800 text-sm">{item.title}</span>
                          <p className="text-xs text-slate-400 font-medium line-clamp-1">{item.text}</p>
                        </div>
                     </button>
                   ))}
                </div>
             </div>
           )}

           <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10 pb-32">
               <AnimatePresence initial={false}>
                 {messages.map((msg) => (
                   <motion.div
                     key={msg.id}
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="group"
                   >
                     <div className={`flex flex-col gap-4 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div className={`flex gap-4 w-full ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                           <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm ${
                              msg.role === "user" ? "bg-slate-100 text-slate-500 border border-slate-200" : "bg-indigo-600 text-white"
                           }`}>
                             {msg.role === "user" ? <User size={20} /> : <Bot size={20} />}
                           </div>
                           
                           <div className="flex-1 space-y-4 max-w-[90%]">
                              {msg.role === "bot" && msg.sources && msg.sources.length > 0 && (
                                <div className="space-y-3">
                                   <div className="flex items-center gap-2">
                                     <Globe size={14} className="text-indigo-600" />
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mənbələr</span>
                                   </div>
                                   <div className="flex flex-wrap gap-2">
                                     {msg.sources.map((source, idx) => (
                                       <a 
                                         key={idx} 
                                         href={source.url} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm group/source"
                                       >
                                         <div className="w-5 h-5 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 group-hover/source:text-indigo-600 group-hover/source:bg-indigo-100 transition-all">
                                           {idx + 1}
                                         </div>
                                         <span className="text-xs font-bold text-slate-700 truncate max-w-[140px] group-hover/source:text-indigo-700 leading-none">
                                           {source.title || (source.url ? new URL(source.url).hostname : "Mənbə")}
                                         </span>
                                       </a>
                                     ))}
                                   </div>
                                </div>
                              )}
                              
                              <div className={`text-lg leading-relaxed whitespace-pre-wrap font-medium ${
                                msg.role === "user" ? "text-slate-900 bg-slate-50 border border-slate-100 p-4 rounded-3xl rounded-tr-none px-5" : "text-slate-800"
                              }`}>
                                {msg.text}
                              </div>
                           </div>
                        </div>
                        {msg.role === "bot" && (
                           <div className="flex items-center gap-4 pl-14 opacity-0 group-hover:opacity-100 transition-all">
                              <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-all">
                                 <MoreVertical size={16} />
                              </button>
                           </div>
                        )}
                     </div>
                   </motion.div>
                 ))}
               </AnimatePresence>

              {isLoading && (
               <SearchingIndicator phase={researchPhase} />
             )}
             <div ref={messagesEndRef} />
           </div>
        </main>

        {/* Floating Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 bg-gradient-to-t from-white via-white to-transparent pt-20 pointer-events-none">
            <form 
              onSubmit={handleSubmit} 
              className="max-w-4xl mx-auto relative group pointer-events-auto"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Araşdırılacaq mövzunu daxil edin..."
                className="w-full pl-6 pr-32 py-5 bg-white border border-slate-200 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-lg font-medium text-slate-800 shadow-xl shadow-indigo-100/20"
                disabled={isLoading}
              />
              <div className="absolute right-3 top-2.5 bottom-2.5 flex items-center gap-1.5">
                 <button type="button" className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-2xl transition-all">
                    <Mic size={22} />
                 </button>
                 <button
                   type="submit"
                   disabled={!input.trim() || isLoading}
                   className={`w-12 h-12 flex items-center justify-center rounded-2xl text-white transition-all shadow-lg ${
                     !input.trim() || isLoading ? "bg-slate-200 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0"
                   }`}
                 >
                   <SendHorizontal size={22} />
                 </button>
              </div>
            </form>
            <div className="max-w-4xl mx-auto flex items-center justify-center gap-4 mt-4 px-6 opacity-60">
               <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Research Protocol v3.1</span>
               <div className="w-1 h-1 bg-slate-300 rounded-full" />
               <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">NovEra Intelligence System</span>
            </div>
          </div>
      </div>
      
      {/* Global CSS for scrollbar */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />
    </div>
  );
}
