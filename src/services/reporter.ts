export interface Reporter {
  publish(title: string, markdown: string): Promise<string>;
}

