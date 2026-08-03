import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GroupDocument = Group & Document;

@Schema({ timestamps: false, versionKey: false })
export class Group {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'GroupMember' }] })
  members: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Message' }] })
  messages: Types.ObjectId[];
}

export const GroupSchema = SchemaFactory.createForClass(Group);

GroupSchema.index({ createdBy: 1, name: 1 }, { unique: true });
GroupSchema.index({ createdAt: -1 });

GroupSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true,
});

GroupSchema.set('toJSON', { virtuals: true });
GroupSchema.set('toObject', { virtuals: true });
