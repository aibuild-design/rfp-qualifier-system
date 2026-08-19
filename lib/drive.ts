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

/**
 * File a built proposal into the bid folder as a Google Doc.
 *
 * Then tidy, because nothing in Drive ever replaced anything. Every re-triage
 * added another copy of the solicitation and every rebuild another copy of the
 * proposal, and one bid folder had reached twenty-six files before anybody
 * looked. Tidying after the upload rather than before means the new document
 * exists before the old one goes, so a failed upload cannot leave the folder
 * empty.
 */
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
  if (reply?.doc_url) await ask({ action: "tidy-folder", folder_id: folderId });
  return reply?.doc_url ?? null;
}

/**
 * Put the standing documents into a bid folder.
 *
 * Module 8 states it: "standing documents like your insurance certificate
 * attach to every submission." Until now they were recorded in Settings, shown
 * on the proposal page, and never went anywhere. A reminder list that knows the
 * file exists but leaves you to go and find it is not what was asked for.
 *
 * Uploaded as-is rather than converted. The proposal becomes a Google Doc
 * because it is a document people edit; a certificate of insurance is evidence,
 * and converting it changes the artefact the agency asked to see.
 *
 * Expired documents are skipped and named in the return. An insurance
 * certificate that lapsed in March is worse than none at all, because it gets
 * attached with confidence.
 */
export async function attachStandingDocuments(
  folderId: string,
  docs: { label: string; file_name: string; expires_on: string | null; bytes: Buffer }[],
): Promise<{ attached: string[]; expired: string[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const attached: string[] = [];
  const expired: string[] = [];

  for (const doc of docs) {
    if (doc.expires_on && doc.expires_on < today) {
      expired.push(doc.label);
      continue;
    }
    const reply = await ask({
      action: "attach-file",
      folder_id: folderId,
      file_name: doc.file_name,
      file_base64: doc.bytes.toString("base64"),
      mime_type: mimeFor(doc.file_name),
    });
    if (reply?.ok) attached.push(doc.label);
  }

  return { attached, expired };
}

/** Enough to keep Drive from labelling everything a binary download. */
function mimeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

/** Leave one of each thing in a bid folder and trash the rest. */
export async function tidyFolder(folderId: string): Promise<boolean> {
  const reply = await ask({ action: "tidy-folder", folder_id: folderId });
  return Boolean(reply?.ok);
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
