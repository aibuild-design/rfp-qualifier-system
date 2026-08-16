/**
 * Ask n8n to do something in Drive.
 *
 * The dashboard holds no Google credentials and is not going to: n8n owns them,
 * the mail trigger has to live there anyway, and a token this app obtained
 * would be a second place Google is connected. So filing a finished draft and
 * moving a folder between lanes are requests, not operations.
 *
 * Every call returns rather than throws. Filing a proposal is a good thing to
 * have happen and a terrible reason to fail the action that triggered it: a
 * draft that built correctly must not report failure because Drive was briefly
 * unreachable.
 */
const ROOT = process.env.DRIVE_ROOT_FOLDER_ID ?? "1qTC9nXlPab4zsMkWsXhASRaUM8u9pUwL";

type DriveReply = { ok?: boolean; doc_url?: string; moved_to?: string; error?: string };

async function ask(payload: Record<string, unknown>): Promise<DriveReply | null> {
  const base = process.env.N8N_BASE_URL;
  const key = process.env.RFP_INTAKE_API_KEY;
  if (!base || !key) return null;

  try {
    const res = await fetch(`${base}/webhook/rfp-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      // Uploading a half-megabyte document and converting it is not instant,
      // but it is not a minute either.
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return null;
    return (await res.json()) as DriveReply;
  } catch {
    return null;
  }
}

/** File a built proposal into the bid folder as a Google Doc. */
export async function fileProposal(
  folderId: string,
  fileName: string,
  docx: Buffer,
): Promise<string | null> {
  const reply = await ask({
    action: "file-proposal",
    folder_id: folderId,
    file_name: fileName,
    docx_base64: docx.toString("base64"),
  });
  return reply?.doc_url ?? null;
}

/**
 * Move a bid folder into its lane, creating the lane if it does not exist.
 *
 * Declined is its own lane rather than a deletion. The folder holds the
 * solicitation as the agency sent it, and six months on "did we see this?" and
 * "why did we pass?" are real questions whose answer should not be gone.
 */
export async function moveToLane(folderId: string, lane: "Go" | "Maybe" | "Declined"): Promise<boolean> {
  const reply = await ask({ action: "move-to-lane", folder_id: folderId, lane, root_id: ROOT });
  return Boolean(reply?.ok);
}

/** The folder id out of the URL the filing step stored. */
export function folderIdFrom(url: string | null): string | null {
  return url?.split("/").filter(Boolean).pop() ?? null;
}
