import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { GroupMemberGuard } from '../common/guards/group-member.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { StorageService, type UploadedFileLike } from '../storage/storage.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { MessagesService } from './messages.service';

// 5 MB cap and an allow-list of image/PDF mime types — enforced by ParseFilePipe before the
// handler runs, so oversized or unexpected files never reach storage.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/;

/**
 * Nested under a group: every route is group-scoped, so GroupMemberGuard applies to the whole
 * controller. Combined with the global JwtAuthGuard, reaching any handler here means the caller
 * is authenticated AND a member of :id — exactly CLAUDE.md's read/post rule, enforced once.
 *
 * The :id param is the group id (kept consistent with the groups routes so one guard reads one
 * param name).
 */
@Controller('groups/:id/messages')
@UseGuards(GroupMemberGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  @ResponseMessage('Message sent')
  create(
    @Param('id', ParseUuidPipe) groupId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(groupId, userId, dto.content);
  }

  @Get()
  findPage(
    @Param('id', ParseUuidPipe) groupId: string,
    @Query() query: PaginationQueryDto,
  ) {
    // Returning { data, meta } signals the ResponseInterceptor to lift meta into the envelope.
    return this.messagesService.findPage(groupId, query.limit, query.cursor);
  }

  @Get('search')
  search(
    @Param('id', ParseUuidPipe) groupId: string,
    @Query() query: SearchMessagesDto,
  ) {
    return this.messagesService.search(groupId, query.q);
  }

  /**
   * Upload a file as a message. The bytes go to Supabase Storage (server-side, service-role key);
   * the resulting message carries the public URL and is broadcast like any other, so it streams
   * live and lands in history. An optional `content` field is a caption.
   */
  @Post('upload')
  @ResponseMessage('File uploaded')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id', ParseUuidPipe) groupId: string,
    @CurrentUser('userId') userId: string,
    @Body('content') content: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          // Magic-number validation (inspects the actual bytes, so a renamed .exe is caught).
          // fallbackToMimetype covers the case where content detection is unavailable — notably
          // Jest's VM can't dynamically import the ESM `file-type` package — by matching the
          // declared MIME against the same allow-list.
          new FileTypeValidator({
            fileType: ALLOWED_MIME,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file: UploadedFileLike,
  ) {
    const stored = await this.storage.upload(groupId, file);
    return this.messagesService.createWithAttachment(
      groupId,
      userId,
      (content ?? '').trim(),
      { url: stored.url, name: stored.name, mime: stored.mime },
    );
  }

  @Patch(':messageId')
  @ResponseMessage('Message updated')
  edit(
    @Param('id', ParseUuidPipe) groupId: string,
    @Param('messageId', ParseUuidPipe) messageId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.edit(groupId, messageId, userId, dto.content);
  }

  @Delete(':messageId')
  @ResponseMessage('Message deleted')
  remove(
    @Param('id', ParseUuidPipe) groupId: string,
    @Param('messageId', ParseUuidPipe) messageId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messagesService.softDelete(groupId, messageId, userId);
  }
}
