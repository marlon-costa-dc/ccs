/**
 * Cursor Protobuf Main Module
 * Exports encoder/decoder functions and builds complete requests
 */

import { randomUUID } from 'crypto';
import {
  ROLE,
  UNIFIED_MODE,
  THINKING_LEVEL,
  FIELD,
  type CursorMessage,
  type CursorTool,
  type FormattedMessage,
  type MessageId,
  type ThinkingLevelType,
} from './cursor-protobuf-schema.js';
import {
  encodeField,
  encodeVarint,
  encodeMessage,
  encodeInstruction,
  encodeModel,
  encodeCursorSetting,
  encodeMetadata,
  encodeMessageId,
  encodeMcpTool,
  wrapConnectRPCFrame,
  concatArrays,
} from './cursor-protobuf-encoder.js';
import {
  decodeVarint,
  decodeField,
  decodeMessage,
  parseConnectRPCFrame,
  extractTextFromResponse,
} from './cursor-protobuf-decoder.js';
import { WIRE_TYPE } from './cursor-protobuf-schema.js';

/**
 * Build complete chat request protobuf
 */
export function encodeRequest(
  messages: CursorMessage[],
  modelName: string,
  tools: CursorTool[] = [],
  reasoningEffort: string | null = null
): Uint8Array {
  if (messages.length === 0) {
    throw new Error('Messages array must not be empty');
  }

  const hasTools = tools?.length > 0;
  const isAgentic = hasTools;
  const formattedMessages: FormattedMessage[] = [];
  const messageIds: MessageId[] = [];

  // Prepare messages
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = msg.role === 'user' ? ROLE.USER : ROLE.ASSISTANT;
    const msgId = randomUUID();
    const isLast = i === messages.length - 1;

    formattedMessages.push({
      content: msg.content,
      role,
      messageId: msgId,
      isLast,
      hasTools,
      toolResults: msg.tool_results || [],
    });

    messageIds.push({ messageId: msgId, role });
  }

  // Map reasoning effort to thinking level
  let thinkingLevel: ThinkingLevelType = THINKING_LEVEL.UNSPECIFIED;
  if (reasoningEffort === 'medium') thinkingLevel = THINKING_LEVEL.MEDIUM;
  else if (reasoningEffort === 'high') thinkingLevel = THINKING_LEVEL.HIGH;

  // Build arrays for messages and tools
  const messageFields = formattedMessages.map((fm) =>
    encodeField(
      FIELD.Chat.MESSAGES,
      WIRE_TYPE.LEN,
      encodeMessage(fm.content, fm.role, fm.messageId, fm.isLast, fm.hasTools, fm.toolResults)
    )
  );

  const messageIdFields = messageIds.map((mid) =>
    encodeField(FIELD.Chat.MESSAGE_IDS, WIRE_TYPE.LEN, encodeMessageId(mid.messageId, mid.role))
  );

  const toolFields =
    tools?.length > 0
      ? tools.map((tool) => encodeField(FIELD.Chat.MCP_TOOLS, WIRE_TYPE.LEN, encodeMcpTool(tool)))
      : [];

  const supportedToolsField = isAgentic
    ? [encodeField(FIELD.Chat.SUPPORTED_TOOLS, WIRE_TYPE.LEN, encodeVarint(1))]
    : [];

  // Concatenate all parts
  const parts: Uint8Array[] = [
    ...messageFields,
    encodeField(FIELD.Chat.UNKNOWN_2, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.Chat.INSTRUCTION, WIRE_TYPE.LEN, encodeInstruction('')),
    encodeField(FIELD.Chat.UNKNOWN_4, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.Chat.MODEL, WIRE_TYPE.LEN, encodeModel(modelName)),
    encodeField(FIELD.Chat.WEB_TOOL, WIRE_TYPE.LEN, ''),
    encodeField(FIELD.Chat.UNKNOWN_13, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.Chat.CURSOR_SETTING, WIRE_TYPE.LEN, encodeCursorSetting()),
    encodeField(FIELD.Chat.UNKNOWN_19, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.Chat.CONVERSATION_ID, WIRE_TYPE.LEN, randomUUID()),
    encodeField(FIELD.Chat.METADATA, WIRE_TYPE.LEN, encodeMetadata()),
    encodeField(FIELD.Chat.IS_AGENTIC, WIRE_TYPE.VARINT, isAgentic ? 1 : 0),
    ...supportedToolsField,
    ...messageIdFields,
    ...toolFields,
    encodeField(FIELD.Chat.LARGE_CONTEXT, WIRE_TYPE.VARINT, 0),
    encodeField(FIELD.Chat.UNKNOWN_38, WIRE_TYPE.VARINT, 0),
    encodeField(
      FIELD.Chat.UNIFIED_MODE,
      WIRE_TYPE.VARINT,
      isAgentic ? UNIFIED_MODE.AGENT : UNIFIED_MODE.CHAT
    ),
    encodeField(FIELD.Chat.UNKNOWN_47, WIRE_TYPE.LEN, ''),
    encodeField(FIELD.Chat.SHOULD_DISABLE_TOOLS, WIRE_TYPE.VARINT, isAgentic ? 0 : 1),
    encodeField(FIELD.Chat.THINKING_LEVEL, WIRE_TYPE.VARINT, thinkingLevel),
    encodeField(FIELD.Chat.UNKNOWN_51, WIRE_TYPE.VARINT, 0),
    encodeField(FIELD.Chat.UNKNOWN_53, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.Chat.UNIFIED_MODE_NAME, WIRE_TYPE.LEN, isAgentic ? 'Agent' : 'Ask'),
  ];

  return concatArrays(...parts);
}

/**
 * Build chat request wrapped in top-level message
 */
export function buildChatRequest(
  messages: CursorMessage[],
  modelName: string,
  tools: CursorTool[] = [],
  reasoningEffort: string | null = null
): Uint8Array {
  return encodeField(
    FIELD.Request.REQUEST,
    WIRE_TYPE.LEN,
    encodeRequest(messages, modelName, tools, reasoningEffort)
  );
}

/**
 * Generate the raw top-level protobuf request body expected by Cursor upstream.
 */
export function generateCursorBody(
  messages: CursorMessage[],
  modelName: string,
  tools: CursorTool[] = [],
  reasoningEffort: string | null = null
): Uint8Array {
  return buildChatRequest(messages, modelName, tools, reasoningEffort);
}

// Re-export all functions
export {
  encodeVarint,
  encodeField,
  encodeMessage,
  encodeInstruction,
  encodeModel,
  encodeCursorSetting,
  encodeMetadata,
  encodeMessageId,
  encodeMcpTool,
  wrapConnectRPCFrame,
  decodeVarint,
  decodeField,
  decodeMessage,
  parseConnectRPCFrame,
  extractTextFromResponse,
};
