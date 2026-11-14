import type { CursorTool } from './cursor-protobuf-schema';

export interface CursorOpenAIMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

export interface AnthropicTextBlock {
  type: 'text';
  text?: string;
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id?: string;
  content?: unknown;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface CursorAnthropicRequest {
  model?: string;
  messages?: Array<{ role?: string; content?: string | AnthropicContentBlock[] }>;
  system?: string | AnthropicTextBlock[];
  stream?: boolean;
  tools?: CursorTool[];
  output_config?: {
    effort?: string;
  };
  thinking?: {
    type?: string;
    budget_tokens?: number;
  };
}
