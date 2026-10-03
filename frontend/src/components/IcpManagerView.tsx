import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { IcpProfileData } from '../services/api';
import {
  Target,
  ShieldCheck,
  CheckCircle2,
  Save,
  RefreshCw,
  Building,
  Globe,
  UserCheck,
  Cpu,
} from 'lucide-react';

export default function IcpManagerView() {
  const [icp, setIcp] = useState<IcpProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [industries, setIndustries] = useState('');
  const [minEmployees, setMinEmployees] = useState(50);
  const [maxEmployees, setMaxEmployees] = useState(500);
  const [countries, setCountries] = useState('');
  const [roles, setRoles] = useState('');
  const [technologies, setTechnologies] = useState('');
  const [minScoreThreshold, setMinScoreThreshold] = useState(70);

  const loadIcp = async () => {
    try {
      setLoading(true);
      const res = await api.fetchIcp();
      if (res?.active) {
        setIcp(res.active);
        setName(res.active.name);
        setIndustries(res.active.targetIndustries.join(', '));
        setMinEmployees(res.active.minEmployees);
        setMaxEmployees(res.active.maxEmployees);
        setCountries(res.active.targetCountries.join(', '));
        setRoles(res.active.targetRoles.join(', '));
        setTechnologies(res.active.requiredTechnologies.join(', '));
        setMinScoreThreshold(res.active.minScoreThreshold);
      }
    } catch (err) {
      console.error('Failed to load ICP profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIcp();
  }, []);

  const handleSave = async () => {
    if (!icp) return;
    try {
      setSaving(true);
      setSaveStatus('Saving profile...');
      await api.updateIcp(icp.id, {
        name,
        targetIndustries: industries.split(',').map((s) => s.trim()).filter(Boolean),
        minEmployees: Number(minEmployees),
        maxEmployees: Number(maxEmployees),
        targetCountries: countries.split(',').map((s) => s.trim()).filter(Boolean),
        targetRoles: roles.split(',').map((s) => s.trim()).filter(Boolean),
        requiredTechnologies: technologies.split(',').map((s) => s.trim()).filter(Boolean),
        minScoreThreshold: Number(minScoreThreshold),
      });
      setSaveStatus('Saved successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !icp) {
    return (
      <div className="empty-state p-12">
        <RefreshCw size={36} className="animate-spin text-indigo-400 mb-2" />
        <p>Loading Active ICP Specification...</p>
      </div>
    );
  }

  return (
    <div className="icp-manager-page">
      <div className="pipeline-header">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="text-indigo-400" size={26} />
            Deterministic ICP Definition Studio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure the mathematical criteria governing automated qualification. Strict rule: <span className="text-indigo-300 font-semibold">Zero LLM filtering for basic qualification</span>.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save ICP Profile'}
        </button>
      </div>

      {saveStatus && (
        <div className="mt-3 p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-700/60 text-xs font-semibold text-indigo-300">
          {saveStatus}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
        {/* Left 2 Cols: Form Configurator */}
        <div className="lg:col-span-2 space-y-4">
          <div className="dossier-card">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              ICP Profile Name:
            </label>
            <input
              type="text"
              className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Building size={14} className="text-indigo-400" /> Target Industry Verticals (Comma separated):
              </label>
              <input
                type="text"
                className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                value={industries}
                onChange={(e) => setIndustries(e.target.value)}
                placeholder="B2B SaaS, FinTech, Cloud Infrastructure, Enterprise AI"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Min Employee Headcount:
                </label>
                <input
                  type="number"
                  className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  value={minEmployees}
                  onChange={(e) => setMinEmployees(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Max Employee Headcount:
                </label>
                <input
                  type="number"
                  className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                  value={maxEmployees}
                  onChange={(e) => setMaxEmployees(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Globe size={14} className="text-emerald-400" /> Target Geographies (Comma separated):
              </label>
              <input
                type="text"
                className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                placeholder="US, UK, India, Canada, Germany"
              />
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <UserCheck size={14} className="text-amber-400" /> Target Decision-Maker Roles (Comma separated):
              </label>
              <input
                type="text"
                className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="CFO, VP Finance, Founder, CEO, Head of Finance"
              />
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Cpu size={14} className="text-sky-400" /> Required Technology Stack Signatures:
              </label>
              <input
                type="text"
                className="w-full text-sm p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white"
                value={technologies}
                onChange={(e) => setTechnologies(e.target.value)}
                placeholder="Stripe, Salesforce, NetSuite, AWS, PostgreSQL"
              />
            </div>
          </div>
        </div>

        {/* Right Col: Mathematical Rules Explanation */}
        <div className="space-y-4">
          <div className="dossier-card">
            <h3 className="section-title text-indigo-300">
              <ShieldCheck size={16} /> Deterministic Rules Architecture
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mt-2">
              In LeadFlow AI, qualification is governed by deterministic boolean algebra:
            </p>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 mt-2">
              IsQualified(C, L) = (Industry ∈ ICP.Industries) ∧ (Min ≤ Count ≤ Max) ∧ (Geo ∈ ICP.Countries) ∧ (Role ∈ ICP.Roles)
            </div>
            <ul className="text-xs text-slate-400 space-y-1.5 mt-3">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Zero LLM hallucinations on basic number bounds</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Same inputs always produce the same decision, with an itemised reason trail</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Sub-millisecond: 0.02ms median, 0.24ms p99 (see evals/REPORT.md)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
