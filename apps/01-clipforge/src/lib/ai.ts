/**
 * LLM helpers: clip selection and copy generation via the Claude API.
 *
 * TODO:
 * - [ ] selectClips(transcript): score transcript segments for hook strength,
 *       self-containedness, and emotional peak; return timestamped candidates
 * - [ ] generateSocialCopy(transcript, clip): platform-specific copy
 * - [ ] generateNewsletter(transcript): long-form draft with sections
 * - [ ] enforce JSON output via tool-use schema; retry on validation failure
 */
export interface ClipCandidate {
  startSec: number;
  endSec: number;
  hookScore: number;
  title: string;
}
