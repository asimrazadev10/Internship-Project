import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReactionDocument = Reaction & Document;

@Schema({ timestamps: false, versionKey: false })
export class Reaction {
  @Prop({ type: Types.ObjectId, ref: 'Message', required: true })
  messageId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  emoji: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

ReactionSchema.index({ messageId: 1, userId: 1, emoji: 1 }, { unique: true });
ReactionSchema.index({ userId: 1 });

ReactionSchema.virtual('message', {
  ref: 'Message',
  localField: 'messageId',
  foreignField: '_id',
  justOne: true,
});

ReactionSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

ReactionSchema.set('toJSON', { virtuals: true });
ReactionSchema.set('toObject', { virtuals: true });
