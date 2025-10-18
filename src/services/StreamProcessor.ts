import {
  FunctionCallResult,
  StreamProcessingResult,
} from "../types/interviewTypes";
import { chatHandlers } from "../utils/chatUtils";
import { ConversationStore } from "./ConversationStore";

/**
 * Callback function type for streaming chunks to frontend
 */
export type StreamChunkCallback = (chunk: {
  type: "text" | "function_call" | "complete" | "error";
  content?: string;
  functionName?: string;
  functionResult?: FunctionCallResult;
  fullText?: string;
  error?: string;
}) => void | Promise<void>;

/**
 * Processes streaming responses from GenAI
 */
export class StreamProcessor {
  private conversationStore: ConversationStore;

  constructor() {
    this.conversationStore = ConversationStore.getInstance();
  }

  /**
   * Process a streaming response and extract text + function calls
   * WITHOUT streaming to frontend (original behavior)
   */
  public async processStream(
    stream: AsyncGenerator<any>,
    userId: string
  ): Promise<StreamProcessingResult> {
    let fullText = "";
    let functionCallResult: FunctionCallResult | null = null;

    try {
      for await (const chunk of stream) {
        // Extract text from chunk
        if (chunk.text) {
          fullText += chunk.text;
        }

        // Process function calls
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          const functionCall = chunk.functionCalls[0];
          functionCallResult = await this.processFunctionCall(
            functionCall,
            userId
          );
        }
      }
    } catch (error) {
      console.error("Error processing stream:", error);
      throw new Error(
        `Stream processing failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return { fullText, functionCallResult };
  }

  /**
   * Process a streaming response WITH callback for frontend streaming
   * Calls onChunk for each chunk received
   */
  public async processStreamWithCallback(
    stream: AsyncGenerator<any>,
    userId: string,
    onChunk: StreamChunkCallback
  ): Promise<StreamProcessingResult> {
    let fullText = "";
    let functionCallResult: FunctionCallResult | null = null;

    try {
      for await (const chunk of stream) {
        // Handle text chunks
        if (chunk.text) {
          fullText += chunk.text;

          // Send text chunk to frontend via callback
          await onChunk({
            type: "text",
            content: chunk.text,
          });
        }

        // Handle function calls
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          const functionCall = chunk.functionCalls[0];
          functionCallResult = await this.processFunctionCall(
            functionCall,
            userId
          );

          // Send function call result to frontend via callback
          await onChunk({
            type: "function_call",
            functionName: functionCall.name,
            functionResult: functionCallResult || undefined,
          });
        }
      }

      // Send completion
      await onChunk({
        type: "complete",
        fullText: fullText,
      });
    } catch (error) {
      console.error("Error processing stream with callback:", error);

      // Send error to frontend
      await onChunk({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Stream processing failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return { fullText, functionCallResult };
  }

  /**
   * Process a single function call
   */
  private async processFunctionCall(
    functionCall: any,
    userId: string
  ): Promise<FunctionCallResult | null> {
    const functionName = functionCall.name;

    // Check if handler exists for this function
    if (!(functionName in chatHandlers)) {
      console.warn(`No handler found for function: ${functionName}`);
      return null;
    }

    try {
      // Execute the function handler
      const result = await chatHandlers[
        functionName as keyof typeof chatHandlers
      ](functionCall.args as any);

      // Store function call in conversation history
      await this.conversationStore.storeTurn(
        userId,
        `function_call:${functionName}`,
        JSON.stringify(result)
      );

      console.log(
        `Processed function call: ${functionName} for user: ${userId}`
      );

      return result as FunctionCallResult;
    } catch (error) {
      console.error(`Error executing function ${functionName}:`, error);
      throw new Error(
        `Function execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Validate stream response
   */
  public validateStreamResult(result: StreamProcessingResult): {
    isValid: boolean;
    error?: string;
  } {
    // Check if we have either text or a function call result
    if (!result.fullText && !result.functionCallResult) {
      return {
        isValid: false,
        error: "No content received from stream",
      };
    }

    // Validate function call result structure if present
    if (result.functionCallResult) {
      const requiredFields = ["type"];
      const missingFields = requiredFields.filter(
        (field) => !(field in result.functionCallResult!)
      );

      if (missingFields.length > 0) {
        return {
          isValid: false,
          error: `Function call result missing fields: ${missingFields.join(
            ", "
          )}`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Extract metadata from stream result
   */
  public extractMetadata(result: StreamProcessingResult): {
    hasText: boolean;
    hasFunctionCall: boolean;
    functionType?: string;
  } {
    return {
      hasText: !!result.fullText && result.fullText.length > 0,
      hasFunctionCall: !!result.functionCallResult,
      functionType: result.functionCallResult?.type,
    };
  }
}
