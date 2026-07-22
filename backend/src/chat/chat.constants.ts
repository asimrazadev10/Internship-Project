/** Socket.IO room name for a group's chat. One room per group: `group:<groupId>`. */
export const roomFor = (groupId: string): string => `group:${groupId}`;
