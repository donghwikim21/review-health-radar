import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../errors.js";
import { buildMessages } from "./prompt.js";
import { NARRATIVE_TOOL_SCHEMA } from "./schema.js";
import type { InsightProvider, NarrativeInput } from "./provider.js";

const TOOL_NAME = "submit_narrative";

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
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
        tools: [
          {
            name: TOOL_NAME,
            description: "Submit the review-health narrative in the required structure.",
            input_schema: NARRATIVE_TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });
    } catch (error) {
      throw new AppError("INSIGHT_UNAVAILABLE", "The LLM provider request failed.", { cause: error });
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      throw new AppError("INSIGHT_UNAVAILABLE", "The LLM did not return a structured narrative.");
    }
    // Return raw; the orchestrator validates schema + grounding and can regenerate.
    return toolUse.input;
  }
}
