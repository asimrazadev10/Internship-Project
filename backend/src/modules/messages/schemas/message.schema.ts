import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  AI_SUMMARY = 'AI_SUMMARY',
}

@Schema({ timestamps: false, versionKey: false })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderId?: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String, enum: MessageType, default: MessageType.USER })
  type: MessageType;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  editedAt?: Date;

  @Prop()
  deletedAt?: Date;

  @Prop()
  attachmentUrl?: string;

  @Prop()
  attachmentName?: string;

  @Prop()
  attachmentMime?: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ groupId: 1, createdAt: -1, _id: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ groupId: 1, type: 1, deletedAt: 1, createdAt: -1 });

MessageSchema.virtual('sender', {
  ref: 'User',
  localField: 'senderId',
  foreignField: '_id',
  justOne: true,
});

MessageSchema.virtual('group', {
  ref: 'Group',
  localField: 'groupId',
  foreignField: '_id',
  justOne: true,
});

MessageSchema.virtual('reactions', {
  ref: 'Reaction',
  localField: '_id',
  foreignField: 'messageId',
});

MessageSchema.methods.isOwnedBy = function (
  this: MessageDocument,
  userId: Types.ObjectId,
): boolean {
  return this.senderId?.equals(userId) ?? false;
};

MessageSchema.methods.isEditable = function (this: MessageDocument): boolean {
  return this.type === MessageType.USER && !this.deletedAt;
};

MessageSchema.set('toJSON', { virtuals: true });
MessageSchema.set('toObject', { virtuals: true });
