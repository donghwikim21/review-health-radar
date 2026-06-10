import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../errors.js";
import { buildMessages, buildRecapMessages, buildVerificationMessages } from "./prompt.js";
import { NARRATIVE_TOOL_SCHEMA, RECAP_TOOL_SCHEMA, VERDICT_TOOL_SCHEMA } from "./schema.js";
import type { InsightProvider, NarrativeInput, RecapInput, VerificationInput } from "./provider.js";

const TOOL_NAME = "submit_narrative";
const VERDICT_TOOL_NAME = "submit_verdict";
const RECAP_TOOL_NAME = "submit_recap";

/**
 * Claude-backed provider. We force a single tool call so the model must return
 * data in our exact schema (no free-text parsing), then re-validate with Zod.
 */
export class AnthropicInsightProvider implements InsightProvider {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(input: NarrativeInput): Promise<unknown> {
    const { system, user } = buildMessages(input);
    return this.toolCall(system, user, TOOL_NAME, NARRATIVE_TOOL_SCHEMA, "narrative");
  }

  async verify(input: VerificationInput): Promise<unknown> {
    const { system, user } = buildVerificationMessages(input);
    return this.toolCall(system, user, VERDICT_TOOL_NAME, VERDICT_TOOL_SCHEMA, "verdict");
  }

  async recap(input: RecapInput): Promise<unknown> {
    const { system, user } = buildRecapMessages(input);
    return this.toolCall(system, user, RECAP_TOOL_NAME, RECAP_TOOL_SCHEMA, "recap");
  }

  /**
   * Forces a single tool call so the model must answer in our exact structure
   * (no free-text parsing), and returns the raw tool input for the caller to
   * validate. Shared by generate() and verify().
   */
  private async toolCall(
    system: string,
    user: string,
    toolName: string,
    schema: unknown,
    label: string,
  ): Promise<unknown> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
        tools: [
          {
            name: toolName,
            description: `Submit the ${label} in the required structure.`,
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      });
    } catch (error) {
      throw new AppError("INSIGHT_UNAVAILABLE", "The LLM provider request failed.", { cause: error });
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === toolName,
    );
    if (!toolUse) {
      throw new AppError("INSIGHT_UNAVAILABLE", `The LLM did not return a structured ${label}.`);
    }
    return toolUse.input;
  }
}
