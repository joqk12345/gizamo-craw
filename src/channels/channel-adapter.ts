import { IncomingMessage } from "../core/types.js";

export interface ChannelAdapter {
  name: string;
  start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<void>;
}

