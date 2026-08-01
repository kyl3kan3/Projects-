/**
 * The GitHub boundary.
 *
 * Every call the product makes goes through `GitHubGateway`. Two things fall out
 * of that: the review pipeline can be driven against a recorded fixture in tests
 * without a network, and the real implementation is a thin, auditable list of the
 * endpoints this app is allowed to touch.
 *
 * The implementation talks to Octokit through `octokit.request(route, params)`
 * with explicit route strings rather than the generated method surface. That is
 * deliberate: Probot's bundled Octokit and a token-authenticated Octokit have
 * different generated types but the same `request`, so one gateway serves the
 * webhook path (installation token) and the offline dry-run path (a personal
 * token) without a second implementation.
 */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface OctokitLike {
  request: (
    route: string,
    params?: Record<string, unknown>,
  ) => Promise<{ status: number; data: unknown; headers: Record<string, unknown> }>;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  body: string;
  authorLogin: string;
  headSha: string;
  baseRef: string;
  state: string;
  isForkPr: boolean;
  changedFiles: number;
}

export interface RepoInfo {
  id: number;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface FileEntry {
  filename: string;
  previous_filename?: string | null;
  status?: string | null;
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
}

export interface InlineCommentInput {
  path: string;
  /** Post-image line number; the last line of the range. */
  line: number;
  side: "RIGHT";
  startLine?: number;
  startSide?: "RIGHT";
  body: string;
}

export interface PostedComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
}

export interface ReactionSummary {
  content: string;
  userLogin: string;
}

export interface CheckRunInput {
  name: string;
  headSha: string;
  conclusion: "success" | "failure" | "neutral" | "skipped";
  title: string;
  summary: string;
}

export interface GitHubGateway {
  getRepo(ref: RepoRef): Promise<RepoInfo>;
  getPullRequest(ref: RepoRef, number: number): Promise<PullRequestInfo>;
  listPullRequestFiles(ref: RepoRef, number: number, limit?: number): Promise<FileEntry[]>;
  /** Post-image contents of a file at a ref, or null when it does not exist. */
  getFileContent(ref: RepoRef, path: string, gitRef: string): Promise<string | null>;
  /** Files changed by one commit — used to detect a rulebook edit on a push. */
  listCommitFiles(ref: RepoRef, sha: string): Promise<FileEntry[]>;
  /** Creates a single review carrying every inline comment. Returns its id. */
  createReview(
    ref: RepoRef,
    number: number,
    input: { commitId: string; body: string; comments: InlineCommentInput[] },
  ): Promise<number>;
  listReviewComments(ref: RepoRef, number: number, reviewId: number): Promise<PostedComment[]>;
  getReviewComment(ref: RepoRef, commentId: number): Promise<PostedComment | null>;
  createIssueComment(ref: RepoRef, number: number, body: string): Promise<number>;
  updateIssueComment(ref: RepoRef, commentId: number, body: string): Promise<void>;
  updateReviewComment(ref: RepoRef, commentId: number, body: string): Promise<void>;
  listReviewCommentReactions(ref: RepoRef, commentId: number): Promise<ReactionSummary[]>;
  createCheckRun(ref: RepoRef, input: CheckRunInput): Promise<void>;
}

/** GitHub caps `/pulls/{n}/files` at 3000 entries and 100 per page. */
const FILES_PAGE_SIZE = 100;

