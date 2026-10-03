import React, { useState, useEffect } from 'react';
import {
  Compass,
  Play,
  Trash2,
  Sparkles,
  ShieldCheck,
  Eye,
} from 'lucide-react';

interface Mission {
  id: string;
  query: string;
  depth: string;
  targetVertical?: string;
  status: string;
  summary?: string;
  confidenceScore?: number;
  stats?: {
    pagesVisited?: number;
    sourcesEvaluated?: number;
    entitiesDiscovered?: number;
    durationSeconds?: number;
  };
  createdAt: string;
  _count?: {
    leads: number;
    logs: number;
    sources: number;
  };
}

interface ResearchMissionsPageProps {
  onViewTrajectory?: (missionId: string) => void;
}

export const ResearchMissionsPage: React.FC<ResearchMissionsPageProps> = ({ onViewTrajectory }) => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [queryInput, setQueryInput] = useState<string>('');
  const [depth, setDepth] = useState<string>('DEEP');
  const [vertical, setVertical] = useState<string>('AI & Developer Tools');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const samplePrompts = [
    'AI Code Generation Startups funded in 2024-2025',
    'Open-Source Foundation Model Labs & Inference Engines',
    'Autonomous Web & Computer-Use Agent Platforms',
    'Enterprise Cybersecurity Startups specializing in LLM Security',
  ];

  const fetchMissions = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:4000/api/workflows');
      const json = await res.json();
      if (json.success) {
        setMissions(json.data);
      }
    } catch (err) {
      console.error('Failed to load missions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMissions();
    const interval = setInterval(fetchMissions, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || submitting) return;

    try {
      setSubmitting(true);
      const res = await fetch('http://localhost:4000/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryInput.trim(),
          depth,
          targetVertical: vertical,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setQueryInput('');
        fetchMissions();
        if (onViewTrajectory && json.data?.id) {
          onViewTrajectory(json.data.id);
        }
      }
    } catch (err) {
      console.error('Failed to launch mission:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this research mission?')) return;

    try {
      await fetch(`http://localhost:4000/api/workflows/${id}`, { method: 'DELETE' });
      fetchMissions();
    } catch (err) {
      console.error('Failed to delete mission:', err);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', color: '#f4f4f5' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid #27272a',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
              boxShadow: '0 4px 14px rgba(168, 85, 247, 0.35)',
            }}
          >
            <Compass size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' }}>
              Autonomous Deep Research Missions
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#a1a1aa' }}>
              Launch multi-step autonomous web exploration and market intelligence investigations
            </p>
          </div>
        </div>
      </div>

      {/* Launch Mission Card */}
      <div
        style={{
          backgroundColor: '#121216',
          border: '1px solid #27272a',
          borderRadius: '14px',
          padding: '24px',
          marginBottom: '32px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sparkles size={16} color="#a855f7" />
          <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#fafafa' }}>
            Initiate Deep Market Investigation
          </h2>
        </div>

        <form onSubmit={handleLaunch}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="e.g. Find top AI infrastructure startups in Europe founded in 2024..."
              style={{
                flex: 1,
                backgroundColor: '#0c0c0e',
                border: '1px solid #3f3f46',
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#f4f4f5',
                fontSize: '14px',
                outline: 'none',
              }}
            />

            <button
              type="submit"
              disabled={submitting || !queryInput.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#6366f1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: submitting || !queryInput.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !queryInput.trim() ? 0.6 : 1,
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              }}
            >
              <Play size={16} fill="#ffffff" />
              {submitting ? 'Launching Agent...' : 'Launch Mission'}
            </button>
          </div>

          {/* Depth and Vertical Selectors */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#a1a1aa' }}>
              <span>Exploration Depth:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['QUICK', 'DEEP', 'EXHAUSTIVE'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepth(d)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      backgroundColor: depth === d ? '#6366f1' : '#1f1f23',
                      color: depth === d ? '#ffffff' : '#a1a1aa',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {d === 'QUICK' ? 'Quick (~30s)' : d === 'DEEP' ? 'Deep (~90s)' : 'Exhaustive (~3m)'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#a1a1aa' }}>
              <span>Vertical:</span>
              <input
                type="text"
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                style={{
                  backgroundColor: '#0c0c0e',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  color: '#f4f4f5',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Sample Prompts */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#71717a' }}>Quick Launch Vectors:</span>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQueryInput(p)}
                style={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  color: '#a1a1aa',
                  borderRadius: '6px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Missions History Grid */}
      <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0', color: '#fafafa' }}>
        Mission Trajectories & History ({missions.length})
      </h2>

      {loading && missions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a' }}>Loading missions...</div>
      ) : missions.length === 0 ? (
        <div
          style={{
            backgroundColor: '#121216',
            border: '1px dashed #27272a',
            borderRadius: '12px',
            padding: '60px',
            textAlign: 'center',
            color: '#71717a',
          }}
        >
          No research missions created yet. Enter an objective above to launch your first autonomous agent run.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
          {missions.map((m) => {
            const isCompleted = m.status === 'COMPLETED';
            const isRunning = m.status === 'RUNNING';

            return (
              <div
                key={m.id}
                style={{
                  backgroundColor: '#121216',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'border-color 0.2s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: isCompleted
                            ? 'rgba(34, 197, 94, 0.15)'
                            : isRunning
                            ? 'rgba(99, 102, 241, 0.2)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: isCompleted ? '#4ade80' : isRunning ? '#818cf8' : '#f87171',
                        }}
                      >
                        {m.status}
                      </span>

                      <span style={{ fontSize: '11px', color: '#71717a' }}>{m.depth} DEPTH</span>
                    </div>

                    <button
                      onClick={(e) => handleDelete(m.id, e)}
                      style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#71717a',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title="Delete Mission"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 6px 0', color: '#fafafa' }}>
                    {m.query}
                  </h3>

                  {m.summary && (
                    <p style={{ fontSize: '12px', color: '#a1a1aa', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                      {m.summary.slice(0, 140)}...
                    </p>
                  )}
                </div>

                <div>
                  {/* Stats Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: '1px solid #1f1f23',
                      paddingTop: '12px',
                      marginTop: '8px',
                      fontSize: '12px',
                      color: '#a1a1aa',
                    }}
                  >
                    <div>
                      {m.confidenceScore ? (
                        <span style={{ color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <ShieldCheck size={13} /> {m.confidenceScore}% Faithfulness
                        </span>
                      ) : (
                        <span>{m._count?.leads || 0} entities verified</span>
                      )}
                    </div>

                    {onViewTrajectory && (
                      <button
                        onClick={() => onViewTrajectory(m.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          backgroundColor: '#27272a',
                          color: '#e4e4e7',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                        }}
                      >
                        <Eye size={12} /> Trajectory
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ResearchMissionsPage;
