import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { IcpProfileData } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  Cpu,
  Globe2,
  Gauge,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Users,
} from 'lucide-react';

type FieldErrors = Partial<Record<'name' | 'minEmployees' | 'maxEmployees' | 'score', string>>;
type NumericInput = number | '';

function TokenPreview({ value }: { value: string }) {
  const tokens = value.split(',').map((token) => token.trim()).filter(Boolean);

  return tokens.length ? (
    <div className="icp-token-list" aria-label="Selected values">
      {tokens.map((token, index) => <span className="icp-token" key={`${token}-${index}`}>{token}</span>)}
    </div>
  ) : (
    <span className="icp-field-help">Separate multiple values with commas.</span>
  );
}

export default function IcpSettingsPage() {
  const [icp, setIcp] = useState<IcpProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);

  const [name, setName] = useState('');
  const [industries, setIndustries] = useState('');
  const [minEmployees, setMinEmployees] = useState<NumericInput>(50);
  const [maxEmployees, setMaxEmployees] = useState<NumericInput>(500);
  const [countries, setCountries] = useState('');
  const [roles, setRoles] = useState('');
  const [technologies, setTechnologies] = useState('');
  const [minScoreThreshold, setMinScoreThreshold] = useState<NumericInput>(70);

  useEffect(() => {
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
      } catch (error) {
        console.error('Failed to load ICP profile:', error);
        setLoadError(error instanceof Error ? error.message : 'Unable to load the ICP profile.');
      } finally {
        setLoading(false);
      }
    };
    void loadIcp();
  }, []);

  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = 'Enter a name for this profile.';
  if (minEmployees === '' || !Number.isInteger(minEmployees) || minEmployees < 0) errors.minEmployees = 'Enter a whole number of zero or more.';
  if (maxEmployees === '' || !Number.isInteger(maxEmployees) || maxEmployees < 0) errors.maxEmployees = 'Enter a whole number of zero or more.';
  if (!errors.minEmployees && !errors.maxEmployees && Number(minEmployees) > Number(maxEmployees)) {
    errors.maxEmployees = 'Maximum headcount must be at least the minimum.';
  }
  if (minScoreThreshold === '' || !Number.isFinite(minScoreThreshold) || minScoreThreshold < 0 || minScoreThreshold > 100) {
    errors.score = 'Score threshold must be between 0 and 100.';
  }

  const handleSave = async () => {
    setValidationAttempted(true);
    if (!icp || Object.keys(errors).length > 0) return;

    try {
      setSaving(true);
      setSaveStatus(null);
      await api.updateIcp(icp.id, {
        name: name.trim(),
        targetIndustries: industries.split(',').map((value) => value.trim()).filter(Boolean),
        minEmployees: Number(minEmployees),
        maxEmployees: Number(maxEmployees),
        targetCountries: countries.split(',').map((value) => value.trim()).filter(Boolean),
        targetRoles: roles.split(',').map((value) => value.trim()).filter(Boolean),
        requiredTechnologies: technologies.split(',').map((value) => value.trim()).filter(Boolean),
        minScoreThreshold: Number(minScoreThreshold),
      });
      setSaveStatus({ kind: 'success', text: 'ICP profile saved successfully.' });
      window.setTimeout(() => setSaveStatus(null), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the ICP profile.';
      setSaveStatus({ kind: 'error', text: message });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !icp) {
    return (
      <div className={`icp-loading-state ${loadError ? 'error' : ''}`} role={loadError ? 'alert' : 'status'} aria-live="polite">
        {loading ? <RefreshCw size={20} className="animate-spin" /> : <AlertCircle size={20} />}
        <span>{loading ? 'Loading ICP profile…' : loadError || 'No active ICP profile is available.'}</span>
      </div>
    );
  }

  const showError = (field: keyof FieldErrors) => validationAttempted ? errors[field] : undefined;

  return (
    <div className="icp-manager-page">
      <nav className="icp-breadcrumb" aria-label="Breadcrumb">
        <span>LeadFlow AI</span><span>/</span><span>Qualification</span><span>/</span><strong>ICP</strong>
      </nav>
      <PageHeader
        eyebrow={<><span className="icp-status-dot" />Qualification Rules</>}
        title="Ideal Customer Profile"
        description="Define the criteria that determine which companies qualify as ideal prospects for automated outreach."
        icon={Target}
        actions={(
          <button onClick={handleSave} disabled={saving} className="btn btn-primary icp-save-button" type="button">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save ICP Profile'}
          </button>
        )}
      />

      {saveStatus && (
        <div className={`icp-save-status ${saveStatus.kind}`} role="status" aria-live="polite">
          {saveStatus.kind === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{saveStatus.text}</span>
        </div>
      )}

      <Panel className="icp-form-panel">
        <div className="icp-section-heading">
          <div>
            <h2>Profile criteria</h2>
            <p>Set firmographic and role signals for an account to enter the qualified pipeline.</p>
          </div>
          <span className="icp-required-note">All fields are editable</span>
        </div>

        <div className="icp-form-grid">
          <div className="icp-field full-width">
            <label htmlFor="icp-name">ICP Profile Name</label>
            <input
              id="icp-name"
              className="form-input"
              type="text"
              placeholder="e.g. Mid-Market SaaS Companies"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(showError('name'))}
              aria-describedby={showError('name') ? 'icp-name-error' : 'icp-name-help'}
            />
            {showError('name') ? <span className="icp-field-error" id="icp-name-error">{errors.name}</span> : <span className="icp-field-help" id="icp-name-help">A clear name helps your team identify this qualification profile.</span>}
          </div>

          <div className="icp-field">
            <label htmlFor="icp-industries"><Building2 size={14} />Target Industry Verticals</label>
            <input id="icp-industries" className="form-input" type="text" placeholder="SaaS, E-commerce, Financial Services, IT Services" value={industries} onChange={(event) => setIndustries(event.target.value)} />
            <TokenPreview value={industries} />
          </div>

          <div className="icp-field">
            <label htmlFor="icp-geographies"><Globe2 size={14} />Target Geographies</label>
            <input id="icp-geographies" className="form-input" type="text" placeholder="United States, United Kingdom, India" value={countries} onChange={(event) => setCountries(event.target.value)} />
            <TokenPreview value={countries} />
          </div>

          <div className="icp-field full-width">
            <div className="icp-field-label"><Users size={14} />Employee Headcount Range</div>
            <p className="icp-field-help">Include companies at both ends of this range.</p>
            <div className="icp-range-inputs">
              <div>
                <label htmlFor="icp-min-employees" className="icp-input-sublabel">Minimum employees</label>
                <input id="icp-min-employees" className="form-input" type="number" min="0" step="1" value={minEmployees} onChange={(event) => setMinEmployees(event.target.value === '' ? '' : Number(event.target.value))} aria-invalid={Boolean(showError('minEmployees'))} aria-describedby={showError('minEmployees') ? 'icp-min-error' : undefined} />
                {showError('minEmployees') && <span className="icp-field-error" id="icp-min-error">{errors.minEmployees}</span>}
              </div>
              <span className="icp-range-separator" aria-hidden="true">to</span>
              <div>
                <label htmlFor="icp-max-employees" className="icp-input-sublabel">Maximum employees</label>
                <input id="icp-max-employees" className="form-input" type="number" min="0" step="1" value={maxEmployees} onChange={(event) => setMaxEmployees(event.target.value === '' ? '' : Number(event.target.value))} aria-invalid={Boolean(showError('maxEmployees'))} aria-describedby={showError('maxEmployees') ? 'icp-max-error' : undefined} />
                {showError('maxEmployees') && <span className="icp-field-error" id="icp-max-error">{errors.maxEmployees}</span>}
              </div>
            </div>
          </div>

          <div className="icp-field">
            <label htmlFor="icp-roles"><BriefcaseBusiness size={14} />Decision-Maker Roles</label>
            <input id="icp-roles" className="form-input" type="text" placeholder="CTO, CFO, Founder, VP Engineering" value={roles} onChange={(event) => setRoles(event.target.value)} />
            <TokenPreview value={roles} />
          </div>

          <div className="icp-field">
            <label htmlFor="icp-technologies"><Cpu size={14} />Required Technology Signatures</label>
            <input id="icp-technologies" className="form-input" type="text" placeholder="Salesforce, HubSpot, AWS, Shopify" value={technologies} onChange={(event) => setTechnologies(event.target.value)} />
            <TokenPreview value={technologies} />
          </div>

          <div className="icp-threshold full-width">
            <div className="icp-threshold-copy">
              <label htmlFor="icp-score-range"><Gauge size={15} />Minimum Score Threshold for Outreach</label>
              <p>Only prospects meeting this score are eligible for outreach.</p>
            </div>
            <div className="icp-threshold-controls">
              <input id="icp-score-range" type="range" min="0" max="100" step="1" value={minScoreThreshold === '' ? 0 : minScoreThreshold} onChange={(event) => setMinScoreThreshold(Number(event.target.value))} aria-label="Minimum score threshold" />
              <div className="icp-score-input-wrap">
                <input className="form-input" type="number" min="0" max="100" step="1" value={minScoreThreshold} onChange={(event) => setMinScoreThreshold(event.target.value === '' ? '' : Number(event.target.value))} aria-label="Minimum score threshold value" aria-invalid={Boolean(showError('score'))} aria-describedby={showError('score') ? 'icp-score-error' : undefined} />
                <span>/ 100</span>
              </div>
              {showError('score') && <span className="icp-field-error" id="icp-score-error">{errors.score}</span>}
            </div>
          </div>
        </div>
      </Panel>

      <section className="icp-engine-section" aria-labelledby="icp-engine-title">
        <div className="icp-section-heading">
          <div>
            <span className="icp-section-kicker"><ShieldCheck size={14} />Transparent qualification</span>
            <h2 id="icp-engine-title">Deterministic Qualification Engine</h2>
            <p>Four explicit checks determine ICP qualification. Empty target lists skip that check; missing employee counts pass provisionally.</p>
          </div>
        </div>

        <Panel className="icp-logic-panel">
          <div className="icp-formula-label">QUALIFICATION FORMULA</div>
          <div className="icp-formula" aria-label="Qualification formula">
            <code><span className="syntax-function">IsQualified</span>(C, L) =</code>
            <div><span className="syntax-keyword">IndustryMatch</span> = <span className="syntax-keyword">Industry</span> ∈ <span className="syntax-variable">ICP.Industries</span> <span className="syntax-comment">(or list empty)</span></div>
            <strong>AND</strong>
            <div><span className="syntax-keyword">SizeMatch</span> = <span className="syntax-keyword">Count</span> unknown <span className="syntax-keyword">OR</span> <span className="syntax-number">Min</span> ≤ <span className="syntax-keyword">Count</span> ≤ <span className="syntax-number">Max</span></div>
            <strong>AND</strong>
            <div><span className="syntax-keyword">GeoMatch</span> = <span className="syntax-keyword">Geo</span> ∈ <span className="syntax-variable">ICP.Countries</span> <span className="syntax-comment">(or list empty)</span></div>
            <strong>AND</strong>
            <div><span className="syntax-keyword">RoleMatch</span> = <span className="syntax-keyword">Role</span> ∈ <span className="syntax-variable">ICP.Roles</span> <span className="syntax-comment">(or list empty)</span></div>
          </div>
          <div className="icp-condition-list">
            {[
              { icon: Building2, label: 'Industry match', detail: 'Matches a target vertical; an empty list skips this check.' },
              { icon: Users, label: 'Headcount check', detail: 'Must be in range. Unknown counts pass pending enrichment.' },
              { icon: MapPin, label: 'Geography match', detail: 'Matches a target country; an empty list skips this check.' },
              { icon: BriefcaseBusiness, label: 'Role match', detail: 'Matches a target persona; an empty list skips this check.' },
            ].map(({ icon: Icon, label, detail }, index) => (
              <div className="icp-condition" key={label}>
                <span className="icp-condition-icon"><Icon size={15} /></span>
                <span className="icp-condition-copy"><strong>{label}</strong><small>{detail}</small></span>
                {index < 3 && <span className="icp-and">AND</span>}
                {index === 3 && <Check size={16} className="icp-condition-check" aria-label="Final condition" />}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="icp-guarantees" aria-label="Qualification guarantees">
        <Panel className="icp-guarantee-card">
          <span className="icp-guarantee-icon"><ShieldCheck size={16} /></span>
          <div><strong>Four explicit checks</strong><p>Industry, headcount, geography, and role determine the qualification result.</p></div>
        </Panel>
        <Panel className="icp-guarantee-card">
          <span className="icp-guarantee-icon"><CheckCircle2 size={16} /></span>
          <div><strong>Unknown size is provisional</strong><p>A missing employee count passes this check while enrichment is pending.</p></div>
        </Panel>
        <Panel className="icp-guarantee-card">
          <span className="icp-guarantee-icon"><SlidersHorizontal size={16} /></span>
          <div><strong>Explainable decisions</strong><p>Each check records its result and a reason for the qualification outcome.</p></div>
        </Panel>
      </section>

      <section className="icp-flow-section" aria-labelledby="icp-flow-title">
        <div className="icp-section-heading">
          <div>
            <h2 id="icp-flow-title">Qualification decision flow</h2>
            <p>All four checks must pass for ICP qualification. The outreach score threshold is configured separately.</p>
          </div>
        </div>
        <Panel className="icp-flow-panel">
          <div className="icp-flow-steps">
            {[
              { label: 'Prospect data', type: 'input' },
              { label: 'Industry check', type: 'rule' },
              { label: 'Headcount check', type: 'rule' },
              { label: 'Geography check', type: 'rule' },
              { label: 'Role check', type: 'rule' },
              { label: 'ICP qualification', type: 'output' },
            ].map((step, index, steps) => (
              <div className="icp-flow-step-wrap" key={step.label}>
                <div className={`icp-flow-step ${step.type}`}>
                  <span>{step.type === 'score' ? <Gauge size={15} /> : step.type === 'output' ? <CheckCircle2 size={15} /> : step.type === 'input' ? <Target size={15} /> : <Check size={15} />}</span>
                  <strong>{step.label}</strong>
                </div>
                {index < steps.length - 1 && <ArrowRight className="icp-flow-arrow" size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
