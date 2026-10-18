export interface StoredBlob {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
}

/** Object storage abstraction. Production uses R2; tests use memory. */
export interface BlobStore {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBlob | null>;
  delete(key: string): Promise<void>;
}

export class R2BlobStore implements BlobStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, data, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<StoredBlob | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return { body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, { data: ArrayBuffer; contentType: string }>();

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    this.objects.set(key, { data, contentType });
  }

  async get(key: string): Promise<StoredBlob | null> {
    const object = this.objects.get(key);
    return object ? { body: object.data, contentType: object.contentType } : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
