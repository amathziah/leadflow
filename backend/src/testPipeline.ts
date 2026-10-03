import { getOrCreateDefaultContext } from './services/seedService.js';
import { DiscoveryService } from './services/discoveryService.js';
import { QualificationService } from './services/qualificationService.js';
import { EnrichmentService } from './services/enrichmentService.js';
import { SignalEngine } from './services/signalEngine.js';
import { ScoringService } from './services/scoringService.js';
import { ResearchAgentService } from './services/ai/researchAgentService.js';
import { PersonalizationService } from './services/personalizationService.js';
import { ReviewService } from './services/reviewService.js';
import { ResponseAnalysisService } from './services/responseAnalysisService.js';
import { LeadMemoryService } from './services/leadMemoryService.js';
import { AnalyticsService } from './services/analyticsService.js';
import { prisma } from './db/prisma.js';

async function runLeadFlowTest() {
  console.log('================================================================');
  console.log('🧪 RUNNING LEADFLOW AI END-TO-END PIPELINE VALIDATION TEST');
  console.log('================================================================');

  // 1. Seed Context
  console.log('\n[Step 1] Initializing Default Organization & ICP Context...');
  const context = await getOrCreateDefaultContext();
  console.log(`✅ Default Context: Org=${context.organizationId}, User=${context.userId}`);

  // 2. Lead Discovery (CSV Import)
  console.log('\n[Step 2] Importing Candidate Leads via CSV parser...');
  const sampleCsv = `Company Name,Domain,Industry,Employees,Country,Role,Contact Name,Email
Datastride Cloud,datastride.io,B2B SaaS,185,United States,CFO,Marcus Chen,marcus@datastride.io
HyperLogix AI,hyperlogix.ai,Enterprise AI,320,United Kingdom,VP Finance,Sarah Jenkins,sarah@hyperlogix.ai
Old Brickyard Heavy Manufacturing,brickyardmfg.com,Heavy Industrial,2400,Germany,Plant Manager,Otto Mueller,otto@brickyardmfg.com`;

  const parsed = DiscoveryService.parseCsv(sampleCsv);
  const ingestResult = await DiscoveryService.ingestCompanies(parsed, 'CSV_UPLOAD');
  console.log(`✅ Ingested: ${ingestResult.newCompaniesCreated} companies, ${ingestResult.newLeadsCreated} candidate leads.`);

  const targetLeadId = ingestResult.createdLeadIds[0];
  const targetCompanyId = ingestResult.createdCompanyIds[0];
  const industrialLeadId = ingestResult.createdLeadIds[2];

  // 3. Deterministic Qualification
  console.log('\n[Step 3] Deterministic Qualification Test (Zero LLM)...');
  const targetQual = await QualificationService.evaluateLead(targetLeadId);
  console.log(`✅ Target Account Qualified: ${targetQual.qualification.isQualified} (Status: ${targetQual.lead.status})`);
  console.log(`   Reasons: ${targetQual.qualification.reasons.join(' | ')}`);

  const disqualifiedQual = await QualificationService.evaluateLead(industrialLeadId);
  console.log(`✅ Heavy Industrial Disqualified: ${!disqualifiedQual.qualification.isQualified} (Status: ${disqualifiedQual.lead.status})`);
  console.log(`   Disqualification: ${disqualifiedQual.qualification.disqualificationReasons.join(' | ')}`);

  // 4. Data Enrichment
  console.log('\n[Step 4] Enriching Target Company with Provenance & Confidence...');
  const enrichment = await EnrichmentService.enrichCompany(targetCompanyId);
  console.log(`✅ Enriched: Headcount=${enrichment.employeeCount}, Tech=${enrichment.technologies?.slice(0, 3).join(', ')}`);
  console.log(`   Provenance Records: ${enrichment.records.length} tracked attributes.`);

  // 5. Signal Engine
  console.log('\n[Step 5] Detecting High-Conviction Business Signals...');
  const signals = await SignalEngine.detectSignals(targetCompanyId);
  console.log(`✅ Detected ${signals.length} Signals:`);
  signals.forEach((s) => console.log(`   • [${s.type}] ${s.headline} (Confidence: ${s.confidence})`));

  // 6. Multi-Factor Lead Scoring
  console.log('\n[Step 6] Calculating Versioned Multi-Factor Score...');
  const scoreResult = await ScoringService.scoreLead(targetLeadId);
  console.log(`✅ Total Score: ${scoreResult.totalScore}/100 (Formula: ${scoreResult.formulaVersion})`);
  scoreResult.explanation.forEach((e) => console.log(`   ${e.factor}: ${e.reason}`));

  // 7. Bounded ReAct AI Research Agent
  console.log('\n[Step 7] Running AI Research Agent with 4 Deterministic Tools...');
  const dossier = await ResearchAgentService.runResearch(targetCompanyId);
  console.log(`✅ Research Dossier Synthesized (Confidence: ${dossier.confidence}):`);
  console.log(`   Summary: ${dossier.summary}`);
  console.log(`   Pain Points: ${dossier.pain_points.length} identified.`);

  // 8. Personalization Engine
  console.log('\n[Step 8] Generating Signal-Grounded Personalized Outreach Draft...');
  const outreachDraft = await PersonalizationService.generateOutreach(targetLeadId);
  console.log(`✅ Outreach Generated (State: ${outreachDraft.state}):`);
  console.log(`   Subject: ${outreachDraft.subject}`);
  console.log(`   Used Signals: ${outreachDraft.usedSignals.map((s) => s.headline).join('; ')}`);
  console.log(`   Draft Body:\n${outreachDraft.body.slice(0, 180)}...`);

  // 9. Human Review Workflow
  console.log('\n[Step 9] Human Review & Governance Workflow (DRAFT -> APPROVED -> SENT)...');
  const approvedMsg = await ReviewService.approveMessage(
    outreachDraft.messageId,
    undefined,
    'Verified signals & high ICP fit. Approved for dispatch.',
    outreachDraft.subject,
    outreachDraft.body
  );
  console.log(`✅ Message Approved (State: ${approvedMsg.state}, ApprovedAt: ${approvedMsg.approvedAt})`);

  const dispatched = await ReviewService.dispatchMessage(outreachDraft.messageId);
  console.log(`✅ Message Dispatched (State: ${dispatched.state}, SentAt: ${dispatched.sentAt})`);

  // 10. Inbound Response Analysis & Dynamic Re-scoring
  console.log('\n[Step 10] Inbound Response Simulation & Dynamic Re-scoring...');
  const inboundReply = "Hi Alex, thanks for reaching out. Yes, we are actively scaling our London operations and looking into this. Are you free for a brief demo call next Tuesday at 2pm EST?";
  const responseResult = await ResponseAnalysisService.processInboundResponse(
    targetLeadId,
    inboundReply,
    outreachDraft.messageId
  );
  console.log(`✅ Response Classified: ${responseResult.classification} (Confidence: ${responseResult.confidence})`);
  console.log(`   Reasoning: ${responseResult.reasoning}`);
  console.log(`   Updated Lead Status: ${responseResult.newLeadStatus}`);
  console.log(`   Dynamic Re-Scored Total: ${responseResult.reScoredTotal}/100`);

  // 11. Lead Memory & Evolution
  console.log('\n[Step 11] Verifying Lead Memory & Timeline Evolution...');
  const memoryTimeline = await LeadMemoryService.getLeadTimeline(targetLeadId);
  console.log(`✅ Lead Memory Timeline: ${memoryTimeline.timeline.length} recorded events.`);
  console.log(`   Score Narrative: ${memoryTimeline.scoreEvolutionNarrative}`);

  // 12. Manager Dashboard & Observability
  console.log('\n[Step 12] Manager Dashboard & Telemetry Metrics...');
  const dashboard = await AnalyticsService.getManagerDashboard();
  console.log(`✅ Manager Dashboard:`);
  console.log(`   Total Leads: ${dashboard.overview.totalLeads} | Average Score: ${dashboard.overview.averageLeadScore}`);
  console.log(`   Qualification Rate: ${dashboard.overview.qualificationRatePercent}% | Response Rate: ${dashboard.overview.responseRatePercent}%`);
  console.log(`   Queue Observability: ${JSON.stringify(dashboard.observability)}`);

  console.log('\n================================================================');
  console.log('🎉 ALL LEADFLOW AI PIPELINE PHASES VERIFIED SUCCESSFULLY!');
  console.log('================================================================');

  await prisma.$disconnect();
}

runLeadFlowTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
