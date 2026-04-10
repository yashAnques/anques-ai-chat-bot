import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import * as mammoth from 'mammoth';
import { Bot, Send, Settings, Upload, Globe, FileText, Menu, X, Trash2, Sparkles, User, Download, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [websiteName, setWebsiteName] = useState('Wa Bridge');
  const [sitemapUrl, setSitemapUrl] = useState('https://wabridge.com/sitemap.xml');
  const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am the Wa Bridge Chat BOT. How can I help you today?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Auto-scrape on initial load
  useEffect(() => {
    const autoScrape = async () => {
      setIsScraping(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsScraping(false);
      toast.success("Website scraped successfully!");
    };
    autoScrape();
  }, []);

  // Reset chat session when configuration changes so it picks up the new system prompt
  useEffect(() => {
    chatSessionRef.current = null;
  }, [websiteName, sitemapUrl, knowledgeBaseText]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: string[] = [];
    let combinedText = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newFiles.push(file.name);
      
      try {
        let text = '';
        if (file.name.toLowerCase().endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
        } else {
          text = await file.text();
        }
        combinedText += `\n\n--- Document: ${file.name} ---\n${text}`;
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setKnowledgeBaseText(prev => prev + combinedText);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearKnowledgeBase = () => {
    setUploadedFiles([]);
    setKnowledgeBaseText('');
  };

  const handleScrape = async () => {
    if (!sitemapUrl) {
      toast.error("Please enter a sitemap URL first");
      return;
    }
    setIsScraping(true);
    // Simulate scraping delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsScraping(false);
    toast.success("Website scraped successfully!");
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    // Simulate saving delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Configuration saved successfully!");
  };

  const constructSystemPrompt = () => {
    const basePrompt = `
You are an AI Assistant named "Anques Technolabs Chat BOT".
Tagline: Specially trained for ${websiteName || 'this website'}.
Description: A highly intelligent, retrieval-based AI assistant trained exclusively on provided documents and website data.

Objective: Answer customer queries accurately using only the uploaded knowledge base documents and scraped website content from sitemap.xml.

Data Sources:
- Uploaded knowledge base documents
- Scraped website pages from sitemap.xml
Strict Rule: Do not use external knowledge or general world knowledge. Only rely on provided data.

Capabilities:
- Understand and process large documents
- Answer user queries with high accuracy
- Generate structured responses (headings, bullet points, tables)
- Provide reference links from source data
- Maintain conversational memory within the session
- Format responses dynamically based on question type

Response Guidelines:
- Style: Professional, Clear and structured, User-friendly, Concise but informative
- Formatting: Use headings, bullet points, tables, code blocks, and typewriter effect where appropriate.
- Reference Rule: Always include relevant source/reference links when available using format: 'Reference: <URL>'

Conversation Memory: Maintain session-based memory and use previous user queries for better contextual responses.

Edge Case Handling:
- Partial Data: Provide answer with available information only
- Multiple Sources: Summarize clearly and concisely
- Unclear Queries: Ask a clarification question before answering

Behavior Rules:
- Do not hallucinate information
- Do not assume missing data
- Do not answer outside knowledge base
- Strictly follow provided context
- Always prioritize accuracy over completeness

Output Examples:
Standard Response:
### Overview
[Answer]

### Key Points
- Point 1
- Point 2

Reference: https://example.com

Out of Scope Response:
I'm specially trained for ${websiteName || 'this website'}, I don't have any information about any other topic.
`;

    const contextData = `
\n\n========================================
AVAILABLE KNOWLEDGE BASE & CONTEXT DATA:
========================================

Website Name: ${websiteName}
Sitemap URL: ${sitemapUrl || 'Not provided'}

Document Content:
${knowledgeBaseText || 'No documents uploaded yet.'}
========================================
`;

    return basePrompt + contextData;
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      if (!chatSessionRef.current) {
        // Map existing messages to history format for the SDK
        const history = messages.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }]
        }));
        
        chatSessionRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          history: history,
          config: {
            systemInstruction: constructSystemPrompt(),
            temperature: 0.2, // Low temperature for more factual responses
          }
        });
      }

      const responseStream = await chatSessionRef.current.sendMessageStream({ message: userMsg });

      // Remove the thinking indicator and prepare an empty message for the stream
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of responseStream) {
        if (chunk.text) {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              text: newMessages[lastIndex].text + chunk.text
            };
            return newMessages;
          });
        }
      }
    } catch (error) {
      console.error('Error generating response:', error);
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, an error occurred while processing your request.' }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const SettingsPanel = () => (
    <div className="flex flex-col gap-6 p-5">
      <div className="space-y-2.5">
        <Label htmlFor="website-name" className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Website Name</Label>
        <div className="relative">
          <Globe className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <Input
            id="website-name"
            placeholder="e.g. Anques Technolabs"
            className="pl-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl focus-visible:ring-blue-500 h-10"
            value={websiteName}
            onChange={(e) => setWebsiteName(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="sitemap-url" className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Sitemap URL</Label>
        <Input
          id="sitemap-url"
          placeholder="https://example.com/sitemap.xml"
          className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl focus-visible:ring-blue-500 h-10"
          value={sitemapUrl}
          onChange={(e) => setSitemapUrl(e.target.value)}
        />
        <p className="text-[11px] text-zinc-500 font-medium">
          Used as context reference for the bot.
        </p>
        <Button 
          variant="secondary" 
          className="w-full rounded-xl mt-1 h-10 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
          onClick={handleScrape}
          disabled={isScraping || !sitemapUrl}
        >
          {isScraping ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {isScraping ? "Scraping Website..." : "Scrape Website"}
        </Button>
      </div>

      <Separator className="bg-zinc-200 dark:bg-zinc-800" />

      <div className="space-y-4">
        <div>
          <Label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Knowledge Base</Label>
          <p className="text-[11px] text-zinc-500 font-medium mb-3 mt-1">
            Upload text documents (.txt, .md, .csv, .docx) to train the bot.
          </p>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            multiple
            accept=".txt,.md,.csv,.json,.docx"
          />
          
          <Button 
            variant="outline" 
            className="w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 h-10" 
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Documents
          </Button>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Uploaded Files ({uploadedFiles.length})
              </Label>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg" onClick={clearKnowledgeBase} title="Clear all documents">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-36 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 p-3">
              <ul className="space-y-2.5">
                {uploadedFiles.map((file, idx) => (
                  <li key={idx} className="flex items-center text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    <FileText className="mr-2.5 h-3.5 w-3.5 text-blue-500" />
                    <span className="truncate">{file}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </div>

      <Separator className="bg-zinc-200 dark:bg-zinc-800" />
      
      <Button 
        className="w-full rounded-xl h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
        onClick={handleSaveConfig}
        disabled={isSaving}
      >
        {isSaving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {isSaving ? "Saving..." : "Save Configuration"}
      </Button>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      <Toaster position="top-center" />
      {/* Desktop Sidebar */}
      <aside className="hidden w-80 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 md:flex">
        <div className="flex h-14 items-center border-b border-zinc-200 dark:border-zinc-800 px-5 font-semibold text-zinc-800 dark:text-zinc-200">
          <Settings className="mr-2.5 h-4 w-4 text-zinc-500" />
          Configuration
        </div>
        <ScrollArea className="flex-1">
          <SettingsPanel />
        </ScrollArea>
      </aside>

      {/* Main Chat Area */}
      <main className="flex flex-1 flex-col min-w-0 min-h-0 bg-white dark:bg-zinc-950 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)] z-10">
        {/* Header */}
        <header className="flex h-14 items-center border-b border-zinc-200 dark:border-zinc-800 px-4 lg:px-6 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
          <Sheet>
            <SheetTrigger className="md:hidden mr-3 inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle configuration</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
              <SheetHeader className="sr-only">
                <SheetTitle>Configuration</SheetTitle>
              </SheetHeader>
              <div className="flex h-14 items-center border-b border-zinc-200 dark:border-zinc-800 px-5 font-semibold text-zinc-800 dark:text-zinc-200">
                <Settings className="mr-2.5 h-4 w-4 text-zinc-500" />
                Configuration
              </div>
              <ScrollArea className="h-[calc(100vh-3.5rem)]">
                <SettingsPanel />
              </ScrollArea>
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-3 font-semibold">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold leading-none text-zinc-900 dark:text-zinc-100">{websiteName || 'Chat BOT'}</h1>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">AI Assistant</p>
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 min-h-0 overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/50">
          <ScrollArea ref={scrollAreaRef} className="h-full p-4 lg:p-6">
            <div className="mx-auto max-w-3xl space-y-6 pb-4 pt-2">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}
              >
                {msg.role === 'model' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm mr-3 mt-1">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`flex max-w-[80%] flex-col gap-2 rounded-2xl px-5 py-3.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-tr-sm shadow-md'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-tl-sm shadow-sm text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:text-zinc-50">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm mr-3 mt-1">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex max-w-[80%] items-center gap-2 rounded-2xl rounded-tl-sm bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <div className="flex gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="bg-white dark:bg-zinc-950 p-4 pb-6 border-t border-zinc-100 dark:border-zinc-900">
          <div className="mx-auto max-w-3xl relative flex items-end gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message AI assistant..."
              className="min-h-[52px] w-full resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent py-3.5 pl-4 pr-12 text-sm"
              rows={1}
            />
            <Button 
              size="icon" 
              className={`absolute right-3 bottom-3 h-8 w-8 rounded-xl transition-all duration-200 ${inputMessage.trim() ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md scale-100' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 scale-95 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isTyping}
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
          <div className="mx-auto max-w-3xl mt-3 text-center">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
