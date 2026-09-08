/**
 * Minimal server-sent-events reader shared by every provider.
 *
 * Each vendor streams the same wire format with different payload shapes, so
 * this hands back raw `data:` strings and lets the provider decode them.
 */
export async function readSSE(
  response: Response,
  onEvent: (data: string, event: string | undefined) => void,
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error("Response had no body to stream");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        let event: string | undefined;
        const dataLines: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length) onEvent(dataLines.join("\n"), event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
