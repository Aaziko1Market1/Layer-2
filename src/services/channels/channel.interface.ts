import { ChannelMessage, IncomingMessage, DeliveryResult, DeliveryStatus } from '../../models/types';

export interface IChannelEngine {
  sendMessage(recipient: string, message: ChannelMessage): Promise<DeliveryResult>;
  receiveWebhook(payload: any): Promise<IncomingMessage>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;
  formatForChannel(rawMessage: string): ChannelMessage;
}
