import { postJson } from "./http.js";
import { Reporter } from "./reporter.js";

interface GitHubCreateFileResponse {
  content?: {
    html_url?: string;
    download_url?: string;
    path?: string;
  };
}

function toB64(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export class GitHubReporter implements Reporter {
  constructor(
    private readonly token: string,
    private readonly repo: string,
    private readonly branch: string,
    private readonly basePath: string
  ) {}

  private async createFile(
    owner: string,
    repoName: string,
    contentPath: string,
    markdown: string,
    branch?: string
  ): Promise<GitHubCreateFileResponse> {
    const encodedPath = contentPath
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${encodedPath}`;
    const body = {
      message: `chore(report): add ${contentPath.split("/").pop() || "report.md"}`,
      content: toB64(markdown),
      ...(branch ? { branch } : {})
    };

    return postJson<GitHubCreateFileResponse>(url, body, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
  }

  private isBranchRefError(err: unknown): boolean {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
      message.includes("no commit found for the ref") ||
      message.includes("reference does not exist") ||
      message.includes("branch not found")
    );
  }

  async publish(title: string, markdown: string): Promise<string> {
    const [owner, repoName] = this.repo.split("/");
    if (!owner || !repoName) {
      throw new Error(`Invalid GITHUB_REPO: ${this.repo}`);
    }

    const now = new Date();
    const datePath = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const fileName = `${Date.now()}-${slugify(title || "task-report")}.md`;
    const contentPath = `${this.basePath}/${datePath}/${fileName}`;

    let usedBranch = this.branch;
    let res: GitHubCreateFileResponse;
    try {
      res = await this.createFile(owner, repoName, contentPath, markdown, usedBranch);
    } catch (err) {
      if (!usedBranch || !this.isBranchRefError(err)) {
        throw err;
      }
      // Fallback to repo default branch when configured branch is invalid.
      res = await this.createFile(owner, repoName, contentPath, markdown);
      usedBranch = "";
    }

    return (
      res.content?.html_url ||
      res.content?.download_url ||
      `https://github.com/${owner}/${repoName}/blob/${usedBranch || "HEAD"}/${contentPath}`
    );
  }
}
