export function getEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // YouTube (watch + shorts)
    if (parsed.hostname.includes("youtube.com")) {
      // Normal watch URL
      const vParam = parsed.searchParams.get("v");
      if (vParam) {
        return `https://www.youtube.com/embed/${vParam}`;
      }

      // Shorts URL: /shorts/{id}
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }

      return null;
    }

    // youtu.be short links
    if (parsed.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${parsed.pathname}`;
    }

    // Vimeo
    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    // Direct video file
    if (url.match(/\.(mp4|webm)$/)) {
      return url;
    }

    return null;
  } catch {
    return null;
  }
}
