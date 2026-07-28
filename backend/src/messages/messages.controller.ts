/**
 * HOW THIS FILE WORKS
 *   1. GroupMemberGuard is applied at class level, so every route is member-only.
 *   2. POST / — send a text message.
 *   3. GET / — cursor-paginated history; returning { data, meta } triggers the envelope's meta.
 *   4. GET /search — substring search. Declared BEFORE :messageId routes so it is not shadowed.
 *   5. POST /upload — validate the file, store the bytes, then persist a message carrying its URL.
 *   6. PATCH / DELETE :messageId — edit and soft-delete, ownership checked in the service.
 *
 * Every route is nested under a group, which is why one guard on the class covers them all.
 */
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
import { GroupMemberGuard } from '../groups/group-member.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import {
  StorageService,
  type UploadedFileLike,
} from '../storage/storage.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { MessagesService } from './messages.service';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from './upload.constants';

/**
 * Nested under a group: every route is group-scoped, so GroupMemberGuard applies to the whole
 * controller. Combined with the global JwtAuthGuard, reaching any handler here means the caller
 * is authenticated AND a member of :id — exactly CLAUDE.md's read/post rule, enforced once.
 *
 * The :id param is the group id (kept consistent with the groups routes so one guard reads one
 * param name).
 */
@Controller('groups/:id/messages')
// Step 1. One guard on the class rather than repeated on six handlers.
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
    // Step 2. Sender comes from the token, so it cannot be forged in the body.
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(groupId, userId, dto.content);
  }

  @Get()
  findPage(
    @Param('id', ParseUuidPipe) groupId: string,
    // Supplies the validated limit and optional cursor.
    @Query() query: PaginationQueryDto,
  ) {
    // Returning { data, meta } signals the ResponseInterceptor to lift meta into the envelope.
    return this.messagesService.findPage(groupId, query.limit, query.cursor);
  }

  // Step 4. Must stay above the ':messageId' routes — Nest matches in declaration order, so
  // otherwise 'search' would be parsed as a message id and rejected by ParseUuidPipe.
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
  // Parses the multipart body and exposes the 'file' field to @UploadedFile below.
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id', ParseUuidPipe) groupId: string,
    @CurrentUser('userId') userId: string,
    // Optional caption; @Body('content') pulls one field out of the multipart form.
    @Body('content') content: string | undefined,
    @UploadedFile(
      new ParseFilePipe({
        // 422 rather than the default 400 — the request was well-formed, the file was not.
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        // Step 5. Both validators run BEFORE the handler body, so a bad file never reaches storage.
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES }),
          // Magic-number validation (inspects the actual bytes, so a renamed .exe is caught).
          // fallbackToMimetype covers the case where content detection is unavailable — notably
          // Jest's VM can't dynamically import the ESM `file-type` package — by matching the
          // declared MIME against the same allow-list.
          new FileTypeValidator({
            fileType: ALLOWED_UPLOAD_MIME,
            fallbackToMimetype: true,
          }),
        ],
      }),
    )
    file: UploadedFileLike,
  ) {
    // Bytes first: the message row must not exist if storing the file failed.
    const stored = await this.storage.upload(groupId, file);
    return this.messagesService.createWithAttachment(
      groupId,
      userId,
      // Trimmed here because the caption arrives as a raw form field, not through a DTO.
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
    // Step 6. Reuses CreateMessageDto — an edit has the same one-field shape and same bounds.
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
    // Soft delete: returns the tombstoned row rather than 204, so clients can replace it in place.
    return this.messagesService.softDelete(groupId, messageId, userId);
  }
}
