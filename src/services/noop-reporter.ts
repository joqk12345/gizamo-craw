import { Reporter } from "./reporter.js";

export class NoopReporter implements Reporter {
  async publish(_title: string, _markdown: string): Promise<string> {
    return "";
  }
}

