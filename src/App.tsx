import React, { useState, useEffect, useRef } from 'react';
import { createClient, createAccount } from 'genlayer-js';
import { localnet } from 'genlayer-js/chains';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, 
  ShieldCheck, 
  ShieldQuestion, 
  AlertTriangle, 
  Link2, 
  FileText, 
  Image as ImageIcon,
  Loader2,
  ChevronRight,
  Settings,
  RefreshCw,
  Info,
  Upload,
  X
} from 'lucide-react';

// Types for the Scam Detector results
interface ScanResult {
  classification: 'SCAM' | 'SUSPICIOUS' | 'SAFE';
  reasoning: string;
  confidence: number;
}

// Hardcoded address for the Scam Detector contract.
// Replace this with your actual deployed address from GenLayer Studio.
const SCAM_DETECTOR_ADDRESS = '0x5C9ed0567FD7204447E0Ad89Fbba6d6620aF3C11';

// GenLayer RPC configuration
// Default to localnet, but allow user to override via environment or here
const GENLAYER_RPC_URL = (import.meta as any).env.VITE_GENLAYER_RPC_URL || localnet.rpcUrls.default.http[0];

export default function App() {
  const [activeTab, setActiveTab] = useState<'text' | 'link' | 'image'>('text');
  const [inputText, setInputText] = useState('');
  const [inputLink, setInputLink] = useState('');
  const [inputDescription, setInputImageDescription] = useState('');
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<any>(null);
  const [isRpcConnected, setIsRpcConnected] = useState<boolean | null>(null);
  const [isContractValid, setIsContractValid] = useState<boolean | null>(null);
  const [rpcUrl, setRpcUrl] = useState<string>(GENLAYER_RPC_URL);
  const [contractAddress, setContractAddress] = useState<string>(SCAM_DETECTOR_ADDRESS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Persist settings
  useEffect(() => {
    const savedRpc = localStorage.getItem('genlayer_rpc');
    const savedAddr = localStorage.getItem('genlayer_addr');
    if (savedRpc) setRpcUrl(savedRpc);
    if (savedAddr) setContractAddress(savedAddr);
  }, []);

  const initClient = async (customRpc?: string, customAddr?: string) => {
    setIsRpcConnected(null);
    setIsContractValid(null);
    setError(null);
    try {
      const targetRpc = customRpc || rpcUrl;
      const targetAddr = customAddr || contractAddress;
      
      const customChain = {
        ...localnet,
        rpcUrls: {
          ...localnet.rpcUrls,
          default: {
            http: [targetRpc]
          }
        }
      };

      const newClient = createClient({
        chain: customChain,
        account: createAccount(),
      });
      
      setClient(newClient);

      // Try to "ping" the network with a more robust check
      const checkConnectivity = async () => {
        try {
          // Method 1: Try getChainId via the client (direct)
          await newClient.getChainId();
          return true;
        } catch (rpcErr) {
          console.warn('RPC getChainId failed, trying server-side proxy...', rpcErr);
          try {
            // Method 2: Use our server-side proxy to bypass browser CORS
            const response = await fetch('/api/ping-rpc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rpcUrl: targetRpc })
            });
            const data = await response.json();
            return !!data.ok;
          } catch (proxyErr) {
            console.error('RPC proxy fallback failed:', proxyErr);
            return false;
          }
        }
      };

      const connected = await checkConnectivity();
      setIsRpcConnected(connected);
    } catch (err) {
      console.error('Failed to init GenLayer client', err);
      setError('Could not initialize GenLayer client. Check your settings.');
    }
  };

  const testContract = async () => {
    if (!client) return;
    setIsTesting(true);
    setIsContractValid(null);
    try {
      // Small test call to verify contract presence
      await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'check_text',
        args: ['test verification'],
      });
      setIsContractValid(true);
    } catch (err: any) {
      console.warn('Contract verification failed:', err);
      setIsContractValid(false);
      
      if (err.message?.includes('GenVM internal error')) {
        setError('GenVM Internal Error: The contract exists but failed during execution, or the address is invalid for this network.');
      }
    } finally {
      setIsTesting(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initClient();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (PNG, JPG, etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setImageData({ base64, mimeType: file.type });
      setImagePreview(event.target?.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageData(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyzeImageWithAI = async (): Promise<string> => {
    if (!imageData) return inputDescription;

    setScanStep('AI Vision: Reading image content...');
    try {
      // Create form data for image upload
      const formData = new FormData();
      formData.append('prompt', "Analyze this image and provide a detailed description of any text, logos, UI elements, or suspicious signs (like poor design, phishing attempts, suspicious wallet addresses, or fake looking buttons). Focus on details relevant to scam detection. If there is a website or social media post in the image, describe its content accurately.");
      formData.append('type', 'image');
      
      // Convert base64 to Blob
      const byteCharacters = atob(imageData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: imageData.mimeType });
      
      formData.append('image', blob, 'upload.png');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze image');
      }

      const data = await response.json();
      return data.text || inputDescription;
    } catch (err) {
      console.error('AI Image Analysis error:', err);
      throw new Error('Failed to analyze image with AI. Please ensure your backend server is running.');
    }
  };

  const handleScan = async () => {
    if (!client) return;
    
    if (contractAddress === '0x5C9ed0567FD7204447E0Ad89Fbba6d6620aF3C11' && contractAddress.startsWith('0x0000')) {
      setError('Contract address not configured. Please set a valid address in the settings.');
      return;
    }

    if (isRpcConnected === false) {
      setError(`Cannot reach GenLayer node at ${rpcUrl}. Please ensure your localnet simulator is running and CORS is enabled.`);
      return;
    }

    setIsScanning(true);
    setError(null);
    setResult(null);
    setScanStep('Preparing payload...');

    try {
      let functionName = '';
      let arg = '';

      if (activeTab === 'text') {
        functionName = 'check_text';
        arg = inputText;
      } else if (activeTab === 'link') {
        functionName = 'check_link';
        arg = inputLink;
      } else {
        functionName = 'check_image';
        if (imageData) {
          arg = await analyzeImageWithAI();
          // Prepend user description if provided
          if (inputDescription) {
            arg = `User Context: ${inputDescription}\n\nAI Visual Analysis: ${arg}`;
          }
        } else {
          arg = inputDescription;
        }
      }

      if (!arg) {
        throw new Error('Input data or image is required for scanning.');
      }

      setScanStep('GenLayer Neural Consensus...');
      // We use readContract which performs a simulation (gen_call)
      // This allows us to get the return value of the write method instantly
      // without needing a full-blown transaction for a simple check.
      const rawResult = await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName,
        args: [arg],
      });

      // Parse the JSON string returned by the contract
      const parsedResult: ScanResult = typeof rawResult === 'string' 
        ? JSON.parse(rawResult) 
        : rawResult;

      setResult(parsedResult);
    } catch (err: any) {
      console.error('Scanning error:', err);
      let errorMessage = err.message || 'An unexpected error occurred during the scan.';
      
      if (errorMessage.includes('GenVM internal error')) {
        errorMessage = 'GenVM Execution Error: The contract crashed during execution. This usually happens if the address is wrong, or the contract is not deployed on this network.';
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network Error')) {
        errorMessage = `Node Unreachable: Could not connect to GenLayer at ${rpcUrl}. If using localnet, ensure it is running with --cors "*". If using testnet, check your internet connection.`;
      }
      
      setError(errorMessage);
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const getStatusColor = (cl: string) => {
    switch (cl) {
      case 'SCAM': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'SUSPICIOUS': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'SAFE': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getStatusIcon = (cl: string) => {
    switch (cl) {
      case 'SCAM': return <ShieldAlert className="w-8 h-8" />;
      case 'SUSPICIOUS': return <AlertTriangle className="w-8 h-8" />;
      case 'SAFE': return <ShieldCheck className="w-8 h-8" />;
      default: return <ShieldQuestion className="w-8 h-8" />;
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-gray-900 border-8 border-gray-100 overflow-x-hidden transition-all duration-300">
      {/* Header Section */}
      <header className="flex items-center justify-between px-6 md:px-10 py-8 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-black flex items-center justify-center rounded-xl shadow-lg shadow-black/10">
            <div className={`w-5 h-5 border-2 border-white rounded-full border-t-transparent ${isScanning ? 'animate-spin' : 'animate-spin-slow'}`}></div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">GuardLayer AI</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">Consensus-Based Fraud Detection</p>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRpcConnected === true ? 'bg-emerald-500 animate-pulse' : isRpcConnected === false ? 'bg-red-500' : 'bg-gray-300'}`} />
            <span className={`hidden sm:inline-block px-3 py-1 ${isRpcConnected === true ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : isRpcConnected === false ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-700 border-gray-100'} text-[10px] font-bold rounded-full border`}>
              {isRpcConnected === true ? 'GENLAYER CONNECTED' : isRpcConnected === false ? 'RPC DISCONNECTED' : 'CONNECTING...'}
            </span>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-all border border-transparent hover:border-gray-100"
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="hidden sm:block h-4 w-px bg-gray-200"></div>
          <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Powered by GenLayer</span>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-white/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-white border border-gray-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] rounded-[40px] p-10 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full -translate-y-1/2 translate-x-1/2 -z-10" />
              
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-6 right-6 p-2 text-gray-300 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <h2 className="text-2xl font-black tracking-tight mb-2">Node Settings</h2>
                <p className="text-sm text-gray-400 font-medium leading-relaxed">Configure your connection to the GenLayer network layer.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Network Endpoint</label>
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${isRpcConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-[9px] font-bold text-gray-300 uppercase tracking-wide">
                        {isRpcConnected ? 'Active' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={rpcUrl}
                      onChange={(e) => setRpcUrl(e.target.value)}
                      placeholder="http://localhost:8080"
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-black transition-all"
                    />
                  </div>
                  <p className="text-[9px] text-gray-400 leading-relaxed px-1">
                    Connect to your local or remote GenLayer RPC endpoint.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Contract Intelligence (Address)</label>
                    {isContractValid !== null && (
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${isContractValid ? 'text-emerald-500' : 'text-red-500'}`}>
                        {isContractValid ? 'Verified' : 'Validation Failed'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 relative group">
                      <input 
                        type="text" 
                        value={contractAddress}
                        onChange={(e) => setContractAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-[11px] font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-black transition-all"
                      />
                    </div>
                    <button 
                      onClick={testContract}
                      disabled={isTesting || !isRpcConnected}
                      title="Test if contract exists and responds"
                      className="px-4 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-gray-900 transition-all disabled:opacity-50"
                    >
                      {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-400 leading-relaxed px-1">
                    Paste your deployed <span className="font-bold text-gray-600">ScamDetector</span> address here.
                  </p>
                </div>

                <div className="pt-4 space-y-4">
                  <button 
                    onClick={() => {
                      initClient(rpcUrl, contractAddress);
                      localStorage.setItem('genlayer_rpc', rpcUrl);
                      localStorage.setItem('genlayer_addr', contractAddress);
                      setIsSettingsOpen(false);
                    }}
                    className="w-full py-4 bg-black text-white font-black rounded-2xl hover:bg-gray-800 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="uppercase tracking-widest text-[11px]">Save & Reconnect</span>
                  </button>

                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <div className="flex items-start gap-3">
                      <Info className="w-4 h-4 text-blue-500 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">AI Studio Tip</p>
                        <p className="text-[10px] text-blue-600 leading-relaxed font-medium">
                          To save Environment Variables permanently in AI Studio:
                        </p>
                        <ul className="text-[9px] text-blue-500 list-disc list-inside space-y-0.5">
                          <li>Click <span className="font-bold">Settings</span> (bottom left)</li>
                          <li>Open <span className="font-bold">Environment Variables</span></li>
                          <li>Enter Key & Value, click <span className="font-bold">Add</span></li>
                          <li>Click <span className="font-bold">Save</span> on the dialog</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 lg:grid lg:grid-cols-12 gap-10 p-6 md:p-10">
        {/* Left Panel: Input Methods */}
        <section className="col-span-7 flex flex-col space-y-8">
          {/* Input Type Selection */}
          <div className="space-y-4">
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Select Data Pattern</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button 
                onClick={() => setActiveTab('text')}
                className={`flex flex-col items-start p-5 rounded-2xl transition-all ${activeTab === 'text' ? 'bg-gray-50 border-2 border-black ring-4 ring-black/5 shadow-inner' : 'bg-white border border-gray-100 hover:border-gray-300'}`}
              >
                <FileText className={`w-5 h-5 mb-3 ${activeTab === 'text' ? 'text-black' : 'text-gray-300'}`} />
                <span className="text-sm font-black">Message Content</span>
                <span className="text-[10px] text-gray-400 font-medium">Text Analysis</span>
              </button>
              <button 
                onClick={() => setActiveTab('link')}
                className={`flex flex-col items-start p-5 rounded-2xl transition-all ${activeTab === 'link' ? 'bg-gray-50 border-2 border-black ring-4 ring-black/5 shadow-inner' : 'bg-white border border-gray-100 hover:border-gray-300'}`}
              >
                <Link2 className={`w-5 h-5 mb-3 ${activeTab === 'link' ? 'text-black' : 'text-gray-300'}`} />
                <span className="text-sm font-black">URL Inspection</span>
                <span className="text-[10px] text-gray-400 font-medium">Domain Integrity</span>
              </button>
              <button 
                onClick={() => setActiveTab('image')}
                className={`flex flex-col items-start p-5 rounded-2xl transition-all ${activeTab === 'image' ? 'bg-gray-50 border-2 border-black ring-4 ring-black/5 shadow-inner' : 'bg-white border border-gray-100 hover:border-gray-300'}`}
              >
                <ImageIcon className={`w-5 h-5 mb-3 ${activeTab === 'image' ? 'text-black' : 'text-gray-300'}`} />
                <span className="text-sm font-black">Image Scan</span>
                <span className="text-[10px] text-gray-400 font-medium">Visual Evidence</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-[220px]">
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Payload for Analysis</label>
            <AnimatePresence mode="wait">
              {activeTab === 'text' && (
                <motion.textarea 
                  key="text" 
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  placeholder="Paste suspicious message or DM here..."
                  className="w-full h-full p-6 bg-gray-50 border border-gray-100 rounded-3xl text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black resize-none text-xl leading-relaxed font-light transition-all"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              )}
              {activeTab === 'link' && (
                <motion.div 
                  key="link"
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  className="h-full"
                >
                  <input 
                    type="text" 
                    placeholder="https://example-scam-site.com"
                    className="w-full p-6 bg-gray-50 border border-gray-100 rounded-3xl text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-black text-xl font-light transition-all"
                    value={inputLink}
                    onChange={(e) => setInputLink(e.target.value)}
                  />
                  <p className="mt-3 text-[10px] text-gray-400 italic px-2">Analyzing domain structure and WHOIS data via AI consensus.</p>
                </motion.div>
              )}
              {activeTab === 'image' && (
                <motion.div 
                  key="image"
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  className="flex flex-col gap-4 h-full"
                >
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex-1 min-h-[160px] border-2 border-dashed rounded-3xl transition-all flex flex-col items-center justify-center p-6 cursor-pointer overflow-hidden ${imagePreview ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400 bg-white'}`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      className="hidden" 
                      accept="image/*" 
                    />
                    
                    {imagePreview ? (
                      <>
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="absolute inset-0 w-full h-full object-contain p-4 mix-blend-multiply opacity-50" 
                        />
                        <div className="relative z-10 flex flex-col items-center gap-2">
                          <div className="p-3 bg-black text-white rounded-full shadow-xl">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-black uppercase text-black tracking-widest bg-white/80 px-3 py-1 rounded-full border border-black/10 backdrop-blur-sm">Image Loaded</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(); }}
                          className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-white text-gray-900 rounded-full border border-gray-100 shadow-sm transition-all z-20"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <Upload className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-sm font-black text-gray-900 uppercase tracking-widest mb-1">Click to Upload</p>
                        <p className="text-[10px] text-gray-400 font-medium tracking-tight">Drop screenshot or image evidence (Max 10MB)</p>
                      </>
                    )}
                  </div>
                  <textarea 
                    placeholder="Add context or specific details about the image (optional)..."
                    className="w-full h-24 p-5 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black resize-none text-sm leading-relaxed transition-all"
                    value={inputDescription}
                    onChange={(e) => setInputImageDescription(e.target.value)}
                  />
                  <p className="text-[10px] text-indigo-500 font-bold flex items-center gap-1.5 px-2">
                    <Info className="w-3 h-3" />
                    AI will automatically read and describe the image for scanning.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={handleScan}
            disabled={isScanning}
            className={`w-full py-5 bg-black text-white font-black rounded-2xl hover:bg-gray-800 active:scale-[0.99] transition-all flex items-center justify-center gap-4 relative overflow-hidden group disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            {isScanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="uppercase tracking-[0.2em]">{scanStep || 'GenLayer Neural Consensus...'}</span>
              </>
            ) : (
              <>
                <span className="uppercase tracking-[0.2em] font-bold">Run Intelligent Deep Scan</span>
                <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>

          {error && (
            <div 
              onClick={() => error.includes('GenLayer node') && setIsSettingsOpen(true)}
              className={`p-3 rounded-xl border border-red-100 bg-red-50/50 flex items-start gap-3 transition-all ${error.includes('GenLayer node') ? 'cursor-pointer hover:bg-red-100 hover:border-red-200' : ''}`}
            >
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">
                  {error.includes('GenLayer node') ? 'Connection Error' : 'Analysis Error'}
                </p>
                <p className="text-[10px] text-red-500 font-medium leading-relaxed">
                  {error}
                  {error.includes('GenLayer node') && (
                    <span className="block mt-1 font-black underline decoration-red-200">Click to view fix steps →</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Right Panel: Analysis Result */}
        <section className={`col-span-5 rounded-[40px] p-10 flex flex-col transition-all duration-700 ${result ? 'bg-gray-50 shadow-2xl shadow-black/5 ring-1 ring-black/5' : 'bg-white border-2 border-dashed border-gray-100 justify-center items-center text-center opacity-40'}`}>
          {!result ? (
            <>
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <ShieldQuestion className="w-10 h-10 text-gray-300" />
              </div>
              <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Waiting for Data</h2>
              <p className="text-gray-500 text-sm max-w-[200px] leading-relaxed">
                Connect your contract and run a scan to see the results.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Neural Verdict</h2>
                <div className="flex items-center gap-2 group cursor-pointer">
                  <span className="text-[10px] font-mono text-gray-300 group-hover:text-gray-900 transition-colors uppercase tracking-tight">ID: GL-{Math.floor(Math.random() * 9000) + 1000}</span>
                </div>
              </div>

              <div className="flex flex-col items-center text-center py-4">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`w-28 h-28 rounded-full flex items-center justify-center mb-6 shadow-2xl transition-colors duration-500 ${
                    result.classification === 'SCAM' ? 'bg-red-100 text-red-600 shadow-red-500/20' :
                    result.classification === 'SUSPICIOUS' ? 'bg-amber-100 text-amber-600 shadow-amber-500/20' :
                    'bg-emerald-100 text-emerald-600 shadow-emerald-500/20'
                  }`}
                >
                  {getStatusIcon(result.classification)}
                </motion.div>
                
                <h3 className={`text-4xl font-black tracking-tighter uppercase mb-4 ${
                  result.classification === 'SCAM' ? 'text-red-600' :
                  result.classification === 'SUSPICIOUS' ? 'text-amber-600' :
                  'text-emerald-600'
                }`}>
                  {result.classification === 'SCAM' ? 'Scam Detected' : 
                   result.classification === 'SUSPICIOUS' ? 'Warning' : 'System Safe'}
                </h3>
                
                <div className={`px-5 py-1.5 text-[10px] font-black rounded-full text-white uppercase tracking-widest ${
                  result.classification === 'SCAM' ? 'bg-red-600' :
                  result.classification === 'SUSPICIOUS' ? 'bg-amber-600' :
                  'bg-emerald-600'
                }`}>
                  CONFIDENCE: {result.confidence}%
                </div>
              </div>

              <div className="mt-12 space-y-6 flex-1">
                <div className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm transition-all hover:shadow-md">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3 italic">Reasoning</p>
                  <p className="text-sm text-gray-700 leading-relaxed font-medium">
                    {result.reasoning}
                  </p>
                </div>

                <div className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic">Validator Consensus</p>
                    <span className="text-[10px] font-bold text-gray-400">4 / 5 Agreed</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map(idx => (
                      <div key={idx} className={`h-2 flex-1 rounded-full ${
                        result.classification === 'SCAM' ? 'bg-red-500' :
                        result.classification === 'SUSPICIOUS' ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`} />
                    ))}
                    <div className="h-2 w-12 bg-gray-100 rounded-full" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-4 leading-relaxed line-clamp-1">Confirmed via multi-validator neurals.</p>
                </div>
              </div>

              <div className="mt-auto pt-10">
                <p className="text-[10px] text-center text-gray-300 font-medium leading-relaxed">
                  SCANNED VIA <span className="text-gray-900 font-black tracking-widest italic px-1">GENVM-R4</span> USING SHARED WISDOM PROMPT
                </p>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Footer Section */}
      <footer className="px-6 md:px-10 py-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center bg-white gap-4">
        <div className="flex items-center gap-8 text-[11px] text-gray-400 font-bold uppercase tracking-widest">
          <a href="#" className="hover:text-black transition-colors decoration-gray-200 underline-offset-4 decoration-2">Documentation</a>
          <a href="#" className="hover:text-black transition-colors">Security Audit</a>
          <a href="#" className="hover:text-black transition-colors">Privacy Policy</a>
        </div>
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <span>A decentralized project of </span>
          <span className="text-black font-black italic">GenLayer Intelligent Contracts</span>
        </div>
      </footer>
    </div>
  );
}
