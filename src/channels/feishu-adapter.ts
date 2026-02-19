import { IncomingMessage } from "../core/types.js";
import { ChannelAdapter } from "./channel-adapter.js";

// Feishu adapter placeholder for future expansion.
export class FeishuAdapter implements ChannelAdapter {
  readonly name = "feishu";

  async start(_onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    throw new Error("FeishuAdapter is not implemented yet.");
  }

  async sendMessage(_chatId: string, _text: string): Promise<void> {
    throw new Error("FeishuAdapter is not implemented yet.");
  }
}

