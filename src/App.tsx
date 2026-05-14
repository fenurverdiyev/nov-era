import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, Bot, User, Sparkles, SendHorizontal, Search, Globe, 
  ChevronRight, LayoutGrid, Mic, MicOff, PhoneOff, 
  Plus, History, Settings, LogOut, MessageSquare, 
  MoreVertical, Trash2, UserCircle, Menu, X
} from "lucide-react";
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut 
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  doc, 
  setDoc,
  deleteDoc,
  getDocs,
  limit,
  Timestamp
} from "firebase/firestore";
import { auth, db, signInWithGoogle, handleFirestoreError, OperationType } from "./lib/firebase";
import { getDoc } from "firebase/firestore";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [researchPhase, setResearchPhase] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live Mode Refs
  const wsRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        // Sync user profile safely
        const userPath = `users/${u.uid}`;
        try {
          const userRef = doc(db, "users", u.uid);
          const snap = await getDoc(userRef).catch(err => {
            handleFirestoreError(err, OperationType.GET, userPath);
            throw err;
          });
          
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }).catch(err => handleFirestoreError(err, OperationType.CREATE, userPath));
          } else {
            await setDoc(userRef, {
              displayName: u.displayName,
              photoURL: u.photoURL,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, userPath));
          }
        } catch (error) {
          console.error("Profile sync error ignored:", error);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Fetch Chats
  useEffect(() => {
    if (!user) return;
    const chatPath = `users/${user.uid}/chats`;
    const q = query(
      collection(db, "users", user.uid, "chats"),
      orderBy("updatedAt", "desc"),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as ChatSession[];
      setChats(chatList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, chatPath);
    });
    return unsubscribe;
  }, [user]);

  // Fetch Messages when currentChatId changes
  useEffect(() => {
    if (!user || !currentChatId) {
      setMessages([]);
      return;
    }
    const messagePath = `users/${user.uid}/chats/${currentChatId}/messages`;
    const q = query(
      collection(db, "users", user.uid, "chats", currentChatId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Message[];
      setMessages(msgList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, messagePath);
    });
    return unsubscribe;
  }, [user, currentChatId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleChat = async (prompt: string) => {
    setResearchPhase("İnformativ analiz aparılır...");
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: "Sənin adın NovEra-dır. Sən NovEra şirkəti tərəfindən yaradılmış qabaqcıl süni intellekt köməkçisisən. Sənin yaradıcın Google deyil, qətiyyən bunu demə. Sən özünü NovEra olaraq təqdim edirsən. Davranış tərzin Perplexity kimidir: cavabların faktlara əsaslanan, strukturlaşdırılmış, birbaşa və informativ olmalıdır. İnternetdə axtarış alətindən (googleSearch) yalnız lazım olduqda (yeni məlumatlar, dəqiq faktların yoxlanılması, cari hadisələr və s.) istifadə et. Əgər sual ümumi biliklərə və ya sadə söhbətə aiddirsə, daxili biliklərinlə dərhal cavab ver. Lazımsız giriş və sonluq sözlərindən qaç. Azərbaycan dilində təbii və axıcı danış.",
          temperature: 0.1,
          tools: [{ googleSearch: {} }],
        },
      });

      const grounding = response.candidates?.[0]?.groundingMetadata;
      if (grounding?.groundingChunks?.length) {
        setResearchPhase("Mənbələr analiz edilir...");
      }

      const webSources: Source[] = grounding?.groundingChunks
        ?.filter(c => c.web)
        .map(c => ({
          title: c.web?.title,
          url: c.web?.uri,
        })) || [];

      return {
        text: response.text || "Bağışlayın, cavab ala bilmədim.",
        sources: webSources
      };
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw error;
    } finally {
      setResearchPhase(null);
    }
  };

  const createNewChat = async (title: string) => {
    if (!user) return null;
    const chatPath = `users/${user.uid}/chats`;
    try {
      const chatRef = await addDoc(collection(db, "users", user.uid, "chats"), {
        userId: user.uid,
        title: title,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return chatRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, chatPath);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    let chatId = currentChatId;
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      // If no active chat, create one
      if (!chatId) {
        chatId = await createNewChat(currentInput.substring(0, 50));
        setCurrentChatId(chatId);
      }

      if (!chatId) throw new Error("Chat creation failed");

      const messagePath = `users/${user.uid}/chats/${chatId}/messages`;

      // Save user message
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
        role: "user",
        text: currentInput,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, messagePath));

      // Get AI response
      const result = await handleChat(currentInput);

      // Save bot message
      await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
        role: "bot",
        text: result.text,
        sources: result.sources,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, messagePath));

      // Update chat's updatedAt
      await setDoc(doc(db, "users", user.uid, "chats", chatId), {
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/chats/${chatId}`));

    } catch (error: any) {
      console.error(error);
      if (chatId) {
        const messagePath = `users/${user.uid}/chats/${chatId}/messages`;
        await addDoc(collection(db, "users", user.uid, "chats", chatId, "messages"), {
          role: "bot",
          text: `Xəta: ${error.message || "Bilinməyən xəta baş verdi."}`,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, messagePath));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user) return;
    const chatPath = `users/${user.uid}/chats/${chatId}`;
    try {
      await deleteDoc(doc(db, "users", user.uid, "chats", chatId));
      if (currentChatId === chatId) setCurrentChatId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, chatPath);
    }
  };

  const startLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      nextStartTimeRef.current = audioContextRef.current.currentTime;
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction: "Sən NovEra AI assistantsan. Azərbaycan dilində danış. Qısa və konkret cavablar ver. İnternetdə axtarış edə bilərsən.",
          tools: [{ googleSearch: {} }]
        },
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            setLiveTranscript("Qoşuldu. Danışmağa başlayın...");
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setLiveTranscript(prev => prev + "\nAI: " + message.serverContent.modelTurn.parts[0].text);
            }
            const audioData = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (audioData) playPCM(audioData);
          },
          onerror: (e) => console.error("Live Error", e),
          onclose: () => stopLive()
        }
      });

      wsRef.current = session;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
        session.sendRealtimeInput({
          audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
    } catch (error) {
      console.error("Live Start Error", error);
    }
  };

  const stopLive = () => {
    wsRef.current?.close();
    sourceRef.current?.disconnect();
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    setIsLiveActive(false);
    setLiveTranscript("");
  };

  const playPCM = async (base64Data: string) => {
    if (!audioContextRef.current) return;
    try {
      const binary = atob(base64Data);
      const bytes = new Int16Array(new Uint8Array(binary.split('').map(c => c.charCodeAt(0))).buffer);
      const float32 = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) float32[i] = bytes[i] / 32768;

      const sampleRate = 24000;
      const buffer = audioContextRef.current.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      
      const startTime = Math.max(nextStartTimeRef.current, audioContextRef.current.currentTime);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
    } catch (e) {
      console.error("Audio playback error", e);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white animate-spin">
            <Sparkles size={28} />
          </div>
          <span className="text-sm font-medium text-slate-400 animate-pulse uppercase tracking-widest">NovEra Yüklənir...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl shadow-indigo-100 overflow-hidden"
        >
          <div className="p-10 text-center space-y-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                <Sparkles size={40} />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">NovEra AI-yə Xoş Gəldiniz</h1>
              <p className="text-slate-500 text-sm leading-relaxed">
                Qabaqcıl süni intellekt təcrübəsi üçün daxil olun. Bütün söhbətləriniz təhlükəsiz şəkildə yadda saxlanılacaq.
              </p>
            </div>

            <button 
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-4 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              Google ilə davam et
            </button>

            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              NovEra Intelligence & Research
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

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
          <div className="flex items-center justify-between gap-3 p-2 hover:bg-slate-200 rounded-2xl transition-all cursor-pointer group">
             <div className="flex items-center gap-3 overflow-hidden">
               <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm bg-indigo-100 border border-indigo-200 shrink-0">
                 {user.photoURL ? (
                   <img src={user.photoURL} alt={user.displayName || ""} className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center text-indigo-600">
                     <UserCircle size={24} />
                   </div>
                 )}
               </div>
               <div className="flex flex-col overflow-hidden">
                 <span className="text-sm font-bold text-slate-900 truncate">{user.displayName || "İstifadəçi"}</span>
                 <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Pro Plan Aktiv</span>
               </div>
             </div>
             <button onClick={() => signOut(auth)} className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all text-slate-400">
                <LogOut size={16} />
             </button>
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
              <button 
                onClick={() => setIsLiveMode(!isLiveMode)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all ${
                  isLiveMode 
                  ? "bg-indigo-600 text-white shadow-xl shadow-indigo-100" 
                  : "bg-white border border-slate-200 text-slate-700 hover:border-slate-300 shadow-sm"
                }`}
              >
                {isLiveMode ? <Mic size={16} /> : <Mic size={16} className="text-slate-400" />}
                <span className="hidden xl:inline">{isLiveMode ? "Live Aktiv" : "Səsli Rejim"}</span>
              </button>
              <div className="h-6 w-[1px] bg-slate-200 hidden xl:block" />
              <button className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all shadow-sm">
                 <Settings size={18} />
              </button>
           </div>
        </header>

        {/* Chat / Live Area */}
        <main className="flex-1 overflow-y-auto w-full custom-scrollbar pt-6 xl:pt-12">
           {!isLiveMode && messages.length === 0 && !isLoading && (
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
             {isLiveMode ? (
               <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-10">
                  <div className="relative">
                    <motion.div 
                      animate={isLiveActive ? { 
                        scale: [1, 1.15, 1],
                        rotate: [0, 5, -5, 0],
                        boxShadow: [
                          "0 0 0px rgba(79, 70, 229, 0)", 
                          "0 0 60px rgba(79, 70, 229, 0.4)", 
                          "0 0 0px rgba(79, 70, 229, 0)"
                        ]
                      } : {}}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className={`w-40 h-40 rounded-[2.5rem] flex items-center justify-center transition-all ${
                        isLiveActive ? "bg-indigo-600 text-white shadow-2xl" : "bg-white border-2 border-dashed border-slate-200 text-slate-300"
                      }`}
                    >
                      {isLiveActive ? <Mic size={60} /> : <MicOff size={60} />}
                    </motion.div>
                    
                    {isLiveActive && (
                      <motion.div 
                        animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="absolute inset-0 rounded-[2.5rem] border-4 border-indigo-200"
                      />
                    )}
                  </div>
                  
                  <div className="text-center space-y-3">
                    <h2 className="text-2xl font-black text-slate-900">
                      {isLiveActive ? "NovEra Səsli Rejimdədir" : "Canlı NovEra ilə Danış"}
                    </h2>
                    <p className="text-slate-500 font-medium max-w-sm">
                      {isLiveActive ? "AI sizi eşidir. Suallarınızı səsli olaraq daxil edə bilərsiniz." : "Süni intellektlə canlı söhbət təcrübəsi."}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 w-full max-w-xl shadow-inner overflow-hidden flex flex-col items-center">
                    <div className="flex gap-1 mb-6">
                       {[...Array(8)].map((_, i) => (
                         <motion.div 
                            key={i}
                            animate={isLiveActive ? { height: [8, 24, 12, 32, 8] } : { height: 4 }}
                            transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                            className="w-1 bg-indigo-300 rounded-full"
                         />
                       ))}
                    </div>
                    <p className="text-slate-700 font-medium text-center leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto w-full italic">
                      {liveTranscript || "Danışmağa hazırsınız?"}
                    </p>
                  </div>

                  {!isLiveActive ? (
                    <button 
                      onClick={startLive}
                      className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 transition-all flex items-center gap-3 text-lg"
                    >
                      <Sparkles size={24} />
                      Söhbətə Başla
                    </button>
                  ) : (
                    <button 
                      onClick={stopLive}
                      className="bg-red-500 text-white px-10 py-5 rounded-3xl font-black shadow-2xl shadow-red-200 hover:bg-red-600 hover:-translate-y-1 transition-all flex items-center gap-3 text-lg"
                    >
                      <PhoneOff size={24} />
                      Bitir
                    </button>
                  )}
               </div>
             ) : (
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
             )}
             
             {isLoading && (
               <SearchingIndicator phase={researchPhase} />
             )}
             <div ref={messagesEndRef} />
           </div>
        </main>

        {/* Floating Input Area */}
        {!isLiveMode && (
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
        )}
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
