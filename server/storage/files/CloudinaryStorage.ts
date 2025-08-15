import path from "path";
import { Readable } from "stream";
import { PresignedPost } from "@aws-sdk/s3-presigned-post";
import fs from "fs-extra";
import tmp from "tmp";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import fetch from "@server/utils/fetch";
import BaseStorage from "./BaseStorage";

// Import cloudinary dynamically to avoid module resolution issues
let cloudinary: unknown;
try {
  cloudinary = require("cloudinary").v2;
} catch (error) {
  Logger.warn("Cloudinary not available", error);
}

export default class CloudinaryStorage extends BaseStorage {
  constructor() {
    super();

    // Configure Cloudinary
    (cloudinary as any).config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  public async getPresignedPost(
    key: string,
    acl: string,
    maxUploadSize: number,
    contentType = "image"
  ): Promise<Partial<PresignedPost>> {
    // Cloudinary doesn't use presigned posts in the same way as S3
    // Instead, we'll return a configuration for direct uploads
    const timestamp = Math.round(new Date().getTime() / 1000);
    const transformations = this.getTransformationsForContentType(contentType);

    const uploadParams: Record<string, unknown> = {
      timestamp,
      public_id: this.getPublicIdFromKey(key),
      resource_type: this.getResourceTypeFromContentType(contentType),
      folder: this.getFolderFromKey(key),
    };

    if (transformations) {
      uploadParams.transformation = transformations;
    }

    // Generate signature for secure uploads
    const signature = (cloudinary as any).utils.api_sign_request(
      uploadParams,
      env.CLOUDINARY_API_SECRET!
    );

    return {
      url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${uploadParams.resource_type}/upload`,
      fields: {
        ...uploadParams,
        signature,
        api_key: env.CLOUDINARY_API_KEY!,
      },
    };
  }

  public getUploadUrl(_isServerUpload?: boolean): string {
    return `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`;
  }

  public getUrlForKey(key: string): string {
    const publicId = this.getPublicIdFromKey(key);
    const resourceType = this.getResourceTypeFromKey(key);

    return (cloudinary as any).url(publicId, {
      resource_type: resourceType,
      secure: true,
      version: 1,
    });
  }

  public store = async ({
    body,
    contentType,
    key,
    acl,
  }: {
    body: Buffer | Uint8Array | string | Readable;
    contentLength?: number;
    contentType?: string;
    key: string;
    acl?: string;
  }): Promise<string | undefined> => {
    try {
      const publicId = this.getPublicIdFromKey(key);
      const resourceType = this.getResourceTypeFromContentType(contentType);
      const folder = this.getFolderFromKey(key);

      let uploadResult: Record<string, unknown>;

      if (body instanceof Readable) {
        // For streams, we need to convert to buffer first
        const chunks: Buffer[] = [];
        for await (const chunk of body) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        uploadResult = await (cloudinary as any).uploader.upload(
          `data:${contentType || "application/octet-stream"};base64,${buffer.toString("base64")}`,
          {
            public_id: publicId,
            resource_type: resourceType,
            folder: folder,
            access_mode: acl === "public-read" ? "public" : "authenticated",
          }
        );
      } else {
        // For buffers, strings, etc.
        let base64Data: string;
        if (Buffer.isBuffer(body)) {
          base64Data = body.toString("base64");
        } else if (typeof body === "string") {
          base64Data = Buffer.from(body).toString("base64");
        } else {
          // Handle Uint8Array
          base64Data = Buffer.from(body as Uint8Array).toString("base64");
        }

        uploadResult = await (cloudinary as any).uploader.upload(
          `data:${contentType || "application/octet-stream"};base64,${base64Data}`,
          {
            public_id: publicId,
            resource_type: resourceType,
            folder: folder,
            access_mode: acl === "public-read" ? "public" : "authenticated",
          }
        );
      }

      return uploadResult.secure_url as string;
    } catch (error) {
      Logger.error("Error uploading to Cloudinary", error, {
        key,
        contentType,
      });
      throw error;
    }
  };

  public async deleteFile(key: string): Promise<void> {
    try {
      const publicId = this.getPublicIdFromKey(key);
      const resourceType = this.getResourceTypeFromKey(key);

      await (cloudinary as any).uploader.destroy(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      Logger.error("Error deleting file from Cloudinary", error, { key });
      throw error;
    }
  }

  public getSignedUrl = async (
    key: string,
    expiresIn = CloudinaryStorage.defaultSignedUrlExpires
  ): Promise<string> => {
    const publicId = this.getPublicIdFromKey(key);
    const resourceType = this.getResourceTypeFromKey(key);

    // Generate a signed URL with expiration
    const signedUrl = (cloudinary as any).utils.private_download_url(
      publicId,
      resourceType,
      {
        expires_at: Math.round(Date.now() / 1000) + expiresIn,
      }
    );

    return signedUrl;
  };

  public async getFileHandle(key: string): Promise<{
    path: string;
    cleanup: () => Promise<void>;
  }> {
    return new Promise((resolve, reject) => {
      tmp.dir((err, tmpDir) => {
        if (err) {
          return reject(err);
        }
        const tmpFile = path.join(tmpDir, "tmp");
        const dest = fs.createWriteStream(tmpFile);
        dest.on("error", reject);
        dest.on("finish", () =>
          resolve({ path: tmpFile, cleanup: () => fs.rm(tmpFile) })
        );

        void this.getFileStream(key).then((stream) => {
          if (!stream) {
            return reject(new Error("No stream available"));
          }

          stream
            .on("error", (error) => {
              dest.end();
              reject(error);
            })
            .pipe(dest);
        });
      });
    });
  }

  public async getFileStream(
    key: string,
    range?: { start?: number; end?: number }
  ): Promise<NodeJS.ReadableStream | null> {
    try {
      const url = this.getUrlForKey(key);

      // Use fetch to get the file as a stream
      const headers: Record<string, string> = {};
      if (range) {
        headers.Range = `bytes=${range.start}-${range.end}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.body as unknown as NodeJS.ReadableStream;
    } catch (error) {
      Logger.error("Error getting file stream from Cloudinary", error, { key });
      return null;
    }
  }

  /**
   * Extract public_id from key by removing file extension and folder prefix
   */
  private getPublicIdFromKey(key: string): string {
    // Remove file extension and clean up the path
    const withoutExt = key.replace(/\.[^/.]+$/, "");
    return withoutExt;
  }

  /**
   * Extract folder from key
   */
  private getFolderFromKey(key: string): string {
    const folderPath = path.dirname(key);
    return folderPath === "." ? "" : folderPath;
  }

  /**
   * Determine Cloudinary resource type from content type
   */
  private getResourceTypeFromContentType(
    contentType?: string
  ): "image" | "video" | "raw" {
    if (!contentType) {
      return "raw";
    }

    if (contentType.startsWith("image/")) {
      return "image";
    }
    if (contentType.startsWith("video/")) {
      return "video";
    }
    return "raw";
  }

  /**
   * Determine resource type from file key/extension
   */
  private getResourceTypeFromKey(key: string): "image" | "video" | "raw" {
    const ext = path.extname(key).toLowerCase();

    const imageExts = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".webp",
      ".svg",
    ];
    const videoExts = [".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm"];

    if (imageExts.includes(ext)) {
      return "image";
    }
    if (videoExts.includes(ext)) {
      return "video";
    }
    return "raw";
  }

  /**
   * Get transformations based on content type
   */
  private getTransformationsForContentType(
    contentType: string
  ): string | undefined {
    if (contentType.startsWith("image/")) {
      // Apply some basic optimizations for images
      return "f_auto,q_auto";
    }
    return undefined;
  }
}
