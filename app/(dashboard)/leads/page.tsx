"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Search,
  Trash2,
  Download,
  Sparkles,
  Copy,
  ExternalLink,
  X,
  TrendingUp,
  Target,
  DollarSign,
  BarChart3,
  Activity,
} from "lucide-react";
import { useToast } from "@/app/components/UI/Toast";

type Lead = {
  id: string;
  handle: string;
  niche: string | null;
  followers: string | null;
  templateId: string | null;
  notes: string | null;
  status: string;
  priority: string;
  score: number;
  value: number;
  dealValue: number;
  lastUpdated: string;
  createdAt: string;
};

type DmTemplate = {
  id: string;
  name: string;
  category: string | null;
  body: string;
  isBuiltIn: boolean;
  createdAt: string;
};

const STATUSES = ["Prospect", "DMed", "Replied", "Interested", "Call booked", "Closed", "Dead"];
const PRIORITIES = ["Low", "Medium", "High"];
const NICHES = ["Fitness", "SaaS", "E-commerce", "Finance", "Education", "Real Estate", "Marketing", "Other"];
const FOLLOWER_RANGES = ["1K-10K", "10K-50K", "50K-100K", "100K-500K", "500K+"];

export default function LeadsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"pipeline" | "analytics" | "templates">("pipeline");
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<DmTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  
  const [newLead, setNewLead] = useState({
    handle: "",
    niche: "",
    followers: "",
    templateId: "",
    status: "Prospect",
    priority: "Medium",
    dealValue: 0,
    notes: "",
  });
  
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "",
    body: "",
  });
  
  const [showTemplatePreview, setShowTemplatePreview] = useState<DmTemplate | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showEditTemplate, setShowEditTemplate] = useState<DmTemplate | null>(null);
  const [aiParams, setAiParams] = useState({ niche: "", tone: "Professional" });
  const [isGenerating, setIsGenerating] = useState(false);
  
  // DM Modal State
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [activeLeadForDm, setActiveLeadForDm] = useState<Lead | null>(null);

  useEffect(() => {
    fetchLeads();
    fetchTemplates();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      setLeads(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch leads:", error);
      toast("error", "Failed to load leads");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.handle) {
      toast("error", "Handle is required");
      return;
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLead),
      });

      if (res.ok) {
        const createdLead = await res.json();
        setLeads([createdLead, ...leads]);
        setNewLead({ handle: "", niche: "", followers: "", templateId: "", status: "Prospect", priority: "Medium", dealValue: 0, notes: "" });
        toast("success", "Lead added successfully");
      }
    } catch (error) {
      toast("error", "Failed to add lead");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const lead = leads.find((l) => l.id === id);
      let updateData: any = { status };

      // If closing a deal and dealValue is 0, prompt for value
      if (status === "Closed" && lead && (!lead.dealValue || lead.dealValue === 0)) {
        const dealValueStr = window.prompt("Deal Won! Enter the monthly retainer value (₹) for this client:");
        if (dealValueStr) {
          const dealValue = parseInt(dealValueStr, 10);
          if (!isNaN(dealValue) && dealValue > 0) {
            updateData.dealValue = dealValue;
          }
        }
      }

      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (res.ok) {
        const updated = await res.json();
        setLeads(leads.map((l) => (l.id === id ? updated : l)));
        toast("success", "Status updated");
      }
    } catch (error) {
      toast("error", "Failed to update status");
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm("Delete this lead?")) return;

    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (res.ok) {
        setLeads(leads.filter((l) => l.id !== id));
        toast("success", "Lead deleted");
      }
    } catch (error) {
      toast("error", "Failed to delete lead");
    }
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.body) {
      toast("error", "Name and body are required");
      return;
    }

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTemplate),
      });

      if (res.ok) {
        const created = await res.json();
        setTemplates([created, ...templates]);
        setNewTemplate({ name: "", category: "", body: "" });
        toast("success", "Template created");
      }
    } catch (error) {
      toast("error", "Failed to create template");
    }
  };

  const handleUpdateTemplate = async () => {
    if (!showEditTemplate || showEditTemplate.id === "new") return;

    try {
      const res = await fetch(`/api/templates/${showEditTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplate.name,
          category: newTemplate.category,
          body: newTemplate.body,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setTemplates(templates.map((t) => (t.id === showEditTemplate.id ? updated : t)));
        setShowEditTemplate(null);
        setNewTemplate({ name: "", category: "", body: "" });
        toast("success", "Template updated");
      }
    } catch (error) {
      toast("error", "Failed to update template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;

    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates(templates.filter((t) => t.id !== id));
        toast("success", "Template deleted");
      }
    } catch (error) {
      toast("error", "Failed to delete template");
    }
  };

  const handleGenerateAI = async () => {
    if (!aiParams.niche || !aiParams.tone) {
      toast("error", "Niche and tone are required");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiParams),
      });

      if (res.ok) {
        const data = await res.json();
        setNewTemplate({
          name: `AI Generated - ${aiParams.niche}`,
          category: "AI Generated",
          body: data.template,
        });
        setShowAIModal(false);
        setActiveTab("templates");
        toast("success", "Template generated! Review and save below.");
      } else {
        const error = await res.json();
        toast("error", error.error || "Failed to generate template");
      }
    } catch (error) {
      toast("error", "Failed to generate template");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendDM = (lead: Lead) => {
    setActiveLeadForDm(lead);
    setDmModalOpen(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("success", "Copied to clipboard!");
  };

  const handleCopyTemplate = (body: string) => {
    navigator.clipboard.writeText(body);
    toast("success", "Template copied to clipboard!");
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.body.trim()) {
      toast("error", "Please fill in required fields");
      return;
    }

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTemplate),
      });

      if (!res.ok) throw new Error("Failed to create template");

      const created = await res.json();
      setTemplates([...templates, created]);
      setNewTemplate({ name: "", category: "", body: "" });
      toast("success", "Template created successfully!");
    } catch (error) {
      toast("error", "Failed to create template");
    }
  };

  const handleExportTemplates = () => {
    const dataStr = JSON.stringify(templates, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dm-templates-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    toast("success", "Templates exported!");
  };

  const exportCSV = () => {
    const filtered = getFilteredLeads();
    const csv = [
      ["Handle", "Niche", "Followers", "Status", "Priority", "Days Since", "Notes"],
      ...filtered.map((l) => [
        l.handle,
        l.niche || "",
        l.followers || "",
        l.status,
        l.priority,
        getDaysSince(l.lastUpdated).toString(),
        (l.notes || "").replace(/,/g, ";"),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast("success", "CSV exported");
  };

  const getDaysSince = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const getCategoryBadgeStyles = (category: string | null) => {
    if (!category) return "bg-white/10 text-white/70 border border-white/20";
    
    const cat = category.toLowerCase();
    if (cat.includes("india") && cat.includes("instagram")) {
      return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    }
    if (cat.includes("international") && cat.includes("instagram")) {
      return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
    }
    if (cat.includes("linkedin")) {
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
    if (cat.includes("follow-up") || cat.includes("follow up")) {
      return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
    }
    if (cat.includes("objection")) {
      return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
    return "bg-white/10 text-white/70 border border-white/20";
  };

  const getFilteredLeads = () => {
    let filtered = leads.filter((l) => statusFilter === "All" || l.status === statusFilter);
    filtered = filtered.filter(
      (l) =>
        l.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.niche || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sortOrder === "newest"
      ? filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const analytics = useMemo(() => {
    const safeLeads = leads || [];
    const safeTemplates = templates || [];
    
    const stats = {
      prospects: safeLeads.filter((l) => l.status === "Prospect").length,
      dmed: safeLeads.filter((l) => l.status === "DMed").length,
      replied: safeLeads.filter((l) => l.status === "Replied").length,
      interested: safeLeads.filter((l) => l.status === "Interested").length,
      callsBooked: safeLeads.filter((l) => l.status === "Call booked").length,
      closed: safeLeads.filter((l) => l.status === "Closed").length,
    };

    const replyRate = stats.dmed > 0 ? ((stats.replied / stats.dmed) * 100).toFixed(1) : "0";
    const closeRate = stats.dmed > 0 ? ((stats.closed / stats.dmed) * 100).toFixed(1) : "0";
    
    // Calculate Actual Revenue (Only Closed Deals)
    const revenue = safeLeads
      .filter((l) => l.status === "Closed")
      .reduce((sum, l) => sum + (l.dealValue || 0), 0);
    
    // Calculate Potential Pipeline Value (Active late-stage deals)
    const pipelineValue = safeLeads
      .filter((l) => ["Interested", "Call booked"].includes(l.status))
      .reduce((sum, l) => sum + (l.dealValue || 0), 0);

    const priorityDist = {
      high: safeLeads.filter((l) => l.priority === "High").length,
      medium: safeLeads.filter((l) => l.priority === "Medium").length,
      low: safeLeads.filter((l) => l.priority === "Low").length,
    };

    const templatePerf = safeTemplates.map((t) => {
      const leadsWithTemplate = safeLeads.filter((l) => l.templateId === t.id);
      const replied = leadsWithTemplate.filter((l) => l.status === "Replied" || l.status === "Interested" || l.status === "Call booked" || l.status === "Closed").length;
      const successRate = leadsWithTemplate.length > 0 ? ((replied / leadsWithTemplate.length) * 100).toFixed(1) : "0";
      return { name: t.name, successRate, count: leadsWithTemplate.length };
    }).sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

    const nicheMap = safeLeads.reduce((acc, l) => {
      const niche = l.niche || "Unknown";
      acc[niche] = (acc[niche] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const nicheBreakdown = Object.entries(nicheMap)
      .map(([niche, count]) => ({
        niche,
        count,
        percentage: safeLeads.length > 0 ? ((count / safeLeads.length) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => b.count - a.count);

    const recentActivity = [...safeLeads]
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      .slice(0, 10)
      .map((l) => ({
        handle: l.handle,
        status: l.status,
        timestamp: l.lastUpdated,
        isNew: new Date(l.lastUpdated).getTime() === new Date(l.createdAt).getTime(),
      }));

    return {
      stats,
      replyRate,
      closeRate,
      revenue,
      pipelineValue,
      priorityDist,
      templatePerf,
      nicheBreakdown,
      recentActivity,
    };
  }, [leads, templates]);

  const statusCounts = useMemo(() => {
    const safeLeads = leads || [];
    return {
      All: safeLeads.length,
      Prospect: safeLeads.filter((l) => l.status === "Prospect").length,
      DMed: safeLeads.filter((l) => l.status === "DMed").length,
      Replied: safeLeads.filter((l) => l.status === "Replied").length,
      Interested: safeLeads.filter((l) => l.status === "Interested").length,
      "Call booked": safeLeads.filter((l) => l.status === "Call booked").length,
      Closed: safeLeads.filter((l) => l.status === "Closed").length,
      Dead: safeLeads.filter((l) => l.status === "Dead").length,
    };
  }, [leads]);

  return (
    <div className="min-h-screen bg-[#0D1017] bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] text-[#8892A4] -m-[32px]">
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Glassmorphic Header */}
        <div className="mb-8">
          <h1 className="font-['DM_Serif_Display'] text-4xl text-white mb-2 tracking-wide">Leads CRM</h1>
          <p className="text-[#8892A4] text-sm font-['DM_Sans']">Manage your outreach pipeline and track conversions</p>
        </div>

        {/* Glassmorphic Floating Tab Pills */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
              activeTab === "pipeline"
                ? "text-white bg-purple-500/20 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                : "text-[#8892A4] bg-white/[0.03] border border-transparent hover:bg-white/[0.08]"
            }`}
          >
            Pipeline
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              activeTab === "pipeline" ? "bg-purple-500/30" : "bg-white/10"
            }`}>
              {leads.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 ${
              activeTab === "analytics"
                ? "text-white bg-purple-500/20 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                : "text-[#8892A4] bg-white/[0.03] border border-transparent hover:bg-white/[0.08]"
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-5 py-2 rounded-full font-medium text-sm transition-all duration-300 flex items-center gap-2 ${
              activeTab === "templates"
                ? "text-white bg-purple-500/20 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                : "text-[#8892A4] bg-white/[0.03] border border-transparent hover:bg-white/[0.08]"
            }`}
          >
            Templates
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              activeTab === "templates" ? "bg-purple-500/30" : "bg-white/10"
            }`}>
              {templates.length}
            </span>
          </button>
        </div>

        {activeTab === "pipeline" && (
          <div className="space-y-6">
            {/* Glassmorphic KPI Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-white">{analytics.stats.prospects}</div>
                <div className="text-xs text-[#8892A4] mt-1">Prospects</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-blue-400">{analytics.stats.dmed}</div>
                <div className="text-xs text-[#8892A4] mt-1">DMed</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-yellow-400">{analytics.stats.replied}</div>
                <div className="text-xs text-[#8892A4] mt-1">Replied</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-pink-400">{analytics.stats.interested}</div>
                <div className="text-xs text-[#8892A4] mt-1">Interested</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-purple-400">{analytics.stats.callsBooked}</div>
                <div className="text-xs text-[#8892A4] mt-1">Calls</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-emerald-400">{analytics.stats.closed}</div>
                <div className="text-xs text-[#8892A4] mt-1">Closed</div>
              </div>
              <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <div className="text-2xl font-bold text-emerald-400">₹{(analytics.revenue / 1000).toFixed(0)}K</div>
                <div className="text-xs text-[#8892A4] mt-1">Total MRR</div>
              </div>
            </div>

            {/* Glassmorphic Funnel Progress */}
            <div className="bg-white/[0.02] backdrop-blur-md p-4 rounded-xl sm:rounded-2xl border border-white/[0.08]">
              <div className="flex items-center gap-4">
                <div className="flex-1 flex items-center gap-2">
                  {["Prospect", "DMed", "Replied", "Interested", "Calls", "Closed"].map((stage, idx) => (
                    <div key={stage} className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full shadow-lg ${idx === 0 ? "bg-white shadow-white/20" : idx === 1 ? "bg-blue-400 shadow-blue-400/30" : idx === 2 ? "bg-yellow-400 shadow-yellow-400/30" : idx === 3 ? "bg-pink-400 shadow-pink-400/30" : idx === 4 ? "bg-purple-400 shadow-purple-400/30" : "bg-emerald-400 shadow-emerald-400/30"}`} />
                        <div className="text-[9px] text-[#8892A4] mt-1">{stage}</div>
                      </div>
                      {idx < 5 && <div className="h-[2px] w-8 bg-gradient-to-r from-white/20 to-transparent" />}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-[#8892A4]">
                  <span className="text-white font-medium">{leads.length}</span> total •{" "}
                  <span className="text-emerald-400 font-medium">₹{(analytics.pipelineValue / 1000).toFixed(0)}K</span> pipeline
                </div>
              </div>
            </div>

            {/* Glassmorphic Add Lead Form */}
            <form onSubmit={handleAddLead} className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">Add Lead</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                  <input
                    type="text"
                    placeholder="@handle"
                    value={newLead.handle}
                    onChange={(e) => setNewLead({ ...newLead, handle: e.target.value })}
                    className="bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8892A4] outline-none transition-all"
                    required
                  />
                  <select
                    value={newLead.niche}
                    onChange={(e) => setNewLead({ ...newLead, niche: e.target.value })}
                    className="bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
                  >
                    <option value="">Niche</option>
                    {NICHES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newLead.followers}
                    onChange={(e) => setNewLead({ ...newLead, followers: e.target.value })}
                    className="bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
                  >
                    <option value="">Followers</option>
                    {FOLLOWER_RANGES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <select
                      value={newLead.templateId}
                      onChange={(e) => setNewLead({ ...newLead, templateId: e.target.value })}
                      className="flex-1 bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
                    >
                      <option value="">Template</option>
                      {(templates || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {newLead.templateId && (
                      <button
                        type="button"
                        onClick={() => {
                          const t = templates.find((x) => x.id === newLead.templateId);
                          if (t) setShowTemplatePreview(t);
                        }}
                        className="px-2 bg-black/20 border border-white/10 hover:border-white/20 rounded-lg text-xs text-[#8892A4] hover:text-white transition-all"
                      >
                        View
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    placeholder="Expected Value (₹)"
                    value={newLead.dealValue || ""}
                    onChange={(e) => setNewLead({ ...newLead, dealValue: parseInt(e.target.value) || 0 })}
                    className="bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8892A4] outline-none transition-all"
                  />
                  <select
                    value={newLead.priority}
                    onChange={(e) => setNewLead({ ...newLead, priority: e.target.value })}
                    className="bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newLead.status}
                    onChange={(e) => setNewLead({ ...newLead, status: e.target.value })}
                    className="bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={newLead.notes}
                    onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                    className="flex-1 bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#8892A4] outline-none transition-all"
                  />
                  <button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(147,51,234,0.3)] border border-purple-400/50 transition-all"
                  >
                    <Plus size={16} />
                    Add Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("templates")}
                    className="bg-white/[0.02] backdrop-blur-md border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] text-[#8892A4] hover:text-white px-6 py-2 rounded-lg font-medium text-sm transition-all duration-300"
                  >
                    Templates
                  </button>
                </div>
              </div>
            </form>

            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-300 ${
                      statusFilter === status
                        ? "text-white bg-purple-500/20 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                        : "bg-white/[0.02] backdrop-blur-md text-[#8892A4] hover:bg-white/[0.04] hover:text-white border border-white/[0.08]"
                    }`}
                  >
                    {status}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === status ? "bg-purple-500/30" : "bg-white/10"}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8892A4]" size={16} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white/[0.02] backdrop-blur-md border border-white/[0.08] focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-full pl-10 pr-4 py-2 text-sm text-white outline-none transition-all"
                  />
                </div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="bg-white/[0.02] backdrop-blur-md border border-white/[0.08] rounded-full px-4 py-2 text-sm text-white outline-none"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <button
                  onClick={exportCSV}
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>

            {/* Glassmorphic Data Table */}
            <div className="bg-white/[0.02] backdrop-blur-md rounded-xl sm:rounded-2xl border border-white/[0.08] overflow-hidden">
              <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
                <table className="w-full min-w-[1000px] text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.08] backdrop-blur-sm">
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap">Handle</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap">Niche</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap">Followers</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap">Priority</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap">Days Since</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap min-w-[200px] max-w-[300px]">Notes</th>
                      <th className="px-4 py-3 text-xs font-medium text-[#8892A4] uppercase tracking-wide whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-[#8892A4]">Loading...</td>
                      </tr>
                    ) : getFilteredLeads().length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-[#8892A4]">No leads found</td>
                      </tr>
                    ) : (
                      getFilteredLeads().map((lead) => {
                        const daysSince = getDaysSince(lead.lastUpdated);
                        return (
                          <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="text-white font-medium text-sm">@{lead.handle}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {lead.niche ? (
                                <span className="border border-white/10 rounded-full px-2 py-0.5 text-[11px] text-[#8892A4]">
                                  {lead.niche}
                                </span>
                              ) : (
                                <span className="text-[#8892A4] text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-[#8892A4] whitespace-nowrap">{lead.followers || "-"}</td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  lead.status === "Prospect"
                                    ? "border border-dashed border-white/20 text-white/50"
                                    : lead.status === "Closed"
                                    ? "bg-[#10B981]/10 text-[#10B981]"
                                    : lead.status === "DMed"
                                    ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                                    : lead.status === "Replied"
                                    ? "bg-[#EAB308]/10 text-[#EAB308]"
                                    : lead.status === "Interested"
                                    ? "bg-[#EC4899]/10 text-[#EC4899]"
                                    : lead.status === "Call booked"
                                    ? "bg-[#A855F7]/10 text-[#A855F7]"
                                    : "bg-red-500/10 text-red-400"
                                }`}
                              >
                                {lead.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                  lead.priority === "High"
                                    ? "bg-red-500/10 text-red-400"
                                    : lead.priority === "Low"
                                    ? "bg-blue-500/10 text-blue-400"
                                    : "bg-amber-500/10 text-amber-400"
                                }`}
                              >
                                {lead.priority}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  daysSince >= 3 && lead.status === "DMed"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-emerald-500/10 text-emerald-400"
                                }`}
                              >
                                {daysSince}d
                              </span>
                            </td>
                            <td className="px-4 py-4 min-w-[200px] max-w-[300px]">
                              <span className="text-sm text-[#8892A4] truncate block">{lead.notes || "-"}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <select
                                  value={lead.status}
                                  onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                                  className="bg-black/20 border border-white/10 focus:border-purple-500/50 rounded-lg px-2 py-1 text-xs text-white outline-none"
                                >
                                  <option value="">Move...</option>
                                  {STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleSendDM(lead)}
                                  className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-lg text-xs font-medium shadow-[0_0_10px_rgba(147,51,234,0.3)] border border-purple-400/50 transition-all"
                                >
                                  Send DM
                                </button>
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 rounded transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Top Row: Funnel, Score Distribution, Template Performance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Conversion Funnel - Glassmorphic */}
              <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-purple-400" />
                  Conversion Funnel
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Prospects", count: analytics.stats.prospects, color: "bg-white/20" },
                    { label: "DMed", count: analytics.stats.dmed, color: "bg-blue-400" },
                    { label: "Replied", count: analytics.stats.replied, color: "bg-yellow-400" },
                    { label: "Interested", count: analytics.stats.interested, color: "bg-pink-400" },
                    { label: "Calls", count: analytics.stats.callsBooked, color: "bg-purple-400" },
                    { label: "Closed", count: analytics.stats.closed, color: "bg-emerald-400" },
                  ].map((stage) => {
                    const maxCount = Math.max(analytics.stats.prospects, 1);
                    const width = (stage.count / maxCount) * 100;
                    return (
                      <div key={stage.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#8892A4]">{stage.label}</span>
                          <span className="text-white font-medium">{stage.count}</span>
                        </div>
                        <div className="w-full bg-black/20 rounded-full h-2">
                          <div className={`${stage.color} h-2 rounded-full transition-all shadow-lg`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Priority Distribution - Glassmorphic */}
              <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Target size={16} className="text-purple-400" />
                  Priority Distribution
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "High", count: analytics.priorityDist.high, color: "bg-red-500" },
                    { label: "Medium", count: analytics.priorityDist.medium, color: "bg-amber-500" },
                    { label: "Low", count: analytics.priorityDist.low, color: "bg-blue-500" },
                  ].map((priority) => {
                    const maxCount = Math.max(analytics.priorityDist.high, analytics.priorityDist.medium, analytics.priorityDist.low, 1);
                    const width = (priority.count / maxCount) * 100;
                    return (
                      <div key={priority.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#8892A4]">{priority.label}</span>
                          <span className="text-white font-medium">{priority.count}</span>
                        </div>
                        <div className="w-full bg-black/20 rounded-full h-2">
                          <div className={`${priority.color} h-2 rounded-full transition-all shadow-lg`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Template Performance - Glassmorphic */}
              <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-purple-400" />
                  Template Performance
                </h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {analytics.templatePerf.slice(0, 5).map((t) => (
                    <div key={t.name} className="flex justify-between items-center py-2 border-b border-white/[0.04]">
                      <span className="text-xs text-[#8892A4] truncate flex-1">{t.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-medium">{t.successRate}%</span>
                        <span className="text-[10px] text-[#8892A4]">({t.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Row: KPIs Grid & Niche Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* KPIs Grid - Glassmorphic */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">{analytics.replyRate}%</div>
                  <div className="text-xs text-[#8892A4]">Reply Rate</div>
                </div>
                <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                  <div className="text-3xl font-bold text-emerald-400 mb-2">{analytics.closeRate}%</div>
                  <div className="text-xs text-[#8892A4]">Close Rate</div>
                </div>
                <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                  <div className="text-3xl font-bold text-emerald-400 mb-2">₹{(analytics.revenue / 1000).toFixed(0)}K</div>
                  <div className="text-xs text-[#8892A4]">Revenue (Closed)</div>
                </div>
                <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                  <div className="text-3xl font-bold text-purple-400 mb-2">₹{(analytics.pipelineValue / 1000).toFixed(0)}K</div>
                  <div className="text-xs text-[#8892A4]">Pipeline Value</div>
                </div>
              </div>

              {/* Niche Breakdown - Glassmorphic */}
              <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <DollarSign size={16} className="text-purple-400" />
                  Niche Breakdown
                </h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {analytics.nicheBreakdown.map((n) => (
                    <div key={n.niche} className="flex justify-between items-center py-2 border-b border-white/[0.04]">
                      <span className="text-xs text-[#8892A4]">{n.niche}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-medium">{n.percentage}%</span>
                        <span className="text-[10px] text-[#8892A4]">({n.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity - Glassmorphic */}
            <div className="bg-white/[0.02] backdrop-blur-md p-6 rounded-xl sm:rounded-2xl border border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Activity size={16} className="text-purple-400" />
                Recent Activity
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {analytics.recentActivity.map((activity, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                      <span className="text-sm text-[#8892A4]">
                        {activity.isNew ? "Added" : "Moved"} <span className="text-white font-medium">@{activity.handle}</span>{" "}
                        {activity.isNew ? "as" : "to"} <span className="text-purple-400">{activity.status}</span>
                      </span>
                    </div>
                    <span className="text-xs text-[#8892A4]">{new Date(activity.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-6">
            {/* Glassmorphic Header Row */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">DM Templates</h2>
                <p className="text-[#8892A4] text-[13px] mt-1">
                  Use <span className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded px-1.5 py-0.5 text-purple-400">[Name]</span> and{" "}
                  <span className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded px-1.5 py-0.5 text-purple-400">[Topic]</span> as placeholders — auto-filled when sending
                </p>
              </div>
              <button
                onClick={() => {
                  setNewTemplate({ name: "", category: "", body: "" });
                  setShowEditTemplate({ id: "new", name: "", category: "", body: "", isBuiltIn: false, createdAt: "" } as DmTemplate);
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium text-[13px] transition-all shadow-[0_0_20px_rgba(147,51,234,0.3)] border border-purple-400/50"
              >
                + New template
              </button>
            </div>

            {/* AI Generate Button - Glassmorphic */}
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600/80 to-pink-600/80 hover:from-purple-500/80 hover:to-pink-500/80 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-[0_0_25px_rgba(168,85,247,0.3)] border border-purple-400/30 backdrop-blur-md transition-all"
            >
              <Sparkles size={16} />
              Generate with AI
            </button>

            {/* Glassmorphic Template Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(templates || []).map((template) => (
                <div
                  key={template.id}
                  className="bg-white/[0.02] backdrop-blur-md border border-white/[0.08] rounded-xl sm:rounded-2xl p-5 hover:bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300 flex flex-col"
                >
                  {/* Top Row */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-white font-semibold text-[14px]">{template.name}</h3>
                      <span className="text-[11px] text-[#8892A4]">Not used yet</span>
                    </div>
                    {template.category && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${getCategoryBadgeStyles(template.category)}`}
                      >
                        {template.category}
                      </span>
                    )}
                  </div>

                  {/* Body Text */}
                  <p className="text-[#8892A4] text-[13px] line-clamp-3 leading-relaxed mb-5 flex-grow">
                    {template.body}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-auto pt-2">
                    <button
                      onClick={() => setShowTemplatePreview(template)}
                      className="border border-white/10 text-white/70 hover:bg-white/5 hover:text-white rounded-lg px-4 py-1.5 text-[12px] transition-colors"
                    >
                      View full
                    </button>
                    {!template.isBuiltIn && (
                      <button
                        onClick={() => {
                          setNewTemplate({ name: template.name, category: template.category || "", body: template.body });
                          setShowEditTemplate(template);
                        }}
                        className="border border-white/10 text-white/70 hover:bg-white/5 hover:text-white rounded-lg px-4 py-1.5 text-[12px] transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyTemplate(template.body)}
                      className="border border-white/10 text-white/70 hover:bg-white/5 hover:text-white rounded-lg px-3 py-1.5 text-[12px] transition-colors"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Glassmorphic AI Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D1017]/90 backdrop-blur-xl rounded-2xl border border-white/[0.1] max-w-lg w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="text-purple-400" size={20} />
                Generate DM Template with AI
              </h3>
              <button onClick={() => setShowAIModal(false)} className="text-[#8892A4] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-[#8892A4] mb-2 block">Target Niche</label>
                <input
                  type="text"
                  value={aiParams.niche}
                  onChange={(e) => setAiParams({ ...aiParams, niche: e.target.value })}
                  placeholder="e.g., Fitness coaches, SaaS founders"
                  className="w-full bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-4 py-2 text-white text-sm outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-[#8892A4] mb-2 block">Tone</label>
                <select
                  value={aiParams.tone}
                  onChange={(e) => setAiParams({ ...aiParams, tone: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-4 py-2 text-white text-sm outline-none transition-all"
                >
                  <option value="Professional">Professional</option>
                  <option value="Casual">Casual</option>
                  <option value="Friendly">Friendly</option>
                  <option value="Direct">Direct</option>
                </select>
              </div>
              <button
                onClick={handleGenerateAI}
                disabled={!aiParams.niche.trim() || isGenerating}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.3)] border border-purple-400/30 transition-all"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate Template
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Glassmorphic Template Preview Modal */}
      {showTemplatePreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D1017]/90 backdrop-blur-xl rounded-2xl border border-white/[0.1] max-w-2xl w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">{showTemplatePreview.name}</h3>
              <button onClick={() => setShowTemplatePreview(null)} className="text-[#8892A4] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            {showTemplatePreview.category && (
              <div className="text-sm text-[#8892A4] mb-4">Category: {showTemplatePreview.category}</div>
            )}
            <div className="bg-black/20 rounded-xl p-4 border border-white/[0.08] mb-4">
              <pre className="text-sm text-white whitespace-pre-wrap font-sans">{showTemplatePreview.body}</pre>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyTemplate(showTemplatePreview.body)}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.3)] border border-purple-400/50 transition-all"
              >
                <Copy size={16} />
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowTemplatePreview(null)}
                className="bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.04] border border-white/[0.08] text-white px-4 py-2 rounded-lg text-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Glassmorphic Edit/Create Template Modal */}
      {showEditTemplate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D1017]/90 backdrop-blur-xl rounded-2xl border border-white/[0.1] max-w-2xl w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {showEditTemplate.id === "new" ? "Create New Template" : "Edit Template"}
              </h3>
              <button onClick={() => setShowEditTemplate(null)} className="text-[#8892A4] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-[#8892A4] mb-2 block">Template Name</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g., Initial Reply"
                  className="w-full bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-4 py-2 text-white text-sm outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-[#8892A4] mb-2 block">Category</label>
                <select
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-4 py-2 text-white text-sm outline-none transition-all"
                >
                  <option value="">Select category</option>
                  <option value="India — Instagram">India — Instagram</option>
                  <option value="International — Instagram">International — Instagram</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Objection handler">Objection handler</option>
                  <option value="Cold Outreach">Cold Outreach</option>
                  <option value="Prospecting">Prospecting</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8892A4] mb-2 block">Message Body</label>
                <textarea
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                  placeholder="Hey [Name], loved your recent post about [Topic]..."
                  rows={10}
                  className="w-full bg-black/20 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 rounded-lg px-4 py-2 text-white text-sm outline-none transition-all font-mono"
                />
                <div className="text-xs text-[#8892A4] mt-2">
                  Available: <span className="text-purple-400">[Name]</span>, <span className="text-purple-400">[Topic]</span>, <span className="text-purple-400">[Niche]</span>, <span className="text-purple-400">[Followers]</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (showEditTemplate.id === "new") {
                      handleCreateTemplate();
                      setShowEditTemplate(null);
                    } else {
                      handleUpdateTemplate();
                    }
                  }}
                  disabled={!newTemplate.name.trim() || !newTemplate.body.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-sm shadow-[0_0_15px_rgba(147,51,234,0.3)] border border-purple-400/50 transition-all"
                >
                  {showEditTemplate.id === "new" ? "Create Template" : "Save Changes"}
                </button>
                <button
                  onClick={() => setShowEditTemplate(null)}
                  className="bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.04] border border-white/[0.08] text-white px-4 py-2 rounded-lg text-sm transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Glassmorphic Send DM Modal */}
      {dmModalOpen && activeLeadForDm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0D1017] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/[0.02]">
              <h3 className="text-white font-semibold">Send DM to @{activeLeadForDm.handle}</h3>
              <button onClick={() => setDmModalOpen(false)} className="text-[#8892A4] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="text-[12px] text-[#8892A4] mb-2 uppercase tracking-wider font-bold">Message Preview</p>
              <div className="bg-[#111620] border border-white/5 rounded-xl p-4 text-[#E2E8F0] text-[14px] leading-relaxed whitespace-pre-wrap">
                {(() => {
                  const template = (templates || []).find(t => t.id === activeLeadForDm.templateId);
                  if (!template) return "No template selected for this lead.";
                  return template.body.replace(/\[Name\]/gi, activeLeadForDm.handle.replace('@', ''));
                })()}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 p-5 pt-0 mt-auto">
               <button 
                  onClick={() => {
                    const template = (templates || []).find(t => t.id === activeLeadForDm.templateId);
                    const text = template ? template.body.replace(/\[Name\]/gi, activeLeadForDm.handle.replace('@', '')) : "";
                    navigator.clipboard.writeText(text);
                    toast("success", "Message copied to clipboard!");
                  }}
                  className="flex-1 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
               >
                  <Copy size={16} />
                  Copy Message
               </button>
               <button 
                  onClick={() => {
                    const handle = activeLeadForDm.handle.replace('@', '');
                    window.open(`https://ig.me/m/${handle}`, '_blank');
                    setDmModalOpen(false);
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)] py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
               >
                  <ExternalLink size={16} />
                  Open Instagram
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
