import { prisma } from '../db/prisma.js';
import { getOrCreateDefaultContext } from './seedService.js';
import logger from '../utils/logger.js';

export interface RawCompanyInput {
  name: string;
  domain: string;
  website?: string;
  industry?: string;
  employeeCount?: number;
  country?: string;
  city?: string;
  role?: string;
  contactName?: string;
  fullName?: string;
  email?: string;
  linkedinUrl?: string;
  source?: string;
}

export interface IngestionResult {
  totalReceived: number;
  newCompaniesCreated: number;
  newLeadsCreated: number;
  duplicatesSkipped: number;
  invalidEntries: number;
  errors: string[];
  createdCompanyIds: string[];
  createdLeadIds: string[];
}

export class DiscoveryService {
  /**
   * Normalizes a raw web domain or URL into a clean base domain (e.g. "https://www.stripe.com/pricing" -> "stripe.com")
   */
  static cleanDomain(raw: string): string {
    if (!raw) return '';
    let cleaned = raw.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//i, '');
    cleaned = cleaned.replace(/^www\./i, '');
    cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];
    return cleaned;
  }

  /**
   * Ingest an array of candidate companies from CSV, API, or Search
   * Marks new companies as CANDIDATE and creates CANDIDATE leads.
   */
  static async ingestCompanies(
    items: RawCompanyInput[],
    source: 'CSV_UPLOAD' | 'API_IMPORT' | 'SEARCH_IMPORT' = 'API_IMPORT',
    orgId?: string
  ): Promise<IngestionResult> {
    const context = await getOrCreateDefaultContext();
    const effectiveOrgId = orgId || context.organizationId;

    const result: IngestionResult = {
      totalReceived: items.length,
      newCompaniesCreated: 0,
      newLeadsCreated: 0,
      duplicatesSkipped: 0,
      invalidEntries: 0,
      errors: [],
      createdCompanyIds: [],
      createdLeadIds: [],
    };

    for (const item of items) {
      try {
        const domain = this.cleanDomain(item.domain || item.website || '');
        if (!domain || !domain.includes('.')) {
          result.invalidEntries++;
          result.errors.push(`Invalid domain for company '${item.name || 'Unknown'}': '${item.domain}'`);
          continue;
        }

        const companyName = (item.name || domain.split('.')[0]).trim();

        // 1. Check if company already exists in organization
        let company = await prisma.company.findUnique({
          where: {
            orgId_domain: {
              orgId: effectiveOrgId,
              domain: domain,
            },
          },
        });

        let isNewCompany = false;
        if (!company) {
          company = await prisma.company.create({
            data: {
              orgId: effectiveOrgId,
              domain: domain,
              name: companyName,
              website: item.website || `https://${domain}`,
              industry: item.industry || null,
              employeeCount: item.employeeCount ? Number(item.employeeCount) : null,
              country: item.country || null,
              city: item.city || null,
              status: 'CANDIDATE', // Crucial rule: starts as CANDIDATE
              metadata: {
                discoverySource: source,
                discoveredAt: new Date().toISOString(),
              },
            },
          });
          isNewCompany = true;
          result.newCompaniesCreated++;

          // Record audit log
          await prisma.auditLog.create({
            data: {
              orgId: effectiveOrgId,
              userId: context.userId,
              action: 'COMPANY_DISCOVERED',
              entityType: 'COMPANY',
              entityId: company.id,
              metadata: { domain, source, companyName },
            },
          });
        } else {
          result.duplicatesSkipped++;
        }

        result.createdCompanyIds.push(company.id);

        // 2. Create Candidate Lead if contact/role is present, or a company representative lead
        const leadContactName = item.contactName || item.fullName || (item.role ? `${item.role} @ ${companyName}` : `Lead @ ${companyName}`);
        const leadRole = item.role || 'Key Decision Maker';

        /**
         * Match an existing contact before creating one.
         *
         * Companies were already de-duplicated by domain, but leads were not:
         * re-importing the same CSV produced a fresh copy of every contact, so
         * the pipeline filled with triplicates and each one generated its own
         * outreach draft. Email is the identity when present (it is what we
         * actually send to); otherwise fall back to the contact name within
         * the same company.
         */
        const existingLead = await prisma.lead.findFirst({
          where: {
            companyId: company.id,
            ...(item.email
              ? { email: { equals: item.email, mode: 'insensitive' as const } }
              : { fullName: leadContactName }),
          },
        });

        if (existingLead) {
          // Refresh fields that may have improved since the first import,
          // without resetting pipeline progress (status, score, assignment).
          const lead = await prisma.lead.update({
            where: { id: existingLead.id },
            data: {
              role: leadRole,
              contactRole: leadRole,
              website: company.website,
              industry: company.industry,
              linkedinUrl: item.linkedinUrl || existingLead.linkedinUrl,
            },
          });
          result.duplicatesSkipped++;
          result.createdLeadIds.push(lead.id);
        } else {
          const lead = await prisma.lead.create({
            data: {
              orgId: effectiveOrgId,
              companyId: company.id,
              companyName: company.name,
              fullName: leadContactName,
              contactName: leadContactName,
              email: item.email || null,
              role: leadRole,
              contactRole: leadRole,
              website: company.website,
              industry: company.industry,
              linkedinUrl: item.linkedinUrl || null,
              status: 'CANDIDATE', // Crucial rule: Candidate Lead, not Qualified Lead!
              assignedUserId: context.userId,
              metadata: {
                discoverySource: source,
                companyDomain: domain,
              },
            },
          });

          result.newLeadsCreated++;
          result.createdLeadIds.push(lead.id);
        }
      } catch (err: any) {
        result.errors.push(`Error importing ${item.name || item.domain}: ${err.message}`);
        logger.error(`Error in ingestCompanies for ${item.domain}:`, err);
      }
    }

    logger.info(`📥 Ingestion complete (${source}): ${result.newCompaniesCreated} new companies, ${result.newLeadsCreated} candidate leads.`);
    return result;
  }

  /**
   * Parse CSV content string into structured RawCompanyInput records
   */
  static parseCsv(csvContent: string): RawCompanyInput[] {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    // Parse header
    const headers = this.parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/[\s_-]+/g, ''));
    const rows: RawCompanyInput[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      if (values.length === 0) continue;

      const record: any = {};
      headers.forEach((header, index) => {
        const val = values[index]?.trim() || '';
        if (!val) return;

        if (header.includes('company') || header === 'name' || header === 'organization') {
          record.name = val;
        } else if (header.includes('domain') || header.includes('website') || header === 'url') {
          record.domain = val;
          record.website = val.startsWith('http') ? val : `https://${val}`;
        } else if (header.includes('industry') || header.includes('sector') || header.includes('vertical')) {
          record.industry = val;
        } else if (header.includes('employee') || header.includes('size') || header.includes('headcount')) {
          const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(num)) record.employeeCount = num;
        } else if (header.includes('country') || header.includes('geo') || header.includes('region')) {
          record.country = val;
        } else if (header.includes('city') || header.includes('location')) {
          record.city = val;
        } else if (header.includes('role') || header.includes('title') || header.includes('position')) {
          record.role = val;
        } else if (header.includes('contact') || header.includes('person') || header.includes('name')) {
          if (!record.contactName) record.contactName = val;
        } else if (header.includes('email')) {
          record.email = val;
        } else if (header.includes('linkedin')) {
          record.linkedinUrl = val;
        }
      });

      if (record.name || record.domain) {
        rows.push({
          name: record.name || record.domain || 'Unnamed Company',
          domain: record.domain || record.website || '',
          website: record.website,
          industry: record.industry,
          employeeCount: record.employeeCount,
          country: record.country,
          city: record.city,
          role: record.role,
          contactName: record.contactName,
          email: record.email,
          linkedinUrl: record.linkedinUrl,
        });
      }
    }

    return rows;
  }

  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }
}
