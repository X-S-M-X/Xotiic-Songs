((root, factory) => {
  const api = factory();
  root.XotiicRange = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : self, () => {
  "use strict";

  const parseByteRange = (header, size) => {
    if (!Number.isFinite(size) || size <= 0 || typeof header !== "string") return null;
    const match = header.trim().match(/^bytes=(\d*)-(\d*)$/i);
    if (!match || (!match[1] && !match[2])) return null;

    let start;
    let end;
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isInteger(suffix) || suffix <= 0) return null;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
      end = Math.min(end, size - 1);
    }
    return { start, end, length: end - start + 1 };
  };

  const createPartialResponse = async (request, response) => {
    const blob = await response.blob();
    const range = parseByteRange(request.headers.get("range"), blob.size);
    if (!range) {
      return new Response(null, {
        status: 416,
        statusText: "Range Not Satisfiable",
        headers: { "content-range": `bytes */${blob.size}`, "accept-ranges": "bytes" },
      });
    }
    const headers = new Headers(response.headers);
    headers.set("accept-ranges", "bytes");
    headers.set("content-range", `bytes ${range.start}-${range.end}/${blob.size}`);
    headers.set("content-length", String(range.length));
    return new Response(blob.slice(range.start, range.end + 1, blob.type), {
      status: 206,
      statusText: "Partial Content",
      headers,
    });
  };

  return Object.freeze({ parseByteRange, createPartialResponse });
});
