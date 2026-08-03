import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GroupMemberDocument = GroupMember & Document;

export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

@Schema({ timestamps: false, versionKey: false })
export class GroupMember {
  @Prop({ type: Types.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: MemberRole, default: MemberRole.MEMBER })
  role: MemberRole;

  @Prop({ default: Date.now })
  joinedAt: Date;

  @Prop()
  lastReadAt?: Date;

  // Populated virtuals — declared here so TypeScript sees the populated shape (see below).
  user?: { _id: Types.ObjectId; name: string; email: string } | null;
  group?: { _id: Types.ObjectId } | null;
}

export const GroupMemberSchema = SchemaFactory.createForClass(GroupMember);

GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
GroupMemberSchema.index({ userId: 1 });
GroupMemberSchema.index({ groupId: 1, joinedAt: 1 });

GroupMemberSchema.virtual('group', {
  ref: 'Group',
  localField: 'groupId',
  foreignField: '_id',
  justOne: true,
});

GroupMemberSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

GroupMemberSchema.set('toJSON', { virtuals: true });
GroupMemberSchema.set('toObject', { virtuals: true });
