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
    if (!category) return "bg-zinc-800 text-zinc-400 border border-zinc-700";
    
    const cat = category.toLowerCase();
    if (cat.includes("india") && cat.includes("instagram")) {
      return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    }
    if (cat.includes("international") && cat.includes("instagram")) {
      return "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20";
    }
    if (cat.includes("linkedin")) {
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
    if (cat.includes("follow-up") || cat.includes("follow up")) {
      return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
    }
    if (cat.includes("objection")) {
      return "bg-red-500/10 text-red-400 border border-red-500/20";
    }
    return "bg-zinc-800 text-zinc-400 border border-zinc-700";
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
    <div className="min-h-screen bg-zinc-950 text-zinc-400 -m-[32px] font-sans">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">Leads CRM</h1>
          <p className="text-zinc-400 text-sm">Manage your outreach pipeline and track conversions</p>
        </div>

        {/* Floating Tab Pills */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeTab === "pipeline"
                ? "bg-zinc-800 text-white border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200 border border-transparent"
            }`}
          >
            Pipeline
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              activeTab === "pipeline" ? "bg-zinc-700 text-white" : "bg-zinc-900"
            }`}>
              {leads.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 ${
              activeTab === "analytics"
                ? "bg-zinc-800 text-white border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200 border border-transparent"
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              activeTab === "templates"
                ? "bg-zinc-800 text-white border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200 border border-transparent"
            }`}
          >
            Templates
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              activeTab === "templates" ? "bg-zinc-700 text-white" : "bg-zinc-900"
            }`}>
              {templates.length}
            </span>
          </button>
        </div>

        {activeTab === "pipeline" && (
          <div className="space-y-6">
            {/* KPI Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-white">{analytics.stats.prospects}</div>
                <div className="text-xs text-zinc-500 mt-1">Prospects</div>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-blue-400">{analytics.stats.dmed}</div>
                <div className="text-xs text-zinc-500 mt-1">DMed</div>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-yellow-400">{analytics.stats.replied}</div>
                <div className="text-xs text-zinc-500 mt-1">Replied</div>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-orange-400">{analytics.stats.interested}</div>
                <div className="text-xs text-zinc-500 mt-1">Interested</div>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-indigo-400">{analytics.stats.callsBooked}</div>
                <div className="text-xs text-zinc-500 mt-1">Calls</div>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-emerald-400">{analytics.stats.closed}</div>
                <div className="text-xs text-zinc-500 mt-1">Closed</div>
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 hover:bg-zinc-900 transition-all duration-200">
                <div className="text-3xl font-semibold text-emerald-400">₹{(analytics.revenue / 1000).toFixed(0)}K</div>
                <div className="text-xs text-zinc-500 mt-1">Total MRR</div>
              </div>
            </div>

            {/* Funnel Progress */}
            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
              <div className="flex items-center gap-4">
                <div className="flex-1 flex items-center gap-2">
                  {["Prospect", "DMed", "Replied", "Interested", "Calls", "Closed"].map((stage, idx) => (
                    <div key={stage} className="flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${idx === 0 ? "bg-zinc-200" : idx === 1 ? "bg-blue-400" : idx === 2 ? "bg-yellow-400" : idx === 3 ? "bg-orange-400" : idx === 4 ? "bg-indigo-400" : "bg-emerald-400"}`} />
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">{stage}</div>
                      </div>
                      {idx < 5 && <div className="h-px w-8 bg-zinc-800" />}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-zinc-400 text-right">
                  <span className="text-white font-medium">{leads.length}</span> total<br className="sm:hidden" />
                  <span className="hidden sm:inline"> • </span>
                  <span className="text-emerald-400 font-medium">₹{(analytics.pipelineValue / 1000).toFixed(0)}K</span> pipeline
                </div>
              </div>
            </div>

            {/* Add Lead Form */}
            <form onSubmit={handleAddLead} className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
              <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wide">Add Lead</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                  <input
                    type="text"
                    placeholder="@handle"
                    value={newLead.handle}
                    onChange={(e) => setNewLead({ ...newLead, handle: e.target.value })}
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition-all"
                    required
                  />
                  <select
                    value={newLead.niche}
                    onChange={(e) => setNewLead({ ...newLead, niche: e.target.value })}
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
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
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
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
                      className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
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
                        className="px-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-white transition-all"
                      >
                        View
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    placeholder="Value (₹)"
                    value={newLead.dealValue || ""}
                    onChange={(e) => setNewLead({ ...newLead, dealValue: parseInt(e.target.value) || 0 })}
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition-all"
                  />
                  <select
                    value={newLead.priority}
                    onChange={(e) => setNewLead({ ...newLead, priority: e.target.value })}
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
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
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none transition-all"
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
                    className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    className="bg-rose-500 hover:bg-rose-600 text-white font-medium border-none px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-all"
                  >
                    <Plus size={16} />
                    Add Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("templates")}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 px-6 py-2 rounded-lg font-medium text-sm transition-all duration-200"
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
                    className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-200 ${
                      statusFilter === status
                        ? "bg-zinc-800 text-white border border-zinc-700"
                        : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
                    }`}
                  >
                    {status}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === status ? "bg-zinc-700 text-white" : "bg-zinc-800"}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-full pl-10 pr-4 py-2 text-sm text-white outline-none transition-all"
                  />
                </div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-sm text-white outline-none"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <button
                  onClick={exportCSV}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-all"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
                <table className="w-full min-w-[1000px] text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-900 border-b border-zinc-800">
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Handle</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Niche</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Followers</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Priority</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Days Since</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap min-w-[200px] max-w-[300px]">Notes</th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">Loading...</td>
                      </tr>
                    ) : getFilteredLeads().length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">No leads found</td>
                      </tr>
                    ) : (
                      getFilteredLeads().map((lead) => {
                        const daysSince = getDaysSince(lead.lastUpdated);
                        return (
                          <tr key={lead.id} className="hover:bg-zinc-900/50 transition-colors">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="text-white font-medium text-sm">@{lead.handle}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {lead.niche ? (
                                <span className="border border-zinc-800 rounded-full px-2 py-0.5 text-[11px] text-zinc-400">
                                  {lead.niche}
                                </span>
                              ) : (
                                <span className="text-zinc-500 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-zinc-400 whitespace-nowrap">{lead.followers || "-"}</td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  lead.status === "Prospect"
                                    ? "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50"
                                    : lead.status === "Closed"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : lead.status === "DMed"
                                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                    : lead.status === "Replied"
                                    ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                    : lead.status === "Interested"
                                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                                    : lead.status === "Call booked"
                                    ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
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
                                    : "bg-orange-500/10 text-orange-400"
                                }`}
                              >
                                {lead.priority}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  daysSince >= 3 && lead.status === "DMed"
                                    ? "bg-orange-500/10 text-orange-400"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {daysSince}d
                              </span>
                            </td>
                            <td className="px-4 py-4 min-w-[200px] max-w-[300px]">
                              <span className="text-sm text-zinc-400 truncate block">{lead.notes || "-"}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <select
                                  value={lead.status}
                                  onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                                  className="bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none hover:bg-zinc-800 transition-colors"
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
                                  className="bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-emerald-400/20"
                                >
                                  Send DM
                                </button>
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-all"
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
              {/* Conversion Funnel */}
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-400" />
                  Conversion Funnel
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Prospects", count: analytics.stats.prospects },
                    { label: "DMed", count: analytics.stats.dmed },
                    { label: "Replied", count: analytics.stats.replied },
                    { label: "Interested", count: analytics.stats.interested },
                    { label: "Calls", count: analytics.stats.callsBooked },
                    { label: "Closed", count: analytics.stats.closed },
                  ].map((stage, idx) => {
                    const maxCount = Math.max(analytics.stats.prospects, 1);
                    const width = (stage.count / maxCount) * 100;
                    const opacityClass = idx === 0 ? "opacity-20" : idx === 1 ? "opacity-40" : idx === 2 ? "opacity-60" : idx === 3 ? "opacity-80" : idx === 4 ? "opacity-90" : "opacity-100";
                    return (
                      <div key={stage.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-zinc-400">{stage.label}</span>
                          <span className="text-white font-medium">{stage.count}</span>
                        </div>
                        <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                          <div className={`bg-emerald-400 h-2 rounded-full transition-all ${opacityClass}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Priority Distribution */}
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Target size={16} className="text-emerald-400" />
                  Priority Distribution
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "High", count: analytics.priorityDist.high, color: "bg-red-500" },
                    { label: "Medium", count: analytics.priorityDist.medium, color: "bg-orange-400" },
                    { label: "Low", count: analytics.priorityDist.low, color: "bg-blue-400" },
                  ].map((priority) => {
                    const maxCount = Math.max(analytics.priorityDist.high, analytics.priorityDist.medium, analytics.priorityDist.low, 1);
                    const width = (priority.count / maxCount) * 100;
                    return (
                      <div key={priority.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-zinc-400">{priority.label}</span>
                          <span className="text-white font-medium">{priority.count}</span>
                        </div>
                        <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                          <div className={`${priority.color} h-2 rounded-full transition-all`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Template Performance */}
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-emerald-400" />
                  Template Performance
                </h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                  {analytics.templatePerf.slice(0, 5).map((t) => (
                    <div key={t.name} className="flex justify-between items-center py-2.5 border-b border-zinc-800/50 last:border-0">
                      <span className="text-xs text-zinc-400 truncate flex-1 pr-2">{t.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-medium">{t.successRate}%</span>
                        <span className="text-[10px] text-zinc-500">({t.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Row: KPIs Grid & Niche Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* KPIs Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-center">
                  <div className="text-4xl font-semibold text-white mb-1.5">{analytics.replyRate}%</div>
                  <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Reply Rate</div>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-center">
                  <div className="text-4xl font-semibold text-white mb-1.5">{analytics.closeRate}%</div>
                  <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Close Rate</div>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-center">
                  <div className="text-4xl font-semibold text-emerald-400 mb-1.5">₹{(analytics.revenue / 1000).toFixed(0)}K</div>
                  <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Revenue (Closed)</div>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-center">
                  <div className="text-4xl font-semibold text-emerald-400 mb-1.5">₹{(analytics.pipelineValue / 1000).toFixed(0)}K</div>
                  <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Pipeline Value</div>
                </div>
              </div>

              {/* Niche Breakdown */}
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 flex flex-col">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <DollarSign size={16} className="text-emerald-400" />
                  Niche Breakdown
                </h3>
                <div className="space-y-1 max-h-[220px] overflow-y-auto custom-scrollbar pr-2 flex-grow">
                  {analytics.nicheBreakdown.map((n) => (
                    <div key={n.niche} className="flex justify-between items-center py-2.5 border-b border-zinc-800/50 last:border-0">
                      <span className="text-xs text-zinc-400">{n.niche}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-medium">{n.percentage}%</span>
                        <span className="text-[10px] text-zinc-500">({n.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Activity size={16} className="text-emerald-400" />
                Recent Activity
              </h3>
              <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {analytics.recentActivity.map((activity, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3 border-b border-zinc-800/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]" />
                      <span className="text-sm text-zinc-400">
                        {activity.isNew ? "Added" : "Moved"} <span className="text-white font-medium">@{activity.handle}</span>{" "}
                        {activity.isNew ? "as" : "to"} <span className="text-emerald-400 font-medium">{activity.status}</span>
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">{new Date(activity.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-6">
            {/* Header Row */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">DM Templates</h2>
                <p className="text-zinc-500 text-[13px] mt-1">
                  Use <span className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-emerald-400">[Name]</span> and{" "}
                  <span className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-emerald-400">[Topic]</span> as placeholders — auto-filled when sending
                </p>
              </div>
              <button
                onClick={() => {
                  setNewTemplate({ name: "", category: "", body: "" });
                  setShowEditTemplate({ id: "new", name: "", category: "", body: "", isBuiltIn: false, createdAt: "" } as DmTemplate);
                }}
                className="bg-rose-500 hover:bg-rose-600 text-white font-medium border-none px-4 py-2 rounded-lg text-[13px] transition-all"
              >
                + New template
              </button>
            </div>

            {/* AI Generate Button */}
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-medium border-none px-4 py-2 rounded-lg text-sm transition-all group"
            >
              <Sparkles size={16} className="text-white group-hover:scale-110 transition-transform" />
              Generate with AI
            </button>

            {/* Template Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(templates || []).map((template) => (
                <div
                  key={template.id}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:bg-zinc-900 transition-all duration-300 flex flex-col"
                >
                  {/* Top Row */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-white font-semibold text-[14px]">{template.name}</h3>
                      <span className="text-[11px] text-zinc-500">Not used yet</span>
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
                  <p className="text-zinc-400 text-[13px] line-clamp-3 leading-relaxed mb-5 flex-grow font-mono bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">
                    {template.body}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-auto pt-2">
                    <button
                      onClick={() => setShowTemplatePreview(template)}
                      className="border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 rounded-lg px-4 py-1.5 text-[12px] transition-colors"
                    >
                      View full
                    </button>
                    {!template.isBuiltIn && (
                      <button
                        onClick={() => {
                          setNewTemplate({ name: template.name, category: template.category || "", body: template.body });
                          setShowEditTemplate(template);
                        }}
                        className="border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 rounded-lg px-4 py-1.5 text-[12px] transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyTemplate(template.body)}
                      className="border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 hover:border-emerald-400/50 rounded-lg px-3 py-1.5 text-[12px] transition-colors"
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

      {/* AI Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="text-emerald-400" size={20} />
                Generate DM Template with AI
              </h3>
              <button onClick={() => setShowAIModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-2 block font-medium uppercase tracking-wider">Target Niche</label>
                <input
                  type="text"
                  value={aiParams.niche}
                  onChange={(e) => setAiParams({ ...aiParams, niche: e.target.value })}
                  placeholder="e.g., Fitness coaches, SaaS founders"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-2 block font-medium uppercase tracking-wider">Tone</label>
                <select
                  value={aiParams.tone}
                  onChange={(e) => setAiParams({ ...aiParams, tone: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all"
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
                className="w-full bg-rose-500 hover:bg-rose-600 text-white font-medium border-none disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed py-3 rounded-lg text-sm flex items-center justify-center gap-2 transition-all mt-4"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-900 border-t-transparent" />
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

      {/* Template Preview Modal */}
      {showTemplatePreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">{showTemplatePreview.name}</h3>
              <button onClick={() => setShowTemplatePreview(null)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            {showTemplatePreview.category && (
              <div className="flex gap-2 items-center mb-4">
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Category:</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${getCategoryBadgeStyles(showTemplatePreview.category)}`}>
                  {showTemplatePreview.category}
                </span>
              </div>
            )}
            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 mb-6 font-mono">
              <pre className="text-sm text-zinc-300 whitespace-pre-wrap">{showTemplatePreview.body}</pre>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleCopyTemplate(showTemplatePreview.body)}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-medium border-none px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
              >
                <Copy size={16} />
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowTemplatePreview(null)}
                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white px-6 py-2.5 rounded-lg text-sm transition-all font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Template Modal */}
      {showEditTemplate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {showEditTemplate.id === "new" ? "Create New Template" : "Edit Template"}
              </h3>
              <button onClick={() => setShowEditTemplate(null)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-2 block font-medium uppercase tracking-wider">Template Name</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g., Initial Reply"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-2 block font-medium uppercase tracking-wider">Category</label>
                <select
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all"
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
                <label className="text-xs text-zinc-400 mb-2 block font-medium uppercase tracking-wider">Message Body</label>
                <textarea
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                  placeholder="Hey [Name], loved your recent post about [Topic]..."
                  rows={8}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 rounded-lg px-4 py-3 text-white text-sm outline-none transition-all font-mono placeholder:text-zinc-600"
                />
                <div className="text-xs text-zinc-500 mt-2">
                  Available placeholders: <span className="text-emerald-400">[Name]</span>, <span className="text-emerald-400">[Topic]</span>, <span className="text-emerald-400">[Niche]</span>, <span className="text-emerald-400">[Followers]</span>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
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
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-medium border-none disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed py-2.5 rounded-lg text-sm transition-all"
                >
                  {showEditTemplate.id === "new" ? "Create Template" : "Save Changes"}
                </button>
                <button
                  onClick={() => setShowEditTemplate(null)}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white px-6 py-2.5 rounded-lg text-sm transition-all font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send DM Modal */}
      {dmModalOpen && activeLeadForDm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
              <h3 className="text-white font-semibold">Send DM to <span className="text-emerald-400">@{activeLeadForDm.handle}</span></h3>
              <button onClick={() => setDmModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="text-[12px] text-zinc-500 mb-3 uppercase tracking-wider font-bold">Message Preview</p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-300 text-[14px] leading-relaxed whitespace-pre-wrap font-mono">
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
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
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
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-medium border-none py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
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
