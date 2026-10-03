/**
 * Ground-truth dataset for deterministic ICP qualification.
 *
 * The ICP is pinned here rather than read from the database so a run is
 * reproducible on any machine and does not silently change meaning when
 * someone edits their ICP in the UI.
 *
 * Labels are what a careful human reviewer would decide for this ICP — not
 * what the current implementation happens to return. Cases are included
 * specifically because they are hard, so a passing score is informative and a
 * regression is visible. Expect this suite to surface genuine defects.
 */

export const EVAL_ICP = {
  name: 'Mid-market B2B software, English-speaking markets',
  targetIndustries: ['B2B SaaS', 'Software', 'FinTech', 'Cloud Infrastructure'],
  minEmployees: 50,
  maxEmployees: 1000,
  targetCountries: ['US', 'United States', 'UK', 'United Kingdom', 'Canada', 'Australia'],
  targetRoles: ['CFO', 'VP Finance', 'CEO', 'Founder', 'VP Sales', 'Head of Growth'],
};

export interface QualificationCase {
  id: string;
  /** Why this case exists — printed next to failures to speed up triage. */
  rationale: string;
  company: { industry: string | null; employeeCount: number | null; country: string | null };
  lead: { role: string | null; fullName: string };
  expectedQualified: boolean;
}

