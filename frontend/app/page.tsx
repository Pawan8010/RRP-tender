"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Database, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";

type Tender = {
  id: string;
  tenderId: string;
  title: string;
  organisation?: string | null;
  department?: string | null;
  category?: string | null;
  keywordMatched?: string | null;
  tenderStatus: string;
  tenderURL: string;
  closingDate?: string | null;
  createdAt: string;
};

type TenderResponse = {
  data: Tender[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  meta?: {
    source?: string;
    gemStatedTotal?: number;
    gemUniqueStored?: number;
    gemSearchedAt?: string;
    gemSearchTerms?: string[];
  };
};

type Stats = {
  totalTenders: number;
  gemListedTotal: number;
  duplicateOrUnmappedListings: number;
  newToday: number;
  closingSoon: number;
  keywordMatches: number;
};

type ScrapeResult = {
  status: "SUCCESS" | "FAILED" | "STARTED";
  pagesScraped: number;
  tendersFound: number;
  tendersNew: number;
  tendersUpdated: number;
  statedTotal?: number;
};

const API_BASES = unique([
  process.env.NEXT_PUBLIC_API_URL,
  "http://127.0.0.1:4000/api",
  "http://localhost:4000/api",
]);
const KEYWORDS = [
  "Weapon Sight",
  "Thermal Camera",
  "Thermal Weapon Sight",
  "Thermal Imager",
  "Thermal Imaging Sight",
  "Handheld Thermal Imager",
  "Uncooled Thermal",
  "Cooled Thermal",
  "Night Vision Sight",
  "Day Night Sight",
  "Night Vision Device",
  "Night Vision Device (NVD)",
  "Night Vision Goggles",
  "Night Vision Goggles (NVG)",
  "Image Intensifier",
  "Laser Range Finder",
  "Laser Range Finder (LRF) integrated sight",
  "LOROS",
  "Long Range Observation System (LOROS)",
  "EOSS",
  "Electro Optical Surveillance System (EOSS)",
  "Battlefield Surveillance Radar",
  "Battlefield Surveillance Radar + EO",
  "Border Surveillance System",
  "Pan Tilt Zoom Camera",
  "PTZ with EO payload",
  "Pan Tilt Zoom Camera (PTZ with EO payload)",
  "Long Range PTZ Camera",
  "Longe range PTZ Camera",
  "PTZ Camera",
  "Optical Camera",
  "Night Vision Camera",
  "Reflex Sight",
  "Red Dot Sight",
  "Holographic Sight",
  "LWIR",
  "MWIR",
  "LWIR / MWIR",
  "Target Acquisition System",
  "Night vision Camera",
];

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function dateLabel(value?: string | null) {
  if (!value) return "Not listed";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [tenders, setTenders] = useState<TenderResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const keywordSearch = selectedKeywords.join(" || ");
  const activeSearch = debouncedQuery || keywordSearch;
  const searchPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50", sort: "recently_updated" });
    if (activeSearch) params.set("q", activeSearch);
    return `/tenders?${params.toString()}`;
  }, [activeSearch, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [query]);

  function toggleKeyword(item: string) {
    setQuery("");
    setDebouncedQuery("");
    setSelectedKeywords((current) =>
      current.includes(item) ? current.filter((keyword) => keyword !== item) : [...current, item]
    );
    setPage(1);
  }

  async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (const base of API_BASES) {
      try {
        const response = await fetch(`${base}${path}`, { cache: "no-store", ...init });
        if (response.ok) return response;
        lastError = new Error(`${base}${path} returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to connect to backend API");
  }

  async function loadData() {
    setLoading(true);
    try {
      const [tenderRes, statsRes] = await Promise.all([
        apiFetch(searchPath),
        apiFetch("/tenders/stats"),
      ]);
      setTenders(await tenderRes.json());
      setStats(await statsRes.json());
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load API data");
    } finally {
      setLoading(false);
    }
  }

  async function triggerScrape() {
    setScraping(true);
    setMessage("Scraping GeM now. Full scrape can take time because GeM has thousands of active bids.");
    try {
      const response = await apiFetch("/scrape", { method: "POST" });
      const result = (await response.json()) as ScrapeResult;
      if (!response.ok || (result.status !== "SUCCESS" && result.status !== "STARTED")) {
        throw new Error(`Scrape failed after ${result.pagesScraped || 0} pages`);
      }
      setMessage(result.status === "STARTED" ? "Scrape started in background. Results will appear here as pages are saved." : `Scrape complete: ${result.tendersFound} found, ${result.tendersNew} new, ${result.tendersUpdated} updated. GeM stated total: ${result.statedTotal ?? "unknown"}.`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scrape failed");
    } finally {
      setScraping(false);
    }
  }

  async function waitForScrapeToFinish() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const response = await apiFetch("/scrape/status");
      const status = await response.json();
      await loadData();
      if (!status.inProgress) return;
    }
  }

  async function triggerNewTenderScrape() {
    setScraping(true);
    setMessage("Checking latest GeM pages for newly published tenders.");
    try {
      await apiFetch("/scrape/new", { method: "POST" });
      setMessage("New tender scrape started. Fresh records will appear automatically while it runs.");
      await waitForScrapeToFinish();
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "New tender scrape failed");
    } finally {
      setScraping(false);
    }
  }

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 15000);
    return () => window.clearInterval(timer);
  }, [searchPath]);

  return (
    <main style={{ minHeight: "100vh", padding: "32px 20px" }}>
      <section style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={panelStyle}>
          <div>
            <div style={eyebrowStyle}>
              <ShieldCheck size={16} /> GeM Portal Only
            </div>
            <h1 style={{ fontSize: 48, lineHeight: 1, margin: "12px 0" }}>GeM Tender Scraper & PostgreSQL Search</h1>
            <p style={{ color: "#a8b3c7", maxWidth: 760 }}>
              Scrapes every active public tender from GeM, stores records in PostgreSQL via Prisma, and shows searchable live results in this UI.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={triggerScrape} disabled={scraping} style={primaryButtonStyle}>
              {scraping ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              Scrape All GeM Tenders
            </button>
            <button onClick={triggerNewTenderScrape} disabled={scraping} style={secondaryButtonStyle}>
              Scrape New Tenders
            </button>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 16, margin: "24px 0" }}>
          <Stat title="GeM Listed" value={stats?.gemListedTotal ?? stats?.totalTenders ?? 0} icon={<ShieldCheck size={20} />} />
          <Stat title="Unique Active" value={stats?.totalTenders ?? 0} icon={<Database size={20} />} />
          <Stat title="New Today" value={stats?.newToday ?? 0} icon={<RefreshCw size={20} />} />
          <Stat title="Closing Soon" value={stats?.closingSoon ?? 0} icon={<CalendarDays size={20} />} />
          <Stat title="Keyword Matches" value={stats?.keywordMatches ?? 0} icon={<Search size={20} />} />
        </section>
        {stats && stats.duplicateOrUnmappedListings > 0 && (
          <p style={{ color: "#94a3b8", margin: "-12px 0 20px" }}>
            GeM reports {stats.gemListedTotal.toLocaleString("en-IN")} listed rows; PostgreSQL stores {stats.totalTenders.toLocaleString("en-IN")} unique active bid numbers and avoids duplicate existing tenders.
          </p>
        )}

        <section style={panelStyle}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={20} style={{ position: "absolute", left: 16, top: 15, color: "#64748b" }} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedKeywords([]);
                  setPage(1);
                }}
                placeholder="Search by bid number, thermal camera, LRF, NVG, department..."
                style={inputStyle}
              />
            </div>
            {(query || selectedKeywords.length > 0) && (
              <button
                onClick={() => {
                  setQuery("");
                  setDebouncedQuery("");
                  setSelectedKeywords([]);
                  setPage(1);
                }}
                style={secondaryButtonStyle}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {KEYWORDS.map((item) => (
              <button
                key={item}
                onClick={() => toggleKeyword(item)}
                style={selectedKeywords.includes(item) ? activeChipStyle : chipStyle}
              >
                {item}
              </button>
            ))}
          </div>
          {selectedKeywords.length > 0 && (
            <div style={{ marginTop: 14, color: "#94a3b8", fontSize: 13 }}>
              Selected search: <span style={{ color: "#67e8f9" }}>{selectedKeywords.join(" + ")}</span>
            </div>
          )}
        </section>

        {message && (
          <div style={{ ...panelStyle, borderColor: message.toLowerCase().includes("failed") ? "#ef4444" : "#164e63", marginTop: 20 }}>
            <AlertCircle size={18} /> {message}
          </div>
        )}

        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 24, marginBottom: 6 }}>Tender Results</h2>
              <p style={{ color: "#94a3b8", marginTop: 0 }}>
                {tenders
                  ? `${tenders.pagination.totalItems.toLocaleString("en-IN")} matching tenders${tenders.meta?.source?.startsWith("live-gem") ? " from live GeM search" : " across PostgreSQL"}`
                  : "Searching stored GeM tenders"}
              </p>
              {tenders?.meta?.source?.startsWith("live-gem") && (
                <p style={{ color: "#67e8f9", marginTop: -4, fontSize: 13 }}>
                  Synced from GeM now{tenders.meta.source === "live-gem-multi" ? ` for ${tenders.meta.gemSearchTerms?.length ?? 0} selected keywords` : ""}. Stored unique bids for this search: {(tenders.meta.gemUniqueStored ?? 0).toLocaleString("en-IN")}
                </p>
              )}
            </div>
          </div>
          {loading ? (
            <div style={emptyStyle}><Loader2 className="spin" /> Loading tenders...</div>
          ) : !tenders?.data.length ? (
            <div style={emptyStyle}>No tenders found. Click scrape, then search again.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {tenders.data.map((tender) => (
                <article key={tender.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
                    <div>
                      <div style={{ color: "#67e8f9", fontFamily: "monospace", fontWeight: 700 }}>{tender.tenderId}</div>
                      <h3 style={{ margin: "8px 0", fontSize: 20 }}>{tender.title}</h3>
                      <p style={{ color: "#94a3b8", margin: 0 }}>
                        {[tender.organisation, tender.department, tender.category].filter(Boolean).join(" | ") || "GeM tender"}
                      </p>
                    </div>
                    <a href={tender.tenderURL} target="_blank" rel="noreferrer" style={linkButtonStyle}>
                      Open GeM <ExternalLink size={16} />
                    </a>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                    <span style={metaStyle}>Status: {tender.tenderStatus}</span>
                    <span style={metaStyle}>Ends: {dateLabel(tender.closingDate)}</span>
                    {tender.keywordMatched && <span style={metaStyle}>Matched: {tender.keywordMatched}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {tenders && tenders.pagination.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={secondaryButtonStyle}>
                Previous
              </button>
              <span style={{ color: "#94a3b8" }}>Page {page} of {tenders.pagination.totalPages}</span>
              <button disabled={page >= tenders.pagination.totalPages} onClick={() => setPage((p) => p + 1)} style={secondaryButtonStyle}>
                Next
              </button>
            </div>
          )}
        </section>
      </section>
      <style jsx global>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}

function Stat({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <div style={statStyle}>
      <div style={{ color: "#67e8f9" }}>{icon}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 }}>{title}</div>
      <div style={{ fontSize: 34, fontWeight: 900 }}>{value.toLocaleString("en-IN")}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(15, 23, 42, 0.76)",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 24px 80px rgba(0,0,0,.25)",
};

const statStyle: React.CSSProperties = { ...panelStyle, padding: 18 };
const eyebrowStyle: React.CSSProperties = { display: "inline-flex", gap: 8, alignItems: "center", color: "#67e8f9", fontSize: 12, fontWeight: 800, letterSpacing: 3 };
const primaryButtonStyle: React.CSSProperties = { display: "inline-flex", gap: 10, alignItems: "center", border: 0, borderRadius: 16, padding: "14px 18px", background: "#22d3ee", color: "#03101a", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid rgba(148, 163, 184, 0.25)", borderRadius: 14, padding: "12px 16px", background: "rgba(15, 23, 42, .8)", color: "#e2e8f0", cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid rgba(148, 163, 184, 0.22)", borderRadius: 16, background: "rgba(2, 6, 23, .55)", color: "#e2e8f0", padding: "14px 16px 14px 48px", outline: "none" };
const chipStyle: React.CSSProperties = { border: "1px solid rgba(148, 163, 184, 0.22)", borderRadius: 999, padding: "8px 12px", background: "rgba(2, 6, 23, .55)", color: "#cbd5e1", cursor: "pointer" };
const activeChipStyle: React.CSSProperties = { ...chipStyle, background: "#22d3ee", color: "#03101a", fontWeight: 800 };
const cardStyle: React.CSSProperties = { ...panelStyle, padding: 20 };
const emptyStyle: React.CSSProperties = { ...panelStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#94a3b8", minHeight: 140 };
const linkButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  display: "inline-flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  height: 46,
  minWidth: 142,
  whiteSpace: "nowrap",
  flexShrink: 0,
};
const metaStyle: React.CSSProperties = { borderRadius: 12, padding: "8px 10px", background: "rgba(2, 6, 23, .65)", color: "#cbd5e1", fontSize: 13 };
