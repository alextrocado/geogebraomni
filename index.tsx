
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const LANGUAGES = {
  pt: { label: "PT", name: "Português" },
  en: { label: "EN", name: "English" },
  es: { label: "ES", name: "Español" },
  fr: { label: "FR", name: "Français" },
  de: { label: "DE", name: "Deutsch" }
};

const PERSPECTIVES = {
  'graphing': '1',
  'geometry': '2',
  '3d': '5',
  'cas': '4'
};

const ggbCommandTool = {
  name: 'executeGGBCommands',
  parameters: {
    type: Type.OBJECT,
    description: 'Executa uma lista de comandos standard do GeoGebra na aplicação.',
    properties: {
      commands: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Lista de strings contendo comandos GeoGebra (ex: ["A=(1,1)", "Circle(A, 5)"]).'
      },
      explanation: {
        type: Type.STRING,
        description: 'Uma breve explicação do que estes comandos fazem.'
      }
    },
    required: ['commands']
  }
};

const GeminiPanel = ({ currentLangCode }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleChatSend = async () => {
    if (!input.trim() || loading) return;
    const userText = input;
    const currentLangName = LANGUAGES[currentLangCode].name;
    
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    try {
      // Inicializar a API com a chave do ambiente
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const ggb = (window as any).ggbApplet;
      
      // Capturar contexto atual para a IA saber o que já existe
      const objects = ggb ? 
        ggb.getAllObjectNames().map(n => `${n}: ${ggb.getValueString(n)}`).join('\n') : "Nenhum";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `IDIOMA ATUAL: ${currentLangName}\nOBJETOS NO GEOGEBRA:\n${objects}\n\nUTILIZADOR: ${userText}`,
        config: {
          systemInstruction: `És o GeoGebra Omni, um assistente matemático avançado e tutor digital.
          Estás integrado numa aplicação que corre o GeoGebra Classic.
          
          OBJETIVO:
          Ajudar o utilizador a explorar matemática, geometria e álgebra através de visualizações no GeoGebra.
          
          REGRAS:
          1. Responde SEMPRE em ${currentLangName.toUpperCase()}.
          2. Sempre que o utilizador pedir para criar, desenhar, calcular ou manipular algo, deves usar a ferramenta 'executeGGBCommands'.
          3. Garante que os comandos enviados são compatíveis com a sintaxe oficial do GeoGebra (ex: "Segment((0,0), (2,2))", "f(x)=x^2").
          4. No texto da resposta, sê didático e explica o raciocínio matemático por trás da construção.`,
          tools: [
            { functionDeclarations: [ggbCommandTool] }
            // Nota: googleSearch removido para evitar conflito com functionDeclarations
          ]
        }
      });

      // 1. Verificar e executar Tool Calls (Ações no GeoGebra)
      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          if (fc.name === 'executeGGBCommands' && ggb) {
            const args = fc.args as any;
            const commands = args.commands;
            const explanation = args.explanation;
            
            if (Array.isArray(commands)) {
              commands.forEach(cmd => ggb.evalCommand(cmd));
              
              setMessages(prev => [...prev, { 
                role: 'ai', 
                text: `**Ação executada no GeoGebra:** ${explanation || "Objetos criados no gráfico."}`, 
                isAction: true 
              }]);
            }
          }
        }
      }

      // 2. Mostrar resposta de texto principal
      if (response.text) {
        setMessages(prev => [...prev, { role: 'ai', text: response.text }]);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'ai', text: "Ocorreu um erro ao processar o seu pedido. Por favor, tente novamente ou verifique as instruções." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-96 glass-panel shadow-2xl overflow-hidden border-l border-gray-200">
      <div className="p-5 border-b bg-white/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="gemini-gradient p-2 rounded-xl shadow-lg">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" /></svg>
          </div>
          <div>
            <h2 className="font-bold text-lg gemini-text-gradient leading-none">GeoGebra Omni</h2>
            <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mt-1">Controlo Direto</p>
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/30">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] p-4 rounded-2xl text-sm shadow-sm transition-all ${
              m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-200' : 
              m.isAction ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-xs' :
              'bg-white text-slate-800 border border-slate-100 rounded-tl-none leading-relaxed'
            }`}>
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && <div className="flex gap-1 p-2"><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div></div>}
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleChatSend()} 
            placeholder={`Peça algo (ex: "faz um cubo")`} 
            className="w-full pl-4 pr-12 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none transition-all" 
          />
          <button onClick={handleChatSend} className="absolute right-2 p-2 rounded-xl bg-indigo-600 text-white shadow-lg active:scale-95 transition-transform disabled:opacity-50" disabled={loading}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [appType, setAppType] = useState('3d');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [langCode, setLangCode] = useState('pt');
  const ggbApiRef = useRef(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if ((window as any).GGBApplet && !isInitialized.current) {
      const container = document.getElementById('ggb-element');
      if (container) {
        container.innerHTML = '';
        const params = {
          "appName": "classic",
          "width": window.innerWidth - (isPanelOpen ? 384 : 0),
          "height": window.innerHeight - 64,
          "showToolBar": true,
          "showAlgebraInput": true,
          "showMenuBar": true,
          "language": langCode,
          "id": "ggbApplet",
          "appletOnLoad": function(api) {
            ggbApiRef.current = api;
            (window as any).ggbApplet = api;
            api.setPerspective(PERSPECTIVES[appType as keyof typeof PERSPECTIVES]);
          }
        };
        new (window as any).GGBApplet(params, true).inject('ggb-element');
        isInitialized.current = true;
      }
    }
  }, []);

  useEffect(() => {
    if (ggbApiRef.current) {
      ggbApiRef.current.setPerspective(PERSPECTIVES[appType as keyof typeof PERSPECTIVES]);
    }
  }, [appType]);

  useEffect(() => {
    if ((window as any).ggbApplet && typeof (window as any).ggbApplet.setSize === 'function') {
      const newWidth = window.innerWidth - (isPanelOpen ? 384 : 0);
      const newHeight = window.innerHeight - 64;
      (window as any).ggbApplet.setSize(newWidth, newHeight);
    }
  }, [isPanelOpen]);

  useEffect(() => {
    if (ggbApiRef.current) {
      ggbApiRef.current.setLanguage(langCode);
    }
  }, [langCode]);

  useEffect(() => {
    const handleResize = () => {
      if ((window as any).ggbApplet) {
        const newWidth = window.innerWidth - (isPanelOpen ? 384 : 0);
        const newHeight = window.innerHeight - 64;
        (window as any).ggbApplet.setSize(newWidth, newHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isPanelOpen]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 overflow-hidden font-sans">
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 gemini-gradient rounded-xl flex items-center justify-center text-white shadow-lg">
             <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-none">GeoGebra <span className="text-indigo-600">Omni</span></h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Master Control Sync</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 px-2">IDIOMA:</span>
            {Object.entries(LANGUAGES).map(([code, data]) => (
              <button 
                key={code} 
                onClick={() => setLangCode(code)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${langCode === code ? 'bg-white text-indigo-600 shadow-sm scale-110' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {data.label}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200">
            {['graphing', 'geometry', '3d', 'cas'].map(type => (
              <button key={type} onClick={() => setAppType(type)} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${appType === type ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-400 hover:text-indigo-600'}`}>
                {type === 'cas' ? 'CAS' : type.toUpperCase()}
              </button>
            ))}
          </div>
          
          <button onClick={() => setIsPanelOpen(!isPanelOpen)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isPanelOpen ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </button>
        </div>
      </header>
      
      <main className="flex flex-1 relative overflow-hidden bg-white">
        <div className="flex-1 relative" id="ggb-element"></div>
        {isPanelOpen && <GeminiPanel currentLangCode={langCode} />}
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
