import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** Route `:id` must be a UUID; Bangla error otherwise. Use as @Param('id', ParseIdPipe). */
export const ParseIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('অবৈধ আইডি।'),
});
