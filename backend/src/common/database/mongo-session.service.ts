import { Injectable, OnModuleInit } from '@nestjs/common';
import { Connection, ClientSession, ConnectionStates } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';

@Injectable()
export class MongoSessionService implements OnModuleInit {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new Error('MongoDB connection not established');
    }
  }

  async withTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  getConnection(): Connection {
    return this.connection;
  }
}
