import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
}

@Schema({ timestamps: false, versionKey: false })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Prop({ sparse: true })
  providerId?: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'GroupMember' }] })
  memberships: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Message' }] })
  messages: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Group' }] })
  createdGroups: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'RefreshToken' }] })
  refreshTokens: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Reaction' }] })
  reactions: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { provider: 1, providerId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerId: { $type: 'string' } },
  },
);

UserSchema.pre('save', function (next) {
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  next();
});

UserSchema.methods.toEntity = function (this: UserDocument) {
  const obj = this.toObject() as Record<string, unknown>;
  delete obj.password;
  return obj;
};
