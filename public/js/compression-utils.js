import pako from 'pako';

export class CompressionUtils {

  static async decompressGzip(compressedData) {
    if (compressedData && compressedData.length > 0) {
      try {
        return pako.inflate(compressedData);
      } catch (err) {
        if (typeof DecompressionStream === 'function') {
          return await CompressionUtils._decompressWithStream(compressedData);
        } else {
          console.warn('No decompression method available');
          return compressedData;
        }
      }
    }
    
    return new Uint8Array(0);
  }

  static compressGzip(data) {
    return pako.gzip(data);
  }

  static async _decompressWithStream(compressedData) {
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([compressedData]);
    const decompressedStream = new Response(blob).body.pipeThrough(ds);
    const buffer = await new Response(decompressedStream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  static isGzipped(data) {
    return data && data.length >= 2 && data[0] === 0x1F && data[1] === 0x8B;
  }
}