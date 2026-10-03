import React, { useState, useEffect } from 'react';
import {
  Building2,
  ExternalLink,
  Shield,
  Search,
} from 'lucide-react';

interface CompanyDossier {
  id: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  leadScore: number | null;
  fundingStage: string | null;
  foundingYear: number | null;
  contactName: string | null;
  contactRole: string | null;
  email: string | null;
  competitiveMoats: string | null;
  metadata: {
    domain?: string;
    techStack?: string[];
    productOfferings?: string[];
    keyExecutives?: Array<{ name: string; role: string; bioExcerpt?: string }>;
    citations?: Array<{ url: string; claim: string }>;
    screenshotUrl?: string;
  } | null;
  createdAt: string;
  workflow?: {
    id: string;
    query: string;
    targetVertical?: string;
  };
}

export const CompanyDossiersPage: React.FC = () => {
  const [dossiers, setDossiers] = useState<CompanyDossier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('ALL');
  const [minScore, setMinScore] = useState<number>(0);
  const [selectedDossier, setSelectedDossier] = useState<CompanyDossier | null>(null);

  const fetchDossiers = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:4000/api/leads?limit=50');
      const json = await res.json();
      if (json.success) {
        setDossiers(json.data);
        if (json.data.length > 0 && !selectedDossier) {
          setSelectedDossier(json.data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load company dossiers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDossiers();
  }, []);

  const industries = Array.from(
    new Set(dossiers.map((d) => d.industry).filter((i): i is string => Boolean(i)))
  );

  const filtered = dossiers.filter((d) => {
    const matchesSearch =
      d.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.competitiveMoats && d.competitiveMoats.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.metadata?.techStack && d.metadata.techStack.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesIndustry = selectedIndustry === 'ALL' || d.industry === selectedIndustry;
    const matchesScore = (d.leadScore || 0) >= minScore;

    return matchesSearch && matchesIndustry && matchesScore;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', color: '#f4f4f5' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid #27272a',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #6366f1 100%)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            <Building2 size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' }}>
              Market Intelligence & Company Dossiers
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#a1a1aa' }}>
              Deep technical profiles, strategic moats, verified decision-makers, and stack breakdowns
            </p>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: '#a1a1aa' }}>
          Verified Entities: <strong style={{ color: '#4ade80' }}>{dossiers.length}</strong>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#141418',
          padding: '14px 18px',
          borderRadius: '12px',
          border: '1px solid #27272a',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#71717a' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, tech stack, or moat..."
            style={{
              width: '100%',
              backgroundColor: '#0c0c0e',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              padding: '8px 12px 8px 32px',
              color: '#f4f4f5',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>

        {/* Industry Filter */}
        <select
          value={selectedIndustry}
          onChange={(e) => setSelectedIndustry(e.target.value)}
          style={{
            backgroundColor: '#0c0c0e',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#f4f4f5',
            fontSize: '13px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="ALL">All Verticals ({dossiers.length})</option>
          {industries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>

        {/* Min ICP Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#a1a1aa' }}>
          <span>Min ICP Fit:</span>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{
              backgroundColor: '#0c0c0e',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              padding: '8px 10px',
              color: '#f4f4f5',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            <option value="0">Any Score</option>
            <option value="70">70+ (High Alignment)</option>
            <option value="85">85+ (Tier-1 Fit)</option>
            <option value="90">90+ (Exceptional)</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Left List + Right Detail Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
        {/* Left Company List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '720px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a' }}>Loading dossiers...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a' }}>
              No companies match current filters.
            </div>
          ) : (
            filtered.map((d) => {
              const isSelected = selectedDossier?.id === d.id;
              const score = d.leadScore || 50;

              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedDossier(d)}
                  style={{
                    backgroundColor: isSelected ? '#18181f' : '#111114',
                    border: `1px solid ${isSelected ? '#6366f1' : '#27272a'}`,
                    borderRadius: '10px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#fafafa' }}>{d.companyName}</span>
                      {d.fundingStage && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: '600',
                            backgroundColor: 'rgba(99, 102, 241, 0.15)',
                            color: '#818cf8',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {d.fundingStage}
                        </span>
                      )}
                    </div>

                    {/* ICP Fit Badge */}
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: score >= 85 ? '#4ade80' : score >= 70 ? '#fbbf24' : '#a1a1aa',
                        backgroundColor:
                          score >= 85
                            ? 'rgba(34, 197, 94, 0.1)'
                            : score >= 70
                            ? 'rgba(251, 191, 36, 0.1)'
                            : 'rgba(161, 161, 170, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {score}/100
                    </div>
                  </div>

                  {d.industry && (
                    <div style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '8px' }}>{d.industry}</div>
                  )}

                  {d.competitiveMoats && (
                    <p style={{ fontSize: '12px', color: '#d4d4d8', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                      {d.competitiveMoats.slice(0, 130)}...
                    </p>
                  )}

                  {/* Tech stack badges */}
                  {d.metadata?.techStack && d.metadata.techStack.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {d.metadata.techStack.slice(0, 4).map((tech, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '10px',
                            backgroundColor: '#1f1f23',
                            color: '#a1a1aa',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {tech}
                        </span>
                      ))}
                      {d.metadata.techStack.length > 4 && (
                        <span style={{ fontSize: '10px', color: '#71717a', padding: '2px 4px' }}>
                          +{d.metadata.techStack.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Detail Pane */}
        {selectedDossier ? (
          <div
            style={{
              backgroundColor: '#0c0c0e',
              border: '1px solid #27272a',
              borderRadius: '12px',
              padding: '24px',
              minHeight: '600px',
              maxHeight: '720px',
              overflowY: 'auto',
            }}
          >
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 4px 0', color: '#fafafa' }}>
                  {selectedDossier.companyName}
                </h2>
                {selectedDossier.website && (
                  <a
                    href={selectedDossier.website}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: '#818cf8',
                      textDecoration: 'none',
                    }}
                  >
                    {selectedDossier.website} <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '22px', fontWeight: '800', color: '#4ade80' }}>
                  {selectedDossier.leadScore || 50}/100
                </div>
                <span style={{ fontSize: '11px', color: '#71717a' }}>ICP Relevance Rating</span>
              </div>
            </div>

            {/* Strategic Moat Card */}
            <div
              style={{
                backgroundColor: '#14141a',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>
                <Shield size={14} />
                Strategic Moat & Technical Defensibility
              </div>
              <p style={{ fontSize: '13px', color: '#e4e4e7', margin: 0, lineHeight: '1.5' }}>
                {selectedDossier.competitiveMoats || 'No explicit moat details extracted.'}
              </p>
            </div>

            {/* Tech Stack Breakdown */}
            {selectedDossier.metadata?.techStack && selectedDossier.metadata.techStack.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#a1a1aa', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                  Technical Architecture & Stack
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedDossier.metadata.techStack.map((tech, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '11px',
                        backgroundColor: '#1c1c24',
                        color: '#c7d2fe',
                        border: '1px solid #2e2e38',
                        padding: '3px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Leadership & Contacts */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#a1a1aa', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                Key Leadership Team
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedDossier.metadata?.keyExecutives && selectedDossier.metadata.keyExecutives.length > 0 ? (
                  selectedDossier.metadata.keyExecutives.map((exec, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#141418',
                        border: '1px solid #27272a',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#fafafa' }}>{exec.name}</div>
                        <div style={{ fontSize: '11px', color: '#818cf8' }}>{exec.role}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      backgroundColor: '#141418',
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#fafafa' }}>
                      {selectedDossier.contactName || 'Executive Leadership'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#818cf8' }}>
                      {selectedDossier.contactRole || 'Founder / C-Level'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Grounded Evidence Citations */}
            {selectedDossier.metadata?.citations && selectedDossier.metadata.citations.length > 0 && (
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#a1a1aa', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                  Verified Source Citations
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedDossier.metadata.citations.map((cit, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#141418',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#d4d4d8',
                        borderLeft: '2px solid #10b981',
                      }}
                    >
                      <div style={{ marginBottom: '2px' }}>{cit.claim}</div>
                      <a
                        href={cit.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#818cf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {cit.url.slice(0, 50)}... <ExternalLink size={10} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: '#0c0c0e', border: '1px solid #27272a', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#71717a' }}>
            Select a company dossier to inspect full profile.
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyDossiersPage;
