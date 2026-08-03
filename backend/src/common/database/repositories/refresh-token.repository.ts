import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../../../modules/auth/schemas/refresh-token.schema';
import { MongoSessionService } from '../mongo-session.service';

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenDocument> {
  constructor(
    @InjectModel(RefreshToken.name) model: Model<RefreshTokenDocument>,
    sessionService: MongoSessionService,
  ) {
    super(model, sessionService);
  }

  async findByTokenHash(
    tokenHash: string,
    session?: ClientSession,
  ): Promise<RefreshTokenDocument | null> {
    return this.model
      .findOne({ tokenHash })
      .session(session ?? null)
      .exec();
  }

  async createToken(
    data: {
      userId: Types.ObjectId;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
    },
    session?: ClientSession,
  ): Promise<RefreshTokenDocument> {
    return this.create(data, session);
  }

  async revokeToken(
    tokenId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<RefreshTokenDocument | null> {
    return this.model
      .findByIdAndUpdate(tokenId, { revokedAt: new Date() }, { new: true })
      .session(session ?? null)
      .exec();
  }

  async revokeFamily(
    familyId: string,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateMany(
        { familyId, revokedAt: null },
        { revokedAt: new Date() },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async findValidByTokenHash(
    tokenHash: string,
    session?: ClientSession,
  ): Promise<RefreshTokenDocument | null> {
    return this.model
      .findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } })
      .session(session ?? null)
      .exec();
  }

  async purgeExpired(
    graceMs: number,
    session?: ClientSession,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - graceMs);
    const result = await this.model
      .deleteMany({ expiresAt: { $lt: cutoff } })
      .session(session ?? null)
      .exec();
    return result.deletedCount;
  }

  async claimToken(
    tokenId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<RefreshTokenDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: tokenId, revokedAt: null },
        { revokedAt: new Date() },
        { new: true },
      )
      .session(session ?? null)
      .exec();
  }
}
