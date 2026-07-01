import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

class SupabaseStorageService {
  private supabase: SupabaseClient;

  constructor() {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
    this.supabase = createClient(env.SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        transport: ws as any,
      },

    });
    logger.info('📦 Supabase client initialized for storage services');
  }


  /**
   * Helper to ensure a bucket exists, creates it if it doesn't
   */
  public async ensureBucketExists(bucketName: string, isPublic = false): Promise<void> {
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      
      if (listError) {
        throw listError;
      }

      const exists = buckets.some((b) => b.name === bucketName);

      if (!exists) {
        logger.info(`Bucket "${bucketName}" not found. Creating it...`);
        const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
          public: isPublic,
          fileSizeLimit: 5242880, // 5MB limit
        });

        if (createError) {
          throw createError;
        }
        logger.info(`✅ Bucket "${bucketName}" created successfully`);
      }
    } catch (error: any) {
      logger.warn(`Could not verify or create bucket "${bucketName}". It may already exist or require service-role permissions: ${error.message}`);
    }
  }

  /**
   * Upload an image/screenshot taken during browser automation
   */
  public async uploadScreenshot(
    workflowId: string,
    fileName: string,
    fileBuffer: Buffer
  ): Promise<string> {
    const filePath = `workflows/${workflowId}/screenshots/${fileName}`;
    const bucket = env.SUPABASE_SCREENSHOTS_BUCKET;

    logger.debug(`Uploading screenshot to Supabase Storage: ${bucket}/${filePath}`);

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      logger.error(`❌ Failed to upload screenshot: ${error.message}`);
      throw error;
    }

    logger.info(`✅ Screenshot uploaded: ${data.path}`);
    return data.path;
  }

  /**
   * Upload a raw HTML DOM snapshot for debugging scraping issues
   */
  public async uploadPageSnapshot(
    workflowId: string,
    fileName: string,
    htmlContent: string
  ): Promise<string> {
    const filePath = `workflows/${workflowId}/snapshots/${fileName}`;
    const bucket = env.SUPABASE_LOGS_BUCKET;

    logger.debug(`Uploading DOM snapshot to Supabase Storage: ${bucket}/${filePath}`);

    const buffer = Buffer.from(htmlContent, 'utf-8');
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: 'text/html',
        upsert: true,
      });

    if (error) {
      logger.error(`❌ Failed to upload DOM snapshot: ${error.message}`);
      throw error;
    }

    logger.info(`✅ DOM Snapshot uploaded: ${data.path}`);
    return data.path;
  }

  /**
   * Generate a signed (temporary) URL to access protected files on the dashboard
   */
  public async getSignedUrl(
    bucket: string,
    filePath: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error) {
      logger.error(`❌ Failed to generate signed URL for ${bucket}/${filePath}: ${error.message}`);
      throw error;
    }

    return data.signedUrl;
  }
}

export const supabaseStorage = new SupabaseStorageService();
export default supabaseStorage;