export function octokitGateway(octokit: OctokitLike): GitHubGateway {
  return {
    async getRepo(ref) {
      const res = await octokit.request("GET /repos/{owner}/{repo}", { ...ref });
      const data = res.data as {
        id: number;
        full_name: string;
        private: boolean;
        default_branch: string;
      };
      return {
        id: data.id,
        fullName: data.full_name,
        isPrivate: data.private,
        defaultBranch: data.default_branch,
      };
    },

    async getPullRequest(ref, number) {
      const res = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        ...ref,
        pull_number: number,
      });
      const pr = res.data as {
        number: number;
        title: string | null;
        body: string | null;
        user: { login: string } | null;
        head: { sha: string; repo: { full_name: string } | null };
        base: { ref: string; repo: { full_name: string } | null };
        state: string;
        changed_files?: number;
      };
      const headRepo = pr.head.repo?.full_name ?? "";
      const baseRepo = pr.base.repo?.full_name ?? "";
      return {
        number: pr.number,
        title: pr.title ?? "",
        body: pr.body ?? "",
        authorLogin: pr.user?.login ?? "unknown",
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        state: pr.state,
        isForkPr: headRepo !== "" && baseRepo !== "" && headRepo !== baseRepo,
        changedFiles: pr.changed_files ?? 0,
      };
    },

    async listPullRequestFiles(ref, number, limit = 300) {
      const files: FileEntry[] = [];
      for (let page = 1; files.length < limit; page++) {
        const res = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
          ...ref,
          pull_number: number,
          per_page: FILES_PAGE_SIZE,
          page,
        });
        const batch = res.data as FileEntry[];
        files.push(...batch);
        if (batch.length < FILES_PAGE_SIZE) break;
      }
      return files.slice(0, limit);
    },

    async getFileContent(ref, path, gitRef) {
      try {
        const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          ...ref,
          path,
          ref: gitRef,
        });
        const data = res.data as { content?: string; encoding?: string; type?: string };
        if (data.type !== "file" || typeof data.content !== "string") return null;
        if (data.encoding !== "base64") return data.content;
        return Buffer.from(data.content, "base64").toString("utf8");
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async listCommitFiles(ref, sha) {
      const res = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
        ...ref,
        ref: sha,
      });
      const data = res.data as { files?: FileEntry[] };
      return data.files ?? [];
    },

    async createReview(ref, number, input) {
      const res = await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        ...ref,
        pull_number: number,
        commit_id: input.commitId,
        event: "COMMENT",
        body: input.body,
        comments: input.comments.map((c) => ({
          path: c.path,
          line: c.line,
          side: c.side,
          ...(c.startLine !== undefined ? { start_line: c.startLine, start_side: c.startSide } : {}),
          body: c.body,
        })),
      });
      return (res.data as { id: number }).id;
    },

    async listReviewComments(ref, number, reviewId) {
      const res = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments",
        { ...ref, pull_number: number, review_id: reviewId, per_page: FILES_PAGE_SIZE },
      );
      const data = res.data as { id: number; path: string; line: number | null; body: string }[];
      return data.map((c) => ({ id: c.id, path: c.path, line: c.line, body: c.body }));
    },

    async getReviewComment(ref, commentId) {
      try {
        const res = await octokit.request("GET /repos/{owner}/{repo}/pulls/comments/{comment_id}", {
          ...ref,
          comment_id: commentId,
        });
        const c = res.data as { id: number; path: string; line: number | null; body: string };
        return { id: c.id, path: c.path, line: c.line, body: c.body };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async createIssueComment(ref, number, body) {
      const res = await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        ...ref,
        issue_number: number,
        body,
      });
      return (res.data as { id: number }).id;
    },

    async updateIssueComment(ref, commentId, body) {
      await octokit.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", {
        ...ref,
        comment_id: commentId,
        body,
      });
    },

    async updateReviewComment(ref, commentId, body) {
      await octokit.request("PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}", {
        ...ref,
        comment_id: commentId,
        body,
      });
    },

    async listReviewCommentReactions(ref, commentId) {
      const res = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions",
        { ...ref, comment_id: commentId, per_page: FILES_PAGE_SIZE },
      );
      const data = res.data as { content: string; user: { login: string } | null }[];
      return data.map((r) => ({ content: r.content, userLogin: r.user?.login ?? "unknown" }));
    },

    async createCheckRun(ref, input) {
      await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
        ...ref,
        name: input.name,
        head_sha: input.headSha,
        status: "completed",
        conclusion: input.conclusion,
        completed_at: new Date().toISOString(),
        output: { title: input.title, summary: input.summary },
      });
    },
  };
}

export function isNotFound(err: unknown): boolean {
  return typeof (err as { status?: number }).status === "number" && (err as { status: number }).status === 404;
}
