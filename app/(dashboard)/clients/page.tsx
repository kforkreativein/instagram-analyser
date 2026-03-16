"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Search,
  Globe,
  Tag,
  MessageSquare
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/app/components/UI/Toast";

type StyleDNA = {
  tone?: string;
  sentenceLength?: string;
  vocabularyLevel?: string;
  emotionUsed?: string;
  pacing?: string;
  hookPattern?: string;
  ctaPattern?: string;
  repeatedPhrases?: string[];
};

type Client = {
  id: string;
  name: string;
  niche: string;
  platform: string;
  language: string;
  duration: string;
  targetAudience: string;
  tone: string;
  vocabulary: string;
  topics: string;
  avoidTopics: string;
  ctaStyle: string;
  preferredHooks: string[];
  winningScripts: any[];
  styleDNA: StyleDNA;
  createdAt: string;
};

export default function ClientsDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) {
        setClients([]);
        console.error("API Error: Fetching clients failed with status", res.status);
        return;
      }
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      toast("error", "Failed to load clients", "An error occurred while fetching the client list.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete client "${name}"?`)) return;

    try {
      const res = await fetch(`/api/clients?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("success", "Client deleted successfully", `${name} has been removed.`);
        fetchClients();
      } else {
        toast("error", "Failed to delete client", "The server returned an error.");
      }
    } catch (error) {
      toast("error", "An error occurred", "Failed to complete deletion.");
    }
  };

  const filteredClients = (Array.isArray(clients) ? clients : []).filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.niche.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* HEADER AREA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Syne'] font-[800] text-[32px] text-[#F0F2F7] flex items-center gap-3">
            <Users className="w-8 h-8 text-[#3BFFC8]" />
            Client Profiles
          </h1>
          <p className="text-[#8892A4] mt-1">Manage content DNA and audience profiles for all your clients.</p>
        </div>
        
        <Link 
          href="/clients/new"
          className="flex items-center gap-2 bg-[#FF3B57] hover:bg-[#FF3B57]/90 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(255,59,87,0.2)] hover:shadow-[0_0_30px_rgba(255,59,87,0.3)] active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          Add New Client
        </Link>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="relative group max-w-md">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#5A6478] group-focus-within:text-[#3BFFC8] transition-colors">
          <Search className="h-5 w-5" />
        </div>
        <input
          type="text"
          placeholder="Search by name or niche..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-12 pr-4 py-3 bg-[#111620] border border-[rgba(255,255,255,0.06)] rounded-xl text-[#F0F2F7] placeholder-[#5A6478] focus:outline-none focus:ring-1 focus:ring-[#3BFFC8]/50 focus:border-[#3BFFC8]/50 transition-all font-['DM_Sans'] shadow-inner"
        />
      </div>

      {/* CLIENT GRID */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-surface rounded-2xl h-[240px] animate-pulse p-6 space-y-4">
              <div className="h-6 bg-white/5 rounded-md w-1/2"></div>
              <div className="h-4 bg-white/5 rounded-md w-1/3"></div>
              <div className="pt-8 space-y-2">
                <div className="h-4 bg-white/5 rounded-md w-full"></div>
                <div className="h-4 bg-white/5 rounded-md w-full"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredClients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <div 
              key={client.id}
              onClick={() => router.push(`/clients/${client.id}`)}
              className="glass-surface rounded-2xl overflow-hidden hover:glow-cyan hover:border-cyan-500/50 transition-all duration-300 group flex flex-col cursor-pointer"
            >
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-['Syne'] font-[700] text-[18px] text-[#F0F2F7] group-hover:text-[#3BFFC8] transition-colors">
                      {client.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="px-2 py-0.5 rounded-full bg-[rgba(59,255,200,0.1)] border border-[rgba(59,255,200,0.2)] text-[#3BFFC8] text-[10px] font-bold uppercase tracking-wider">
                        {client.niche}
                      </span>
                    </div>
                  </div>
                  <div className="text-[12px] text-[#5A6478] font-['JetBrains_Mono']">
                    {client.language}
                  </div>
                </div>

                <div className="space-y-3 mt-6">
                  <div className="flex items-center gap-2 text-[13px] text-[#8892A4]">
                    <Globe className="w-4 h-4 text-[#5A6478]" />
                    <span>{client.platform}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-[#8892A4]">
                    <MessageSquare className="w-4 h-4 text-[#5A6478]" />
                    <span>{client.winningScripts?.length || 0} Winning Scripts</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[rgba(255,255,255,0.02)] border-t border-[rgba(255,255,255,0.04)] flex items-center justify-end gap-2">
                <Link 
                  href={`/clients/new?edit=${client.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 text-[#8892A4] hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  title="Edit"
                >
                  <Edit2 className="w-4.5 h-4.5" />
                </Link>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(client.id, client.name); }}
                  className="p-2 text-[#8892A4] hover:text-[#FF3B57] hover:bg-white/5 rounded-lg transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-surface rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-[#5A6478]" />
          </div>
          <h3 className="font-['Syne'] font-[700] text-[20px] text-[#F0F2F7]">No clients found</h3>
          <p className="text-[#8892A4] mt-2 mb-6">Start by adding your first client profile to unlock personalized script generation.</p>
          <Link 
            href="/clients/new"
            className="inline-flex items-center gap-2 text-[#3BFFC8] border border-[#3BFFC8]/30 px-4 py-2 rounded-lg font-bold hover:bg-[#3BFFC8]/10 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add First Client
          </Link>
        </div>
      )}
    </div>
  );
}
