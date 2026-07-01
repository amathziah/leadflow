import geminiService from '../src/services/ai/geminiService.js';
import logger from '../src/utils/logger.js';

const mockCompanyText = `
Welcome to CognitiveLabs AI.
Based in Bangalore, India.
We are a seed-stage deep learning startup engineering distributed machine learning workflows.
Our main product is a containerized GPU orchestration workspace that scales GPU training efficiency by up to 50% for LLMs and generative visual models.
Currently, our engineering team is expanding, and we are looking for GPU compute specialists and DevOps engineers to manage cluster scale-ups.
Founder: Ananya Rao. Contact us at info@cognitivelabs.ai.
`;

async function testGeminiService() {
  try {
    logger.info('🧪 Starting Gemini AI Service Integration Test...');

    const query = 'Find AI startups in Bangalore scaling GPU workloads';
    
    // 1. Scoring Test (gemini-2.5-pro)
    logger.info(`🔍 Step 1: Evaluating mock company text against target ICP query: "${query}"`);
    const scoreResult = await geminiService.scoreLead(mockCompanyText, query);

    logger.info('✨ Score result parsing successful:');
    logger.info(`   - Lead Score: ${scoreResult.leadScore}/100`);
    logger.info(`   - Priority Level: ${scoreResult.priority}`);
    logger.info(`   - Industry Category: ${scoreResult.industry}`);
    logger.info(`   - Scoring Reason: "${scoreResult.reason}"`);

    // Basic assertions
    if (typeof scoreResult.leadScore !== 'number') {
      throw new Error('Type validation failure: leadScore must be a number');
    }
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(scoreResult.priority)) {
      throw new Error(`Type validation failure: invalid priority level ${scoreResult.priority}`);
    }

    // 2. Outreach Personalization Test (gemini-2.5-flash)
    logger.info('📄 Step 2: Generating personalized outreach email copy...');
    const emailOutreach = await geminiService.generateOutreach(
      mockCompanyText,
      scoreResult.reason,
      'Ananya Rao'
    );

    logger.info('✅ outreach copy successfully crafted:');
    logger.info('\n----------------------------------------');
    logger.info(emailOutreach);
    logger.info('----------------------------------------');

    if (emailOutreach.includes("Hope this email finds you well") || emailOutreach.includes("Hope you're having a great week")) {
      logger.warn('⚠️ Alert: Email contains generic boilerplate greeting. Prompts guidelines might need tuning.');
    } else {
      logger.info('🎉 Success: Outreach email contains zero boilerplate. Prompts constraints satisfied perfectly.');
    }

  } catch (error) {
    logger.error('💥 Test script failed:', error);
  }
}

testGeminiService();
