import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import { BaseRepository } from './base.repository';
import {
  User,
  UserDocument,
  AuthProvider,
} from '../../../modules/users/schemas/user.schema';
import { MongoSessionService } from '../mongo-session.service';

@Injectable()
export class UserRepository extends BaseRepository<UserDocument> {
  constructor(
    @InjectModel(User.name) model: Model<UserDocument>,
    sessionService: MongoSessionService,
  ) {
    super(model, sessionService);
  }

  async findByEmail(
    email: string,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.model
      .findOne({ email: email.toLowerCase() })
      .select('+password')
      .session(session ?? null)
      .exec();
  }

  async findByProviderId(
    provider: AuthProvider,
    providerId: string,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.model
      .findOne({ provider, providerId })
      .session(session ?? null)
      .exec();
  }

  async createUser(
    data: {
      email: string;
      name: string;
      password?: string;
      provider: AuthProvider;
      providerId?: string;
    },
    session?: ClientSession,
  ): Promise<UserDocument> {
    return this.create(
      {
        email: data.email.toLowerCase(),
        name: data.name,
        password: data.password,
        provider: data.provider,
        providerId: data.providerId,
      },
      session,
    );
  }

  async findByIdWithRelations(
    id: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<UserDocument | null> {
    return this.model
      .findById(id)
      .populate('memberships')
      .populate('messages')
      .populate('createdGroups')
      .populate('refreshTokens')
      .populate('reactions')
      .session(session ?? null)
      .exec();
  }
}