export const QUALIFICATION_CASES: QualificationCase[] = [
  // --- Clear positives -----------------------------------------------------
  {
    id: 'pos-core-saas',
    rationale: 'Textbook fit on all four axes.',
    company: { industry: 'B2B SaaS', employeeCount: 140, country: 'United States' },
    lead: { role: 'CFO', fullName: 'Dana Reyes' },
    expectedQualified: true,
  },
  {
    id: 'pos-fintech-uk',
    rationale: 'Target industry and country written in their long form.',
    company: { industry: 'FinTech', employeeCount: 220, country: 'United Kingdom' },
    lead: { role: 'VP Finance', fullName: 'Sam Okafor' },
    expectedQualified: true,
  },
  {
    id: 'pos-role-longform',
    rationale: "'Chief Financial Officer' must resolve to the CFO persona.",
    company: { industry: 'Cloud Infrastructure', employeeCount: 310, country: 'Canada' },
    lead: { role: 'Chief Financial Officer', fullName: 'Avery Lin' },
    expectedQualified: true,
  },
  {
    id: 'pos-country-alias',
    rationale: "Country alias 'USA' must normalise to the United States.",
    company: { industry: 'Software', employeeCount: 95, country: 'USA' },
    lead: { role: 'Founder', fullName: 'Jordan Pike' },
    expectedQualified: true,
  },

  {
    id: 'pos-industry-narrower-label',
    rationale: "A narrower label ('SaaS') is still the 'B2B SaaS' vertical.",
    company: { industry: 'SaaS', employeeCount: 120, country: 'US' },
    lead: { role: 'CFO', fullName: 'Ellis Kaur' },
    expectedQualified: true,
  },
  {
    id: 'pos-industry-generic-suffix',
    rationale: "'FinTech Solutions' adds only a generic delivery word.",
    company: { industry: 'FinTech Solutions', employeeCount: 300, country: 'Canada' },
    lead: { role: 'VP Finance', fullName: 'Rowan Diaz' },
    expectedQualified: true,
  },

  // --- Boundary conditions -------------------------------------------------
  {
    id: 'bound-min-inclusive',
    rationale: 'Exactly minEmployees — the bracket is inclusive.',
    company: { industry: 'B2B SaaS', employeeCount: 50, country: 'US' },
    lead: { role: 'CEO', fullName: 'Robin Shah' },
    expectedQualified: true,
  },
  {
    id: 'bound-max-inclusive',
    rationale: 'Exactly maxEmployees — the bracket is inclusive.',
    company: { industry: 'B2B SaaS', employeeCount: 1000, country: 'US' },
    lead: { role: 'CEO', fullName: 'Robin Shah' },
    expectedQualified: true,
  },
  {
    id: 'bound-just-under',
    rationale: 'One below the floor must be rejected.',
    company: { industry: 'B2B SaaS', employeeCount: 49, country: 'US' },
    lead: { role: 'CEO', fullName: 'Kit Alvarez' },
    expectedQualified: false,
  },
  {
    id: 'bound-just-over',
    rationale: 'One above the ceiling must be rejected.',
    company: { industry: 'B2B SaaS', employeeCount: 1001, country: 'US' },
    lead: { role: 'CEO', fullName: 'Kit Alvarez' },
    expectedQualified: false,
  },

  // --- Missing data --------------------------------------------------------
  {
    id: 'missing-headcount',
    rationale: 'Unknown headcount is provisionally accepted pending enrichment.',
    company: { industry: 'B2B SaaS', employeeCount: null, country: 'US' },
    lead: { role: 'CFO', fullName: 'Noor Haddad' },
    expectedQualified: true,
  },

  // --- Clear negatives -----------------------------------------------------
  {
    id: 'neg-industry',
    rationale: 'Out-of-scope industry.',
    company: { industry: 'Mining & Extraction', employeeCount: 350, country: 'United States' },
    lead: { role: 'CFO', fullName: 'Casey Monroe' },
    expectedQualified: false,
  },
  {
    id: 'neg-country',
    rationale: 'Country outside the target list.',
    company: { industry: 'B2B SaaS', employeeCount: 190, country: 'Brazil' },
    lead: { role: 'CFO', fullName: 'Luca Moretti' },
    expectedQualified: false,
  },
  {
    id: 'neg-role-junior',
    rationale: 'Non-decision-maker role.',
    company: { industry: 'B2B SaaS', employeeCount: 200, country: 'United States' },
    lead: { role: 'Junior Graphic Designer', fullName: 'Pat Delgado' },
    expectedQualified: false,
  },
  {
    id: 'neg-enterprise-scale',
    rationale: 'Far above the mid-market ceiling.',
    company: { industry: 'B2B SaaS', employeeCount: 45000, country: 'United States' },
    lead: { role: 'VP Finance', fullName: 'Morgan Webb' },
    expectedQualified: false,
  },

  // --- Adversarial: substring and alias collisions -------------------------
  {
    id: 'adv-industry-substring',
    rationale:
      "'Agriculture Software' contains the token 'Software' but is not a target vertical; " +
      'naive substring matching will over-accept it.',
    company: { industry: 'Agriculture Software', employeeCount: 160, country: 'United States' },
    lead: { role: 'CFO', fullName: 'Reese Novak' },
    expectedQualified: false,
  },
  {
    id: 'adv-role-substring-ceo',
    rationale:
      "'Executive Assistant to the CEO' contains 'CEO' but is not the decision maker; " +
      'substring role matching will over-accept it.',
    company: { industry: 'B2B SaaS', employeeCount: 180, country: 'United States' },
    lead: { role: 'Executive Assistant to the CEO', fullName: 'Taylor Brooks' },
    expectedQualified: false,
  },
  {
    id: 'adv-role-facilities-head',
    rationale: "'Head of Facilities' must not match the 'Head of Growth' persona.",
    company: { industry: 'B2B SaaS', employeeCount: 240, country: 'United Kingdom' },
    lead: { role: 'Head of Facilities', fullName: 'Drew Campbell' },
    expectedQualified: false,
  },
  {
    id: 'adv-missing-country',
    rationale:
      'A blank country is unknown, not a match; accepting it silently admits out-of-region accounts.',
    company: { industry: 'B2B SaaS', employeeCount: 150, country: '' },
    lead: { role: 'CFO', fullName: 'Sloane Carter' },
    expectedQualified: false,
  },
  {
    id: 'adv-missing-role',
    rationale: 'A blank role cannot be confirmed as a decision maker.',
    company: { industry: 'B2B SaaS', employeeCount: 150, country: 'US' },
    lead: { role: '', fullName: 'Unknown Contact' },
    expectedQualified: false,
  },
];
